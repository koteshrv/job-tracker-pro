# Agent Knowledge & Architecture Document

This document serves as a complete reference for any AI agent or developer working on the `job-scraper` project. It details the architecture, the scraping mechanics, the hard-learned lessons (especially around difficult Angular sites like TCS iBegin), current status, and future improvements.

## 1. System Architecture

The project is a full-stack job scraping and management application consisting of:
*   **Backend:** FastAPI (`main.py`), using SQLite (`backend/jobs.db`) with SQLAlchemy models (`backend/models.py`).
*   **Frontend:** React + Vite + TypeScript (`frontend/`), utilizing TailwindCSS for styling and components like a Kanban board (`frontend/src/components/KanbanBoard.tsx`) for tracking job application status.
*   **Scraper Engine:** A robust Python-based scraping pipeline utilizing `playwright` for dynamic SPA execution and Google's Gemini (`ai_agent.py`) for intelligent HTML parsing and relevance filtering.
*   **Targets Definition:** `targets.json` defines the URLs, selectors, and specific wait behaviors for different companies.

## 2. Scraper Core Mechanics (`backend/scraper_core.py`)

The scraper is designed to handle modern Single Page Applications (SPAs).
*   **Stealth:** Uses `playwright-stealth` to bypass basic anti-bot mechanisms.
*   **Extraction:** Instead of writing custom parsers for every site, the scraper extracts a cleaned chunk of the DOM (stripping out heavy SVG, base64 images, and scripts) and sends it to the Gemini API. Gemini returns structured JSON containing job titles, URLs, and locations.
*   **Pagination:** 
    *   It relies heavily on analyzing the DOM to find the active page (`li.active`) and then selecting its next sibling (`li.active + li > a`) to click the next page number sequentially.
    *   It avoids `href` traversal when possible to prevent triggering full page reloads on React/Angular sites.

## 3. The TCS iBegin Saga (Critical Lessons Learned)

TCS iBegin uses a highly rigid and legacy Angular 1.x framework. We spent hours battling severe state isolation and event binding bugs when attempting to apply search filters and paginate correctly. **Do not modify the TCS scraping logic without understanding these constraints:**

1.  **The Great Scope Isolation Bug:** 
    *   Attempting to inject a search filter ("software") into the visual search box via Playwright's `.fill()` or native DOM manipulation caused catastrophic desyncs. The text appeared visually, but Angular's internal `$modelValue` and `$parsers` pipeline remained empty, causing API calls to return unfiltered jobs.
    *   Walking the `$parent` scope tree to manually inject `searchString` and firing `$apply()` still failed because the underlying Angular service constructed the API payload using a completely different parameter (`userText`).
2.  **The UI Reload Trap:**
    *   Using a trusted physical Playwright click (`page.locator().click(force=True)`) on the search button *did* successfully filter the initial jobs, but it triggered an Angular routing bug that forced a complete browser reload, wiping the filter state for subsequent pagination.
3.  **THE ULTIMATE FIX (Network Interception):**
    *   We completely abandoned UI-level Angular manipulation. Instead, we sniffed the raw XHR payloads and discovered the API (`api/v1/jobs/searchJ`) expects a JSON payload containing `"userText"`.
    *   We implemented a Playwright Network Interceptor (`page.route("**/api/v1/jobs/searchJ**")`). 
    *   Now, whenever the browser attempts to fetch jobs (initial search OR pagination), Playwright catches the outgoing HTTP request, rips open the POST data, forcefully injects `"userText": "software"`, and sends it to the server. This bypasses the UI and Angular entirely, mathematically guaranteeing that the filter is applied across all pages.
4.  **Pagination Strategy:**
    *   Because the network interceptor handles the filter, pagination is as simple as finding the active page (`li.active + li > a`) and clicking it.
    *   We still scroll the button into view (`scrollIntoView({block: 'center'})`) and use Playwright's trusted physical click to trigger the native `on-touch` event without reloading the page.

## 4. Current Status & Known Issues

*   **TCS Pagination:** We have finalized the exact timing and interaction strategy for TCS. It successfully applies the 'software' filter, waits for the API, centers the Next button, and clicks it flawlessly without losing state.
*   **Database Flush:** Found jobs are stored in `backend/jobs.db`. False positives (rejected by Gemini based on location or role mismatch) are cached to prevent re-processing.
*   **Stuck Right Now:** The user has experienced high penalties/frustration due to the iterative debugging of the TCS interaction. The code is currently strictly locked to the verified working mechanism.

## 5. Future Improvements

1.  **Concurrency / Clustering:** Currently, `test_targets.py` runs sequentially. Implementing a playwright cluster or `asyncio.gather` for multiple targets would vastly speed up scraping.
2.  **Intelligent Retry Mechanisms:** Implement automatic screenshot captures on failure (`page.screenshot()`) immediately before throwing an exception to help agents debug headless failures instantly.
3.  **Gemini Batching:** Gemini API calls are somewhat expensive and rate-limited. We could batch DOM fragments into larger prompts if token limits allow.
4.  **Frontend State Sync:** Ensure the React frontend dynamically polls the FastAPI backend (e.g., via WebSocket) to update the Kanban board in real-time as jobs are scraped.
