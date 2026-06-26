# Hybrid ATS Job Scraper & Telegram Alerter

An automated, Dockerized job scraper designed to monitor modern ATS platforms (Greenhouse/Lever) and traditional enterprise portals (Taleo, Oracle Cloud, Workday) for specific roles. It bypasses Web Application Firewalls (like Akamai) using headed Playwright with Xvfb and sends batched alerts directly to your Telegram.

## Features
- **Hybrid Engine:** Fast JSON parsing for Lever/Greenhouse boards, and stealthy Playwright browser scraping for enterprise portals.
- **Telegram Bot Integration:** Get real-time alerts for new job postings directly to your phone.
- **Smart Batching:** Consolidates all found jobs into a single clean Telegram message to avoid notification spam.
- **Database Deduplication:** Uses a local SQLite database (`jobs.db`) to ensure you never receive duplicate alerts for the same job within a 7-day window.
- **Dockerized:** Runs cleanly on any Linux server, Mac, or Raspberry Pi via a single cron job.

---

## 🛠️ Setup Instructions

### 1. Create a Telegram Bot
1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` and follow the prompts to create your bot.
3. Save the **API Token** provided by BotFather.
4. Open a chat with your new bot and send it a simple "Hello" message.
5. Go to your browser and visit: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
6. Look for `"chat": {"id": <CHAT_ID>}` in the JSON response. Save this Chat ID.

### 2. Configure Environment
Clone this repository and set up your environment variables:
```bash
git clone <your-repo-url>
cd job-scraper
cp .env.example .env
```
Open `.env` and paste your Token and Chat ID:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

### 3. Build & Run Locally
Build the Docker image. This installs Python, Playwright, and Xvfb (Virtual Framebuffer for headed browsing):
```bash
docker build -t job-scraper .
```

Run the container. We map the current directory as a volume so the SQLite `jobs.db` database saves persistently across runs:
```bash
docker run --rm --name job-scraper-test -v $(pwd):/app --env-file .env job-scraper
```

### 4. Deploy via Cron Job
To run this fully autonomously (e.g., every 4 hours), add it to your server's crontab:
```bash
crontab -e
```
Add the following line (make sure to update the path to match your deployment directory):
```bash
0 */4 * * * cd /path/to/job-scraper && /usr/bin/docker run --rm -v $(pwd):/app --env-file .env job-scraper >> scraper.log 2>&1
```

---

## 🎯 Configuration

### `targets.json`
This file controls which companies are scraped. 
- For **Greenhouse** and **Lever**, you only need the company name and their ATS Board Token.
- For **Playwright**, you must provide the exact search URL and the text that appears when NO jobs are found (e.g., "0 jobs" or "no results").

### `scraper.py`
Currently, the search keywords (e.g., `software engineer`, `backend`) and target locations are defined as lists at the top of the `scraper.py` file. If you modify them, remember to rebuild the Docker container!
