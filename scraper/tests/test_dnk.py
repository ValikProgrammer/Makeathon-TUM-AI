from unittest.mock import patch, MagicMock
from sources.dnk import fetch

DNK_API_RESPONSE = {
    "results": [
        {
            "id": "dnk-2025-awo-hannover",
            "companyName": "AWO Regionalverband Hannover",
            "sector": "Gesundheit/Soziales/Pflege",
            "reportYear": 2025,
            "reportUrl": "https://datenbank2.deutscher-nachhaltigkeitskodex.de/reports/awo-hannover-2025",
            "city": "Hannover",
            "employeeRange": "500-999",
        }
    ],
    "total": 1,
}


def _mock_get(url, params=None, headers=None, timeout=None):
    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = DNK_API_RESPONSE
    return mock


def test_fetch_returns_list():
    with patch("sources.dnk.requests.get", side_effect=_mock_get):
        result = fetch(limit=10)
    assert isinstance(result, list)


def test_fetch_has_required_keys():
    with patch("sources.dnk.requests.get", side_effect=_mock_get):
        result = fetch(limit=10)
    assert len(result) == 1
    r = result[0]
    assert "company_name" in r
    assert "sector" in r
    assert "report_year" in r
    assert "report_url" in r
    assert "location" in r
    assert "num_employees" in r


def test_fetch_maps_company_name():
    with patch("sources.dnk.requests.get", side_effect=_mock_get):
        result = fetch(limit=10)
    assert result[0]["company_name"] == "AWO Regionalverband Hannover"


def test_fetch_empty_on_api_error():
    mock = MagicMock()
    mock.status_code = 500
    with patch("sources.dnk.requests.get", return_value=mock):
        result = fetch(limit=10)
    assert result == []


def test_fetch_empty_on_request_exception():
    with patch("sources.dnk.requests.get", side_effect=Exception("timeout")):
        result = fetch(limit=10)
    assert result == []
