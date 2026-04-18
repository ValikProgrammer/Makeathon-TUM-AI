# Data Concept — lease·a·kitchen Agent Stack

**One table. One knowledge base. A thin runtime contact mirror. That's it.**

---

## The big picture

```
                ┌──────────────────────────────────────┐
                │             Cockpit (UI)             │
                └──────────────────┬───────────────────┘
                                   │ read / write
            ┌──────────────────────┴──────────────────────┐
            │                                             │
    ┌───────▼────────┐                         ┌──────────▼───────────┐
    │   Twin (PG)    │◀─────── id ────────────▶│ HappyRobot Contacts  │
    │   leads table  │                         │  Runtime dialer +    │
    │  (only table)  │                         │  inbound match only  │
    └───────┬────────┘                         └──────────────────────┘
            │ read
    ┌───────▼────────────┐
    │  Knowledge Base    │
    │  (retrieval only)  │
    └────────────────────┘
```

- **Twin** — one `leads` table, the only persistent state
- **Contacts** — thin HappyRobot mirror, only phone + name + external_id
- **Knowledge Base** — static facts, FAQs, hook copy, proof points

## Placement rules

| If the data is… | It goes in… |
|---|---|
| anything that changes per lead | **`leads` table** |
| the phone number Kate dials or matches on | **Contacts mirror** |
| a fact, script, or proof point Kate/Otto may cite | **Knowledge Base** |
| the three bundle prices | **`config/pricing.json`** (not Twin, not KB) |

---

# 1 · Twin — the `leads` table

The single source of truth. Every agent writes its own columns; nothing else is persisted.

## Schema

See [`seed/scout-seed.sql`](../seed/scout-seed.sql) for the authoritative DDL.
Summary by section:

### Identity & lifecycle

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |
| `stage` | TEXT | `new` · `qualified` · `homologation_fail` · `not_interested` · `escalated` · `offered` · `accepted` · `rejected` · `suppressed` |

### Company (Jack research — real)

| Column | Type | Notes |
|---|---|---|
| `company_name` | TEXT | required |
| `street`, `postal_code`, `city`, `url` | TEXT | from Pipedrive |

### Contact

| Column | Type | Writer |
|---|---|---|
| `person_name`, `person_role`, `person_email` | TEXT | Jack |
| `person_phone` | TEXT | **Landing page** (prospect-submitted) |

### Jack output

| Column | Type | Notes |
|---|---|---|
| `signal_url` | TEXT | authoritative link |
| `signal_summary` | TEXT | becomes Kate's "why now" opener line |
| `motivation_string` | TEXT | `simplify` · `scale` · `optimize` · `circular` |
| `score` | INTEGER | 0–100 |

### Consent (landing-page submit)

| Column | Type | Notes |
|---|---|---|
| `consent_given_at` | TIMESTAMPTZ | also marks LP submit moment |
| `consent_text_version` | TEXT | e.g. `v1.0` |
| `consent_ip` | TEXT | audit |

### Kate output

| Column | Type | Notes |
|---|---|---|
| `facility_type` | TEXT | `senior_care` · `assisted_living` · `student_housing` · `serviced_apartments` · `other` |
| `num_units` | INTEGER | total, mirrors sum of bundle_* |
| `timeline` | TEXT | free text |
| `preferred_term_months` | INTEGER | 36 / 48 / 60 / 72 / 84 |
| `decision_maker` | TEXT | |
| `bundle_leader`, `bundle_profi`, `bundle_top_feature` | INTEGER | per-bundle qty |
| `opt_in` | BOOLEAN | |
| `preferred_channel` | TEXT | `email` · `whatsapp` · `phone` |
| `contact_address` | TEXT | where Otto sends the offer |
| `call_transcript_url` | TEXT | HappyRobot link |
| `call_notes`, `escalation_reason` | TEXT | |

### Otto output

