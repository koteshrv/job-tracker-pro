import os
import logging
import json
import requests
from google import genai
import PyPDF2
from pathlib import Path
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi import HTTPException
import time

try:
    from ollama import Client as OllamaClient
except ImportError:
    OllamaClient = None

load_dotenv()

logger = logging.getLogger(__name__)

# --- DB-backed rate limit state ---
# Stores rate_limited_until (unix timestamp) inside model_telemetry JSON per model.
# Survives server restarts unlike an in-memory dict.

def _is_rate_limited(model: str) -> bool:
    """Check DB to see if this model is still in its rate-limit cooldown window."""
    from .database import SessionLocal
    from . import models as _models
    db = SessionLocal()
    try:
        settings = db.query(_models.Settings).first()
        if settings and settings.model_telemetry:
            telemetry = json.loads(settings.model_telemetry)
            entry = telemetry.get(model, {})
            until = entry.get("rate_limited_until", 0)
            if time.time() < until:
                remaining = int(until - time.time())
                logger.info(f"[RateLimit] {model} is DB-rate-limited for {remaining}s more.")
                return True
    except Exception:
        pass
    finally:
        db.close()
    return False

def _set_rate_limit(model: str, seconds: int = 60):
    """Persist a rate-limit cooldown for this model in DB model_telemetry."""
    from .database import SessionLocal
    from . import models as _models
    db = SessionLocal()
    try:
        settings = db.query(_models.Settings).first()
        if settings:
            telemetry = {}
            if settings.model_telemetry:
                try:
                    telemetry = json.loads(settings.model_telemetry)
                except Exception:
                    telemetry = {}
            if model not in telemetry:
                telemetry[model] = {}
            telemetry[model]["rate_limited_until"] = time.time() + seconds
            settings.model_telemetry = json.dumps(telemetry)
            db.commit()
            logger.info(f"[RateLimit] {model} marked rate-limited in DB for {seconds}s.")
    except Exception as e:
        logger.error(f"Failed to persist rate limit for {model}: {e}")
    finally:
        db.close()

# Emergency fallback used ONLY if the DB is completely unreachable at runtime.
# This is NOT the intended configuration path — use the Settings UI to set your model chain.
_EMERGENCY_FALLBACK_MODEL = "gemini-3.1-flash-lite"
ENV_API_KEY = os.getenv("GEMINI_API_KEY")

# Substrings that indicate retrying a different model won't help (auth/config issues).
_FATAL_ERROR_HINTS = ("api key not valid", "api_key_invalid", "permission denied", "unauthenticated")

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
RESUMES_DIR = UPLOAD_DIR / "resumes"
RESUMES_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_RESUME_EXT = (".pdf", ".tex")

# Migrate a legacy single resume.pdf into the resumes/ directory.
_legacy_resume = UPLOAD_DIR / "resume.pdf"
if _legacy_resume.exists() and not any(RESUMES_DIR.iterdir()):
    _legacy_resume.rename(RESUMES_DIR / "resume.pdf")

def safe_resume_name(name: str) -> str:
    """Strip any directory components from an uploaded filename."""
    return Path(name).name

def list_resumes() -> list:
    return sorted(p.name for p in RESUMES_DIR.glob("*") if p.suffix.lower() in ALLOWED_RESUME_EXT)

def _resume_path(name: str = None):
    files = list_resumes()
    if not files:
        return None
    if name:
        n = safe_resume_name(name)
        return RESUMES_DIR / n if n in files else None
    return RESUMES_DIR / files[0]

def delete_resume(name: str) -> bool:
    path = _resume_path(name)
    if path and path.exists():
        path.unlink()
        return True
    return False

