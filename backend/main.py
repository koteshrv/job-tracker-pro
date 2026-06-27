from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form
import shutil
from pathlib import Path
from pydantic import BaseModel
import httpx
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import subprocess
import tempfile
import os
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from typing import List
import logging

from . import models, schemas, crud, scheduler, ai_agent, auth
from .database import engine, get_db
from .scraper_core import run_scraper, load_targets, fetch_job_description, record_job
from .ai_agent import generate_cover_letter, generate_tailored_resume

logger = logging.getLogger(__name__)

# Create tables if they don't exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Job Scraper ATS API")

# Paths reachable without a valid auth token.
PUBLIC_PATHS = {"/api/login"}

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if request.method == "OPTIONS" or not path.startswith("/api") or path in PUBLIC_PATHS:
            return await call_next(request)
        authz = request.headers.get("Authorization", "")
        token = authz[7:] if authz.startswith("Bearer ") else ""
        if not auth.verify_token(token):
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
        return await call_next(request)

# Added before CORS so CORS stays the outermost layer (it must add headers even
# to 401 responses, or the browser can't read them).
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/login")
def login(creds: schemas.LoginRequest):
    if not auth.check_credentials(creds.username, creds.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"token": auth.create_token(creds.username)}

@app.on_event("startup")
def _start_scheduler():
    # Clean up any RUNNING logs orphaned by a previous crash/restart.
    db = next(get_db())
    try:
        n = crud.fail_orphaned_running_logs(db)
        if n:
            logger.info(f"Marked {n} orphaned RUNNING log(s) as FAILED.")
    finally:
        db.close()
    try:
        scheduler.start()
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")

@app.on_event("shutdown")
def _stop_scheduler():
    if scheduler.scheduler.running:
        scheduler.scheduler.shutdown(wait=False)

def bg_scrape_task(db: Session):
    # Log a RUNNING entry immediately so it shows up in history right away.
    log = crud.create_scraper_log(db, schemas.ScraperLogBase(jobs_found=0, status="RUNNING", trigger_source="MANUAL"))
    try:
        new_jobs = run_scraper(db)
        crud.update_scraper_log(db, log.id, jobs_found=len(new_jobs), status="SUCCESS")
        logger.info(f"Background scrape complete! Found {len(new_jobs)} new jobs.")
    except Exception as e:
        crud.update_scraper_log(db, log.id, status="FAILED", error_message=str(e))
        logger.error(f"Background scrape failed: {e}")

