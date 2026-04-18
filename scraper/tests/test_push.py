import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from push import push, _write_jsonl, _post_with_retry

SAMPLE_SIGNALS = [
    {
        "source": "TED",
        "source_url": "https://ted.europa.eu/notice/1",
        "captured_at": "2026-04-18T09:00:00Z",
        "raw_title": "Leasing Haushaltsgeräte",
        "raw_body": "Diakonie Stuttgart | 40 Wohneinheiten",
    },
    {
        "source": "Indeed",
        "source_url": "https://de.indeed.com/job/1",
        "captured_at": "2026-04-18T09:01:00Z",
        "raw_title": "Facility Manager Pflegeheim",
        "raw_body": "Caritas München | München",
    },
]


def test_write_jsonl_creates_file(tmp_path):
    out = str(tmp_path / "out.jsonl")
    _write_jsonl(SAMPLE_SIGNALS, out)
    assert Path(out).exists()


def test_write_jsonl_correct_line_count(tmp_path):
    out = str(tmp_path / "out.jsonl")
    _write_jsonl(SAMPLE_SIGNALS, out)
    lines = Path(out).read_text().strip().splitlines()
    assert len(lines) == 2


def test_write_jsonl_valid_json_per_line(tmp_path):
    out = str(tmp_path / "out.jsonl")
    _write_jsonl(SAMPLE_SIGNALS, out)
    for line in Path(out).read_text().strip().splitlines():
        parsed = json.loads(line)
        assert "source" in parsed


def test_write_jsonl_appends_on_second_call(tmp_path):
    out = str(tmp_path / "out.jsonl")
    _write_jsonl(SAMPLE_SIGNALS, out)
    _write_jsonl(SAMPLE_SIGNALS[:1], out)
    lines = Path(out).read_text().strip().splitlines()
    assert len(lines) == 3


def test_post_with_retry_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    with patch("push.requests.post", return_value=mock_resp) as mock_post:
        result = _post_with_retry(SAMPLE_SIGNALS[0], "https://webhook.example.com")
    assert result[0] is True
    assert mock_post.call_count == 1


def test_post_with_retry_retries_on_failure():
    mock_resp = MagicMock()
    mock_resp.status_code = 500
    with patch("push.requests.post", return_value=mock_resp):
        with patch("push.time.sleep"):
            result = _post_with_retry(SAMPLE_SIGNALS[0], "https://webhook.example.com", max_retries=3)
    assert result[0] is False


def test_post_with_retry_succeeds_on_second_attempt():
    fail_resp = MagicMock()
    fail_resp.status_code = 503
    ok_resp = MagicMock()
    ok_resp.status_code = 200
    with patch("push.requests.post", side_effect=[fail_resp, ok_resp]):
        with patch("push.time.sleep"):
            result = _post_with_retry(SAMPLE_SIGNALS[0], "https://webhook.example.com", max_retries=3)
    assert result[0] is True


def test_push_dry_run_skips_webhook(tmp_path):
    out = str(tmp_path / "out.jsonl")
    with patch("push.requests.post") as mock_post:
        stats = push(SAMPLE_SIGNALS, out, "https://webhook.example.com", dry_run=True)
    mock_post.assert_not_called()
    assert stats["written"] == 2
    assert stats["pushed"] == 0


def test_push_calls_webhook_per_signal(tmp_path):
    out = str(tmp_path / "out.jsonl")
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    with patch("push.requests.post", return_value=mock_resp):
        stats = push(SAMPLE_SIGNALS, out, "https://webhook.example.com")
    assert stats["pushed"] == 2
    assert stats["errors"] == 0
