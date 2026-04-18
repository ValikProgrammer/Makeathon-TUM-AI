import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from config import (
    HAPPYROBOT_WEBHOOK_URL,
    OUTPUT_PATH,
    RESULTS_PER_SOURCE,
    SEARCH_KEYWORDS,
    INDEED_KEYWORDS,
    BUND_KEYWORDS,
)
from normalize import normalize
from push import push

import sources.ted as ted
import sources.indeed as indeed
import sources.dnk as dnk
import sources.bund as bund
import sources.bauportal as bauportal

_SOURCES = {
    "ted":       ("TED",       lambda lim: ted.fetch(SEARCH_KEYWORDS, lim)),
    "indeed":    ("Indeed",    lambda lim: indeed.fetch(INDEED_KEYWORDS, lim)),
    "dnk":       ("DNK",       lambda lim: dnk.fetch(lim)),
    "bund":      ("BundDe",    lambda lim: bund.fetch(BUND_KEYWORDS, lim)),
    "bauportal": ("Bauportal", lambda lim: bauportal.fetch(lim)),
}


def _fetch_one(name: str, source_key: str, fetcher, limit: int) -> tuple[str, list[dict], Exception | None]:
    try:
        raws = fetcher(limit)
        signals = [normalize(r, source_key) for r in raws]
        return name, signals, None
    except Exception as e:
        return name, [], e


def _load_seeds(sources: list[str]) -> list[dict]:
    signals = []
    for name in sources:
        seed_path = Path(__file__).parent.parent / "seeds" / f"{name}_seed.jsonl"
        if seed_path.exists():
            for line in seed_path.read_text(encoding="utf-8").strip().splitlines():
                if line.strip():
                    signals.append(json.loads(line))
    return signals


def main():
    parser = argparse.ArgumentParser(description="Jack Scout Scraper")
    parser.add_argument("--sources", default=",".join(_SOURCES.keys()))
    parser.add_argument("--limit", type=int, default=RESULTS_PER_SOURCE)
    args = parser.parse_args()

    selected = [s.strip() for s in args.sources.split(",") if s.strip() in _SOURCES]

    all_signals = []
    results: dict[str, tuple[int, Exception | None]] = {}

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(
                _fetch_one, name, _SOURCES[name][0], _SOURCES[name][1], args.limit
                ): name
                for name in selected
            }
        for future in as_completed(futures):
            name, signals, error = future.result()
            results[name] = (len(signals), error)
            all_signals.extend(signals)

    parts = []
    for name in selected:
        count, error = results.get(name, (0, Exception("not run")))
        parts.append(
            f"{name.upper()}: FAILED ({error})" if error else f"{name.upper()}: {count} ok"
        )
    print(" | ".join(parts))

    print(f"Total: {len(all_signals)} signals")
    stats = push(all_signals, OUTPUT_PATH, HAPPYROBOT_WEBHOOK_URL)
    print(f"Written: {stats['written']} | Pushed: {stats['pushed']} | Errors: {stats['errors']}")


if __name__ == "__main__":
    main()