| Column | Type | Notes |
|---|---|---|
| `offer_sent_at` | TIMESTAMPTZ | |
| `offer_accepted_at` | TIMESTAMPTZ | |

## Who writes what

| Writer | Columns |
|---|---|
| **Jack** | `company_*`, `street`, `postal_code`, `city`, `url`, `person_name`, `person_role`, `person_email`, `signal_*`, `motivation_string`, `score` |
| **Landing page** | `person_phone`, `consent_*` |
| **Kate** | `facility_type`, `num_units`, `timeline`, `preferred_term_months`, `decision_maker`, `bundle_*`, `opt_in`, `preferred_channel`, `contact_address`, `call_*`, `escalation_reason`, and transitions `stage` |
| **Otto** | `offer_sent_at`, `offer_accepted_at`, and transitions `stage` to `offered` / `accepted` / `rejected` |
| **Cockpit** | reads everything; manual stage override for SDR intervention |

## Computed (not stored)

These are always derived at render time from columns + `config/pricing.json`. Storing them creates drift.

- Monthly rate = `(bundle_leader × 42) + (bundle_profi × 58) + (bundle_top_feature × 80)`
- Total contract value = `monthly_rate × preferred_term_months`
- Purchase equivalent = `Σ (bundle_qty × purchase_equiv_eur per bundle)`
- Savings = `purchase_equiv − total_contract_value`
- Pipeline KPI = aggregate over `stage IN ('qualified', 'offered')`

## Deliberately not built (for the hackathon)

- No separate `signal`, `touchpoint`, `consent`, `offer`, `inventory` tables. Everything lives on the lead row.
- No audit log table — Twin's native journal covers it.
- No `score_breakdown` jsonb — single integer, reasoning goes into `signal_summary` as prose.
- No multi-consent history — one consent per lead is enough for §7/GDPR demo.

---

# 2 · HappyRobot Contacts — thin runtime mirror

Only exists so the voice runtime can dial and match inbound calls.

| Field | Purpose |
|---|---|
| `phone` | primary key for inbound matching |
| `name` | for greeting |
| `external_id` | points to `leads.id` |

Populated at the moment the landing page submits consent + phone. Business data always comes from Twin via `external_id`; never stored on Contacts.

---

# 3 · Knowledge Base — retrieval only

Static content Kate and Otto cite. Not state, not mutable per lead.

| Category | Examples |
|---|---|
| **Product knowledge** | Bundle appliance lists, service SLAs, warranty terms |
| **BSH proof points** | DNV certificate (C719652), +20 % lifespan ISO 14021, ESRS E1, MIA Miteinander testimonial |
| **Objection handling** | "more expensive than buying" → TCO reply · "we already have a supplier" → renewal-date probe · "we need commercial kitchen" → homologation exit |
| **Hook copy templates** | The four BSH-aligned opener lines (simplify / scale / optimize / circular) |
| **Legal boilerplate** | Verbal privacy disclosure, B2B withdrawal right, privacy URL |
| **Team routing** | Which human handles which escalation + office hours |

### Not in the KB

- **Prices** — live in `config/pricing.json`
- **Prospect-specific data** — lives in `leads` columns
- **Consent evidence** — lives in `leads.consent_*`
- **Availability** — too dynamic

---

# 4 · The pitch line

> "We didn't build a CRM. Agents don't need a CRM — they need a **shared row** and a **script library**. One Postgres table is the row. The Knowledge Base is the library. That's all."

---

# 5 · Out of scope for the hackathon

Post-hackathon:
- Pipeline stages / forecasting / commission / territory (full CRM)
- Twin ↔ external CRM (Pipedrive, HubSpot) sync
- KB as vector store with embeddings
- RBAC inside Twin
- Calibration history for Jack's feedback loop
- Signal history as separate table (multiple signals per lead)
- Inventory table (per-SKU catalog parked in Google Drive as `otto_mock_pricelist.json`)
- Audit log table beyond Twin native
