import json
import logging
import requests
import urllib.parse
import asyncio
import re
import os
from bs4 import BeautifulSoup
from pydantic import BaseModel, HttpUrl
try:
    from pyvirtualdisplay import Display
    HAS_VIRTUAL_DISPLAY = True
except ImportError:
    HAS_VIRTUAL_DISPLAY = False
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from . import models, schemas
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
try:
    from fake_useragent import UserAgent
    ua = UserAgent(os="windows", browsers=["chrome", "edge"])
except ImportError:
    ua = None

# Tokens in a URL that strongly suggest it points to an actual individual job posting.
JOB_HREF_HINTS = (
    "requisition", "posting", "vacanc", "gh_jid", "opening",
    "/jobs/", "/job/", "/position/", "/role/", "/apply",
    "jobId", "job_id", "jid=", "id=", "req=", "reqid",
    "detail", "description", "profile",
)

# URL patterns that are definitely NOT individual job listings — exclude them.
EXCLUDED_HREF_PATTERNS = (
    # Auth / account pages
    "login", "signin", "sign-in", "logout", "register",
    "dashboard", "my-profile", "user/details", "applicant/",
    # Policy pages
    "privacy", "cookie", "terms", "legal",
    # Generic nav / non-job pages  
    "about", "contact", "news", "blog", "press", "media",
    "investor", "alumni", "supplier",
    "accessibility", "sitemap", "faq",
    # Company life/culture/benefits
    "life-at", "culture", "benefits", "diversity", "inclusion",
    "early-careers", "business-divisions", "locations", "job-categories",
    "business_categories", "job_categories", "our-workplace",
    # Saved/My job dashboards
    "saved-jobs", "saved_jobs", "my-jobs", "talent-community", "join-talent",
    # Specific company non-job pages
    "amazon.jobs/en/search", "amazon.jobs/content/",
    "apple.com/in/", "apple.com/shop", "apple.com/careers/in", "jobs.apple.com/careers/", "jobs.apple.com/app/",
    "microsoft.com/en-us", "microsoft.com/software",
    "xbox.com", "azure.microsoft.com", "marketplace.microsoft.com",
    "wellsfargojobs.com/en/resources", "wellsfargojobs.com/en/well-life", "wellsfargojobs.com/en/ready-to-work", "wellsfargojobs.com/en/create-a-job-alert",
    # glassdoor (all TLDs e.g. .co.in), EEOC, shorteners, support
    "glassdoor", "eeoc.gov", "bit.ly", "goo.gl",
    "go.microsoft.com", "support.google.com", "support.microsoft.com", "support.apple.com",
    # nav anchors that are literally anchor links, not job pages
    "#main", "#top", "#footer", "#skip", "#collapse",
)

# Title text patterns that are definitely NOT job titles — exclude them.
EXCLUDED_TITLE_PATTERNS = (
    "saved jobs", "job search", "click here", "access application",
    "log in", "sign in", "register", "apply now",
    "privacy policy", "cookie", "terms",
    "life at ", "about us", "contact us",
    "view profile", "view all",
    "skip to", "join the network", "join our talent",
    "(english)", "(french)", "(german)", "(spanish)", "(portuguese)",
    "(japanese)", "(polish)", "(dutch)", "(slovak)",
)

def is_valid_candidate(href: str, title: str, strict_hints: bool = False) -> bool:
    """Pre-filter out obvious garbage links so the AI doesn't waste tokens or hallucinate."""
    if not href or not title: return False
    if len(title) < 3 or len(title) > 200: return False
    
    hl = href.lower()
    tl = title.lower()
    
    if any(p in hl for p in EXCLUDED_HREF_PATTERNS):
        return False
    if any(p in tl for p in EXCLUDED_TITLE_PATTERNS):
        return False
        
    if strict_hints:
        # Must satisfy at least ONE of:
        # 1. URL contains a known job-page keyword hint
        has_hint = any(h in hl for h in JOB_HREF_HINTS)
        
        # 2. Last path segment contains digits (job IDs like /12345, /req-9876)
        last_part = href.split('?')[0].strip('/').split('/')[-1]
        has_digits = any(char.isdigit() for char in last_part)
        
        # 3. URL is deeply nested (4+ non-empty path segments).
        #    Nav/social links are shallow (e.g. /about, /login).
        #    Job detail pages are deep (e.g. /company/careers/jobs/software-engineer)
        path_segments = [s for s in href.split('?')[0].split('/') if s]
        is_deep_path = len(path_segments) >= 4
        
        if not (has_hint or has_digits or is_deep_path):
            return False
            
    return True


def _find_jobs_in_json(data):
    jobs = []
    if isinstance(data, dict):
        title = data.get("title") or data.get("jobTitle") or data.get("reqTitle")
        link = data.get("url") or data.get("jobUrl") or data.get("link") or data.get("id") or data.get("jobId")
        if title and link and isinstance(title, str) and isinstance(link, (str, int)):
            if is_valid_candidate(str(link), title):
                jobs.append({"title": title, "href": str(link)})
        
        for v in data.values():
            if isinstance(v, (dict, list)):
                jobs.extend(_find_jobs_in_json(v))
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, (dict, list)):
                jobs.extend(_find_jobs_in_json(item))
    return jobs

