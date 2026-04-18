# Wiring Guide — lease·a·kitchen Agent Stack

**How the cockpit, the database (HappyRobot Twin), the landing page, and the three HappyRobot workflows plug together.**

*All facts below are confirmed from docs.happyrobot.ai (authenticated). Key URLs are linked inline.*

---

## 1 · Architecture at a glance

```
                                ┌────────────────────────────┐
                                │  Prospect mailbox          │
                                │  (postcard · real life)    │
                                └─────────────┬──────────────┘
                                              │ QR scan
                                              ▼
                                ┌────────────────────────────┐
                                │ Landing page               │
                                │ /l/[lead_id]?hook=…        │
                                │ (Next.js route)            │
                                └─────────────┬──────────────┘
                                              │  POST /api/consent
                                              │  { lead_id, phone,
                                              │    consent_text_version }
                                              ▼
       ┌────────────────────┐         ┌────────────────────────────┐
       │  Cockpit (Next.js) │◀───────▶│ HappyRobot Twin            │
       │  apps/web          │  REST   │ (managed Postgres per org) │
       │  - KPI bar         │ +JWT    │ table `leads`              │
       │  - Kanban          │  via    │ seed/scout-seed.sql        │
       │  - Lead modal      │Gateway  │                            │
       └─────────┬──────────┘         └────────────┬───────────────┘
                 │                                 ▲
                 │ POST /api/qualify               │  Write to Twin
                 ▼                                 │  (workflow node)
       ┌─────────────────────────────────────────┐ │
       │ HappyRobot workflows                    │ │
       │  ├─ Kate (voice, y3zadtxp7ibb live)     │ │
       │  │   Webhook trigger                    │ │
       │  │   → Outbound Voice Agent node        │ │
       │  │   → AI Extract (JSON Schema strict)  │ │
       │  │   → Write to Twin → POST /api/callback
       │  │                                      │ │
       │  ├─ Otto (closer)                       │ │
       │  │   Trigger after Kate qualifies       │ │
       │  │   → Read from Twin                   │ │
       │  │   → AI Generate (offer body)         │ │
       │  │   → Email action (SendGrid/Gmail)    │ │
       │  │   → Write to Twin + POST /api/events │ │
       │  │                                      │ │
       │  └─ Jack (mocked for demo)              │ │
       └─────────────────────────────────────────┘ │
                                                   │
                                       ┌───────────┴────────────────┐
                                       │ Native HappyRobot Contacts │
                                       │ auto-created per call      │
                                       │ (phone_number / email)     │
                                       └────────────────────────────┘
```

**Key facts we now know for certain** (all from HR docs):

