import requests

# Confirm this endpoint via DevTools on https://datenbank2.deutscher-nachhaltigkeitskodex.de/
_ENDPOINT = "https://datenbank2.deutscher-nachhaltigkeitskodex.de/api/search"


def fetch(limit: int = 50, min_year: int = 2024) -> list[dict]:
    params = {
        "sector": "Gesundheit/Soziales/Pflege",
        "yearFrom": min_year,
        "pageSize": min(limit, 100),
        "page": 1,
    }
    try:
        resp = requests.get(
            _ENDPOINT,
            params=params,
            headers={"Accept": "application/json"},
            timeout=15,
        )
        if resp.status_code >= 300:
            return []
        results = resp.json().get("results", [])
        return [_map(r) for r in results[:limit]]
    except Exception:
        return []


def _map(r: dict) -> dict:
    return {
        "company_name": r.get("companyName", ""),
        "sector": r.get("sector", ""),
        "report_year": r.get("reportYear", 0),
        "report_url": r.get("reportUrl", ""),
        "location": r.get("city", ""),
        "num_employees": r.get("employeeRange", ""),
    }
