from datetime import datetime, timedelta, timezone

import requests

_ENDPOINT = "https://api.ted.europa.eu/v3/notices/search"
_FIELDS = ["ND", "TI", "TD", "AU", "DT", "DL", "TED_NOTICE_URL"]


def fetch(keywords: list[str], limit: int = 50, lookback_days: int = 30) -> list[dict]:
    query = " OR ".join(f'"{kw}"' for kw in keywords)
    since = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%Y%m%d")
    payload = {
        "query": f"({query}) AND CNT:DE AND DD:[{since} TO 99999999]",
        "fields": _FIELDS,
        "page": 1,
        "limit": min(limit, 100),
        "reverseOrder": False,
    }
    try:
        resp = requests.post(
            _ENDPOINT,
            json=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            timeout=15,
        )
        if resp.status_code >= 300:
            return []
        notices = resp.json().get("notices", [])
        return [_map(n) for n in notices[:limit]]
    except requests.RequestException:
        return []


def _map(n: dict) -> dict:
    return {
        "ted_id": n.get("ND", ""),
        "title": n.get("TI", ""),
        "description": n.get("TD", ""),
        "contracting_authority": n.get("AU", ""),
        "publication_date": _fmt_date(n.get("DT", "")),
        "deadline": _fmt_date(n.get("DL", "")),
        "url": n.get("TED_NOTICE_URL", ""),
    }


def _fmt_date(raw: str) -> str:
    if len(raw) == 8:
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
    return raw