def _extract_jobs_from_text(text, base_url):
    try:
        data = json.loads(text)
        jobs = _find_jobs_in_json(data)
        for j in jobs:
            if not j["href"].startswith("http"):
                j["href"] = urllib.parse.urljoin(base_url, j["href"])
        if jobs:
            return jobs
    except Exception:
        pass
        
    soup = BeautifulSoup(text, "html.parser")
    jobs = []
    for a in soup.find_all("a", href=True):
        title = a.get_text(strip=True)
        if title and len(title) >= 3:
            href = urllib.parse.urljoin(base_url, a["href"])
            if is_valid_candidate(href, title):
                jobs.append({"title": title, "href": href})
    return jobs


logger = logging.getLogger(__name__)

LOCATIONS = ["india", "bangalore", "hyderabad", "pune", "gurgaon", "noida", "remote"]

DEFAULT_KEYWORDS = ["software", "engineer", "developer", "backend", "frontend", "python"]

def load_keywords(db: Session = None) -> List[str]:
    # Prefer keywords configured in Settings, then keywords.json, then defaults.
    if db is not None:
        settings = db.query(models.Settings).first()
        if settings and settings.search_keywords:
            try:
                parsed = json.loads(settings.search_keywords)
                kws = [k.strip() for k in parsed if k and k.strip()] if isinstance(parsed, list) else []
                if kws:
                    return kws
            except Exception:
                pass
    try:
        with open("keywords.json", "r") as f:
            return json.load(f)
    except Exception:
        return DEFAULT_KEYWORDS

def load_targets() -> List[Dict[str, Any]]:
    try:
        with open("targets.json", "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load targets.json: {e}")
        return []

def update_target_selector(company: str, new_selector: str):
    try:
        targets = load_targets()
        updated = False
        for t in targets:
            if t.get("company") == company:
                t["job_selector"] = new_selector
                updated = True
                break
        if updated:
            with open("targets.json", "w") as f:
                json.dump(targets, f, indent=2)
            logger.info(f"Successfully updated targets.json with AI-generated selector '{new_selector}' for {company}")
    except Exception as e:
        logger.error(f"Failed to update targets.json for {company}: {e}")

def has_been_notified(db: Session, url: str) -> bool:
    seven_days_ago = datetime.now() - timedelta(days=7)
    return db.query(models.Job).filter(models.Job.url == url, models.Job.created_at > seven_days_ago).first() is not None

def record_job(db: Session, company: str, title: str, url: str, location: str = "") -> models.Job:
    existing = db.query(models.Job).filter(models.Job.url == url).first()
    if existing:
        return existing
    job = models.Job(company=company, title=title, url=url, location=location)
    db.add(job)
    return job

def check_keywords_and_location(title: str, location: str, keywords: List[str], locations: List[str]) -> bool:
    title_lower = title.lower() if title else ""
    loc_lower = location.lower() if location else ""
    
    # We still locally drop obvious senior/non-target roles to save AI tokens
    if any(x in title_lower for x in ["intern", "manager", "director", "vp", "president", "principal", "lead", "head"]):
        return False
        
    # We NO LONGER require a strict substring match on keywords (e.g. "software"). 
    # If the title is "SDE", a strict keyword match fails. We let Gemini evaluate it.
    
    location_match = any(l in loc_lower for l in locations) or not location 
    return location_match

def process_greenhouse(db: Session, target: dict, keywords: List[str], locations: List[str], new_jobs: list, company_logs: list):
    board_token = target.get("api_board_token")
    company = target.get("company")
    url = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs"
    try:
        r = requests.get(url, timeout=10)
        jobs_found_count = 0
        if r.status_code == 200:
            for job in r.json().get("jobs", []):
                title = job.get("title", "")
                location = job.get("location", {}).get("name", "")
                job_url = job.get("absolute_url", "")
                if check_keywords_and_location(title, location, keywords, locations):
                    if not has_been_notified(db, job_url):
                        new_jobs.append({"company": company, "title": title, "url": job_url, "location": location})
                        jobs_found_count += 1
        company_logs.append({"company": company, "status": "SUCCESS", "jobs_found": jobs_found_count})
    except Exception as e:
        logger.error(f"Error processing Greenhouse {company}: {e}")
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": 0, "message": str(e)})

def process_lever(db: Session, target: dict, keywords: List[str], locations: List[str], new_jobs: list, company_logs: list):
    board_token = target.get("api_board_token")
    company = target.get("company")
    url = f"https://api.lever.co/v0/postings/{board_token}"
    try:
        r = requests.get(url, timeout=10)
        jobs_found_count = 0
        if r.status_code == 200:
            for job in r.json():
                title = job.get("text", "")
                location = job.get("categories", {}).get("location", "")
                job_url = job.get("hostedUrl", "")
                if check_keywords_and_location(title, location, keywords, locations):
                    if not has_been_notified(db, job_url):
                        new_jobs.append({"company": company, "title": title, "url": job_url, "location": location})
                        jobs_found_count += 1
        company_logs.append({"company": company, "status": "SUCCESS", "jobs_found": jobs_found_count})
    except Exception as e:
        logger.error(f"Error processing Lever {company}: {e}")
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": 0, "message": str(e)})

