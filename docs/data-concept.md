# Data Concept — lease·a·kitchen Agent Stack

**Three data surfaces, one logic: Twin holds state, Contacts mirrors runtime, Knowledge Base holds script material.**

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
    │   Twin (PG)    │◀────── external_id ────▶│ HappyRobot Contacts  │
    │  STATE of      │                         │  Runtime dialer +    │
    │  truth         │                         │  inbound match only  │
    └───────┬────────┘                         └──────────┬───────────┘
            │ read                                        │
    ┌───────▼────────────┐                   Kate calls from here
    │  Knowledge Base    │
    │  (retrieval only:  │
    │  facts, FAQ, copy) │
    └────────────────────┘
```

- **Twin** — operational memory, authoritative record per prospect
- **Contacts** — thin identity mirror used by the voice runtime
- **Knowledge Base** — static content Kate and Otto cite, never write to

---

## Data placement rules (the one-line version)

| If the data is… | It goes in… |
|---|---|
| specific to a prospect and changes over time | **Twin** |
| the phone number the voice agent dials or matches on | **Contacts** (mirror) |
| a fact, script, or proof point any agent may cite | **Knowledge Base** |
| a price, an SKU, or availability | **Twin · `inventory`** |
| legal evidence of consent | **Twin · `consent`** (never KB) |

---

# 1 · Twin — the state of truth

Functionally a mini-CRM for the agents. Every decision an agent makes is based on a Twin row.

## 1.1 Design principle

Every agent should be able to answer *"what do I know about this prospect right now?"* with a single lookup. If Kate has to call Jack to get the hook, or Otto has to guess the qualification fields, state has been split badly.

**Rule:** *Twin holds the shared state. Each agent writes its outputs and reads whatever it needs.*

## 1.2 Core tables

### `prospect` — the one record to rule them all

The canonical record per company/lead. Every other table references this.

| Field | Source | Purpose |
|---|---|---|
| `id` (PK) | auto | stable lead ID |
| `company_name` | Jack | company |
| `facility_name` | Jack | specific site, if different |
| `segment` | Jack | `senior_living | student_housing | serviced_apartments | btr | hospital | other` |
| `contact_name` | Jack | primary contact (if known) |
| `contact_role` | Jack | drives hook selection |
| `postal_address` | Jack | validated address for postcard |
| `phone` | Kate (inbound) / Jack | reachability |
| `email` | Kate / prospect input | |
| `country`, `region`, `city` | Jack | geo |
| **`score_total`** | Jack | 0–100 |
| **`score_breakdown`** (jsonb) | Jack | per-dimension scores + sources |
| **`hook`** | Jack | `simplify | scale | optimize | circular` |
| **`homologation_fit`** | Jack + Kate | `fit | unfit | unknown` |
| `status` | auto | `new | postcard_sent | qr_scanned | consented | called | offered | won | lost | suppressed` |
| `created_at`, `updated_at` | auto | |

**Who writes:** Jack creates, Kate updates `status` + `phone` + `email`, Otto updates `status`, cockpit reads everything.

### `signal` — public-source evidence (multiple per prospect)

Why-now proof for audit and Kate's opener context.

| Field | Purpose |
|---|---|
| `id` (PK) | |
| `prospect_id` (FK) | |
| `source_type` | `tender | permit | funding | press | jobpost | registry | other` |
| `source_url` | authoritative link |
| `signal_date` | when the signal was published |
| `signal_summary` | short text Kate uses in opener |
| `strength_score` | 0–100, feeds into `score_breakdown` |

Jack may find multiple signals over time. Kate picks the most recent/strongest for the opener.

### `touchpoint` — every interaction event

Chronological log. Lets the cockpit tell the story and prevents double-contacting.

| Field | Purpose |
|---|---|
| `id` (PK) | |
| `prospect_id` (FK) | |
| `type` | `postcard_sent | qr_scanned | landing_view | call_attempted | call_answered | email_sent | whatsapp_sent | escalated_to_human` |
| `direction` | `outbound | inbound` |
| `channel` | `post | web | phone | email | whatsapp` |
| `occurred_at` | timestamp |
| `agent` | `jack | kate | otto | human | prospect` |
| `metadata` (jsonb) | anything type-specific (postcard template id, call duration, email subject) |

Kate uses this to refuse redialing. Jack uses it to enforce the "no contact in last 6 months" rule.

### `consent` — legal audit (load-bearing under UWG §7 + GDPR)

Every consent event, versioned. This is your proof in court.

| Field | Purpose |
|---|---|
| `id` (PK) | |
| `prospect_id` (FK) | |
| `consent_type` | `callback_ai | marketing_email | whatsapp_contact | data_processing` |
| `consent_text_version` | e.g. `v1.0` — matches the exact text shown |
| `consent_text_snapshot` | the text they actually saw (immutable) |
| `granted_at` | timestamp |
| `ip_address`, `user_agent`, `referrer` | for audit |
| `revoked_at` | nullable |

Kate and Otto must check this before calling/emailing. Revoked → suppress.

### `call` — Kate's structured output

One row per call attempt.

| Field | Purpose |
|---|---|
| `id` (PK) | |
| `prospect_id` (FK) | |
| `started_at`, `ended_at` | duration calc |
| `call_outcome` | from Kate's output schema |
| **Envelope fields** | `facility_type`, `num_units`, `timeline`, `preferred_term_months`, `budget_indicator`, `decision_maker`, `opt_in`, `preferred_channel`, `contact_address` |
| `hook_used`, `hook_resonated` | feeds Jack's calibration loop |
| `escalate`, `escalation_reason` | |
| `callback_time` | if requested |
| `transcript_url` | link to HappyRobot recording/transcript |
| `notes` | free text |

Otto reads this row to build the offer. Jack reads `hook_resonated` to recalibrate hook selection rules.

### `offer` — Otto's output

| Field | Purpose |
|---|---|
| `id` (PK) | |
| `prospect_id` (FK) | |
| `call_id` (FK) | which qualification drove this offer |
| `line_items` (jsonb) | SKU, qty, unit_price, line_total — straight from Otto |
| `term_months` | |
| `subtotal_eur_month`, `discount_eur_month`, `total_eur_month` | |
| `total_contract_value_eur` | |
| `valid_until` | |
| `sent_channel` | `email | whatsapp` |
| `sent_at` | |
| `accepted_at` | nullable — when they click the CTA |
| `rejected_reason` | nullable |

### `suppression` — the do-not-contact list

| Field | Purpose |
|---|---|
| `id` (PK) | |
| `prospect_id` (FK, nullable) | |
| `domain_or_phone_or_address` | broad suppression — e.g. whole holding |
| `reason` | `opt_out | gdpr_objection | insolvency | already_customer | ICP_exclusion | homologation_fail | cooldown` |
| `suppressed_until` | nullable — for time-bound cooldowns |
| `created_at`, `created_by` | audit |

Jack queries this before scoring. Kate queries before dialing. Otto queries before emailing.

### `inventory` — what Otto is allowed to offer

Mirror of `otto_mock_pricelist.json` in Postgres. Keeps the agent dynamic and auditable.

| Field | Purpose |
|---|---|
| `sku` (PK) | |
| `product_name` | |
| `category` | SDA/Cooking/Cooling/Dishcare/Laundry Care/Accessories |
| `status` | `active | phasing_out | end_of_life` |
| `monthly_price_eur` (jsonb) | per term `{36, 48, 60, 72, 84}` |
| `stock_available` | rough count — prevents Otto quoting vaporware |
| `updated_at` | |

## 1.3 Who reads / writes what

|  | prospect | signal | touchpoint | consent | call | offer | suppression | inventory |
|---|---|---|---|---|---|---|---|---|
| **Jack** | R/W | R/W | R/W | R | R | R | R | — |
| **Kate** | R/W | R | R/W | R | W | — | R | R |
| **Otto** | R/W | — | W | R | R | R/W | R | R |
| **Cockpit** | R | R | R | R | R | R | R | R |
| **Human (SDR)** | R/W | R | R/W | R | R/W | R/W | R/W | R |

## 1.4 Essential queries

**Jack before creating a prospect:**
```sql
-- is this prospect already known or suppressed?
SELECT id FROM prospect WHERE company_name ILIKE :name;
SELECT 1 FROM suppression
 WHERE (prospect_id = :pid OR domain_or_phone_or_address = :domain)
   AND (suppressed_until IS NULL OR suppressed_until > now());
