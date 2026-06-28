from sqlalchemy.orm import Session
from . import models, schemas
from .crypto import encrypt_value, decrypt_value
from datetime import datetime, timedelta, timezone

def get_jobs(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Job).filter(models.Job.status != 'FALSE_POSITIVE').order_by(models.Job.created_at.desc()).offset(skip).limit(limit).all()

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

def delete_job(db: Session, job_id: int) -> bool:
    db_job = get_job(db, job_id)
    if db_job:
        db.delete(db_job)
        db.commit()
        return True
    return False

def delete_all_jobs(db: Session) -> int:
    count = db.query(models.Job).delete()
    db.commit()
    return count

def empty_trash(db: Session) -> int:
    count = db.query(models.Job).filter(models.Job.status == "TRASH").delete(synchronize_session=False)
    db.commit()
    return count

def clean_old_trash(db: Session, retention_days: int) -> int:
    from datetime import datetime, timedelta
    from sqlalchemy import func
    
    cutoff = datetime.now() - timedelta(days=retention_days)
    count = db.query(models.Job).filter(
        models.Job.status == "TRASH",
        # Fallback to created_at if updated_at is null (for older items)
        func.coalesce(models.Job.updated_at, models.Job.created_at) < cutoff
    ).delete(synchronize_session=False)
    db.commit()
    return count

def bulk_update_status(db: Session, ids: list, status: str) -> int:
    count = db.query(models.Job).filter(models.Job.id.in_(ids)).update(
        {models.Job.status: status}, synchronize_session=False)
    db.commit()
    return count

def bulk_delete_jobs(db: Session, ids: list) -> int:
    count = db.query(models.Job).filter(models.Job.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return count

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
    if decrypted.gemini_api_key:
        decrypted.gemini_api_key = decrypt_value(decrypted.gemini_api_key)
    return decrypted

ENCRYPTED_FIELDS = {"telegram_bot_token", "gemini_api_key"}

def update_settings(db: Session, settings: schemas.SettingsBase):
    db_settings = db.query(models.Settings).first()
    if not db_settings:
        db_settings = models.Settings()
        db.add(db_settings)

    # Only touch fields the client actually sent, so a partial update (e.g. saving
    # just the company selection) doesn't reset other settings to their defaults.
    provided = settings.model_dump(exclude_unset=True)
    for key, value in provided.items():
        if value is None:
            continue
        if key in ENCRYPTED_FIELDS:
            value = encrypt_value(value)
        setattr(db_settings, key, value)

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

def fail_orphaned_running_logs(db: Session) -> int:
    """Mark any lingering RUNNING logs as FAILED. A RUNNING log at startup means a
    previous process died mid-scrape, so it would otherwise hang forever."""
    orphans = db.query(models.ScraperLog).filter(models.ScraperLog.status == "RUNNING").all()
    for log in orphans:
        log.status = "FAILED"
        log.error_message = "Interrupted — the server restarted while this run was in progress."
    if orphans:
        db.commit()
    return len(orphans)

def update_scraper_log(db: Session, log_id: int, status: str = None, jobs_found: int = None, error_message: str = None, detailed_logs: str = None, raw_logs: str = None) -> models.ScraperLog:
    log = db.query(models.ScraperLog).filter(models.ScraperLog.id == log_id).first()
    if log:
        if status is not None:
            log.status = status
        if jobs_found is not None:
            log.jobs_found = jobs_found
        if error_message is not None:
            log.error_message = error_message
        if detailed_logs is not None:
            log.detailed_logs = detailed_logs
        if raw_logs is not None:
            log.raw_logs = raw_logs
        db.commit()
        db.refresh(log)
    return log

def delete_old_scraper_logs(db: Session, days: int = 14) -> int:
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    old_logs = db.query(models.ScraperLog).filter(models.ScraperLog.timestamp < cutoff_date).all()
    count = len(old_logs)
    if count > 0:
        for log in old_logs:
            db.delete(log)
        db.commit()
    return count
