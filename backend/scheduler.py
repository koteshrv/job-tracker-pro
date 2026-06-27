import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .database import SessionLocal
from . import crud, schemas
from .scraper_core import run_scraper

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()
JOB_ID = "scheduled_scrape"

def _scheduled_scrape():
    """Run the scraper from a self-managed DB session (no request context)."""
    db = SessionLocal()
    log = crud.create_scraper_log(db, schemas.ScraperLogBase(jobs_found=0, status="RUNNING", trigger_source="CRON"))
    try:
        settings = crud.get_settings(db)
        # Clean old trash before scraping
        if settings.trash_retention_days > 0:
            deleted_trash = crud.clean_old_trash(db, settings.trash_retention_days)
            if deleted_trash > 0:
                logger.info(f"Cleaned up {deleted_trash} old trash items.")
                
        new_jobs = run_scraper(db)
        crud.update_scraper_log(db, log.id, jobs_found=len(new_jobs), status="SUCCESS")
        logger.info(f"Scheduled scrape complete. Found {len(new_jobs)} new jobs.")
    except Exception as e:
        crud.update_scraper_log(db, log.id, status="FAILED", error_message=str(e))
        logger.error(f"Scheduled scrape failed: {e}")
    finally:
        db.close()

def reschedule(cron_expr: str) -> bool:
    """(Re)install the cron job. Returns False if the expression is invalid."""
    if not cron_expr:
        return False
    try:
        trigger = CronTrigger.from_crontab(cron_expr)
    except Exception as e:
        logger.error(f"Invalid cron expression '{cron_expr}': {e}")
        return False
    scheduler.add_job(_scheduled_scrape, trigger, id=JOB_ID, replace_existing=True)
    logger.info(f"Scheduled scraper with cron '{cron_expr}'.")
    return True

def start():
    """Start the scheduler and install the job from the saved settings."""
    if not scheduler.running:
        scheduler.start()
    db = SessionLocal()
    try:
        settings = crud.get_settings(db)
        reschedule(settings.cron_schedule or "0 */4 * * *")
    finally:
        db.close()
