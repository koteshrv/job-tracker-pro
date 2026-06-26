import os
import google.generativeai as genai
import PyPDF2
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
RESUME_PATH = UPLOAD_DIR / "resume.pdf"

def extract_resume_text() -> str:
    if not RESUME_PATH.exists():
        return ""
    try:
        text = ""
        with open(RESUME_PATH, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
        return text
    except Exception as e:
        print(f"Failed to read resume: {e}")
        return ""

def generate_cover_letter(job_title: str, company: str, location: str = "") -> str:
    if not api_key:
        return "Error: GEMINI_API_KEY is not configured in the backend environment."
    
    resume_text = extract_resume_text()
    if not resume_text:
        return "Error: Could not read resume. Please upload your resume first."

    prompt = f"""
You are an expert career coach and professional writer. 
Write a concise, modern, and highly persuasive cover letter for the role of {job_title} at {company} {f'located in {location}' if location else ''}.

Use the following resume to highlight my most relevant skills and experience:
---
{resume_text}
---

Requirements:
- Do NOT use generic placeholders like [Company Name] or [Your Name], deduce as much as possible from the resume.
- Keep it under 3 paragraphs.
- Be highly confident and direct.
- Focus strictly on matching the resume skills to the likely requirements of {job_title}.
"""

    try:
        model = genai.GenerativeModel("gemini-pro")
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Error generating cover letter: {str(e)}"
