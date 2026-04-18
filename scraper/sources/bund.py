import requests
from bs4 import BeautifulSoup

_BASE = "https://www.bund.de"
_SEARCH_URL = f"{_BASE}/Content/DE/Ausschreibungen/ausschreibungen_node.html"
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; lease-a-kitchen-scout/1.0)"}


def fetch(keywords: list[str], limit: int = 50) -> list[dict]:
    results = []
    seen = set()
    for keyword in keywords:
        if len(results) >= limit:
            break
        try:
            resp = requests.get(
                _SEARCH_URL,
                params={"gtp": keyword, "cl2Categories_Themen": "Beschaffung"},
                headers=_HEADERS,
                timeout=15,
            )
            if resp.status_code >= 300:
                continue
            for item in _parse_tenders(resp.text, _SEARCH_URL):
                if item["url"] not in seen:
                    seen.add(item["url"])
                    results.append(item)
        except Exception:
            continue
    return results[:limit]


def _parse_tenders(html: str, base_url: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for card in soup.select(".c-teaser"):
        link_el = card.select_one(".c-teaser__headline a")
        if not link_el:
            continue
        title = link_el.get_text(strip=True)
        href = link_el.get("href", "")
        url = href if href.startswith("http") else f"{_BASE}{href}"
        desc_el = card.select_one(".c-teaser__text")
        description = desc_el.get_text(strip=True) if desc_el else ""
        meta = _parse_meta(card)
        items.append({
            "title": title,
            "contracting_body": meta.get("Vergabestelle", ""),
            "publication_date": meta.get("Veröffentlicht", ""),
            "deadline": meta.get("Angebotsfrist", ""),
            "description": description,
            "url": url,
        })
    return items


def _parse_meta(card) -> dict:
    meta = {}
    dl = card.select_one("dl.c-teaser__meta")
    if not dl:
        return meta
    keys = [dt.get_text(strip=True) for dt in dl.select("dt")]
    vals = [dd.get_text(strip=True) for dd in dl.select("dd")]
    return dict(zip(keys, vals))
