from pathlib import Path
from unittest.mock import patch, MagicMock
from sources.bund import fetch, _parse_tenders

FIXTURE = (Path(__file__).parent / "fixtures" / "bund.html").read_text()


def _mock_get(url, params=None, headers=None, timeout=None):
    mock = MagicMock()
    mock.status_code = 200
    mock.text = FIXTURE
    return mock


def test_parse_tenders_returns_list():
    result = _parse_tenders(FIXTURE, "https://www.bund.de/ausschreibungen")
    assert isinstance(result, list)


def test_parse_tenders_finds_two_items():
    result = _parse_tenders(FIXTURE, "https://www.bund.de/ausschreibungen")
    assert len(result) == 2


def test_parse_tenders_has_required_keys():
    result = _parse_tenders(FIXTURE, "https://www.bund.de/ausschreibungen")
    item = result[0]
    assert "title" in item
    assert "contracting_body" in item
    assert "description" in item
    assert "url" in item
    assert "publication_date" in item
    assert "deadline" in item


def test_parse_tenders_correct_title():
    result = _parse_tenders(FIXTURE, "https://www.bund.de/ausschreibungen")
    assert result[0]["title"] == "Ausstattung Wohnbereich Pflegeheim Köln"


def test_fetch_returns_list():
    with patch("sources.bund.requests.get", side_effect=_mock_get):
        result = fetch(keywords=["Ausstattung Wohnbereich"], limit=10)
    assert isinstance(result, list)


def test_fetch_empty_on_error():
    with patch("sources.bund.requests.get", side_effect=Exception("blocked")):
        result = fetch(keywords=["Küchengeräte"], limit=10)
    assert result == []
