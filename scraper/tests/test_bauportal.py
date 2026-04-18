from pathlib import Path
from unittest.mock import patch, MagicMock
from sources.bauportal import fetch, _parse_permits

FIXTURE = (Path(__file__).parent / "fixtures" / "bauportal.html").read_text()


def _mock_get(url, params=None, headers=None, timeout=None):
    mock = MagicMock()
    mock.status_code = 200
    mock.text = FIXTURE
    return mock


def test_parse_permits_returns_list():
    result = _parse_permits(FIXTURE, "https://bauantrag-online.de/permits")
    assert isinstance(result, list)


def test_parse_permits_finds_two_items():
    result = _parse_permits(FIXTURE, "https://bauantrag-online.de/permits")
    assert len(result) == 2


def test_parse_permits_has_required_keys():
    result = _parse_permits(FIXTURE, "https://bauantrag-online.de/permits")
    item = result[0]
    assert "permit_ref" in item
    assert "applicant" in item
    assert "project_type" in item
    assert "location" in item
    assert "units" in item
    assert "submission_date" in item
    assert "url" in item


def test_parse_permits_units_as_int():
    result = _parse_permits(FIXTURE, "https://bauantrag-online.de/permits")
    assert result[0]["units"] == 45


def test_parse_permits_second_entry():
    result = _parse_permits(FIXTURE, "https://bauantrag-online.de/permits")
    assert result[1]["applicant"] == "Studentenwerk Nürnberg"


def test_fetch_returns_list():
    with patch("sources.bauportal.requests.get", side_effect=_mock_get):
        result = fetch(limit=10)
    assert isinstance(result, list)


def test_fetch_empty_on_error():
    with patch("sources.bauportal.requests.get", side_effect=Exception("timeout")):
        result = fetch(limit=10)
    assert result == []