def extract_resume_text(name: str = None) -> str:
    path = _resume_path(name)
    if not path or not path.exists():
        return ""
    try:
        # .tex resumes are read as plain text (cleaner source than a parsed PDF).
        if path.suffix.lower() == ".tex":
            return path.read_text(encoding="utf-8", errors="ignore")
        text = ""
        with open(path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
        return text
    except Exception as e:
        logger.error(f"Failed to read resume '{path.name}': {e}")
        return ""

def record_token_usage(model_name: str, prompt_tokens: int, candidate_tokens: int):
    """Accrues Gemini API token usage per model at project level in database settings."""
    from .database import SessionLocal
    from . import models
    import json
    from datetime import date
    
    db = SessionLocal()
    try:
        settings = db.query(models.Settings).first()
        if settings:
            # 1. Update global metrics
            settings.total_prompt_tokens = (settings.total_prompt_tokens or 0) + prompt_tokens
            settings.total_candidate_tokens = (settings.total_candidate_tokens or 0) + candidate_tokens
            
            # 2. Update per-model telemetry logs
            telemetry = {}
            if settings.model_telemetry:
                try:
                    telemetry = json.loads(settings.model_telemetry)
                except Exception:
                    telemetry = {}
            
            normalized_model = model_name or "unknown-model"
            if normalized_model not in telemetry:
                telemetry[normalized_model] = {"requests": 0, "prompt_tokens": 0, "candidate_tokens": 0}
            
            model_stats = telemetry[normalized_model]
            today_str = date.today().isoformat()
            
            # Reset daily counter if it's a new day
            if model_stats.get("last_request_date") != today_str:
                model_stats["today_requests"] = 0
                model_stats["last_request_date"] = today_str
            
            model_stats["requests"] = model_stats.get("requests", 0) + 1
            model_stats["prompt_tokens"] = model_stats.get("prompt_tokens", 0) + prompt_tokens
            model_stats["candidate_tokens"] = model_stats.get("candidate_tokens", 0) + candidate_tokens
            model_stats["today_requests"] = model_stats.get("today_requests", 0) + 1
            
            settings.model_telemetry = json.dumps(telemetry)
            db.commit()
    except Exception as e:
        logger.error(f"Failed to record token usage: {e}")
    finally:
        db.close()

def _generate(prompt: str, api_key: str = None, model_name: str = None) -> str:
    """Run a prompt through Gemini, falling back to lower models on error."""
    resolved_key = api_key or ENV_API_KEY
    resolved_model = model_name
    
    from .database import SessionLocal
    from . import models
    db = SessionLocal()
    try:
        settings = db.query(models.Settings).first()
        if settings:
            if not resolved_key and settings.gemini_api_key:
                from .crypto import decrypt_value
                decrypted = decrypt_value(settings.gemini_api_key)
                if decrypted:
                    resolved_key = decrypted
            if not resolved_model and settings.gemini_model:
                resolved_model = settings.gemini_model
    except Exception:
        pass
    finally:
        db.close()

    if not resolved_key:
        return "Error: Gemini API key is not configured. Add it in Settings or set GEMINI_API_KEY in the backend environment."

    # Build model chain exclusively from DB (what the user set in Settings UI).
    # If DB was unreachable, fall back to a single emergency model — NOT a hardcoded list.
    chain = []
    raw_models = resolved_model if resolved_model else _EMERGENCY_FALLBACK_MODEL
    for m in raw_models.split(","):
        clean_m = m.strip()
        if clean_m and clean_m not in chain:
            chain.append(clean_m)
            
    if not chain:
        chain.append(_EMERGENCY_FALLBACK_MODEL)
    
    if not resolved_model:
        logger.warning(f"[AI] DB model chain unavailable. Using emergency fallback: {chain}")
    else:
        logger.info(f"[AI] Model chain from Settings: {chain}")

    client = genai.Client(api_key=resolved_key)
    last_err = ""
    for model in chain:
        if _is_rate_limited(model):
            logger.info(f"Skipping {model} due to recent 429 Rate Limit.")
            continue
            
        try:
            response = client.models.generate_content(model=model, contents=prompt)
            # Record token metrics
            if hasattr(response, 'usage_metadata') and response.usage_metadata:
                pt = response.usage_metadata.prompt_token_count or 0
                ct = response.usage_metadata.candidates_token_count or 0
                record_token_usage(model, pt, ct)
            
            if response and response.text:
                return response.text
                
        except Exception as e:
            err_msg = str(e)
            logger.warning(f"Triggering fallback — Model {model} failed: {err_msg}")
            last_err = err_msg
            if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
                # Default 60s cooldown
                cooldown = 60
                # Try to parse "retry in Xs" from error
                import re
                match = re.search(r"retry in (\d+)(?:\.\d+)?s", err_msg)
                if match:
                    cooldown = int(match.group(1)) + 2 # Add 2s buffer
                _set_rate_limit(model, cooldown)
                
            if any(h in err_msg.lower() for h in _FATAL_ERROR_HINTS):
                break  # auth/config issue — fallback won't help
                
    if not last_err:
        last_err = "All models were skipped because they are currently in a cooldown period (penalty box) from recent rate limits."
        
    return f"Error generating content (all models failed). Last error: {last_err}"

def _generate_cloud_private(prompt: str, settings: any) -> str:
    """Placeholder for Cloud Private (OpenAI/Anthropic) logic."""
    return "Error: Cloud Private (OpenAI/Anthropic) mode is not yet fully implemented."

class OllamaResumeOutput(BaseModel):
    latex_source: str

class OllamaCoverLetterOutput(BaseModel):
    cover_letter: str

def _generate_ollama(prompt: str, settings: any, output_schema: BaseModel) -> str:
    """Uses Ollama SDK with Pydantic structured output."""
    if not OllamaClient:
        raise HTTPException(status_code=500, detail="Ollama SDK is not installed. Please run `pip install ollama`.")
        
    url = settings.ollama_url or "http://localhost:11434"
    models_to_try = [m.strip() for m in (settings.ollama_model or "llama3").split(",")]
    
    # Check daemon health first to return graceful 503
    try:
        health = requests.get(f"{url}/api/tags", timeout=3)
        health.raise_for_status()
    except Exception as e:
        logger.error(f"Ollama daemon unreachable at {url}: {e}")
        raise HTTPException(status_code=503, detail=f"Ollama daemon is not running or unreachable at {url}.")
        
    client = OllamaClient(host=url)
    last_err = None
    
    for model in models_to_try:
        try:
            response = client.chat(
                model=model,
                messages=[{'role': 'user', 'content': prompt}],
                format=output_schema.model_json_schema()
            )
            content = response.message.content
            data = json.loads(content)
            
            # Depending on schema, return the correct field
            if "latex_source" in data:
                return data["latex_source"]
            elif "cover_letter" in data:
                return data["cover_letter"]
            return content
        except Exception as e:
            logger.error(f"Ollama generation failed for {model}: {e}")
            last_err = str(e)
            
    return f"Error: Local generation failed - {last_err}"

def _route_generation(prompt: str, mode: str, settings: any, is_tex: bool = False, is_cl: bool = False) -> str:
    """Factory router for multi-provider AI generation."""
    if mode == "ollama":
        schema = OllamaCoverLetterOutput if is_cl else OllamaResumeOutput
        return _generate_ollama(prompt, settings, schema)
    elif mode in ("openai", "anthropic", "grok"):
        return _generate_cloud_private(prompt, settings)
    else:
        # Default: Cloud Free (Gemini)
        return _generate(prompt, settings.gemini_api_key, settings.gemini_model)

def _get_custom_guidelines() -> str:
    """Helper to fetch custom user guidelines from the Settings database."""
    from .database import SessionLocal
    from . import models
    db = SessionLocal()
    try:
        settings = db.query(models.Settings).first()
        if settings and settings.custom_guidelines:
            return settings.custom_guidelines.strip()
    except Exception:
        pass
    finally:
        db.close()
    return ""

def generate_cover_letter(job_title: str, company: str, location: str = "", description: str = "", api_key: str = None, model_name: str = None, resume_name: str = None, generation_mode: str = "cloud_free") -> str:
    resume_text = extract_resume_text(resume_name)
    if not resume_text:
        return "Error: Could not read resume. Please upload your resume first."
        
    from .database import SessionLocal
    from . import models
    db = SessionLocal()
    settings = db.query(models.Settings).first()
    db.close()

    jd_context = f"\n\nJob Description Context:\n---\n{description}\n---\n" if description else ""
    
    # Inject user guidelines if configured
    guidelines = _get_custom_guidelines()
    custom_directive = f"\nCRITICAL USER PERSONAL DIRECTIVES/GUIDELINES:\n{guidelines}\n" if guidelines else ""

    prompt = f"""
You are an expert career coach and professional writer.
Write a concise, modern, and highly persuasive cover letter for the role of {job_title} at {company} {f'located in {location}' if location else ''}.
{jd_context}
Use the following resume to highlight my most relevant skills and experience:
---
{resume_text}
---

Requirements:
- Do NOT use generic placeholders like [Company Name] or [Your Name], deduce as much as possible from the resume.
- Keep it under 3 paragraphs.
- Be highly confident and direct.
- Focus strictly on matching the resume skills to the likely requirements of {job_title}{' based on the provided Job Description context' if description else ''}.
{custom_directive}
"""
    return _route_generation(prompt, generation_mode, settings, is_tex=False, is_cl=True)

def generate_tailored_resume(job_title: str, company: str, location: str = "", description: str = "", api_key: str = None, model_name: str = None, resume_name: str = None, generation_mode: str = "cloud_free") -> str:
    resume_text = extract_resume_text(resume_name)
    if not resume_text:
        return "Error: Could not read resume. Please upload your resume first."
        
    from .database import SessionLocal
    from . import models
    db = SessionLocal()
    settings = db.query(models.Settings).first()
    db.close()

    path = _resume_path(resume_name)
    is_tex = bool(path) and path.suffix.lower() == ".tex"

    jd_context = f"\n\nJob Description Context:\n---\n{description}\n---\n" if description else ""

    escape_directive = (
        "\nCRITICAL LATEX REQUIREMENT:\n"
        "You MUST escape ALL special LaTeX characters. Replace "
        "'&' with '\\&', '%' with '\\%', '$' with '\\$', '_' with '\\_'. "
        "Failure to escape these will crash the compiler!"
    ) if is_tex else ""

    # Inject user guidelines if configured
    guidelines = _get_custom_guidelines()
    custom_directive = f"\nCRITICAL USER PERSONAL DIRECTIVES/GUIDELINES:\n{guidelines}\n" if guidelines else ""

    shared = f"""You are an expert technical recruiter and professional resume writer.
Rewrite and tailor the resume below for the role of {job_title} at {company} {f'located in {location}' if location else ''}.
{jd_context}
Original resume:
---
{resume_text}
---

Rules:
- Keep ONLY truthful information from the original resume. Do NOT invent experience, employers, or dates.
- CRITICAL: Do NOT inflate or escalate job titles. Keep the original job titles (e.g. 'Senior Software Engineer') exactly as they are in the original resume. Do NOT change them to 'Lead', 'Staff', or 'Manager' even if the target job description is for a higher level.
- Reorder, reword, and emphasize the bullet points and skills most relevant to a {job_title} role{' as outlined in the Job Description' if description else ''}, but do NOT exaggerate responsibilities.
- Rewrite the professional summary to target this specific role while remaining strictly honest to your true seniority.
- Surface keywords a {job_title} job description and ATS would look for, but only where the resume genuinely supports them.
{custom_directive}
{escape_directive}"""

    if is_tex:
        prompt = shared + """
- The original is a LaTeX document. Return a COMPLETE, COMPILABLE LaTeX document.
- Preserve the original preamble, document class, packages, commands, and overall formatting/structure exactly. Only change the textual content to tailor it.
- Output raw LaTeX only. Do NOT wrap it in markdown code fences or add commentary."""
        return _route_generation(prompt, generation_mode, settings, is_tex=True, is_cl=False)
    else:
        prompt = shared + "\n- Return ONLY the updated markdown text."
        return _route_generation(prompt, generation_mode, settings, is_tex=False, is_cl=False)

def extract_resume_keywords(resume_text: str, api_key: str = None, model_name: str = None) -> str:
    """Extracts a JSON array of up to 30 technical keywords from the resume text."""
    if not resume_text:
        return "[]"
        
    prompt = f"""
You are an expert ATS (Applicant Tracking System) parser.
Extract the top 20-30 most important technical skills, tools, frameworks, and domain keywords from the following resume.
Return ONLY a valid JSON array of strings. Do NOT return markdown formatting, code fences, or any other text.
Example output: ["Python", "React", "AWS", "Machine Learning", "Docker"]

Resume:
---
{resume_text}
---
"""
    result = _generate(prompt, api_key, model_name)
    if result.startswith("Error"):
        return "[]"
        
    # Clean up code fences just in case
    clean = result.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        if lines[0].startswith("```"): lines = lines[1:]
        if lines[-1].startswith("```"): lines = lines[:-1]
        clean = "\n".join(lines).strip()
    
    return clean

def parse_job_page_title(page_title: str, api_key: str = None, model_name: str = None) -> dict:
    """Uses Gemini to quickly extract a clean Company and Job Title from a messy HTML <title>."""
    prompt = f"""
You are an expert at parsing raw HTML <title> tags from job boards (LinkedIn, Workday, etc.).
Extract the 'company' and 'title' from the following page title.
Return ONLY a valid JSON object with keys 'company' and 'title'.
If you cannot determine the company, use "Unknown Company".
If you cannot determine the title, use the raw page title.
Do NOT return markdown formatting or code fences.

Page Title: "{page_title}"
"""
    result = _generate(prompt, api_key, model_name)
    try:
        clean = result.strip()
        if clean.startswith("```"):
            lines = clean.split("\n")
            if lines[0].startswith("```"): lines = lines[1:]
            if lines[-1].startswith("```"): lines = lines[:-1]
            clean = "\n".join(lines).strip()
        return json.loads(clean)
    except Exception as e:
        logger.error(f"Failed to parse job page title: {e}")
        return {"company": "Unknown Company", "title": page_title}

def sanitize_job_description(raw_text: str, api_key: str = None) -> str:
    """Uses gemini-2.5-flash to extract a clean, structured job description in markdown."""
    if not raw_text or len(raw_text.strip()) < 10:
        return raw_text
        
    prompt = f"""
You are an expert technical recruiter.
Clean up the following raw text scraped from a job board webpage. 
1. Remove all cookies warning text, privacy policy notices, navigation bars, headers, and footers.
2. Structure the remaining core job requirements into clean, beautifully formatted Markdown.
3. Output ONLY the clean Markdown text containing sections like Overview/Role, Responsibilities, Requirements, and Benefits. Do NOT add commentary, wrappers, or markdown code fences.

Raw Webpage Text:
---
{raw_text[:12000]}
---
"""
    result = _generate(prompt, api_key, None)
    if result.startswith("Error") or not result.strip():
        return raw_text  # Fallback to raw text if AI fails
        
    # Clean up code fences just in case
    clean = result.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        if lines[0].startswith("```"): lines = lines[1:]
        if lines[-1].startswith("```"): lines = lines[:-1]
        clean = "\n".join(lines).strip()
        
    return clean



def filter_job_links(jobs: list, keyword: str, api_key: str = None) -> tuple[list, list]:
    """Uses Gemini to filter out false positive links. Returns (valid_jobs, rejected_jobs)."""
    if not jobs:
        return [], []
    
    # Safety cap to avoid exceeding token limits.
    # At ~50 tokens/link, 2000 links ≈ 100K tokens — well within gemini-2.5-flash's 250K TPM.
    # The old 400 cap was silently dropping entire companies from the AI filter!
    MAX_JOBS = 2000
    if len(jobs) > MAX_JOBS:
        logger.warning(f"Capping AI input from {len(jobs)} to {MAX_JOBS} candidates to stay within token limits.")
        jobs = jobs[:MAX_JOBS]
        
    import json
    prompt = f"""
You are an expert technical recruiter parsing scraped web links.
Your ONLY job is to filter a list of links and return the IDs of actual, individual job postings.

CRITICAL RULES for REJECTING links (False Positives):
1. REJECT any generic site navigation links: "Privacy", "Terms", "FAQ", "Login", "Register", "Contact Us", "About", "Home", "Accessibility", "Cookie Policy".
2. REJECT category or search-result pages that don't point to a single specific job (e.g., URLs ending in `#footer` or generic search endpoints like `jobsearch?jk=software`).
3. REJECT blog posts, news articles, investor relations, press releases, and alumni networks.
4. REJECT any link where the title does not look like a specific job role.

CRITICAL RULES for ACCEPTING links (True Positives):
1. ACCEPT links that point to a SPECIFIC job description (e.g., "Software Engineer - Backend", "Data Analyst").
2. We are specifically searching for roles related to the keyword: '{keyword}', but you may accept any legitimate technical/corporate job posting.

Here is the JSON list of links:
{json.dumps([{"id": i, "company": j.get("company", "Unknown"), "title": j["title"], "url": j.get("url", j.get("href", ""))} for i, j in enumerate(jobs)], indent=2)}

Return a JSON array containing ONLY the integer IDs of the valid job links.
For example: [0, 2, 5]
Do not return markdown fences. Just the raw JSON array.
"""
    try:
        result = _generate(prompt, api_key, None)
        
        # --- Diagnostic Dump ---
        try:
            dump_dir = Path(__file__).parent / "dump"
            dump_dir.mkdir(exist_ok=True)
            import time
            ts = int(time.time())
            with open(dump_dir / f"ai_input_{ts}.json", "w") as f:
                json.dump(jobs, f, indent=2)
            with open(dump_dir / f"ai_output_{ts}.txt", "w") as f:
                f.write(str(result))
        except Exception as dump_e:
            logger.error(f"Failed to write AI diagnostic dump: {dump_e}")
        # -----------------------

        if not result or result.startswith("Error"):
            return jobs, []
            
        clean = result.strip()
        if clean.startswith("```"):
            lines = clean.split("\n")
            if lines[0].startswith("```json"): lines = lines[1:]
            elif lines[0].startswith("```"): lines = lines[1:]
            if lines[-1].startswith("```"): lines = lines[:-1]
            clean = "\n".join(lines).strip()
            
        valid_ids = json.loads(clean)
        if isinstance(valid_ids, list):
            valid_set = set(v for v in valid_ids if isinstance(v, int) and 0 <= v < len(jobs))
            valid_jobs = [jobs[i] for i in range(len(jobs)) if i in valid_set]
            rejected_jobs = [jobs[i] for i in range(len(jobs)) if i not in valid_set]
            return valid_jobs, rejected_jobs
    except Exception as e:
        logger.error(f"AI filtering failed: {e}")
        
    return jobs, []
