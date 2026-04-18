-- ============================================================
-- leads · single source of truth · TUM.ai Makeathon
-- ============================================================
-- One table for the whole pipeline: Jack → Kate → Otto.
-- Every agent writes its own columns; nothing else is persisted.
--
-- Company fields (name, address, URL, person_name/role/email) = REAL data
--   pulled from Pipedrive (owner: Martin / orgaloom).
-- person_phone = NULL — captured on the landing page by the prospect.
-- Scout output fields (signal_*, motivation_string, score) are NULL in the
--   seed — Jack populates them at runtime.
-- ------------------------------------------------------------

DROP TABLE IF EXISTS leads;

CREATE TABLE leads (
    -- Identity & lifecycle
    id                       SERIAL       PRIMARY KEY,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    stage                    TEXT         NOT NULL DEFAULT 'new',
      -- new | qualified | homologation_fail | not_interested
      -- | escalated | offered | accepted | rejected | suppressed

    -- Company (Jack, real)
    company_name             TEXT         NOT NULL,
    street                   TEXT,
    postal_code              TEXT,
    city                     TEXT,
    url                      TEXT,

    -- Contact (Jack researches all but phone)
    person_name              TEXT,
    person_role              TEXT,
    person_email             TEXT,
    person_phone             TEXT,                 -- filled by landing page

    -- Jack output
    signal_url               TEXT,
    signal_summary           TEXT,                 -- Kate's "why now" line
    motivation_string        TEXT,                 -- simplify | scale | optimize | circular
    score                    INTEGER,              -- 0–100

    -- Consent (landing-page submit)
    consent_given_at         TIMESTAMPTZ,
    consent_text_version     TEXT,
    consent_ip               TEXT,

    -- Kate output
    facility_type            TEXT,                 -- senior_care | assisted_living | ...
    num_units                INTEGER,              -- total, sum of bundle_* (stored)
    timeline                 TEXT,
    preferred_term_months    INTEGER,              -- 36 | 48 | 60 | 72 | 84
    decision_maker           TEXT,
    bundle_leader            INTEGER      DEFAULT 0,
    bundle_profi             INTEGER      DEFAULT 0,
    bundle_top_feature       INTEGER      DEFAULT 0,
    opt_in                   BOOLEAN,
    preferred_channel        TEXT,                 -- email | whatsapp | phone
    contact_address          TEXT,                 -- email / whatsapp where offer goes
    call_transcript_url      TEXT,
    call_notes               TEXT,
    escalation_reason        TEXT,

    -- Otto output
    offer_sent_at            TIMESTAMPTZ,
    offer_accepted_at        TIMESTAMPTZ
);

CREATE INDEX idx_leads_stage        ON leads(stage);
CREATE INDEX idx_leads_person_phone ON leads(person_phone);
CREATE INDEX idx_leads_person_email ON leads(person_email);

