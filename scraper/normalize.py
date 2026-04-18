from datetime import datetime, timezone


def normalize(raw: dict, source: str) -> dict:
    mappers = {
        "TED": _from_ted,
        "Indeed": _from_indeed,
        "DNK": _from_dnk,
        "BundDe": _from_bund,
        "Bauportal": _from_bauportal,
    }
    return mappers[source](raw)


def _from_ted(raw: dict) -> dict:
    return {
        "source": "TED",
        "source_url": raw.get("url", ""),
        "captured_at": _now(),
        "raw_title": raw.get("title", ""),
        "raw_body": _join(
            raw.get("description", ""),
            raw.get("contracting_authority", ""),
            f"Deadline: {raw.get('deadline', '')}",
            f"Published: {raw.get('publication_date', '')}",
        ),
    }


def _from_indeed(raw: dict) -> dict:
    return {
        "source": "Indeed",
        "source_url": raw.get("url", ""),
        "captured_at": _now(),
        "raw_title": raw.get("title", ""),
        "raw_body": _join(
            raw.get("company", ""),
            raw.get("location", ""),
            raw.get("summary", ""),
            f"Posted: {raw.get('post_date', '')}",
        ),
    }


def _from_dnk(raw: dict) -> dict:
    return {
        "source": "DNK",
        "source_url": raw.get("report_url", ""),
        "captured_at": _now(),
        "raw_title": f"DNK Report {raw.get('report_year', '')}: {raw.get('company_name', '')}",
        "raw_body": _join(
            raw.get("company_name", ""),
            raw.get("sector", ""),
            f"Report year: {raw.get('report_year', '')}",
            f"Location: {raw.get('location', '')}",
            f"Employees: {raw.get('num_employees', '')}",
        ),
    }


def _from_bund(raw: dict) -> dict:
    return {
        "source": "BundDe",
        "source_url": raw.get("url", ""),
        "captured_at": _now(),
        "raw_title": raw.get("title", ""),
        "raw_body": _join(
            raw.get("description", ""),
            raw.get("contracting_body", ""),
            f"Deadline: {raw.get('deadline', '')}",
            f"Published: {raw.get('publication_date', '')}",
        ),
    }


def _from_bauportal(raw: dict) -> dict:
    units = raw.get("units")
    units_str = f"{units} Einheiten" if units else "Anzahl Einheiten unbekannt"
    return {
        "source": "Bauportal",
        "source_url": raw.get("url", ""),
        "captured_at": _now(),
        "raw_title": f"{raw.get('project_type', '')} – {raw.get('location', '')}",
        "raw_body": _join(
            raw.get("applicant", ""),
            raw.get("project_type", ""),
            raw.get("location", ""),
            units_str,
            f"Permit ref: {raw.get('permit_ref', '')}",
            f"Submitted: {raw.get('submission_date', '')}",
        ),
    }


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _join(*parts: str) -> str:
    return " | ".join(str(p) for p in parts if p)
