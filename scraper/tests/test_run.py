import json
import argparse
from pathlib import Path
from unittest.mock import patch, MagicMock

# Import run once at module level — sources will be real imports
import run as run_mod

TED_RAW = {
    "ted_id": "1", "title": "Test Tender", "description": "D",
    "contracting_authority": "A", "publication_date": "2026-04-15",
    "deadline": "2026-05-15", "url": "https://ted.europa.eu/1"
}


def test_run_dry_run_writes_file(tmp_path):
    out = str(tmp_path / "out.jsonl")
    mock_ted = MagicMock()
    mock_ted.fetch.return_value = [TED_RAW]
    mock_empty = MagicMock()
    mock_empty.fetch.return_value = []

    # Patch the module-level source references inside run.py's _SOURCES
    with patch.object(run_mod, "ted", mock_ted), \
         patch.object(run_mod, "indeed", mock_empty), \
         patch.object(run_mod, "dnk", mock_empty), \
         patch.object(run_mod, "bund", mock_empty), \
         patch.object(run_mod, "bauportal", mock_empty), \
         patch.object(run_mod, "OUTPUT_PATH", out), \
         patch.object(run_mod, "HAPPYROBOT_WEBHOOK_URL", "https://webhook.example.com"), \
         patch("argparse.ArgumentParser.parse_args",
               return_value=argparse.Namespace(
                   sources="ted", dry_run=True, limit=10, use_seeds=False)):
        # Rebuild _SOURCES with mocked modules
        run_mod._SOURCES = {
            "ted": ("TED", lambda lim: mock_ted.fetch(run_mod.SEARCH_KEYWORDS, lim)),
        }
        run_mod.main()

    assert Path(out).exists()
    lines = Path(out).read_text().strip().splitlines()
    assert len(lines) == 1


def test_run_source_error_does_not_abort(tmp_path, capsys):
    out = str(tmp_path / "out.jsonl")
    mock_ted = MagicMock()
    mock_ted.fetch.return_value = [TED_RAW]
    mock_dnk_fail = MagicMock()
    mock_dnk_fail.fetch.side_effect = Exception("DNK timeout")

    with patch.object(run_mod, "OUTPUT_PATH", out), \
         patch.object(run_mod, "HAPPYROBOT_WEBHOOK_URL", "https://webhook.example.com"), \
         patch("argparse.ArgumentParser.parse_args",
               return_value=argparse.Namespace(
                   sources="ted,dnk", dry_run=True, limit=10, use_seeds=False)):
        run_mod._SOURCES = {
            "ted": ("TED", lambda lim: mock_ted.fetch(run_mod.SEARCH_KEYWORDS, lim)),
            "dnk": ("DNK", lambda lim: mock_dnk_fail.fetch(lim)),
        }
        run_mod.main()

    captured = capsys.readouterr()
    assert "FAILED" in captured.out
    assert Path(out).exists()
