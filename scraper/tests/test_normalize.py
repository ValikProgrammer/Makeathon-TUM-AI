from normalize import normalize

TED_RAW = {
    "ted_id": "TED-2026-001",
    "title": "Leasing Haushaltsgeräte Seniorenresidenz Stuttgart",
    "description": "Diakonie Stuttgart schreibt Leasing von 40 Waschmaschinen aus.",
    "contracting_authority": "Diakonie Stuttgart gGmbH",
    "publication_date": "2026-04-15",
    "deadline": "2026-05-15",
    "url": "https://ted.europa.eu/notice/TED-2026-001",
}

INDEED_RAW = {
    "job_id": "ind-abc123",
    "title": "Facility Manager Pflegeheim",
    "company": "Caritas München",
    "location": "München, Bayern",
    "post_date": "2026-04-14",
    "summary": "Neubau Seniorenresidenz, 55 Einheiten, Inbetriebnahme Q4 2026.",
    "url": "https://de.indeed.com/viewjob?jk=abc123",
}

DNK_RAW = {
    "company_name": "AWO Regionalverband Hannover",
    "sector": "Gesundheit/Soziales/Pflege",
    "report_year": 2025,
    "report_url": "https://datenbank2.deutscher-nachhaltigkeitskodex.de/reports/awo-hannover-2025",
    "location": "Hannover",
    "num_employees": "500-999",
}

BUND_RAW = {
    "title": "Ausstattung Wohnbereich Pflegeheim Köln",
    "contracting_body": "Stadt Köln, Sozialamt",
    "publication_date": "2026-04-10",
    "deadline": "2026-05-10",
    "description": "Lieferung und Leasing von Haushaltsgeräten für 30 Wohneinheiten.",
    "url": "https://www.bund.de/ausschreibungen/12345",
}

BAUPORTAL_RAW = {
    "permit_ref": "BAUGEH-2026-MUC-0042",
    "applicant": "Münchner Wohnbau GmbH",
    "project_type": "Neubau Betreutes Wohnen",
    "location": "München-Schwabing",
    "units": 45,
    "submission_date": "2026-04-01",
    "url": "https://bauantrag-online.de/permits/BAUGEH-2026-MUC-0042",
}

REQUIRED_KEYS = {"source", "source_url", "captured_at", "raw_title", "raw_body"}


def test_normalize_ted_has_required_keys():
    result = normalize(TED_RAW, "TED")
    assert REQUIRED_KEYS.issubset(result.keys())


def test_normalize_ted_source():
    result = normalize(TED_RAW, "TED")
    assert result["source"] == "TED"


def test_normalize_ted_url():
    result = normalize(TED_RAW, "TED")
    assert result["source_url"] == TED_RAW["url"]


def test_normalize_ted_title():
    result = normalize(TED_RAW, "TED")
    assert result["raw_title"] == TED_RAW["title"]


def test_normalize_ted_body_contains_description():
    result = normalize(TED_RAW, "TED")
    assert "Diakonie Stuttgart" in result["raw_body"]


def test_normalize_indeed_source():
    result = normalize(INDEED_RAW, "Indeed")
    assert result["source"] == "Indeed"


def test_normalize_indeed_body_contains_company():
    result = normalize(INDEED_RAW, "Indeed")
    assert "Caritas München" in result["raw_body"]


def test_normalize_dnk_source():
    result = normalize(DNK_RAW, "DNK")
    assert result["source"] == "DNK"


def test_normalize_dnk_body_contains_report_year():
    result = normalize(DNK_RAW, "DNK")
    assert "2025" in result["raw_body"]


def test_normalize_bund_source():
    result = normalize(BUND_RAW, "BundDe")
    assert result["source"] == "BundDe"


def test_normalize_bund_body_contains_contracting_body():
    result = normalize(BUND_RAW, "BundDe")
    assert "Stadt Köln" in result["raw_body"]


def test_normalize_bauportal_source():
    result = normalize(BAUPORTAL_RAW, "Bauportal")
    assert result["source"] == "Bauportal"


def test_normalize_bauportal_body_contains_units():
    result = normalize(BAUPORTAL_RAW, "Bauportal")
    assert "45" in result["raw_body"]


def test_normalize_captured_at_is_iso8601():
    result = normalize(TED_RAW, "TED")
    assert result["captured_at"].endswith("Z")
    assert "T" in result["captured_at"]


def test_normalize_unknown_source_raises():
    try:
        normalize(TED_RAW, "UNKNOWN")
        assert False, "Expected KeyError"
    except KeyError:
        pass
