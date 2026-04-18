import requests
from bs4 import BeautifulSoup

_BASE = "https://bauantrag-online.de"
_SEARCH_URL = f"{_BASE}/permits"
_KEYWORDS = ["Betreutes Wohnen", "Seniorenresidenz", "Pflegeheim", "Studentenwohnheim", "Altenpflege"]
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; lease-a-kitchen-scout/1.0)"}


def fetch(limit: int = 50) -> list[dict]:
    try:
        resp = requests.get(
            _SEARCH_URL,
            params={"category": "Wohnen", "region": "Bayern", "pageSize": min(limit, 100)},
            headers=_HEADERS,
            timeout=15,
        )
        if resp.status_code >= 300:
            return []
        permits = _parse_permits(resp.text, _SEARCH_URL)
        return [p for p in permits if _is_relevant(p)][:limit]
    except Exception:
        return []


def _parse_permits(html: str, base_url: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    permits = []
    for row in soup.select(".permit-row"):
        ref_el = row.select_one(".permit-ref a")
        if not ref_el:
            continue
        href = ref_el.get("href", "")
        url = href if href.startswith("http") else f"{_BASE}{href}"
        units_el = row.select_one(".permit-units")
        units = None
        if units_el:
            try:
                units = int(units_el.get_text(strip=True))
            except ValueError:
                units = None
        permits.append({
            "permit_ref": ref_el.get_text(strip=True),
            "applicant": _text(row, ".permit-applicant"),
            "project_type": _text(row, ".permit-type"),
            "location": _text(row, ".permit-location"),
            "units": units,
            "submission_date": _text(row, ".permit-date"),
            "url": url,
        })
    return permits


def _is_relevant(permit: dict) -> bool:
    combined = f"{permit['project_type']} {permit['applicant']}".lower()
    return any(kw.lower() in combined for kw in _KEYWORDS)


def _text(tag, selector: str) -> str:
    el = tag.select_one(selector)
    return el.get_text(strip=True) if el else ""