```

**Kate when an inbound call arrives:**
```sql
SELECT p.*, s.signal_summary, p.hook
  FROM prospect p
  LEFT JOIN signal s ON s.prospect_id = p.id
 WHERE p.phone = :inbound_phone
 ORDER BY s.signal_date DESC
 LIMIT 1;
```

**Otto when building an offer:**
```sql
SELECT * FROM call WHERE prospect_id = :pid ORDER BY ended_at DESC LIMIT 1;

SELECT 1 FROM consent
 WHERE prospect_id = :pid
   AND consent_type IN ('marketing_email', 'callback_ai')
   AND revoked_at IS NULL;

SELECT * FROM inventory
 WHERE category = :category AND status = 'active' AND stock_available > :qty;
```

## 1.5 Indexes that matter

```sql
CREATE INDEX idx_prospect_phone       ON prospect(phone);
CREATE INDEX idx_prospect_status      ON prospect(status);
CREATE INDEX idx_touchpoint_prospect  ON touchpoint(prospect_id, occurred_at DESC);
CREATE INDEX idx_signal_prospect      ON signal(prospect_id, signal_date DESC);
CREATE INDEX idx_call_prospect        ON call(prospect_id, started_at DESC);
CREATE INDEX idx_suppression_domain   ON suppression(domain_or_phone_or_address);
```

## 1.6 Twin-specific notes

HappyRobot Twin exposes Postgres — but:
- Tables created in the Twin UI are easier to wire to agent variables
- Keep naming lowercase snake_case (Postgres default)
- Use `jsonb` liberally for envelope-like fields — fewer schema migrations during the hackathon
- Kate reads/writes via HappyRobot's built-in Twin operators; Otto and Jack via direct Postgres (REST or psycopg)

## 1.7 The one thing not to mess up

Every row in `call`, `offer`, and every consent event **must** point back to `prospect_id`. If that chain breaks, the cockpit can't tell the story, the audit can't prove compliance, and the feedback loop to Jack is dead.

Every agent's first write of the session: *"Do I have a prospect? If not, create one. Then reference it."*

---

# 2 · HappyRobot Contacts — thin runtime mirror

HappyRobot's native contact entity. Its only job is to let the voice runtime match inbound calls and dial outbound numbers.

## 2.1 What it holds

| Field | Purpose |
|---|---|
| `phone` | primary key for inbound matching |
| `name` | for greeting |
| `email` | where Otto sends the offer |
| `external_id` | points to `prospect.id` in Twin |

## 2.2 What it does not hold

Segment, score, hook, signal history, qualification envelope, consent records, offer line items — none of it lives here. Kate reads those from Twin on call start via `external_id`.

## 2.3 Why a mirror at all

1. HappyRobot's voice flow wires to contact fields natively — less glue code.
2. Inbound phone matching is blazing fast against a local index.

If HappyRobot Twin already exposes Postgres directly to the voice flow, the mirror can collapse to a single `phone → external_id` lookup.

## 2.4 Sync direction

**Twin → Contacts**, not the other way around. The cockpit pushes a thin contact when a prospect reaches `status = consented`. Business attribute changes always go to Twin first.

---

# 3 · Knowledge Base — retrieval only

What Kate and Otto need to *cite*, not data they write back. Versioned content, not mutable state.

## 3.1 What belongs in the KB

| Category | Examples |
|---|---|
| **Product knowledge** | SKU specs (energy class, capacity, dimensions), service SLA details (48h Express, 72h on-site) |
| **BSH proof points** | DNV certificate numbers, +20 % lifespan ISO 14021 claim, ESRS E1 wording, MIA Miteinander testimonial |
| **Objection handling (FAQ)** | "more expensive than buying" → TCO reply · "we already have a supplier" → renewal-date probe · "we need commercial kitchen" → homologation exit |
| **Hook copy templates** | The four BSH-aligned opener lines (simplify/scale/optimize/circular) + alternate phrasings |
| **Legal boilerplate** | Verbal privacy disclosure, B2B withdrawal right, privacy URL reference |
| **Team routing** | Which human handles which escalation (legal, pricing, Gastro) + office hours |

## 3.2 What does not belong in the KB

- **Prices** — transactional, belong in `inventory`
- **Prospect data** — transactional, belong in `prospect` / `call` / `signal`
- **Consent records** — legal audit, must be structured, belong in `consent`
- **Inventory availability** — too dynamic to snapshot
- **Customer-named case studies with PII** — unless explicitly cleared

## 3.3 How agents consume it

Kate and Otto retrieve KB entries by topic tag (`objection:price`, `proof:dnv`, `hook:simplify`). The KB can be a flat YAML/JSON file, a vector store, or HappyRobot's built-in knowledge feature — the choice is infra, not concept.

---

# 4 · The pitch line

> "We didn't build a CRM. Agents don't need a CRM — they need a **shared memory** and a **script library**. Twin is the memory. The Knowledge Base is the library. That's all."

---

# 5 · Out of scope for the hackathon

Keep these for post-hackathon:
- Full-CRM features (pipeline stages, forecasting, commission, territory)
- Twin ↔ external CRM (Pipedrive, HubSpot) sync
- KB as vector store with embeddings
- Role-based access control inside Twin
- Time-series / analytics warehouse for calibration history
- `hook_calibration_history` table for Jack's feedback loop
- Separate `user` / `team` / `permissions` tables
- Duplicated audit-log table (Twin already logs its own writes)

Everything above works on day one with flat tables and a YAML knowledge file.
