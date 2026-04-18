-- ============================================================
-- Scout Seed Data  ·  lease·a·kitchen · TUM.ai Makeathon
-- ============================================================
-- Company fields (name, street, postal_code, city, url) = REAL data
--   pulled from Pipedrive (owner: Martin / orgaloom).
-- Person fields (person_name, person_role, person_email) = MOCK data
--   (invented; do NOT contact).
-- Scout output fields (context, motivation_type, score) are intentionally
--   NULL — the Scout agent fills them during the demo.
-- ------------------------------------------------------------

DROP TABLE IF EXISTS leads;

CREATE TABLE leads (
    id              INTEGER PRIMARY KEY,
    -- Company (real)
    name            TEXT    NOT NULL,
    street          TEXT    NOT NULL,   -- Straße + Hausnummer
    postal_code     TEXT    NOT NULL,   -- PLZ
    city            TEXT    NOT NULL,   -- Ort
    url             TEXT,
    -- Contact person (mock)
    person_name     TEXT    NOT NULL,
    person_role     TEXT    NOT NULL,
    person_email    TEXT    NOT NULL,
    -- Scout agent output (filled at runtime)
    context         TEXT,
    motivation_type TEXT,
    score           INTEGER
);

INSERT INTO leads (id, name, street, postal_code, city, url, person_name, person_role, person_email, context, motivation_type, score) VALUES
(1,  'Evangelische Heimstiftung GmbH',                  'Hackstraße 12',            '70190', 'Stuttgart', 'https://www.ev-heimstiftung.de/',         'Dr. Stefan Bürkle',   'Leitung Einkauf',        's.buerkle@ev-heimstiftung.de',            NULL, NULL, NULL),
(2,  'Pro Seniore Residenz Kempten',                    'Stiftskellerweg 43',       '87439', 'Kempten',   'https://kempten.pro-seniore.de/',         'Martina Hoffmann',    'Hausleitung',            'm.hoffmann@pro-seniore.com',              NULL, NULL, NULL),
(3,  'Dorea GmbH',                                      'Siemensdamm 62',           '13627', 'Berlin',    'https://www.dorea.de/',                   'Andreas Richter',     'Geschäftsführer',        'a.richter@dorea.de',                      NULL, NULL, NULL),
(4,  'DOMIZILIUM GmbH',                                 'Wilhelm-Köhler-Straße 50', '86956', 'Schongau',  'https://www.domizilium.de/',              'Julia Schwarz',       'Einrichtungsleitung',    'j.schwarz@domizilium.de',                 NULL, NULL, NULL),
(5,  'AWO Arbeiterwohlfahrt',                           'Blücherstraße 62/63',      '10961', 'Berlin',    'https://www.awo.org/',                    'Thomas Weber',        'Regionalleitung',        't.weber@awo.org',                         NULL, NULL, NULL),
(6,  'BRK SeniorenWohnen',                              'Garmischer Straße 19-21', '81373', 'München',   'https://www.brk-seniorenwohnen.de/',      'Dr. Christine Bauer', 'Leitung Hauswirtschaft', 'c.bauer@brk-seniorenwohnen.de',           NULL, NULL, NULL),
(7,  'Tertianum Service GmbH',                          'Hackescher Markt 2-3',    '10178', 'Berlin',    'https://tertianum-premiumresidences.de/', 'Michael Krause',      'Prokurist',              'm.krause@tertianum-premiumresidences.de', NULL, NULL, NULL),
(8,  'Caritas Trägergesellschaft St. Elisabeth gGmbH',  'Von-Hompesch-Straße 1',   '53123', 'Bonn',      'https://www.cts-mbh.de/',                 'Petra Müller',        'Leitung Einkauf',        'p.mueller@cts-mbh.de',                    NULL, NULL, NULL),
(9,  'EMVIA Living GmbH',                               'Aachener Straße 1053-1055','50858','Köln',      'https://www.emvia.de/',                   'Frank Schmidt',       'Geschäftsführer',        'f.schmidt@emvia.de',                      NULL, NULL, NULL),
(10, 'Augustinum Gruppe',                               'Stiftsbogen 74',          '81375', 'München',   'https://www.augustinum.de/',              'Sabine Fischer',      'Hausleitung',            's.fischer@augustinum.de',                 NULL, NULL, NULL);
