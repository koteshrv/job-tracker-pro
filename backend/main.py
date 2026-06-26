from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, UploadFile, File
import shutil
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
import logging

from . import models, schemas, crud
from .database import engine, get_db
from .scraper_core import run_scraper
from .ai_agent import generate_cover_letter, UPLOAD_DIR

logger = logging.getLogger(__name__)

# Create tables if they don't exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Job Scraper ATS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def bg_scrape_task(db: Session):
    try:
        new_jobs = run_scraper(db)
        crud.create_scraper_log(db, schemas.ScraperLogBase(jobs_found=len(new_jobs), status="SUCCESS"))
        logger.info(f"Background scrape complete! Found {len(new_jobs)} new jobs.")
    except Exception as e:
        crud.create_scraper_log(db, schemas.ScraperLogBase(jobs_found=0, status="FAILED", error_message=str(e)))
        logger.error(f"Background scrape failed: {e}")

@app.post("/api/run-scraper")
def trigger_scraper(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(bg_scrape_task, db)
    return {"message": "Scraper job started in the background."}

@app.get("/api/jobs", response_model=List[schemas.Job])
def read_jobs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    jobs = crud.get_jobs(db, skip=skip, limit=limit)
    return jobs

@app.put("/api/jobs/{job_id}", response_model=schemas.Job)
def update_job(job_id: int, job_update: schemas.JobUpdate, db: Session = Depends(get_db)):
    db_job = crud.update_job_status(db, job_id, job_update)
    if db_job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return db_job

@app.get("/api/settings", response_model=schemas.Settings)
def get_settings(db: Session = Depends(get_db)):
    return crud.get_settings(db)

@app.put("/api/settings", response_model=schemas.Settings)
def update_settings(settings: schemas.SettingsBase, db: Session = Depends(get_db)):
    return crud.update_settings(db, settings)

@app.get("/api/history", response_model=List[schemas.ScraperLog])
def get_history(limit: int = 50, db: Session = Depends(get_db)):
    return crud.get_scraper_logs(db, limit=limit)

@app.post("/api/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    file_path = UPLOAD_DIR / "resume.pdf"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"message": "Resume uploaded successfully"}

@app.post("/api/jobs/{job_id}/cover-letter")
def generate_cl_for_job(job_id: int, db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    cl_text = generate_cover_letter(db_job.title, db_job.company, db_job.location or "")
    if cl_text.startswith("Error"):
        raise HTTPException(status_code=400, detail=cl_text)
    
    db_job = crud.update_job_status(db, job_id, schemas.JobUpdate(cover_letter=cl_text))
    return {"cover_letter": cl_text}
