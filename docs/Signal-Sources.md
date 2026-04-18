# Signal Sources for the Agentic Funnel

*Starter inventory for TUM.ai Hackathon — lease·a·kitchen*

These sources deliver public buying-intent signals from the senior-living
sector. Every match creates a reason for a lead and simultaneously documents
"presumed consent" (§ 7 para. 2 no. 2 UWG) for follow-up contact.

---

## Strong Signals (Tier A — straight into the funnel)

### 1. Bund.de — Federal Procurement Platform
- **URL:** `https://www.bund.de/Content/DE/Ausschreibungen/ausschreibungen_node.html`
- **What:** Public tenders from all federal, state, and municipal agencies
- **Relevant keywords:** "Küchengeräte" (kitchen appliances), "Großküche" (commercial kitchen), "Ausstattung Wohnbereich" (residential area equipment), "Haustechnik Altenheim" (senior-home facilities), "Sanierung Pflegeheim" (care-home renovation)
- **Tech:** No official API, but HTML scraping at hourly interval is feasible; TED Europa is a structured EU-wide alternative
- **Hackathon-ready:** Yes — about one day of scraper build

### 2. TED Europa — Tenders Electronic Daily
- **URL:** `https://ted.europa.eu/`
- **API:** OpenAPI available (`https://data.europa.eu/api/hub/search/`)
- **What:** EU-wide public tenders above threshold values
- **Relevance:** Large operators (Diakonie, Caritas regional associations) often publish EU-wide
- **Hackathon-ready:** Yes — structured JSON response, fast integration

### 3. Building-Permit Registries (examples by state)
- **Bavaria:** `https://www.bauen.bayern.de/baugesetzbuch/` — construction applications partly public
- **Berlin:** `https://bauakte.berlin.de/`
- **NRW:** municipal-specific via local building authorities
- **What:** New-build and renovation applications — direct indicator of upcoming kitchen fit-out
- **Hackathon-ready:** Limited — fragmented landscape; one state as MVP is realistic

### 4. Job Boards — signal "renovation or overload"
- **Indeed:** `https://de.indeed.com/`
- **Stepstone:** `https://www.stepstone.de/`
- **Xing Jobs:** `https://www.xing.com/jobs/`
- **Keywords:** "Facility Manager Pflegeheim", "Haustechnik Altenpflege", "Einrichtungsleitung Betreutes Wohnen Neubau", "Projektleitung Sanierung Pflege"
- **What:** Job posts indicate current building or modernisation phases, or overload in equipment stock
- **Tech:** Scraping possible (mind ToS); some APIs paid; Xing API via business partner
- **Hackathon-ready:** Yes — 2–3 hours for a basic crawler

---

## Medium Signals (Tier B — keep warm, re-evaluate cyclically)

### 5. Sustainability Reports (ESG / DNK)
- **German Sustainability Code database:** `https://datenbank2.deutscher-nachhaltigkeitskodex.de/`
- **What:** Searchable DB of all DNK declarations; care providers above a certain size are required to report
- **Relevance:** Recently published report = receptive to ESG argument (refurbishing, CO₂ Scope 3)
- **Hackathon-ready:** Yes — API available

### 6. Business / Commercial Register
- **Unternehmensregister:** `https://www.unternehmensregister.de/`
- **Handelsregister:** `https://www.handelsregister.de/`
- **What:** New entries, changes of managing director, capital increases at operators
- **Relevance:** New leadership = 6–12 months later, typical window for modernisation decisions
- **Tech:** HTTP-based, not ergonomic, but works
- **Hackathon-ready:** Limited — more of a supplementary source

### 7. Operator Press Releases (Google News / RSS)
- **Google News API** (via SerpAPI or light scraping)
- **RSS feeds of operator websites** (Caritas, AWO, Diakonie have PR feeds)
- **What:** "Opening of new facility", "Modernisation completed", "Acquisition of care home XY"
- **Hackathon-ready:** Yes — classic RSS parser, quick to build

### 8. LinkedIn — Operator Company Pages
- **Apify LinkedIn actor** (already available in the Cowork setup)
- **What:** Personnel changes (MD, purchasing, facility management), post activity on modernisation, new-site announcements
- **Hackathon-ready:** Yes — LinkedIn MCP is already configured

---

## Weak Signals (Tier C — trigger basic research only)

### 9. Google Maps / Reviews
- **Google Places API** (paid but low cost per single query)
- **What:** New reviews criticising the kitchen or breakfast, or "old kitchen" as search term
- **Hackathon-ready:** Nice-to-have, not a core module

### 10. Wayback Machine / Website Relaunches
- **Wayback Machine API:** `http://archive.org/wayback/available`
- **What:** Website relaunch often means organisational change, new contact persons
- **Hackathon-ready:** Nice-to-have

### 11. Bundesanzeiger — Annual Reports
- **URL:** `https://www.bundesanzeiger.de/`
- **What:** Balance sheets of larger operators (reserves, CAPEX plans visible)
- **Hackathon-ready:** Too deep for an MVP, but valuable for production

---

## Recommendation for the Hackathon MVP

Build **three sources** into the core MVP:

1. **TED Europa** (fast API, structured JSON, EU-wide tenders)
2. **Indeed job board** (keyword crawler, strong indicator of modernisation phase)
3. **DNK sustainability-report database** (clear, structured, ESG argument directly usable)

Together these three cover the full spectrum — public tenders (direct buying
intent), operational strain (open positions), and values-driven openness
(ESG reports).

All other sources can be added incrementally after the hackathon.

---

## Matching Logic: Signal → Watchlist

For each signal, the agent must decide:

1. Does the source match an organisation on our watchlist (fuzzy match on name + address)?
2. If yes: attach the signal event to the organisation in Pipedrive, raise lead status to "Hot", trigger a research run.
3. If no: register the organisation as a new watchlist candidate, run an ICP check, add if appropriate.

---

*As of 17 April 2026 — list is extensible. Add new sources directly to this file.*