def process_api_post(db: Session, target: dict, keywords: List[str], new_jobs: list, company_logs: list):
    company = target.get("company")
    url = target.get("url")
    headers = target.get("headers", {})
    payload_template = target.get("payload", "")
    no_results_text = target.get("no_results_text", "0").lower()
    
    jobs_found_count = 0
    has_error = False
    error_msg = ""
    for keyword in keywords:
        try:
            kw_val = urllib.parse.quote(keyword) if "x-www-form-urlencoded" in headers.get("Content-Type", "").lower() else keyword
            payload = payload_template.replace("{keyword}", kw_val)
            r = requests.post(url, headers=headers, data=payload.encode('utf-8'), timeout=15)
            if r.status_code == 200:
                if no_results_text not in r.text.lower():
                    jobs_extracted = _extract_jobs_from_text(r.text, url)
                    if jobs_extracted:
                        for job in jobs_extracted:
                            title = job.get("title", "")
                            job_url = job.get("href", "")
                            if title and job_url:
                                if not has_been_notified(db, job_url):
                                    new_jobs.append({"company": company, "title": title, "url": job_url, "location": ""})
                                    jobs_found_count += 1
        except Exception as e:
            logger.error(f"Error processing API POST {company}: {e}")
            has_error = True
            error_msg = str(e)
            
    if has_error:
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": jobs_found_count, "message": error_msg})
    else:
        company_logs.append({"company": company, "status": "SUCCESS", "jobs_found": jobs_found_count})


def process_tech_mahindra(db: Session, target: dict, keywords: List[str], new_jobs: list, company_logs: list):
    company = target.get("company", "Tech Mahindra")
    url = target.get("url", "https://careers.techmahindra.com/")
    no_results_text = target.get("no_results_text", "0 results").lower()
    
    headers = {
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest"
    }

    matched_keywords = []
    has_error = False
    error_msg = ""
    jobs_found_count = 0
    for keyword in keywords:
        try:
            session = requests.Session()
            get_r = session.get(url, timeout=15)
            if get_r.status_code != 200: continue
            
            viewstate = re.search(r'id="__VIEWSTATE"\s+value="(.*?)"', get_r.text).group(1)
            viewstategen = re.search(r'id="__VIEWSTATEGENERATOR"\s+value="(.*?)"', get_r.text).group(1)
            eventval = re.search(r'id="__EVENTVALIDATION"\s+value="(.*?)"', get_r.text).group(1)
            
            payload_dict = {
                "ctl00$ContentPlaceHolder1$ScriptManager1": "ctl00$ContentPlaceHolder1$ctl04|ctl00$ContentPlaceHolder1$btnFreeSearch",
                "ctl00$ContentPlaceHolder1$RblList": "IT",
                "ctl00$ContentPlaceHolder1$txtAdvanceSearch": keyword,
                "ctl00$ContentPlaceHolder1$txtFirstName": "",
                "ctl00$ContentPlaceHolder1$txtLastName": "",
                "ctl00$ContentPlaceHolder1$ddlNationality": "IND",
                "ctl00$ContentPlaceHolder1$ddlTotExpYears": "Select Experience *",
                "ctl00$ContentPlaceHolder1$txtUserName": "",
                "ctl00$ContentPlaceHolder1$ddlType": "Select",
                "ctl00$ContentPlaceHolder1$txtSkills": "",
                "ctl00$ContentPlaceHolder1$ddlcountrycode": "Select country code *",
                "ctl00$ContentPlaceHolder1$txt_MobileNumber": "",
                "__EVENTTARGET": "",
                "__EVENTARGUMENT": "",
                "__LASTFOCUS": "",
                "__VIEWSTATE": viewstate,
                "__VIEWSTATEGENERATOR": viewstategen,
                "__VIEWSTATEENCRYPTED": "",
                "__EVENTVALIDATION": eventval,
                "__ASYNCPOST": "true",
                "ctl00$ContentPlaceHolder1$btnFreeSearch": "Search"
            }
            
            post_r = session.post(url, headers=headers, data=urllib.parse.urlencode(payload_dict), timeout=15)
            if post_r.status_code == 200 and no_results_text not in post_r.text.lower():
                jobs_extracted = _extract_jobs_from_text(post_r.text, url)
                if jobs_extracted:
                    for job in jobs_extracted:
                        title = job.get("title", "")
                        job_url = job.get("href", "")
                        if title and job_url:
                            if not has_been_notified(db, job_url):
                                new_jobs.append({"company": company, "title": title, "url": job_url, "location": ""})
                                jobs_found_count += 1
        except Exception as e:
            logger.error(f"Error Tech Mahindra {company}: {e}")
            has_error = True
            error_msg = str(e)
            
    if has_error:
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": jobs_found_count, "message": error_msg})
    else:
        company_logs.append({"company": company, "status": "SUCCESS", "jobs_found": jobs_found_count})


