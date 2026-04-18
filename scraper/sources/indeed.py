import time

import requests
from bs4 import BeautifulSoup

_BASE = "https://de.indeed.com"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "de-DE,de;q=0.9",
}


def fetch(keywords: list[str], limit: int = 50) -> list[dict]:
    results = []
    seen = set()
    for keyword in keywords:
        if len(results) >= limit:
            break
        try:
            url = f"{_BASE}/jobs?q={requests.utils.quote(keyword)}&l=Deutschland&sort=date"
            resp = requests.get(url, headers=_HEADERS, timeout=15)
            if resp.status_code >= 300:
                continue
            for job in _parse_jobs(resp.text, url):
                if job["job_id"] not in seen:
                    seen.add(job["job_id"])
                    results.append(job)
            time.sleep(1.5)
        except Exception:
            continue
    return results[:limit]


def _parse_jobs(html: str, base_url: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for card in soup.select(".job_seen_beacon"):
        title_el = card.select_one(".jobTitle a")
        if not title_el:
            continue
        job_id = title_el.get("data-jk", "")
        title = title_el.get_text(strip=True)
        company = card.select_one(".companyName")
        location = card.select_one(".companyLocation")
        date_el = card.select_one(".date")
        snippet = card.select_one(".job-snippet")
        jobs.append({
            "job_id": job_id,
            "title": title,
            "company": company.get_text(strip=True) if company else "",
            "location": location.get_text(strip=True) if location else "",
            "post_date": date_el.get_text(strip=True) if date_el else "",
            "summary": snippet.get_text(strip=True) if snippet else "",
            "url": f"{_BASE}/viewjob?jk={job_id}" if job_id else "",
        })
    return jobs
