#!/usr/bin/env ../venv/bin/python
import asyncio
import sys
import os
import logging
import argparse
from sqlalchemy.orm import Session

# Add parent directory to path so we can import backend modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.database import SessionLocal
from backend.scraper_core import (
    load_targets, 
    process_greenhouse, 
    process_lever, 
    process_api_post,
    process_tcs_api,
    process_tech_mahindra,
    process_playwright
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

async def test_all_targets(filter_companies: list = None, headless: bool = False):
    db: Session = SessionLocal()
    all_targets = load_targets()
    
    # Filter to specific companies if requested
    if filter_companies:
        filter_lower = [c.lower() for c in filter_companies]
        targets = [t for t in all_targets if t.get("company", "").lower() in filter_lower]
        if not targets:
            logger.error(f"No targets matched: {filter_companies}")
            logger.info(f"Available: {[t.get('company') for t in all_targets]}")
            db.close()
            return
        logger.info(f"Filtered to {len(targets)} target(s): {[t.get('company') for t in targets]}")
    else:
        targets = all_targets
    
    # We will test with a single broad keyword to see if the board is alive
    keywords = ["software"]
    locations = ["india", "bangalore", "hyderabad", "pune", "gurgaon", "noida", "remote"]
    
    results = []
    playwright_targets = []
    
    logger.info(f"Testing {len(targets)} targets...")
    
    for target in targets:
        company = target.get("company", "Unknown")
        t_type = target.get("type", "")
        
        new_jobs = []
        company_logs = []
        
        logger.info(f"Testing [{company}] via {t_type}...")
        
        if t_type == "greenhouse":
            process_greenhouse(db, target, keywords, locations, new_jobs, company_logs)
        elif t_type == "lever":
            process_lever(db, target, keywords, locations, new_jobs, company_logs)
        elif t_type == "api_post":
            process_api_post(db, target, keywords, new_jobs, company_logs)
        elif t_type == "tcs_api":
            process_tcs_api(db, target, keywords, new_jobs, company_logs)
        elif t_type == "tech_mahindra":
            process_tech_mahindra(db, target, keywords, new_jobs, company_logs)
        elif t_type == "playwright":
            playwright_targets.append(target)
            continue
            
        # Analyze results
        if company_logs:
            log = company_logs[-1]
            status = log.get("status", "FAILED")
            count = log.get("jobs_found", 0)
            msg = log.get("message", "")
            
            if status == "SUCCESS" and count > 0:
                # Group by source_url
                sources = {}
                for j in new_jobs:
                    src = j.get('source_url', 'Unknown Source')
                    if src not in sources:
                        sources[src] = []
                    sources[src].append(j)
                
                job_list = ""
                for src, s_jobs in sources.items():
                    job_list += f"\nSource: {src}\n"
                    job_list += "\n".join([f"      - {j.get('title')} ({j.get('url')})" for j in s_jobs])
                
                results.append({"company": company, "state": "WORKING", "details": f"Found {count} jobs:\n{job_list}", "jobs": new_jobs})
            elif status == "SUCCESS" and count == 0:
                results.append({"company": company, "state": "EMPTY/DEAD", "details": "API succeeded but returned 0 jobs. Board likely empty or migrated.", "jobs": []})
            else:
                results.append({"company": company, "state": "ERROR", "details": msg, "jobs": []})
                
    if playwright_targets:
        logger.info(f"Testing {len(playwright_targets)} Playwright targets...")
        pw_jobs = []
        pw_logs = []
        await process_playwright(db, playwright_targets, keywords, pw_jobs, pw_logs, headless=headless)
        
        for log in pw_logs:
            company = log.get("company")
            status = log.get("status", "FAILED")
            count = log.get("jobs_found", 0)
            msg = log.get("message", "")
            
            if status == "SUCCESS" and count > 0:
                comp_jobs = [j for j in pw_jobs if j.get('company') == company]
                
                sources = {}
                for j in comp_jobs:
                    src = j.get('source_url', 'Unknown Source')
                    if src not in sources:
                        sources[src] = []
                    sources[src].append(j)
                
                job_list = ""
                for src, s_jobs in sources.items():
                    job_list += f"\nSource: {src}\n"
                    job_list += "\n".join([f"      - {j.get('title')} ({j.get('url')})" for j in s_jobs])
                
                results.append({"company": company, "state": "WORKING", "details": f"Found {count} jobs:\n{job_list}", "jobs": comp_jobs})
            elif status == "SUCCESS" and count == 0:
                results.append({"company": company, "state": "EMPTY/DEAD", "details": "Scraper succeeded but found 0 jobs.", "jobs": []})
            else:
                results.append({"company": company, "state": "ERROR", "details": msg, "jobs": []})
                
    db.close()
    
    report_lines = []
    report_lines.append("="*60)
    report_lines.append("🎯 TARGET DIAGNOSTIC REPORT")
    report_lines.append("="*60)
    
    working = [r for r in results if r["state"] == "WORKING"]
    empty = [r for r in results if r["state"] == "EMPTY/DEAD"]
    error = [r for r in results if r["state"] == "ERROR"]
    
    report_lines.append(f"\n✅ WORKING ({len(working)}):")
    for r in working:
        report_lines.append(f"  - {r['company']}: {r['details']}")
        
    report_lines.append(f"\n⚠️ EMPTY / MIGRATED BOARDS ({len(empty)}):")
    for r in empty:
        report_lines.append(f"  - {r['company']}: {r['details']}")
        
    report_lines.append(f"\n❌ ERRORS ({len(error)}):")
    for r in error:
        report_lines.append(f"  - {r['company']}: {r['details']}")
        
    report_lines.append("="*60)
    
    report_text = "\n".join(report_lines)
    print(report_text)
    
    import time
    ts = int(time.time())
    
    dump_dir = os.path.join(os.path.dirname(__file__), "dump")
    os.makedirs(dump_dir, exist_ok=True)
    
    report_path = os.path.join(dump_dir, f"test_targets_report_{ts}.log")
    with open(report_path, "w") as f:
        f.write(report_text)
    print(f"\n[+] Full detailed report saved to {report_path}")
        
    all_links_content = []
    for r in results:
        company_name = r.get("company", "Unknown")
        if "jobs" in r and len(r["jobs"]) > 0:
            all_links_content.append(f"\n--- {company_name} ---")
            
            sources = {}
            for j in r["jobs"]:
                src = j.get('source_url', 'Unknown Source')
                if src not in sources:
                    sources[src] = []
                sources[src].append(j)
                
            for src, s_jobs in sources.items():
                all_links_content.append(f"Source: {src}")
                for j in s_jobs:
                    url = j.get("url")
                    if url:
                        all_links_content.append(url)
                    
    links_path = os.path.join(dump_dir, f"test_targets_all_links_{ts}.log")
    with open(links_path, "w") as f:
        f.write("\n".join(all_links_content).strip())
    
    total_links = sum(1 for line in all_links_content if line.startswith("http"))
    print(f"[+] Plain list of {total_links} URLs (segregated by company) saved to {links_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Test job scraper targets",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Test all targets (with visible browser):
    ./venv/bin/python backend/test_targets.py

  Test specific companies only:
    ./venv/bin/python backend/test_targets.py -c "Wells Fargo" "Google" "Apple"

  Test headless (no browser window):
    ./venv/bin/python backend/test_targets.py --headless

  Test only the failed ones with visible browser:
    ./venv/bin/python backend/test_targets.py -c "Wells Fargo" "JP Morgan Chase" "Cognizant" "Capgemini" "Citi" "Google" "Amazon" "Microsoft" "Apple"
"""
    )
    parser.add_argument(
        "--companies", "-c",
        nargs="+",
        metavar="COMPANY",
        help="One or more company names to test (case-insensitive). Tests all if omitted."
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        default=False,
        help="Run browser in headless mode (no visible window). Default: headed (visible)."
    )
    args = parser.parse_args()
    asyncio.run(test_all_targets(filter_companies=args.companies, headless=args.headless))