async def dismiss_popups(page) -> None:
    """Aggressively dismiss cookie banners, chatbots, and modal overlays.
    
    Three-phase approach:
    1. Click any visible 'accept/allow/agree/close' buttons
    2. Press Escape to close any remaining modal/dialog
    3. Forcibly hide all fixed/sticky overlays from the DOM
    """
    import re
    
    # Phase 1a: Click consent buttons (Accept All, Allow, Agree, etc.)
    CONSENT_PATTERNS = re.compile(
        r"^(Accept All|Accept all|Allow All|Allow all|Accept Cookies|Accept cookies|"
        r"Got it|Got It|I Accept|I agree|I Agree|Agree|Accept|Allow|Confirm|OK|Close|Decline All|Reject All)$",
        re.IGNORECASE
    )
    try:
        consent_btn = page.locator('button, a, [role="button"], [type="button"]').filter(
            has_text=CONSENT_PATTERNS
        ).first
        if await consent_btn.is_visible(timeout=1500):
            logger.debug("  [popup] Clicking consent button...")
            await consent_btn.click(timeout=2000, force=True)
            await page.wait_for_timeout(700)
    except Exception:
        pass

    # Phase 1b: Click any visible close/X buttons on popups, chatbots, and modals
    CLOSE_PATTERNS = re.compile(r"^(Close|close|Dismiss|dismiss|×|✕|✖|X|x)$")
    try:
        close_btns = page.locator(
            '[aria-label*="close" i], [aria-label*="dismiss" i], [title*="close" i], '
            '[class*="close"], [class*="dismiss"], [id*="close"], '
            'button[class*="chat"], [class*="cookie"] button'
        )
        count = await close_btns.count()
        for idx in range(min(count, 5)):  # try up to 5 close buttons
            btn = close_btns.nth(idx)
            if await btn.is_visible(timeout=500):
                logger.debug("  [popup] Clicking close/X button...")
                await btn.click(timeout=1000, force=True)
                await page.wait_for_timeout(400)
    except Exception:
        pass
    
    # Phase 2: Press Escape to close any remaining overlay/dialog
    # NOTE: Intentionally skipped — Escape resets state on many JS SPAs
    # (e.g. Microsoft Careers, Google Careers) causing pagination to break.

    # Phase 3: Forcibly hide remaining fixed/sticky overlays from the DOM
    try:
        await page.evaluate('''
            () => {
                const BANNER_SELECTORS = [
                    'iframe',
                    '[id*="cookie"]', '[class*="cookie"]',
                    '[id*="consent"]', '[class*="consent"]',
                    '[id*="gdpr"]',   '[class*="gdpr"]',
                    '[id*="banner"]', '[class*="banner"]',
                    '[id*="popup"]',  '[class*="popup"]',
                    '[id*="modal"]',  '[class*="modal"]',
                    '[id*="overlay"]','[class*="overlay"]',
                    '[id*="chat"]',   '[class*="chat"]',
                    '[id*="bot"]',    '[class*="bot"]',
                    '[id*="widget"]', '[class*="widget"]',
                ];
                BANNER_SELECTORS.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => {
                        if (!el || !el.style) return;
                        // Only hide if it is overlaying the page (fixed/sticky/absolute)
                        const style = window.getComputedStyle(el);
                        if (['fixed', 'sticky', 'absolute'].includes(style.position)
                            || el.tagName === 'IFRAME') {
                            el.style.setProperty('display', 'none', 'important');
                            el.style.setProperty('visibility', 'hidden', 'important');
                        }
                    });
                });
                // Restore scrollability in case a banner locked the body scroll
                document.body.style.removeProperty('overflow');
                document.documentElement.style.removeProperty('overflow');
            }
        ''')
    except Exception:
        pass