@app.post("/api/run-scraper")
def trigger_scraper(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(bg_scrape_task, db)
    return {"message": "Scraper job started in the background."}

@app.get("/api/jobs", response_model=List[schemas.Job])
def read_jobs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    jobs = crud.get_jobs(db, skip=skip, limit=limit)
    return jobs

@app.delete("/api/jobs")
def clear_jobs(db: Session = Depends(get_db)):
    count = crud.delete_all_jobs(db)
    return {"deleted": count}

@app.post("/api/jobs/bulk-status")
def bulk_status(req: schemas.BulkStatusRequest, db: Session = Depends(get_db)):
    count = crud.bulk_update_status(db, req.ids, req.status)
    return {"updated": count}

@app.post("/api/jobs/bulk-delete")
def bulk_delete(req: schemas.BulkIdsRequest, db: Session = Depends(get_db)):
    count = crud.bulk_delete_jobs(db, req.ids)
    return {"deleted": count}

@app.delete("/api/jobs/{job_id}")
def remove_job(job_id: int, db: Session = Depends(get_db)):
    if not crud.delete_job(db, job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return {"deleted": 1}

@app.delete("/api/jobs/trash/empty")
def empty_trash(db: Session = Depends(get_db)):
    count = crud.empty_trash(db)
    return {"deleted": count}

@app.put("/api/jobs/{job_id}", response_model=schemas.Job)
def update_job(job_id: int, job_update: schemas.JobUpdate, db: Session = Depends(get_db)):
    db_job = crud.update_job_status(db, job_id, job_update)
    if db_job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return db_job

class ExtensionPayload(BaseModel):
    url: str
    page_title: str
    description: str
    company: str = None
    title: str = None

@app.get("/api/jobs/extension/parse-title")
def parse_title_endpoint(page_title: str, db: Session = Depends(get_db)):
    """Used by Chrome extension to pre-parse the title before user saves it."""
    settings = crud.get_settings(db)
    api_key = settings.gemini_api_key if settings else None
    model_name = settings.gemini_model if settings else None
    parsed = ai_agent.parse_job_page_title(page_title, api_key, model_name)
    return parsed

@app.post("/api/jobs/extension", response_model=schemas.Job)
def save_from_extension(payload: ExtensionPayload, db: Session = Depends(get_db)):
    """Receives a job scraped by the Chrome Extension."""
    import urllib.parse
    settings = crud.get_settings(db)
    api_key = settings.gemini_api_key if settings else None

    # Parse domain for source tag
    try:
        domain = urllib.parse.urlparse(payload.url).netloc
        parts = domain.replace("www.", "").split(".")
        site_name = parts[-2].capitalize() if len(parts) >= 2 else domain
    except Exception:
        site_name = "Extension"
    location_tag = f"Extension ({site_name})"

    # Clean description using AI
    clean_desc = ai_agent.sanitize_job_description(payload.description, api_key)

    company = payload.company.strip() if payload.company else "Unknown Company"
    title = payload.title.strip() if payload.title else payload.page_title

    # Save to Kanban
    job = record_job(db, company, title, payload.url, location_tag)
    
    # Always overwrite the card values with the latest parsed/user-edited values
    update_data = {
        "description": clean_desc,
        "location": location_tag,
        "company": company,
        "title": title
    }
    job_update = schemas.JobUpdate(**update_data)
    return crud.update_job_status(db, job.id, job_update)

@app.get("/api/settings", response_model=schemas.Settings)
def get_settings(db: Session = Depends(get_db)):
    return crud.get_settings(db)

@app.put("/api/settings", response_model=schemas.Settings)
def update_settings(settings: schemas.SettingsBase, db: Session = Depends(get_db)):
    updated = crud.update_settings(db, settings)
    if "cron_schedule" in settings.model_dump(exclude_unset=True):
        scheduler.reschedule(updated.cron_schedule)
    return updated

@app.get("/api/history", response_model=List[schemas.ScraperLog])
def get_history(limit: int = 50, db: Session = Depends(get_db)):
    return crud.get_scraper_logs(db, limit=limit)

@app.get("/api/companies")
def get_companies():
    """Distinct companies available in targets.json, for the sidebar selector."""
    targets = load_targets()
    seen = []
    for t in targets:
        name = t.get("company")
        if name and name not in seen:
            seen.append(name)
    return {"companies": seen}

@app.get("/api/resumes")
def get_resumes():
    return {"resumes": ai_agent.list_resumes()}

@app.post("/api/upload-resume")
async def upload_resume(file: UploadFile = File(...), name: str = Form(None), db: Session = Depends(get_db)):
    orig = ai_agent.safe_resume_name(file.filename or "")
    ext = Path(orig).suffix.lower()
    if ext not in ai_agent.ALLOWED_RESUME_EXT:
        raise HTTPException(status_code=400, detail="Only .pdf and .tex files are supported.")

    # Optional custom name; keep the original extension if the user omits it.
    if name and name.strip():
        target = ai_agent.safe_resume_name(name.strip())
        if not target.lower().endswith(ai_agent.ALLOWED_RESUME_EXT):
            target += ext
    else:
        target = orig

    file_path = ai_agent.RESUMES_DIR / target
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Extract keywords using AI in the background, or do it inline
    settings = crud.get_settings(db)
    resume_text = ai_agent.extract_resume_text(target)
    if resume_text and settings:
        try:
            keywords_json = ai_agent.extract_resume_keywords(
                resume_text, 
                api_key=settings.gemini_api_key, 
                model_name=settings.gemini_model
            )
            crud.update_settings(db, schemas.SettingsBase(extracted_keywords=keywords_json))
        except Exception as e:
            logger.error(f"Failed to extract keywords: {e}")

    return {"message": "Resume uploaded successfully", "resumes": ai_agent.list_resumes()}

@app.delete("/api/resumes/{name}")
def remove_resume(name: str):
    if not ai_agent.delete_resume(name):
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"deleted": name, "resumes": ai_agent.list_resumes()}

@app.post("/api/jobs/{job_id}/cover-letter")
def generate_cl_for_job(job_id: int, resume: str = None, db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")

    settings = crud.get_settings(db)
    cl_text = generate_cover_letter(
        db_job.title, db_job.company, db_job.location or "", db_job.description or "",
        api_key=settings.gemini_api_key, model_name=settings.gemini_model, resume_name=resume
    )
    if cl_text.startswith("Error"):
        raise HTTPException(status_code=400, detail=cl_text)

    db_job = crud.update_job_status(db, job_id, schemas.JobUpdate(cover_letter=cl_text))
    return {"cover_letter": cl_text}

@app.post("/api/jobs/{job_id}/tailored-resume")
def generate_resume_for_job(job_id: int, resume: str = None, db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")

    settings = crud.get_settings(db)
    resume_text = generate_tailored_resume(
        db_job.title, db_job.company, db_job.location or "", db_job.description or "",
        api_key=settings.gemini_api_key, model_name=settings.gemini_model, resume_name=resume
    )
    if resume_text.startswith("Error"):
        raise HTTPException(status_code=400, detail=resume_text)

    crud.update_job_status(db, job_id, schemas.JobUpdate(tailored_resume=resume_text))
    return {"tailored_resume": resume_text}

@app.get("/api/jobs/{job_id}/resume/pdf")
def get_resume_pdf(job_id: int, db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job or not db_job.tailored_resume:
        raise HTTPException(status_code=404, detail="Tailored resume not found for this job")

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "resume.tex"
        
        # Clean up Markdown code fences if Gemini incorrectly output them
        clean_tex = db_job.tailored_resume.strip()
        if clean_tex.startswith("```"):
            lines = clean_tex.split("\n")
            if lines[0].startswith("```"): lines = lines[1:]
            if lines[-1].startswith("```"): lines = lines[:-1]
            clean_tex = "\n".join(lines).strip()
            
        tex_path.write_text(clean_tex)
        
        try:
            # Run pdflatex twice for references, though usually once is enough for simple resumes
            subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "resume.tex"],
                cwd=tmpdir,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
        except subprocess.CalledProcessError as e:
            logger.error(f"LaTeX compilation failed: {e.stdout.decode()} {e.stderr.decode()}")
            raise HTTPException(status_code=500, detail="Failed to compile PDF from LaTeX")
        
        pdf_path = Path(tmpdir) / "resume.pdf"
        if not pdf_path.exists():
            raise HTTPException(status_code=500, detail="PDF file was not generated")
            
        # Copy the pdf out of the tempdir so it persists for FileResponse
        out_path = Path("/tmp") / f"resume_{job_id}.pdf"
        shutil.copy(pdf_path, out_path)
        
    return FileResponse(
        path=out_path,
        media_type="application/pdf",
        filename=f"{db_job.company}_Resume.pdf"
    )

@app.post("/api/jobs/{job_id}/fetch-jd")
async def fetch_jd(job_id: int, db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if not db_job.url:
        raise HTTPException(status_code=400, detail="Job has no URL")
        
    try:
        description = await fetch_job_description(db_job.url)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
        
    settings = crud.get_settings(db)
    api_key = settings.gemini_api_key if settings else None
    clean_desc = ai_agent.sanitize_job_description(description, api_key)
        
    db_job = crud.update_job_status(db, job_id, schemas.JobUpdate(description=clean_desc))
    return {"description": clean_desc}