-- ------------------------------------------------------------
-- Seed: 10 real senior-living operators (mock person data)
-- ------------------------------------------------------------
-- Note: signal_url values below are MOCK — pointers look real but
-- were fabricated for the hackathon demo. Replace with real sources
-- once Jack's live scraper is in production.
-- ------------------------------------------------------------
INSERT INTO leads (
    company_name, street, postal_code, city, url,
    person_name, person_role, person_email,
    signal_url, signal_summary, motivation_string, score
) VALUES
(
    'Evangelische Heimstiftung GmbH', 'Hackstraße 12', '70190', 'Stuttgart', 'https://www.ev-heimstiftung.de/',
    'Dr. Stefan Bürkle', 'Leitung Einkauf', 's.buerkle@ev-heimstiftung.de',
    'https://www.bund.de/mock-tender/EHS-2026-07',
    'Public tender for KfW-funded senior residence opening Stuttgart Q3 2026, approximately 120 residential units',
    'optimize', 88
),
(
    'Pro Seniore Residenz Kempten', 'Stiftskellerweg 43', '87439', 'Kempten', 'https://kempten.pro-seniore.de/',
    'Martina Hoffmann', 'Hausleitung', 'm.hoffmann@pro-seniore.com',
    'https://mock-bauportal.de/permits/kempten-sued-2026',
    'Renovation permit granted for Pro Seniore Kempten-Süd, 45 apartments, construction start Q4 2026',
    'simplify', 76
),
(
    'Dorea GmbH', 'Siemensdamm 62', '13627', 'Berlin', 'https://www.dorea.de/',
    'Andreas Richter', 'Geschäftsführer', 'a.richter@dorea.de',
    'https://mock-care-invest.de/news/dorea-expansion-2026',
    'Press release: Dorea announcing three new assisted-living sites across Berlin-Brandenburg region',
    'scale', 82
),
(
    'DOMIZILIUM GmbH', 'Wilhelm-Köhler-Straße 50', '86956', 'Schongau', 'https://www.domizilium.de/',
    'Julia Schwarz', 'Einrichtungsleitung', 'j.schwarz@domizilium.de',
    'https://mock-bauportal.de/permits/schongau-bw-2026',
    'Building permit granted for new betreutes Wohnen complex in Schongau, 60 residential units',
    'simplify', 79
),
(
    'AWO Arbeiterwohlfahrt', 'Blücherstraße 62/63', '10961', 'Berlin', 'https://www.awo.org/',
    'Thomas Weber', 'Regionalleitung', 't.weber@awo.org',
    'https://mock-vergabeportal.de/tender/AWO-BE-2026-41',
    'Öffentliche Ausschreibung for household-appliance leasing across 5 AWO senior residences, total approximately 200 units',
    'scale', 74
),
(
    'BRK SeniorenWohnen', 'Garmischer Straße 19-21', '81373', 'München', 'https://www.brk-seniorenwohnen.de/',
    'Dr. Christine Bauer', 'Leitung Hauswirtschaft', 'c.bauer@brk-seniorenwohnen.de',
    'https://mock-brk.de/news/serienrenovierung-muenchen-2026-2028',
    'Serial renovation plan for Munich region 2026–2028: 8 senior homes, approximately 400 residential units with appliance refresh',
    'simplify', 91
),
(
    'Tertianum Service GmbH', 'Hackescher Markt 2-3', '10178', 'Berlin', 'https://tertianum-premiumresidences.de/',
    'Michael Krause', 'Prokurist', 'm.krause@tertianum-premiumresidences.de',
    'https://mock-immobilien-zeitung.de/news/tertianum-mitte-opening',
    'Opening announcement for new Tertianum Premium Residence Berlin-Mitte, projected Q2 2027',
    'optimize', 68
),
(
    'Caritas Trägergesellschaft St. Elisabeth gGmbH', 'Von-Hompesch-Straße 1', '53123', 'Bonn', 'https://www.cts-mbh.de/',
    'Petra Müller', 'Leitung Einkauf', 'p.mueller@cts-mbh.de',
    'https://mock-bundesanzeiger.de/jahresabschluss/CTS-2025',
    'Annual report 2025 mentions appliance refresh across senior-care facilities in 2026, specific budget line allocated',
    'optimize', 85
),
(
    'EMVIA Living GmbH', 'Aachener Straße 1053-1055', '50858', 'Köln', 'https://www.emvia.de/',
    'Frank Schmidt', 'Geschäftsführer', 'f.schmidt@emvia.de',
    'https://mock-care-invest.de/news/emvia-acquisition-q1-2026',
    'Acquisition of two smaller care operators announced; appliance harmonization across acquired sites planned',
    'scale', 70
),
(
    'Augustinum Gruppe', 'Stiftsbogen 74', '81375', 'München', 'https://www.augustinum.de/',
    'Sabine Fischer', 'Hausleitung', 's.fischer@augustinum.de',
    'https://mock-augustinum.de/news/jubilaeum-refurbishment-2026',
    '50th-anniversary refurbishment project across Munich residences: 180 apartments scheduled for renewal 2026–2027',
    'simplify', 87
);