async def extract_playwright_jobs(page, keyword: str, source_url: str, max_pages: int = 10, infinite_scroll: bool = False, job_url_pattern: str = None, next_btn_selector: str = None, force_url_pagination: bool = False) -> List[Dict[str, str]]:
    """Pull all links from a rendered page (with pagination or infinite scroll) and let Gemini filter."""
    jobs, seen = [], set()
    
    try:
        for i in range(max_pages): # Scrape up to max_pages
            if "tcsapps.com" in source_url:
                try:
                    # Wait for the API call to finish so the pagination block is no longer hidden
                    await page.wait_for_selector("#paging:not(.ng-hide)", timeout=15000)
                except:
                    pass
            
            await page.wait_for_timeout(500)
            await dismiss_popups(page)  # Dismiss on every page/iteration
            
            html_snippet = await page.evaluate(r'''() => {
                let results = [];
                // 1. Standard anchor tags
                document.querySelectorAll('a[href]').forEach(el => {
                    const text = (el.innerText || el.getAttribute('aria-label') || el.title || "").replace(/\s+/g, ' ').trim();
                    results.push({title: text, href: el.href || ""});
                });
                
                // 2. AngularJS click handlers with string literals
                document.querySelectorAll('[data-ng-click*="/jobs/"]').forEach(el => {
                    const clickAttr = el.getAttribute('data-ng-click') || "";
                    const match = clickAttr.match(/goTo\(['"]?(\/jobs\/[^'"]+)['"]?\)/);
                    if (match) {
                        const href = window.location.origin + '/candidate' + match[1];
                        const text = (el.innerText || "").replace(/\s+/g, ' ').trim();
                        results.push({title: text, href: href});
                    }
                });
                
                // 3. AngularJS dynamic scope extraction (TCS iBegin)
                if (window.angular) {
                    document.querySelectorAll('.job-window, [data-ng-repeat*=" in "], [data-ng-click^="jobDesc"]').forEach(el => {
                        try {
                            const scope = window.angular.element(el).scope();
                            if (scope) {
                                const jobObj = scope.job || scope.j;
                                if (jobObj && jobObj.jobId) {
                                    const href = window.location.origin + '/candidate/job-details/' + jobObj.jobId;
                                    const title = jobObj.title || "";
                                    results.push({title: title, href: href});
                                }
                            }
                        } catch (e) {}
                    });
                }
                
                return results.filter(x => x.href && x.href.startsWith('http') && x.title !== undefined);
            }''')
            
            new_this_page = 0
            for item in html_snippet:
                title = item["title"]
                href = item["href"]
                if href in seen:
                    continue
                    
                if job_url_pattern:
                    # If target defines an exact pattern (regex), use ONLY that to filter, and mark it to bypass AI.
                    if re.search(job_url_pattern, href):
                        seen.add(href)
                        jobs.append({"title": title, "href": href, "source_url": source_url, "skip_ai": True})
                        new_this_page += 1
                        logger.debug(f"  + Collected (REGEX MATCH): {title[:60]!r} -> {href[:80]}")
                    continue
                    
                if not is_valid_candidate(href, title, strict_hints=True):
                    continue
                seen.add(href)
                jobs.append({"title": title, "href": href, "source_url": source_url})
                new_this_page += 1
                logger.debug(f"  + Collected: {title[:60]!r} -> {href[:80]}")
                        
            # (dismiss_popups already handles cleanup above)
            
            if i == max_pages - 1:
                logger.warning(f"  [!] Max pages ({max_pages}) reached. More jobs may be available.")
                break

            if infinite_scroll:
                # Scroll the window AND all scrollable containers to trigger lazy loading. 
                # This works for Oracle HCM and other SPAs that use nested scroll views.
                prev_height = await page.evaluate("document.body.scrollHeight")
                
                await page.evaluate('''() => {
                    window.scrollTo(0, document.body.scrollHeight);
                    const scrollables = Array.from(document.querySelectorAll('*')).filter(
                        e => e.scrollHeight > e.clientHeight && 
                        (getComputedStyle(e).overflowY === 'auto' || getComputedStyle(e).overflowY === 'scroll')
                    );
                    for (const s of scrollables) {
                        s.scrollTop = s.scrollHeight;
                    }
                }''')
                await page.wait_for_timeout(3000)
                
                new_height = await page.evaluate("document.body.scrollHeight")
                # We can't rely strictly on body height changing if it's an inner container. 
                # So we just rely on new jobs being found (checked below).
            else:
                if force_url_pagination and "page=" in source_url.lower():
                    # Skip button clicking entirely to prevent SPA state loss
                    next_btn = None
                else:
                    # Try to click next page button
                    next_btn = await page.evaluate_handle('''([selector]) => {
                        if (selector) {
                            const b = document.querySelector(selector);
                            if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !b.classList.contains('disabled')) {
                                const style = window.getComputedStyle(b);
                                if (style.display !== 'none' && style.visibility !== 'hidden') return b;
                            }
                        }
                        
                        // Fallback to heuristic matches
                        const exact_btns = Array.from(document.querySelectorAll('button, a, [role="button"], [role="link"], .pagination-next, .next'));
                        for (const b of exact_btns) {
                            const text = (b.innerText || "").toLowerCase().trim();
                            const aria = (b.getAttribute('aria-label') || "").toLowerCase();
                            if (text === "next" || text === "next page" || text === ">" || text === "›" || aria.includes("next")) {
                                if (!b.disabled && b.getAttribute('aria-disabled') !== 'true' && !b.classList.contains('disabled')) {
                                    // Ignore hidden elements
                                    const style = window.getComputedStyle(b);
                                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                                        return b;
                                    }
                                }
                            }
                        }
                        return null;
                    }''', [next_btn_selector])
                if not next_btn or not await next_btn.json_value():
                    # Fallback: if we can't find a Next button (or force_url_pagination is true), manipulate the source_url directly
                    if "page=" in source_url.lower():
                        match = re.search(r'page=(\d+)', source_url, re.IGNORECASE)
                        if match:
                            start_page = int(match.group(1))
                            next_page = start_page + i + 1
                            next_page_url = re.sub(r'page=\d+', f'page={next_page}', source_url, flags=re.IGNORECASE)
                            logger.debug(f"Paginating via URL: {next_page_url}")
                            await page.goto(next_page_url, wait_until="domcontentloaded", timeout=30000)
                            await page.wait_for_timeout(4000)
                            continue
                    break
                
                # Prefer native Playwright click to perfectly mimic human interaction.
                # This ensures SPA frameworks like Angular/React register the event properly in their zones.
                try:
                    # Scroll to bottom so the user visually sees the scroll happening
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await page.wait_for_timeout(500)
                    
                    # Scroll the element perfectly to the center of the screen to avoid sticky footers
                    await page.evaluate("(btn) => btn.scrollIntoView({block: 'center', inline: 'center'})", next_btn)
                    await page.wait_for_timeout(500)
                    
                    # (The network interceptor added during the initial search will automatically catch and fix pagination API calls!)
                    
                    # Use Playwright's trusted physical click so Angular's on-touch prevents the page from reloading
                    await next_btn.click(timeout=5000)
                except Exception as e:
                    logger.debug(f"Native click failed: {e}, falling back to JS synthetic click")
                    await page.evaluate('''(btn) => {
                        btn.dispatchEvent(new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        }));
                    }''', next_btn)
                
                # SPAs load content dynamically without triggering DOMContentLoaded. 
                # A hard wait ensures network requests finish and DOM updates.
                await page.wait_for_timeout(4000)
            
            # If we didn't find any NEW jobs on this page/scroll, we've hit the end.
            if new_this_page == 0:
                logger.debug("  No new jobs found on this page/scroll, stopping.")
                break
                
    except Exception as e:
        logger.error(f"Playwright extraction/pagination failed: {e}")
        
    logger.info(f"Raw link extraction yielded {len(jobs)} candidates from {page.url}")
    return jobs

