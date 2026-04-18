import json
import time
from pathlib import Path

import requests

from config import PUSH_ERRORS_PATH


def push(signals: list[dict], output_path: str, webhook_url: str) -> dict:
    written = _write_jsonl(signals, output_path)
    pushed, errors = 0, 0
    pushed, errors = _post_each(signals, webhook_url)
    return {"written": written, "pushed": pushed, "errors": errors}


def _write_jsonl(signals: list[dict], output_path: str) -> int:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        for signal in signals:
            f.write(json.dumps(signal, ensure_ascii=False) + "\n")
    return len(signals)


def _post_each(signals: list[dict], webhook_url: str) -> tuple[int, int]:
    pushed, errors = 0, 0
    for signal in signals:
        ok, last_reason = _post_with_retry(signal, webhook_url)
        if ok:
            pushed += 1
        else:
            errors += 1
            _log_error(signal, last_reason)
    return pushed, errors


def _post_with_retry(signal: dict, webhook_url: str, max_retries: int = 3) -> tuple[bool, str]:
    last_reason = "max retries exceeded"
    for attempt in range(max_retries):
        try:
            resp = requests.post(
                webhook_url,
                json=signal,
                headers={"Content-Type": "application/json"},
                timeout=10,
            )
            if resp.status_code < 300:
                return True, ""
            last_reason = f"HTTP {resp.status_code}"
        except requests.RequestException as e:
            last_reason = str(e)
        if attempt < max_retries - 1:
            time.sleep(2 ** attempt)
    return False, last_reason


def _log_error(signal: dict, reason: str) -> None:
    from datetime import datetime, timezone
    try:
        path = Path(PUSH_ERRORS_PATH)
        path.parent.mkdir(parents=True, exist_ok=True)
        entry = {"signal": signal, "reason": reason,
                 "logged_at": datetime.now(timezone.utc).isoformat()}
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        import sys
        print(f"[push] ERROR: could not write push_errors.jsonl: {e}", file=sys.stderr)
