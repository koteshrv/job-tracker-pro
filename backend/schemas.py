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

class GenerationRequest(BaseModel):
    resume: Optional[str] = None
    generation_mode: Optional[str] = None

class OnDemandRequest(BaseModel):
    company: str
    title: str
    description: str
    resume: Optional[str] = None
    generation_mode: Optional[str] = None
    type: str = "cover_letter" # 'cover_letter' or 'resume'

class SettingsBase(BaseModel):
    telegram_chat_id: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = "gemini-2.5-flash, gemini-flash-latest, gemini-2.5-pro"
    cron_schedule: Optional[str] = "0 */4 * * *"
    trash_retention_days: Optional[int] = 30
    active_companies: Optional[str] = None
    search_keywords: Optional[str] = None
    extracted_keywords: Optional[str] = None
    total_prompt_tokens: Optional[int] = 0
    total_candidate_tokens: Optional[int] = 0
    custom_guidelines: Optional[str] = None
    model_telemetry: Optional[str] = None
    api_key_tag: Optional[str] = None
    max_pages: Optional[int] = 3
    
    ai_mode: Optional[str] = "gemini"
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    grok_api_key: Optional[str] = None
    ollama_url: Optional[str] = "http://localhost:11434"
    ollama_model: Optional[str] = "llama3"

class Settings(SettingsBase):
    id: int
    class Config:
        from_attributes = True

class ScraperLogBase(BaseModel):
    jobs_found: int
    status: str
    error_message: Optional[str] = None
    trigger_source: str = "MANUAL"
    detailed_logs: Optional[str] = None
    raw_logs: Optional[str] = None

class ScraperLog(ScraperLogBase):
    id: int
    timestamp: datetime
    class Config:
        from_attributes = True