async def fetch_job_description(url: str) -> str:
    """Fetch visible text from a URL using headless Playwright."""
    
    # Optional virtual display for Docker environments to bypass Cloudflare
    display = None
    if HAS_VIRTUAL_DISPLAY:
        try:
            display = Display(visible=0, size=(1280, 800))
            display.start()
        except Exception as e:
            logger.warning(f"Could not start virtual display, falling back to standard: {e}")
            display = None

    try:
        async with async_playwright() as p:
            args = [
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-reading-from-canvas",
                "--disable-webgl"
            ]
            browser = await p.chromium.launch(headless=False, args=args)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=ua.random if ua else None
            )
            page = await context.new_page()
            await Stealth().apply_stealth_async(page)
            
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            
            # Remove scripts, styles, and nav elements to get clean text
            await page.evaluate('''() => {
                document.querySelectorAll('script, style, noscript, nav, header, footer, iframe, svg').forEach(el => el.remove());
            }''')
            
            # Extract text from body
            text = await page.locator("body").inner_text()
            await browser.close()
            
            # Clean up excessive whitespace
            clean_text = re.sub(r'\\n+', '\\n\\n', text).strip()
            
            if "Cloudflare Ray ID:" in clean_text or "Sorry, you have been blocked" in clean_text:
                raise ValueError("Cloudflare bot protection blocked the request.")
                
            return clean_text
    except ValueError as ve:
        logger.warning(f"JD fetch blocked: {ve}")
        raise
    except Exception as e:
        logger.error(f"Failed to fetch JD from {url}: {e}")
        return ""
    finally:
        if display:
            try:
                display.stop()
            except Exception:
                pass

