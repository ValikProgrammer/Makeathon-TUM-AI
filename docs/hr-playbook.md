# HappyRobot Rebuild Playbook — Kate & Otto

**Step-by-step to rewire Kate to the new envelope shape and build Otto from scratch. Written for execution in the HR UI — companion to [wiring-guide.md](./wiring-guide.md).**

Every step either "click X in HR" or "paste Y". If anything below doesn't match what you see, stop and flag — the docs may have drifted.

---

## 0 · Before you touch HR

1. Pull the latest main locally and check you have:
   - `agents/caller.md` (Kate's full system prompt — v3)
   - `agents/closer.md` (Otto's system prompt + email template)
   - `config/envelope-schema.json` (the JSON Schema you'll paste into Kate's Extract node)
   - `config/pricing.json` (three bundle rates — Otto reads these from the prompt, not from Twin, since pricing rarely changes)
   - `docs/wiring-guide.md` (data flow, this is the technical contract)

2. Open your Next.js dev server + ngrok:
   ```bash
   cd apps/web && npm run dev
   ngrok http 3000
   ```
   Copy the ngrok URL — you'll paste it into HR several times.

3. Confirm **Settings → Twin Database** shows status `Available`. If so, run `seed/scout-seed.sql` against the Twin Postgres once (connection string appears after clicking *Deploy Gateway* — or the schema picker in the Write-to-Twin node will tell you the table is missing and you can create it inline from the picker's schema panel).

4. Confirm you have two separate API keys in **Settings → API Keys**:
   - one HR API key (we call it `HAPPYROBOT_API_KEY` in our app — used by `/api/qualify` to trigger Kate)
   - a long random string in **Settings → Environment Variables** as `WEBHOOK_SECRET` (we use this on our side to verify incoming webhook POSTs from HR)

---

## 1 · Kate — update the existing workflow (`y3zadtxp7ibb`)

Open workflow `y3zadtxp7ibb` in the HR editor.

### 1.1 Trigger (Webhook) — check body schema

In the Webhook trigger's **Setup → Test** tab, post this test body so HR infers the new schema:

```json
{
  "to": "+491234567890",
  "lead_id": "L-1004",
  "contact_name": "Julia Schwarz",
  "contact_role": "Einrichtungsleitung",
  "facility_name": "DOMIZILIUM GmbH",
  "city": "Schongau",
  "signal_summary": "Building permit granted for new betreutes Wohnen complex in Schongau",
  "signal_url": "https://mock-bauportal.de/permits/schongau-bw-2026",
  "motivation_string": "simplify",
  "hook": "simplify",
  "campaign_id": "makeathon-2026",
  "callback_url": "https://<your-ngrok>.ngrok.app/api/callback"
}
```

All fields auto-appear in the `@` picker after this.

### 1.2 Voice Agent node — replace the system prompt

1. Open the **Outbound Voice Agent** node.
2. **To** = `@trigger.to`, **From** = your verified HR number (`+49 89 41432042` per `agents/caller.md`).
3. **Language** = English.
4. **Voice** = the Kate voice you already picked.
5. **Prompt** — delete everything and paste `agents/caller.md` from the heading `# System prompt (v3 — live on HappyRobot)` down to the *Quick sanity list* section. **Do NOT include anything under `⚠️ SYSTEM-ONLY BELOW`** — that block goes into the Extract node in 1.3.
6. Replace template tokens in the prompt with `@variable` references:
   - `{contact_name}` → `@trigger.contact_name`
   - `{last_name}` → `@trigger.contact_name` (the prompt uses it as a salutation)
   - `{signal_summary}` → `@trigger.signal_summary`
   - `{facility_name}` → `@trigger.facility_name`
   - motivation-string selection: the prompt uses `{hook}` in the bundle presentation; map to `@trigger.motivation_string`
7. **Contact intelligence** = enabled. HR's native Contacts + Memories give Kate prior-call context automatically.
8. **Recording** = disabled. We're not recording — `config/ai-disclosure.json` says so.

### 1.3 AI Extract node — replace with strict JSON Schema

1. Add a new **AI > Extract** node after the Voice Agent (delete the old one if it's still using the 6-field shape).
2. Model = **GPT-4.1** (default) or **GPT-5-mini** for speed.
3. **Input** = `@voice_agent.transcript`.
4. **Structure** = JSON Schema mode.
5. Paste this schema (it's OpenAI-strict with `additionalProperties: false` everywhere, which HR requires):

```json
{
  "type": "object",
  "properties": {
    "call_outcome": { "type": "string", "enum": ["qualified","homologation_fail","not_interested","callback_requested","escalated","dropped"] },
    "homologation_gate_passed": { "type": "boolean" },
    "facility_type": { "type": ["string","null"], "enum": ["senior_care","assisted_living","dementia_ward","student_housing","serviced_apartments","hospital","other_residential", null] },
    "num_units": { "type": ["integer","null"] },
    "timeline": { "type": ["string","null"] },
    "preferred_term_months": { "type": ["integer","null"], "enum": [36,48,60,72,84,null] },
    "decision_maker": { "type": ["string","null"] },
    "bundle_leader": { "type": "integer" },
    "bundle_profi": { "type": "integer" },
    "bundle_top_feature": { "type": "integer" },
    "opt_in": { "type": "boolean" },
    "preferred_channel": { "type": ["string","null"], "enum": ["email","whatsapp","phone",null] },
    "contact_address": { "type": ["string","null"] },
    "call_notes": { "type": ["string","null"] },
    "escalation_reason": { "type": ["string","null"] }
  },
  "required": ["call_outcome","homologation_gate_passed","bundle_leader","bundle_profi","bundle_top_feature","opt_in"],
  "additionalProperties": false
}
```

6. **System instructions** field — small nudge to the model:
   > *"Read the transcript between Kate (assistant) and the prospect. Extract the fields described in the schema. For bundle_leader/profi/top_feature: if the prospect agreed to a specific mix, return those integers; if no mix was discussed, return 0 for all three. For `homologation_gate_passed`: true if the call covered per-unit residential or small shared kitchen, false if a central cafeteria / industrial laundry was the use case. Be conservative — when in doubt, set opt_in=false."*

### 1.4 Write to Twin node

After Extract, add **Twin → Write** node:

- **Table**: `leads`
- **Mode**: `upsert` (match on `id`)
- **Filter**: `id = @trigger.lead_id`
- **Column mapping** (each from `@ai_extract.<field>`):
  - `stage` ← compute via small expression: `@ai_extract.call_outcome` — map as: `qualified`, `homologation_fail`, `not_interested`, `escalated`. For `callback_requested` / `dropped` keep existing stage.
  - `facility_type`, `num_units`, `timeline`, `preferred_term_months`, `decision_maker`
  - `bundle_leader`, `bundle_profi`, `bundle_top_feature`
  - `opt_in`, `preferred_channel`, `contact_address`, `call_notes`, `escalation_reason`
  - `call_transcript_url` ← `@voice_agent.recording_url` (or transcript URL if HR provides one)
  - `updated_at` ← HR built-in `{{now}}`

### 1.5 Conditional — branch to Otto

After Write to Twin, add a **Conditional**:

- If `@ai_extract.opt_in == true` AND `@ai_extract.homologation_gate_passed == true` → go to **Call Workflow: Otto**
- Else → go to the callback Webhook POST in 1.6

### 1.6 Webhook POST (audit-only back to our app)

Final node — POST to `@trigger.callback_url` (which is our `/api/callback`):

- Method: POST
- URL: `@trigger.callback_url`
- Headers: `Authorization: Bearer @env.WEBHOOK_SECRET` · `Content-Type: application/json`
- Body (Raw mode):
  ```json
  {
    "contact_id": "{{trigger.lead_id}}",
    "lead_id": "{{trigger.lead_id}}",
    "duration": "{{voice_agent.duration}}",
    "call_outcome": "{{ai_extract.call_outcome}}",
    "homologation_gate_passed": {{ai_extract.homologation_gate_passed}},
    "facility_type": "{{ai_extract.facility_type}}",
    "num_units": {{ai_extract.num_units}},
    "timeline": "{{ai_extract.timeline}}",
    "preferred_term_months": {{ai_extract.preferred_term_months}},
    "decision_maker": "{{ai_extract.decision_maker}}",
    "bundle_leader": {{ai_extract.bundle_leader}},
    "bundle_profi": {{ai_extract.bundle_profi}},
    "bundle_top_feature": {{ai_extract.bundle_top_feature}},
    "opt_in": {{ai_extract.opt_in}},
    "preferred_channel": "{{ai_extract.preferred_channel}}",
    "contact_address": "{{ai_extract.contact_address}}",
    "call_transcript_url": "{{voice_agent.recording_url}}",
    "call_notes": "{{ai_extract.call_notes}}",
    "escalation_reason": "{{ai_extract.escalation_reason}}",
    "escalate": {{ ai_extract.escalation_reason != null }}
  }
  ```
- Error handling: `Ignore 5XX` enabled (we'd rather have Twin authoritative than a webhook error blocking Kate).

### 1.7 Publish

Publish the workflow. Fire one test from our `/api/qualify` by clicking "Qualify now" on a seeded lead after POSTing consent. Watch the run in `Runs → Overview`.

---

## 2 · Otto — new workflow from scratch

Create a new workflow, name it `Otto · Offer Generation`.

### 2.1 Trigger — Webhook

Endpoint: `https://platform.happyrobot.ai/hooks/<otto-slug>`. Auth: Bearer `@env.HAPPYROBOT_API_KEY`.

Test body to prime the schema:
```json
{ "lead_id": "L-1004" }
```

### 2.2 Read from Twin

Node: **Twin → Read**
- Table: `leads`
- Filter: `id == @trigger.lead_id`
- Limit: 1

The node output is available as `@read.rows[0]` — reference columns with dot notation in later steps.

### 2.3 Custom Code — compute totals

Node: **Custom Code** (JavaScript).

```js
const lead = input.rows[0];
const rates = { leader: 42, profi: 58, top_feature: 80 };
const purchase = { leader: 3200, profi: 4600, top_feature: 6500 };
const leader = lead.bundle_leader ?? 0;
const profi = lead.bundle_profi ?? 0;
const tf = lead.bundle_top_feature ?? 0;
const units = leader + profi + tf;
const term = lead.preferred_term_months ?? 60;

const monthly = leader * rates.leader + profi * rates.profi + tf * rates.top_feature;
const total = monthly * term;
const purchase_equiv = leader * purchase.leader + profi * purchase.profi + tf * purchase.top_feature;
const savings = Math.max(0, purchase_equiv - total);

return {
  company_name: lead.company_name,
  contact_name: lead.person_name,
  contact_email: lead.contact_address || lead.person_email,
  city: lead.city,
  bundles: [
    { label: "Leader",      qty: leader, monthly: rates.leader,      total_month: leader * rates.leader },
    { label: "Profi",       qty: profi,  monthly: rates.profi,       total_month: profi * rates.profi },
    { label: "Top Feature", qty: tf,     monthly: rates.top_feature, total_month: tf * rates.top_feature },
  ].filter(b => b.qty > 0),
  term_months: term,
  monthly, total, purchase_equiv, savings, units,
};
```

### 2.4 AI Generate — render email body

Node: **AI > Generate**.
- Model: GPT-4.1
- Prompt:

```
You are Otto, the offer-generation agent for lease·a·kitchen. Render a clean, warm, concise proposal email in English for a senior-living operator.

Structure:
- Greeting using the contact name.
- One sentence thanking them for the call.
- A short paragraph stating the setup: number of units, facility type, start timeline.
- A bulleted list of bundles with qty × unit price = monthly total. Only bundles where qty > 0.
- A "Monthly rate" line and a "Total contract value over {{term_months}} months" line.
- One sentence mentioning the savings vs buying: "~€{{savings}} saved over the term compared to purchasing equivalent appliances".
- One sentence on what's included: "Warranty, delivery, and pickup are always part of every package. Maintenance, repair, and appliance replacement are bundled."
- Close with: "Reply to this email or call +49 89 20 70 42 42 — happy to finalise on your timeline."

Input data:
{{compute.*}}  (monthly, total, savings, bundles[], term_months, company_name, contact_name, city)

Return ONLY a JSON object with two keys: subject (string) and body_text (string). No markdown fences, no explanation.
```

Set **Response format** to JSON so we can access `@ai_generate.subject` and `@ai_generate.body_text` cleanly.

### 2.5 Email action — Outlook

Use the existing **Outlook integration credential** in `Settings → Integrations → Outlook`.

Node: **Email → Send via Outlook**
- **To**: `@compute.contact_email`
- **Subject**: `@ai_generate.subject`
- **Body (HTML or plain)**: `@ai_generate.body_text`
- **From**: `hello@lease-a-kitchen.de` (or whatever mailbox the Outlook integration is authorised for)

### 2.6 Write to Twin — mark offered

Node: **Twin → Write** (upsert on `id`)
- Filter: `id == @trigger.lead_id`
- Columns:
  - `stage` = `'offered'`
  - `offer_sent_at` = `{{now}}`
  - `updated_at` = `{{now}}`

### 2.7 Webhook POST — audit to cockpit

Same pattern as Kate's 1.6, target `{NEXT_PUBLIC_APP_URL}/api/events`:

```json
{
  "event": "otto.offer_ready",
  "lead_id": "{{trigger.lead_id}}",
  "meta": {
    "monthly": {{compute.monthly}},
    "total": {{compute.total}},
    "savings": {{compute.savings}},
    "subject": "{{ai_generate.subject}}"
  }
}
```

### 2.8 Publish

Publish. Test it by manually firing a POST with the seeded qualified lead (L-1004 has `opt_in=true` and bundle_mix already filled):

```bash
curl -X POST https://platform.happyrobot.ai/hooks/<otto-slug> \
  -H 'Authorization: Bearer $HAPPYROBOT_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"lead_id":"L-1004"}'
```

Watch for the email to land at `j.schwarz@domizilium.de` (or whichever test address you point the seed at).

---

## 3 · Kate → Otto handoff wiring

Two ways:
- **Call Workflow node** in Kate's step 1.5 (recommended — cleanest).
- Or: a simple HTTP POST from Kate's final webhook to Otto's webhook URL after the callback one.

Go with Call Workflow. Pass `{ lead_id: @trigger.lead_id }` as the body.

---

## 4 · Smoke test checklist

- [ ] `curl /api/consent` writes phone + consent on a seed lead → it appears in the cockpit with the green consent pill.
- [ ] Click "Qualify now" on that lead in the cockpit → Kate dials within 5 seconds.
- [ ] On the call, verify Kate self-identifies as AI in the first sentence.
- [ ] Finish the conversation with opt-in → Otto should fire within 15 seconds of call-end.
- [ ] Outlook inbox receives the proposal email.
- [ ] Cockpit shows the lead in the `Offered` column with `~€Xk est.` matching `bundle_mix × monthly × term`.

Record the full loop end-to-end once working — that's our demo-day backup video.

---

## 5 · Variables and env reference

In **Settings → Environment Variables**, set:

| Key | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Your ngrok / Vercel URL, used in all callback URLs from Kate and Otto |
| `WEBHOOK_SECRET` | Random string; we verify incoming HR POSTs against this |
| `EMAIL_FROM` | `hello@lease-a-kitchen.de` (or the Outlook mailbox we're authorised to send from) |

In our app's `apps/web/.env.local`:

| Key | Purpose |
|---|---|
| `HAPPYROBOT_API_KEY` | Used by `/api/qualify` and `/api/otto-draft` (if any) to authenticate outbound webhook calls |
| `HAPPYROBOT_CALLER_WEBHOOK_URL` | `https://platform.happyrobot.ai/hooks/<kate-slug>` |
| `HAPPYROBOT_OTTO_WEBHOOK_URL` | `https://platform.happyrobot.ai/hooks/<otto-slug>` |
| `NEXT_PUBLIC_APP_URL` | Our ngrok URL — must match what Kate's workflow sees |
| `WEBHOOK_SECRET` | Same value as in HR env vars |

---

## 6 · Known friction points

- **AI Extract strict mode**: every `object` in the JSON Schema must have `"additionalProperties": false`. If extraction fails silently, this is the first thing to check.
- **Twin Write upsert**: the node needs a unique column (id) to match on — without it, every call inserts a new row.
- **HR variable syntax**: `@variable` in node UIs, `{{variable}}` in Raw body / free-text fields.
- **Outlook rate limits**: if the same mailbox sends 50+ emails in a day for demo testing, throttling kicks in. Have a backup mailbox or use a separate test address.
