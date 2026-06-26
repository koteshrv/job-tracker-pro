from sqlalchemy.orm import Session
from . import models, schemas
from .crypto import encrypt_value, decrypt_value

def get_jobs(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Job).offset(skip).limit(limit).all()

def get_job(db: Session, job_id: int):
    return db.query(models.Job).filter(models.Job.id == job_id).first()

def create_job(db: Session, job: schemas.JobCreate):
    # Check if exists
    db_job = db.query(models.Job).filter(models.Job.url == job.url).first()
    if db_job:
        return db_job
    db_job = models.Job(**job.model_dump())
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job

def update_job_status(db: Session, job_id: int, job_update: schemas.JobUpdate):
    db_job = get_job(db, job_id)
    if db_job:
        update_data = job_update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_job, key, value)
        db.commit()
        db.refresh(db_job)
    return db_job

def get_settings(db: Session):
    settings = db.query(models.Settings).first()
    if not settings:
        settings = models.Settings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    decrypted = schemas.Settings.model_validate(settings)
    if decrypted.telegram_bot_token:
        decrypted.telegram_bot_token = decrypt_value(decrypted.telegram_bot_token)
    return decrypted

def update_settings(db: Session, settings: schemas.SettingsBase):
    db_settings = db.query(models.Settings).first()
    if not db_settings:
        db_settings = models.Settings()
        db.add(db_settings)
    
    if settings.telegram_chat_id is not None:
        db_settings.telegram_chat_id = settings.telegram_chat_id
    if settings.telegram_bot_token is not None:
        db_settings.telegram_bot_token = encrypt_value(settings.telegram_bot_token)
    if settings.cron_schedule is not None:
        db_settings.cron_schedule = settings.cron_schedule
    if settings.active_companies is not None:
        db_settings.active_companies = settings.active_companies
        
    db.commit()
    db.refresh(db_settings)
    return get_settings(db)

def get_scraper_logs(db: Session, limit: int = 50):
    return db.query(models.ScraperLog).order_by(models.ScraperLog.timestamp.desc()).limit(limit).all()

def create_scraper_log(db: Session, log: schemas.ScraperLogBase):
    db_log = models.ScraperLog(**log.model_dump())
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log