async def process_playwright(db: Session, targets: List[dict], keywords: List[str], new_jobs: list, company_logs: list, headless: bool = True):
    if not targets: return
    async with async_playwright() as p:
        args = [
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-reading-from-canvas",
            "--disable-webgl"
        ]
        browser = await p.chromium.launch(headless=headless, args=args)
        
        for target in targets:
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=ua.random if ua else None
            )
            page = await context.new_page()
            await Stealth().apply_stealth_async(page)
            company = target.get("company", "Unknown")
            url_template = target.get("url")
            logger.info(f"Scraping playwright board for {company}...")
            if not url_template:
                continue

            no_results_text = target.get("no_results_text", "0 results").lower()
            infinite_scroll = target.get("infinite_scroll", False)
            job_url_pattern = target.get("job_url_pattern")
            next_btn_selector = target.get("next_btn_selector")
            force_url_pagination = target.get("force_url_pagination", False)
            intersect_with = target.get("intersect_with")
            
            jobs_found_count = 0
            has_error = False
            error_msg = ""
            
            intersect_seen = None
            if intersect_with:
                intersect_seen = set()
                try:
                    logger.info(f"[{company}] Running intersection pre-pass on {intersect_with}")
                    extra_wait = target.get("extra_wait_ms", 0)
                    try:
                        if extra_wait > 0:
                            await page.goto(intersect_with, wait_until="networkidle", timeout=45000)
                        else:
                            await page.goto(intersect_with, wait_until="domcontentloaded", timeout=30000)
                    except Exception:
                        pass
                    await page.wait_for_timeout(5000 + extra_wait)
                    await dismiss_popups(page)
                    
                    content = (await page.content()).lower()
                    if no_results_text not in content:
                        intersect_extracted = await extract_playwright_jobs(
                            page, "intersection", intersect_with, 
                            infinite_scroll=infinite_scroll, 
                            job_url_pattern=job_url_pattern, 
                            next_btn_selector=next_btn_selector,
                            force_url_pagination=force_url_pagination
                        )
                        if intersect_extracted:
                            for job in intersect_extracted:
                                intersect_seen.add(job["href"])
                    logger.info(f"[{company}] Intersection pass found {len(intersect_seen)} URLs")
                except Exception as e:
                    logger.error(f"[{company}] Intersection pass failed: {e}")

            search_input_selector = target.get("search_input_selector")
            search_btn_selector = target.get("search_btn_selector")

            company_seen = set()  # dedup across keyword searches for this company
            for keyword in keywords:
                if search_input_selector:
                    url = url_template.split('?')[0]
                else:
                    url = url_template.replace("{keyword}", urllib.parse.quote(keyword))
                    
                try:
                    logger.debug(f"[{company}] Navigating to: {url}")
                    extra_wait = target.get("extra_wait_ms", 0)
                    try:
                        if extra_wait > 0:
                            # Use networkidle for heavy JS sites — waits until all XHR/fetch settle
                            await page.goto(url, wait_until="networkidle", timeout=45000)
                        else:
                            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    except Exception:
                        # Fallback if networkidle times out
                        pass
                        
                    if search_input_selector:
                        logger.info(f"[{company}] Executing UI search for '{keyword}'")
                        await dismiss_popups(page)
                        try:
                            if "tcsapps.com" in url:
                                # ULTIMATE FIX: Intercept the API requests at the network layer!
                                # By dumping the raw API payload, we discovered the filter key is 'userText'.
                                # This completely bypasses all Angular 1.x UI bugs by forcefully injecting 
                                # the filter directly into outgoing HTTP requests (both initial and pagination).
                                async def intercept_tcs(route, request):
                                    if request.method == "POST":
                                        try:
                                            import json
                                            data = json.loads(request.post_data)
                                            data["userText"] = keyword
                                            # Forward the modified payload to the server
                                            await route.continue_(post_data=json.dumps(data).encode("utf-8"), headers=request.headers)
                                        except Exception as e:
                                            logger.error(f"TCS route intercept failed: {e}")
                                            await route.continue_()
                                    else:
                                        await route.continue_()
                                await page.route("**/api/v1/jobs/searchJ**", intercept_tcs)
                                
                            # Perform a basic UI interaction so Angular triggers the API request
                            input_loc = page.locator(search_input_selector)
                            await input_loc.fill(keyword, timeout=10000)
                            await page.wait_for_timeout(500)
                            await input_loc.press("Enter")
                            
                            # The API call wait is handled dynamically inside extract_playwright_jobs via #paging:not(.ng-hide)
                        except Exception as ui_e:
                            logger.error(f"UI search failed: {ui_e}")
                    else:
                        # Base wait + any extra configured for this target
                        await page.wait_for_timeout(5000 + extra_wait)
                    
                    # Dismiss all popups before reading content or clicking pagination
                    await dismiss_popups(page)
                        
                    content = (await page.content()).lower()
                    
                    if company == "TCS":
                        with open(f"/home/hari/job-scraper/tests/dump/tcs_debug_{keyword}.html", "w") as f:
                            f.write(await page.content())
                        logger.info(f"Dumped TCS DOM to tcs_debug_{keyword}.html")

                    if no_results_text in content:
                        logger.debug(f"[{company}] No results for keyword '{keyword}' (found no_results_text)")
                    else:
                        extracted = await extract_playwright_jobs(
                            page, keyword, url, 
                            infinite_scroll=infinite_scroll, 
                            job_url_pattern=job_url_pattern, 
                            next_btn_selector=next_btn_selector,
                            force_url_pagination=force_url_pagination
                        )
                        new_from_keyword = 0
                        if extracted:
                            for job in extracted:
                                href = job["href"]
                                if intersect_seen is not None and href not in intersect_seen:
                                    continue
                                if href in company_seen:
                                    logger.debug(f"[{company}] Skipping duplicate URL: {href[:80]}")
                                    continue
                                company_seen.add(href)
                                if not has_been_notified(db, href):
                                    skip_ai = job.get("skip_ai", False)
                                    new_jobs.append({"company": company, "title": job["title"], "url": href, "location": "", "source_url": url, "skip_ai": skip_ai})
                                    jobs_found_count += 1
                                    new_from_keyword += 1
                                else:
                                    logger.debug(f"[{company}] Already in DB, skipping: {href[:80]}")
                        logger.debug(f"[{company}] keyword='{keyword}': {len(extracted or [])} raw links, {new_from_keyword} new added")
                except Exception as e:
                    logger.error(f"Playwright error {company}: {e}")
                    has_error = True
                    error_msg = str(e)
                    
            if has_error:
                company_logs.append({"company": company, "status": "FAILED", "jobs_found": jobs_found_count, "message": error_msg})
                logger.info(f"Finished {company}: FAILED, found {jobs_found_count} jobs")
            else:
                company_logs.append({"company": company, "status": "SUCCESS", "jobs_found": jobs_found_count})
                logger.info(f"Finished {company}: SUCCESS, found {jobs_found_count} jobs")
                
            try:
                await context.close()
            except Exception:
                pass
                
        await browser.close()

def get_active_companies(db: Session) -> List[str]:
    """Return the list of companies the user enabled in Settings, or [] for 'all'."""
    settings = db.query(models.Settings).first()
    if not settings or not settings.active_companies:
        return []
    try:
        active = json.loads(settings.active_companies)
        return active if isinstance(active, list) else []
    except Exception:
        return []

