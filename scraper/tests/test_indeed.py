from pathlib import Path
from unittest.mock import patch, MagicMock
from sources.indeed import fetch, _parse_jobs

FIXTURE = (Path(__file__).parent / "fixtures" / "indeed.html").read_text()


def _mock_get(url, headers=None, timeout=None):
    mock = MagicMock()
    mock.status_code = 200
    mock.text = FIXTURE
    return mock


def test_parse_jobs_returns_list():
    result = _parse_jobs(FIXTURE, "https://de.indeed.com/jobs?q=test")
    assert isinstance(result, list)


def test_parse_jobs_finds_two_jobs():
    result = _parse_jobs(FIXTURE, "https://de.indeed.com/jobs?q=test")
    assert len(result) == 2


def test_parse_jobs_has_required_keys():
    result = _parse_jobs(FIXTURE, "https://de.indeed.com/jobs?q=test")
    job = result[0]
    assert "job_id" in job
    assert "title" in job
    assert "company" in job
    assert "location" in job
    assert "summary" in job
    assert "url" in job
    assert "post_date" in job


def test_parse_jobs_correct_title():
    result = _parse_jobs(FIXTURE, "https://de.indeed.com/jobs?q=test")
    assert result[0]["title"] == "Facility Manager Pflegeheim"


def test_parse_jobs_correct_company():
    result = _parse_jobs(FIXTURE, "https://de.indeed.com/jobs?q=test")
    assert result[0]["company"] == "Caritas München"


def test_fetch_returns_list_of_dicts():
    with patch("sources.indeed.requests.get", side_effect=_mock_get):
        result = fetch(keywords=["Facility Manager Pflegeheim"], limit=10)
    assert isinstance(result, list)
    assert all("job_id" in r for r in result)


def test_fetch_empty_on_request_error():
    with patch("sources.indeed.requests.get", side_effect=Exception("blocked")):
        result = fetch(keywords=["Altenpflege"], limit=10)
    assert result == []
