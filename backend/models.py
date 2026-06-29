from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from .database import Base

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    company = Column(String, index=True)
    title = Column(String, index=True)
    url = Column(String, unique=True, index=True)
    location = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    
    # New v3.0 ATS fields
    status = Column(String, default="NEW") # NEW, APPLIED, INTERVIEWING, REJECTED, IGNORED
    notes = Column(Text, nullable=True)
    cover_letter = Column(Text, nullable=True)
    tailored_resume = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    applied_at = Column(DateTime(timezone=True), nullable=True)

class Settings(Base):
    __tablename__ = "settings"
    
    id = Column(Integer, primary_key=True, index=True)
    telegram_chat_id = Column(String, nullable=True)
    telegram_bot_token = Column(String, nullable=True) # Encrypted
    gemini_api_key = Column(String, nullable=True) # Encrypted
    gemini_model = Column(String, default="gemini-2.5-flash, gemini-flash-latest, gemini-2.5-pro")
    cron_schedule = Column(String, default="0 */4 * * *")
    trash_retention_days = Column(Integer, default=30)
    active_companies = Column(String, nullable=True) # JSON array of active companies
    search_keywords = Column(String, nullable=True) # JSON array of search keywords
    extracted_keywords = Column(String, nullable=True) # JSON array of keywords extracted from resume
    total_prompt_tokens = Column(Integer, default=0)
    total_candidate_tokens = Column(Integer, default=0)
    custom_guidelines = Column(String, nullable=True)
    model_telemetry = Column(String, nullable=True) # JSON object tracking per-model statistics
    api_key_tag = Column(String, nullable=True)
    max_pages = Column(Integer, default=3)
    
    # AI Provider routing
    ai_mode = Column(String, default="gemini") # "gemini", "openai", "anthropic", "grok", "ollama"
    openai_api_key = Column(String, nullable=True)
    anthropic_api_key = Column(String, nullable=True)
    grok_api_key = Column(String, nullable=True)
    ollama_url = Column(String, default="http://localhost:11434")
    ollama_model = Column(String, default="llama3")

class ScraperLog(Base):
    __tablename__ = "scraper_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    jobs_found = Column(Integer, default=0)
    status = Column(String) # "SUCCESS", "FAILED"
    error_message = Column(Text, nullable=True)
    trigger_source = Column(String, default="MANUAL") # "MANUAL", "CRON"
    detailed_logs = Column(Text, nullable=True) # JSON string of company logs
    raw_logs = Column(Text, nullable=True) # Full console output for this runutcomes