def run_scraper(db: Session):
    logger.info("=" * 60)
    logger.info("Starting Backend Scraper Engine...")
    targets = load_targets()
    keywords = load_keywords(db)
    logger.info(f"Keywords: {keywords}")
    logger.debug(f"Loaded {len(targets)} total targets from targets.json")
    new_jobs = []
    company_logs = []
    playwright_targets = []

    active = get_active_companies(db)
    if active:
        targets = [t for t in targets if t.get("company") in active]
        logger.info(f"Scraping {len(targets)} selected companies: {active}")
    else:
        logger.info(f"Scraping all {len(targets)} companies (no filter set)")

    for target in targets:
        t_type = target.get("type", "")
        company = target.get("company", "Unknown")
        if t_type != "playwright":
            logger.info(f"[{company}] Scraping via {t_type}...")
            
        if t_type == "greenhouse":
            process_greenhouse(db, target, keywords, LOCATIONS, new_jobs, company_logs)
        elif t_type == "lever":
            process_lever(db, target, keywords, LOCATIONS, new_jobs, company_logs)
        elif t_type == "api_post":
            process_api_post(db, target, keywords, new_jobs, company_logs)
        elif t_type == "tech_mahindra":
            process_tech_mahindra(db, target, keywords, new_jobs, company_logs)
        elif t_type == "playwright":
            playwright_targets.append(target)
            
        if company_logs and company_logs[-1].get("company") == company:
            status = company_logs[-1].get("status")
            links_found = company_logs[-1].get("jobs_found", 0)
            logger.info(f"[{company}] Done → {status}, {links_found} candidate links collected")
            
    if playwright_targets:
        asyncio.run(process_playwright(db, playwright_targets, keywords, new_jobs, company_logs))

    # BULK AI FILTERING & COMMIT
    logger.info(f"Total raw candidates collected across all companies: {len(new_jobs)}")
    if new_jobs:
        try:
            settings = db.query(models.Settings).first()
            from backend.crypto import decrypt_value
            api_key = decrypt_value(settings.gemini_api_key) if settings and settings.gemini_api_key else None
            
            if api_key:
                from backend.ai_agent import filter_job_links
                
                # Filter out jobs that don't need AI
                jobs_for_ai = [j for j in new_jobs if not j.get("skip_ai")]
                jobs_bypassing_ai = [j for j in new_jobs if j.get("skip_ai")]
                
                logger.info(f"Bypassing AI for {len(jobs_bypassing_ai)} clearly matched job links.")
                logger.info(f"Sending {len(jobs_for_ai)} ambiguous links to Gemini for filtering.")
                
                # Split into chunks if candidate list is large.
                # Each chunk = 1 API request. ~500 links ≈ 25K tokens, safe for all models.
                CHUNK_SIZE = 500
                keyword_str = ",".join(keywords)
                
                filtered_jobs = []
                rejected_jobs = []
                
                if not jobs_for_ai:
                    logger.info("No jobs require AI filtering.")
                elif len(jobs_for_ai) <= CHUNK_SIZE:
                    logger.info(f"Sending {len(jobs_for_ai)} candidates to AI Filter (single request)...")
                    valid, rejected = filter_job_links(jobs_for_ai, keyword_str, api_key)
                    filtered_jobs.extend(valid)
                    rejected_jobs.extend(rejected)
                else:
                    chunks = [jobs_for_ai[i:i+CHUNK_SIZE] for i in range(0, len(jobs_for_ai), CHUNK_SIZE)]
                    logger.info(f"Splitting {len(jobs_for_ai)} candidates into {len(chunks)} chunks of ~{CHUNK_SIZE} for AI Filter...")
                    for idx, chunk in enumerate(chunks, 1):
                        logger.info(f"  AI chunk {idx}/{len(chunks)}: sending {len(chunk)} candidates...")
                        valid, rejected = filter_job_links(chunk, keyword_str, api_key)
                        logger.info(f"  AI chunk {idx}/{len(chunks)}: retained {len(valid)} valid jobs, rejected {len(rejected)}")
                        filtered_jobs.extend(valid)
                        rejected_jobs.extend(rejected)
                
                logger.info(f"AI Filter complete: {len(filtered_jobs)} valid jobs retained from {len(jobs_for_ai)} AI-processed candidates")
                
                # Recombine
                new_jobs = jobs_bypassing_ai + filtered_jobs
            else:
                logger.warning("No API key configured — skipping AI filter, saving all raw candidates")
                rejected_jobs = []
                
            unique_jobs = {}
            for job in new_jobs:
                unique_jobs[job["url"]] = job
                
            unique_rejected = {}
            for job in rejected_jobs:
                # If it's valid via another path (e.g. overlap across companies), keep it valid.
                if job["url"] not in unique_jobs:
                    unique_rejected[job["url"]] = job
            
            logger.debug(f"After URL dedup: {len(unique_jobs)} valid jobs, {len(unique_rejected)} false positives to cache")
            
            # Commit valid jobs
            for url, job in unique_jobs.items():
                logger.debug(f"  Committing: [{job.get('company')}] {job.get('title', '(no title)')} -> {url[:80]}")
                record_job(db, job["company"], job["title"], url, job.get("location", ""))
                
            # Commit rejected jobs so scraper doesn't fetch them again tomorrow
            for url, job in unique_rejected.items():
                db_job = record_job(db, job["company"], job["title"], url, job.get("location", ""))
                # If it's a completely new DB entry (status is NEW or None before flush), mark it FALSE_POSITIVE so UI hides it
                if db_job.status == "NEW" or db_job.status is None:
                    db_job.status = "FALSE_POSITIVE"
                    
            db.commit()
            logger.info(f"Successfully committed {len(unique_jobs)} new jobs to the database (and cached {len(unique_rejected)} false positives).")
        except Exception as e:
            db.rollback()
            logger.error(f"Failed during AI filter/commit: {e}", exc_info=True)

    logger.info("=" * 60)
    return new_jobs, company_logs
