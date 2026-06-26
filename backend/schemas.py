from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class JobBase(BaseModel):
    company: str
    title: str
    url: str

class JobCreate(JobBase):
    pass

class JobUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    applied_at: Optional[datetime] = None

class Job(JobBase):
    id: int
    status: str
    notes: Optional[str] = None
    cover_letter: Optional[str] = None
    created_at: datetime
    applied_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class SettingsBase(BaseModel):
    telegram_chat_id: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    cron_schedule: Optional[str] = "0 */4 * * *"
    active_companies: Optional[str] = None

class Settings(SettingsBase):
    id: int
    class Config:
        from_attributes = True

class ScraperLogBase(BaseModel):
    jobs_found: int
    status: str
    error_message: Optional[str] = None

class ScraperLog(ScraperLogBase):
    id: int
    timestamp: datetime
    class Config:
        from_attributes = True
