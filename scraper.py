import os
import sqlite3
import requests
import asyncio
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

DB_PATH = "jobs.db"
# Temporarily using generic keywords just to test if the pipeline is working
KEYWORDS = ["software", "engineer", "developer", "backend", "frontend", "python"]
LOCATIONS = ["india", "bangalore", "hyderabad", "pune", "gurgaon", "noida", "remote"]

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            company TEXT,
            job_title TEXT,
            url TEXT,
            date_sent TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def has_been_notified(url):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    seven_days_ago = datetime.now() - timedelta(days=7)
    cursor.execute('SELECT 1 FROM notifications WHERE url = ? AND date_sent > ?', (url, seven_days_ago))
    result = cursor.fetchone()
    conn.close()
    return bool(result)

def record_notification(company, job_title, url):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('INSERT INTO notifications (company, job_title, url, date_sent) VALUES (?, ?, ?, ?)', 
                   (company, job_title, url, datetime.now()))
    conn.commit()
    conn.close()

def send_batched_telegram_alert(jobs):
    if not jobs:
        return True
        
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.warning("Skipping Batched Telegram alert - Missing credentials in .env")
        return False
        
    # Telegram max message length is 4096 characters. We will chunk if necessary.
    header = f"🚨 {len(jobs)} New Roles Detected!\n\n"
    chunks = []
    current_msg = header
    
    for job in jobs:
        job_text = f"🏢 {job['company']}\n📌 {job['title']}\n🔗 {job['url']}\n\n"
        if len(current_msg) + len(job_text) > 4000:
            chunks.append(current_msg)
            current_msg = job_text
        else:
            current_msg += job_text
            
    if current_msg:
        chunks.append(current_msg)
        
    api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    
    success = True
    for chunk in chunks:
        payload = {"chat_id": TELEGRAM_CHAT_ID, "text": chunk, "disable_web_page_preview": True}
        try:
            response = requests.post(api_url, json=payload)
            response.raise_for_status()
            logger.info("✅ Batched Telegram alert chunk sent successfully!")
        except Exception as e:
            error_msg = str(e).replace(TELEGRAM_BOT_TOKEN, "***HIDDEN_TOKEN***")
            logger.error(f"Failed to send batched Telegram message: {error_msg}")
            success = False
            
    return success

def check_keywords_and_location(title, location):
    title_lower = title.lower() if title else ""
    loc_lower = location.lower() if location else ""
    
    if any(x in title_lower for x in ["intern", "manager", "director", "vp", "president", "principal"]):
        return False
        
    keyword_match = any(k in title_lower for k in KEYWORDS)
    location_match = any(l in loc_lower for l in LOCATIONS) or not location 
    
    return keyword_match and location_match

def process_greenhouse(target, new_jobs):
    board_token = target.get("api_board_token")
    company = target.get("company")
    url = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            logger.error(f"Greenhouse API error for {company}: {r.status_code}")
            return
            
        jobs = r.json().get("jobs", [])
        for job in jobs:
            title = job.get("title", "")
            location = job.get("location", {}).get("name", "")
            job_url = job.get("absolute_url", "")
            
            if check_keywords_and_location(title, location):
                if not has_been_notified(job_url):
                    logger.info(f"Adding to batch: {company} - {title}")
                    new_jobs.append({"company": company, "title": title, "url": job_url})
    except Exception as e:
        logger.error(f"Error processing Greenhouse for {company}: {e}")

def process_lever(target, new_jobs):
    board_token = target.get("api_board_token")
    company = target.get("company")
    url = f"https://api.lever.co/v0/postings/{board_token}"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            logger.error(f"Lever API error for {company}: {r.status_code}")
            return
            
        jobs = r.json()
        for job in jobs:
            title = job.get("text", "")
            location = job.get("categories", {}).get("location", "")
            job_url = job.get("hostedUrl", "")
            
            if check_keywords_and_location(title, location):
                if not has_been_notified(job_url):
                    logger.info(f"Adding to batch: {company} - {title}")
                    new_jobs.append({"company": company, "title": title, "url": job_url})
    except Exception as e:
        logger.error(f"Error processing Lever for {company}: {e}")

async def process_playwright(targets, new_jobs):
    if not targets:
        return
        
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False, 
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        page = await context.new_page()
        await stealth_async(page)
        
        for target in targets:
            company = target.get("company")
            url = target.get("url")
            no_results_text = target.get("no_results_text", "0 results found").lower()
            
            logger.info(f"Scraping Playwright target: {company}")
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(5000)
                
                content = await page.content()
                content_lower = content.lower()
                
                if no_results_text not in content_lower:
                    if not has_been_notified(url):
                        title = "API Gateway / Apigee Role (Automated URL Match)"
                        logger.info(f"Adding to batch: {company} - {title}")
                        new_jobs.append({"company": company, "title": title, "url": url})
                else:
                    logger.info(f"No results found for {company}.")
            except Exception as e:
                logger.error(f"Playwright error on {company}: {e}")
                
        await browser.close()

def main():
    logger.info("Starting Hybrid Job Scraper in Batch Mode...")
    init_db()
    
    import json
    try:
        with open("targets.json", "r") as f:
            targets = json.load(f)
    except Exception as e:
        logger.error(f"Failed to load targets.json: {e}")
        return

    new_jobs = []
    playwright_targets = []
    
    for target in targets:
        t_type = target.get("type", "")
        if t_type == "greenhouse":
            logger.info(f"Running Greenhouse Engine for {target.get('company')}")
            process_greenhouse(target, new_jobs)
        elif t_type == "lever":
            logger.info(f"Running Lever Engine for {target.get('company')}")
            process_lever(target, new_jobs)
        elif t_type == "playwright":
            playwright_targets.append(target)
            
    if playwright_targets:
        logger.info(f"Running Playwright Engine for {len(playwright_targets)} targets...")
        asyncio.run(process_playwright(playwright_targets, new_jobs))

    if new_jobs:
        logger.info(f"Found {len(new_jobs)} total new jobs! Preparing to send batched Telegram alert...")
        if send_batched_telegram_alert(new_jobs):
            # Only record notifications if the batch was successfully sent
            for job in new_jobs:
                record_notification(job['company'], job['title'], job['url'])
            logger.info("Database successfully updated with notified jobs.")
        else:
            logger.error("Failed to send batched alert. Database not updated. Will retry next run.")
    else:
        logger.info("No new jobs found in this run.")

    logger.info("Scraping completed.")

if __name__ == "__main__":
    main()
