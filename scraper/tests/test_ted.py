from unittest.mock import patch, MagicMock
from sources.ted import fetch

TED_API_RESPONSE = {
    "notices": [
        {
            "ND": "TED-2026-00001",
            "TI": "Leasing von Haushaltsgeräten für Seniorenresidenz Stuttgart",
            "TD": "Diakonie Stuttgart schreibt Leasing von 40 Waschmaschinen und Trocknern aus.",
            "AU": "Diakonie Stuttgart gGmbH",
            "DT": "20260415",
            "DL": "20260515",
            "TED_NOTICE_URL": "https://ted.europa.eu/notice/TED-2026-00001",
        }
    ],
    "total": 1,
}


def _mock_post(url, json=None, headers=None, timeout=None):
    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = TED_API_RESPONSE
    return mock


def test_fetch_returns_list():
    with patch("sources.ted.requests.post", side_effect=_mock_post):
        result = fetch(keywords=["Altenpflege"], limit=10)
    assert isinstance(result, list)


def test_fetch_returns_raw_dicts_with_required_keys():
    with patch("sources.ted.requests.post", side_effect=_mock_post):
        result = fetch(keywords=["Altenpflege"], limit=10)
    assert len(result) == 1
    assert "ted_id" in result[0]
    assert "title" in result[0]
    assert "description" in result[0]
    assert "contracting_authority" in result[0]
    assert "url" in result[0]


def test_fetch_maps_nd_to_ted_id():
    with patch("sources.ted.requests.post", side_effect=_mock_post):
        result = fetch(keywords=["Altenpflege"], limit=10)
    assert result[0]["ted_id"] == "TED-2026-00001"


def test_fetch_empty_on_api_error():
    mock = MagicMock()
    mock.status_code = 500
    mock.json.return_value = {}
    with patch("sources.ted.requests.post", return_value=mock):
        result = fetch(keywords=["Altenpflege"], limit=10)
    assert result == []


def test_fetch_respects_limit():
    many_notices = {"notices": [TED_API_RESPONSE["notices"][0]] * 20, "total": 20}
    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = many_notices
    with patch("sources.ted.requests.post", return_value=mock):
        result = fetch(keywords=["Altenpflege"], limit=5)
    assert len(result) <= 5
