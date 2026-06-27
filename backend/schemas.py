from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class LoginRequest(BaseModel):
    username: str
    password: str

class BulkStatusRequest(BaseModel):
    ids: List[int]
    status: str

class BulkIdsRequest(BaseModel):
    ids: List[int]

class JobBase(BaseModel):
    company: str
    title: str
    url: str
    location: Optional[str] = None
    description: Optional[str] = None

class JobCreate(JobBase):
    pass

class JobUpdate(BaseModel):
    company: Optional[str] = None
    title: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    description: Optional[str] = None
    cover_letter: Optional[str] = None
    tailored_resume: Optional[str] = None
    applied_at: Optional[datetime] = None

class Job(JobBase):
    id: int
    status: str
    notes: Optional[str] = None
    cover_letter: Optional[str] = None
    tailored_resume: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    applied_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class SettingsBase(BaseModel):
    telegram_chat_id: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = "gemini-2.5-flash"
    cron_schedule: Optional[str] = "0 */4 * * *"
    trash_retention_days: Optional[int] = 30
    active_companies: Optional[str] = None
    search_keywords: Optional[str] = None
    extracted_keywords: Optional[str] = None

class Settings(SettingsBase):
    id: int
    class Config:
        from_attributes = True

class ScraperLogBase(BaseModel):
    jobs_found: int
    status: str
    error_message: Optional[str] = None
    trigger_source: Optional[str] = "MANUAL"

class ScraperLog(ScraperLogBase):
    id: int
    timestamp: datetime
    class Config:
        from_attributes = True