- **Twin is a real managed Postgres.** One dedicated RDS instance per organization, provisioned automatically. [Docs — Twin database](https://docs.happyrobot.ai/integrations/data/twin).
- **Twin is reachable from workflows via `Read from Twin` / `Write to Twin` nodes** — no SQL strings, just table + column pickers.
- **Twin can be reached from the cockpit via REST** by clicking *Deploy Gateway* in `Settings > Twin Database`. The gateway returns a URL + JWT auth header + required `x-org-id: <org>` header.
- **HappyRobot Contacts are an automatic CRM-like store.** Auto-created whenever an agent speaks to a phone or email — deduped by `(org_id, type, value)`. Has memories, interaction history, tags, per-workflow blocking. Exposed via REST: `GET /contacts/resolve`. [Docs — Contacts Overview](https://docs.happyrobot.ai/contacts/overview).
- **Webhook triggers** are at `https://platform.happyrobot.ai/hooks/{slug}` — all JSON body fields become `@variable` references in the workflow editor. Auth = Bearer token from `Settings > API Keys`. [Docs — Triggers](https://docs.happyrobot.ai/workflows/triggers).
- **AI Extract node supports strict JSON Schema mode** (OpenAI-compatible, `additionalProperties: false` required on every object). [Docs — AI Extract](https://docs.happyrobot.ai/core-nodes/ai-extract).
- **Webhook node (outbound)** supports GET/POST/PUT/PATCH with Bearer/API Key/Basic/OAuth2 auth and Builder or Raw body modes. [Docs — Webhook](https://docs.happyrobot.ai/core-nodes/webhook).
- **Environment variables** live at the org or workflow level (Settings > Environment Variables) and are referenced via `@` in any field. Per-environment overrides (dev/staging/prod) are first-class.

**Key consequence for our design:** we do **not** need Supabase/Neon or a separate Postgres. Twin *is* the database. Our local `apps/web/lib/db.ts` JSON-file store is the dev fallback; production reads and writes go through the Twin Gateway or via workflow nodes.

---

## 2 · Component responsibilities

| Component | Location | Responsibility |
|---|---|---|
| **Cockpit UI** | `apps/web/app/page.tsx` | Kanban board, lead detail modal, "Qualify now" button, KPI bar. Polls `/api/leads` every 4s. |
| **API: /api/leads** | `apps/web/app/api/leads/route.ts` | `GET` all leads from Twin (prod) or local JSON (dev). |
| **API: /api/qualify** | `apps/web/app/api/qualify/route.ts` | `POST` → fires Kate's webhook trigger (`platform.happyrobot.ai/hooks/{kate_slug}`). |
| **API: /api/callback** | `apps/web/app/api/callback/route.ts` | `POST` target of Kate's final `Webhook` action node. Writes extraction to Twin. |
| **API: /api/events** | `apps/web/app/api/events/route.ts` | Catch-all event sink (scout/kate/otto events). |
| **API: /api/consent** *(to build)* | `apps/web/app/api/consent/route.ts` | Landing-page submit writes `person_phone`, `consent_*` to the lead row. |
| **DB: `leads`** | Twin (managed Postgres, schema = `seed/scout-seed.sql`) | Single flat table. |
| **Kate workflow** | HappyRobot | Voice agent. Live ID `y3zadtxp7ibb`. |
| **Otto workflow** | HappyRobot | Offer generator + email sender. To build. |
| **Jack workflow** | *(mocked)* | Seed rows in `leads` pre-populate signal fields. |
| **DNC list** | `config/dnc.json` | Local suppression, checked by `/api/qualify`. (Could also sit in Twin.) |
| **Pricing** | `config/pricing.json` | Three bundles (Leader/Profi/Top Feature). |
| **AI disclosure** | `config/ai-disclosure.json` | First-utterance boilerplate. |
| **Landing page** *(to build)* | `apps/web/app/(public)/l/[lead_id]/page.tsx` | Hook-driven LP, submits to `/api/consent`. |

---

## 3 · End-to-end data flow

### Phase A — Lead creation (demo = seed, prod = Jack)

1. **Seed** populates `leads` on the first `Cockpit` load (dev: `apps/web/lib/db.ts`; prod: `seed/scout-seed.sql` imported into Twin). Each seed row carries: company fields, `person_name/role/email`, and **Jack's mocked output**: `signal_url`, `signal_summary`, `motivation_string`, `score`.
2. In production, Jack's workflow would `Write to Twin` new rows OR POST `scout.lead_candidate_created` to `/api/events`.

### Phase B — Postcard mailed (not tracked)

Postcard is printed externally, mailed to the prospect. We record nothing about dispatch.

### Phase C — Prospect scans QR

3. QR points to `https://<app>/l/<lead_id>?hook=<motivation>`.
4. The LP reads the URL params and renders the matching hook variant (Simplify/Scale/Optimize/Circular from `demo/landing-page.html`).
5. Prospect submits phone + consent checkbox.
6. **`POST /api/consent`** writes:
   - `person_phone`
   - `consent_given_at = now()`
   - `consent_text_version`
   - `consent_ip = req.headers.get('x-forwarded-for') ?? req.ip`
   - stage remains `new` — the only change is that `person_phone` is now populated, which enables the "Qualify now" button.

### Phase D — Kate calls

7. Sales operator clicks **Qualify now** in the cockpit.
8. `/api/qualify`:
   - Checks `person_phone` is set (412 if not)
   - DNC guardrail (`isDnc(person_phone || person_email)`)
   - Derives `motivation_string` from `person_role` (fallback to `score`-based archetype)
   - POSTs to **`${HAPPYROBOT_CALLER_WEBHOOK_URL}`** (`https://platform.happyrobot.ai/hooks/<kate_slug>`) with:
     ```json
     {
       "to": "+49 89 …",
       "lead_id": "L-1001",
       "contact_name": "Dr. Stefan Bürkle",
       "contact_role": "Leitung Einkauf",
       "facility_name": "Evangelische Heimstiftung GmbH",
       "city": "Stuttgart",
       "signal_summary": "…",
       "signal_url": "…",
       "motivation_string": "simplify",
       "campaign_id": "makeathon-2026",
       "callback_url": "https://<ngrok>/api/callback"
     }
     ```
     With header: `Authorization: Bearer $HAPPYROBOT_API_KEY`.
9. Kate's workflow fires (see §4.1 for full node graph). Outbound voice agent dials `{{to}}`.
10. HappyRobot auto-creates/updates a **native Contact** keyed on the phone number (type=`phone_number`). Memories + interaction history accrue there.
11. Kate executes the prompt from `agents/caller.md` (opener → homologation gate → discovery → three-bundle presentation → bundle-mix → opt-in → friendly close).
12. After the call, **AI Extract node** parses the transcript into strict JSON using the schema in `agents/caller.md` §"SYSTEM-ONLY BELOW".
13. **Write to Twin node** patches the `leads` row with Kate-owned columns.
14. **Webhook POST node** fires to `{{callback_url}}` (= `/api/callback`) with a summary for cockpit-side audit log.

### Phase E — Otto builds + sends offer

15. Trigger options:
    - **A (recommended):** Otto's workflow uses a **Call Workflow** node from Kate (see `core-nodes/call-workflow`) so Kate kicks Otto directly with the lead_id.
    - **B:** `/api/callback` issues a second POST to `${HAPPYROBOT_OTTO_WEBHOOK_URL}` after writing Kate's data.
16. Otto:
    - **Read from Twin** by `lead_id` → gets the full row including `bundle_leader/profi/top_feature`, `preferred_term_months`, `contact_address`.
    - Computes `monthly = leader×42 + profi×58 + top_feature×80`, `total = monthly × term`.
    - **AI Generate node** renders the email body using `demo/offer-template.html` as reference (template copy-pasted into the prompt).
    - **Email action** (SendGrid / Gmail integration) sends to `{{contact_address}}` with subject + body.
    - **Write to Twin** sets `offer_sent_at = now()`, `stage = 'offered'`.
    - **POST /api/events** with `event: "otto.offer_ready"` so cockpit timeline updates.

### Phase F — (Optional) Acceptance

17. Offer email has an "Accept" link → `https://<app>/l/accept/<lead_id>?token=<sig>`.
18. That page POSTs to `/api/events` with `otto.offer_accepted` → stage = `accepted`, `offer_accepted_at = now()`.

---

## 4 · HappyRobot workflow configuration per agent

### 4.1 Kate — voice workflow

**Trigger:** **Webhook**. Endpoint auto-generated: `https://platform.happyrobot.ai/hooks/<slug>`. Auth = Bearer (Settings > API Keys).

Every field in the POST body becomes an `@variable`. Required fields in our payload: `to`, `lead_id`, `contact_name`, `contact_role`, `facility_name`, `city`, `signal_summary`, `signal_url`, `motivation_string`, `campaign_id`, `callback_url`.

**Node graph:**

| # | Node | Configuration |
|---|---|---|
| 1 | **Webhook trigger** | Auth = Bearer. Body schema auto-inferred on first test call. |
| 2 | **Outbound Voice Agent** | `To = @trigger.to` · `From = +49 89 41432042` (must be a verified HR number) · Prompt = paste everything from `agents/caller.md` *# System prompt* down to the sanity list. Reference the variables with `@contact_name`, `@motivation_string`, `@signal_summary`, etc. Contact intelligence = **enabled** (uses the native Contacts memories). |
| 3 | **AI Extract** | Model: GPT-4.1 (default) or GPT-5-mini for speed. Input = `@voice_agent.transcript`. Structure = **JSON Schema mode** using the schema in `agents/caller.md` under SYSTEM-ONLY. Every object needs `"additionalProperties": false`. |
| 4 | **Write to Twin** | Table: `leads`. Filter: `id = @trigger.lead_id`. Columns to write: `stage`, `facility_type`, `num_units`, `timeline`, `preferred_term_months`, `decision_maker`, `bundle_leader`, `bundle_profi`, `bundle_top_feature`, `opt_in`, `preferred_channel`, `contact_address`, `call_transcript_url`, `call_notes`, `escalation_reason`. Values from `@ai_extract.*`. |
| 5 | **Conditional** | If `@ai_extract.opt_in == true` → go to node 6 (Call Workflow: Otto). Else → go to node 7. |
| 6 | **Call Workflow: Otto** | Triggers Otto's workflow with body `{ lead_id }`. |
| 7 | **Webhook POST** | URL = `@trigger.callback_url` · Method = POST · Body = entire extracted JSON + `{ lead_id, duration, call_transcript_url }`. Auth = Bearer using `@env.WEBHOOK_SECRET`. |

**The system prompt in node 2** must NOT contain the SYSTEM-ONLY JSON block — that belongs in node 3's JSON Schema only. Kate should never have that schema in her mouth.

### 4.2 Otto — closer workflow

**Trigger:** **Webhook** (simple — matches the pattern `platform.happyrobot.ai/hooks/<otto_slug>`) OR **Call Workflow** from Kate.

| # | Node | Configuration |
|---|---|---|
| 1 | Webhook trigger / Call Workflow input | Expects `{ lead_id }`. |
| 2 | **Read from Twin** | Table: `leads`. Filter: `id = @trigger.lead_id`. Limit: 1. |
| 3 | **Custom Code** *(or Conditional math)* | Compute monthly = `(@read.bundle_leader * 42) + (@read.bundle_profi * 58) + (@read.bundle_top_feature * 80)`. Compute total. |
| 4 | **AI Generate** | Model: GPT-4.1. Prompt: offer email body template from `demo/offer-template.html` with merge fields. Output: `offer_subject`, `offer_body_html`. |
| 5 | **Email action** (SendGrid or Gmail integration) | `To = @read.contact_address` · Subject = `@ai_generate.offer_subject` · Body = `@ai_generate.offer_body_html` · Content-Type HTML. |
| 6 | **Write to Twin** | Patch `leads` where `id = @trigger.lead_id`: `stage = 'offered'`, `offer_sent_at = {{now}}`. |
| 7 | **Webhook POST** | `POST {{NEXT_PUBLIC_APP_URL}}/api/events` · Body `{ event: "otto.offer_ready", lead_id: @trigger.lead_id, meta: { monthly, total } }`. |

### 4.3 Jack — mocked for the hackathon

No workflow to build. Seed rows carry Jack's output fields pre-filled. Post-hackathon: create a workflow with a **Schedule trigger** that scrapes public sources, runs AI Classify for ICP gating, Writes to Twin, and POSTs `scout.lead_candidate_created`.

---

## 5 · Twin schema setup

**Option 1 — Use Twin as the database.**

1. In HR UI: `Settings > Twin Database` → confirm status is `Available`.
2. Create the `leads` table by running `seed/scout-seed.sql` against the Twin Postgres. (Twin exposes a connection string in the Settings page once the Gateway is deployed.)
3. `Write to Twin` and `Read from Twin` nodes will auto-discover the table + columns via the live schema picker.

**Option 2 — Deploy the Twin Gateway for cockpit access.**

1. `Settings > Twin Database > Deploy Gateway`.
2. Copy the gateway URL and note the required header `x-org-id: <org_id>`.
3. Auth = JWT issued by HR (one-time obtain + store in env).
4. Update `apps/web/lib/db.ts` with a `twinGet()` / `twinUpsert()` adapter that hits the gateway instead of the local JSON file. Schema stays identical — just swap the transport.

For the hackathon demo: **start with local JSON file, migrate to Twin Gateway if time permits.** The app already writes via `updateLead()` abstraction, so the swap is a single file.

---

## 6 · Contacts — use native HR Contacts

HR Contacts auto-track phone numbers and emails your agents interact with. You get memories, tags, per-workflow block lists, and interaction history **for free**.

**How they relate to `leads`:**
- Twin `leads.person_phone` = the identity value HR Contacts deduplicates on.
- First time Kate dials Dr. Bürkle, HR creates a Contact keyed `phone_number: +49…`. Second time, HR finds it and loads memories.
- No explicit sync step — HR does it automatically when an agent interacts.

**What we don't have to build:** contact deduplication, interaction log, call history per contact, memory summarization. All native.

**Block list:** per-workflow, managed in `Settings > Workflows > <name> > Blocked contacts`. DNC enforcement can live in HR rather than our `config/dnc.json` — decide post-hackathon.

---

## 7 · Environment variables

Set at the HR org level in `Settings > Environment Variables`, and locally in `apps/web/.env.local`:

```bash
# App side (Next.js)
HAPPYROBOT_API_KEY=hr_...                    # Bearer token for outgoing triggers
HAPPYROBOT_CALLER_WEBHOOK_URL=https://platform.happyrobot.ai/hooks/<kate_slug>
HAPPYROBOT_OTTO_WEBHOOK_URL=https://platform.happyrobot.ai/hooks/<otto_slug>
NEXT_PUBLIC_APP_URL=https://<ngrok-or-vercel>.app
WEBHOOK_SECRET=<random-32-bytes>             # verify incoming HR webhooks

# Optional: Twin Gateway
TWIN_GATEWAY_URL=https://<twin-gateway>.happyrobot.ai
TWIN_ORG_ID=<org-id>
TWIN_JWT=<long-lived-jwt>

# HR side (Settings > Environment Variables) — referenced as @env.VAR in nodes
WEBHOOK_SECRET=<same value>                  # for incoming webhook POSTs back to us
EMAIL_FROM=hello@lease-a-kitchen.de          # used by Otto's Email action
```

**Rotate the API key quarterly.** HR supports up to 5 active keys simultaneously — create-then-revoke pattern for zero-downtime rotation.

---

## 8 · Event taxonomy (frozen)

| Event | Who fires | Effect on `leads` |
|---|---|---|
| `scout.lead_candidate_created` | Jack (prod) | INSERT row |
| `kate.call_ended` | Kate's Webhook POST node | (not used — Twin node writes directly; this is audit-only) |
| `otto.offer_ready` | Otto's Webhook POST node | (audit only — Otto's Twin node did the stage update) |
| `otto.offer_accepted` | Accept-link page | `stage = accepted`, `offer_accepted_at = now()` |
| `lead.consent_given` | `/api/consent` internal | (no state change, audit-only) |

Everything goes through `/api/events` for a unified audit log even when writes already happened via Twin nodes.

---

## 9 · Local dev setup

```bash
cd apps/web
npm install
cp .env.example .env.local   # fill in the env vars
npm run dev                   # starts Next.js on :3000

# Separate terminal — expose the app to HR webhooks
ngrok http 3000
# Set NEXT_PUBLIC_APP_URL to the ngrok URL in .env.local, restart dev
```

In HR's Kate workflow, **update the trigger test body** to include `callback_url: "https://<ngrok>/api/callback"`. The workflow will POST back to your machine when the call ends.

**Seed first call:** open the cockpit at `http://localhost:3000` → wait for 10 seed leads to appear → manually POST to `/api/consent` to simulate a landing-page submit:

```bash
curl -X POST http://localhost:3000/api/consent -H 'Content-Type: application/json' \
  -d '{"lead_id":"L-1001","phone":"+49…","consent_text_version":"v1.0"}'
```

Then click "Qualify now" on that lead card.

---

## 10 · Deployment (post-hackathon)

- App → **Vercel** (Next.js native). Set all env vars in Vercel project settings.
- Twin stays with HR. Point the cockpit at the Twin Gateway URL.
- HR webhook URLs rewritten to the Vercel domain.
- Postcard QR codes encode the Vercel URL pattern `https://lease-a-kitchen.app/l/<lead_id>?hook=<motivation>`.

For the demo: **stay on ngrok + local JSON file store.** Everything works end-to-end, nothing to provision.

---

## 11 · Open items (unblock before Phase 1)

- [ ] Confirm Twin is provisioned in the HR org (Valentin to check `Settings > Twin Database`).
- [ ] Create `leads` table in Twin from `seed/scout-seed.sql`, OR decide to stay on local JSON for the demo.
- [ ] Get `HAPPYROBOT_CALLER_WEBHOOK_URL` and `HAPPYROBOT_API_KEY` from Valentin and put them in `.env.local`.
- [ ] Decide: Otto as HR workflow (recommended, see §4.2) or as Next.js `/api/otto/draft` endpoint (faster to iterate without HR UI).
- [ ] Wire the Email action in HR (SendGrid credential — or use HappyRobot Email integration if available). Alternative: Option B with Resend from the Next.js side.
- [ ] Build `/api/consent` and the `/l/[lead_id]` landing page route.
- [ ] Update Kate's HR workflow to include the `Write to Twin` node (new — currently only POSTs to `/api/callback`).

Post-hackathon:
- [ ] HMAC signature verification on incoming HR webhooks (HR documentation doesn't explicitly mention HMAC — use Bearer + `WEBHOOK_SECRET` header for now).
- [ ] Migrate DNC list from `config/dnc.json` to per-workflow block contacts in HR.
- [ ] Deploy Twin Gateway and switch cockpit reads/writes to it.
- [ ] Accept-link flow.

---

## 12 · Quick reference — HR endpoints we hit

| Purpose | Endpoint |
|---|---|
| Trigger Kate (outbound call) | `POST https://platform.happyrobot.ai/hooks/<kate_slug>` |
| Trigger Otto | `POST https://platform.happyrobot.ai/hooks/<otto_slug>` |
| Fetch call record | `GET https://api.happyrobot.ai/v1/calls/{id}` *(see API Reference)* |
| Fetch transcript | `GET https://api.happyrobot.ai/v1/calls/{id}/transcript` |
| Resolve a contact | `GET /v1/contacts/resolve?type=phone_number&value=...` |
| List contacts | `GET /v1/contacts` |
| Twin Gateway (when deployed) | `<gateway-url>/<table>?<query>` with `Authorization: Bearer <jwt>` + `x-org-id` |

All API calls: `Authorization: Bearer $HAPPYROBOT_API_KEY`.
