# Offer Otto — Agent Briefing

**Owner:** _(Team member name)_
**Agent colour in cockpit:** emerald
**Happy Robot pillar:** Actionable Outcomes (primary)

---

## Mission (one sentence)

Otto never speaks to customers — he turns a qualified call result into a
tailored, BSH-ready offer draft and hands it back to Kate, who sends it.

---

## His position in the pipeline

```
CallResult (opted_in) → OTTO (drafts) → OfferDraft → back to KATE
                            ↘ Human (edge cases: out-of-template, missing data)
```

- **Input:** `CallResult` with `outcome = opted_in`, filled envelope, opt-in
  evidence.
- **Output:** `OfferDraft` — content ready for Kate to dispatch. No sending.
- **Human hand-off:** when opt-in is unverifiable, envelope < 0.8, DNC
  conflict, or price / scope outside the template.

## Why Otto is not the sender

Kate owns the customer relationship end-to-end. Letting Otto send
would create two faces for the prospect on two channels — confusing
and off-brand. Otto is infrastructure, Kate is the voice.

## Input schema

See Kate's `CallResult`. Acceptance preconditions:

- `outcome == "opted_in"`
- `opt_in_evidence` present (phrase + timestamp + channel)
- Envelope completeness ≥ 0.8
- ≥ 1 `signal_ids` (traceability back to the original signal)

## Output schema

```json
{
  "id": "env_20260418_0002",
  "lead_id": "lead_20260418_0011",
  "call_id": "call_20260418_0004",
  "signal_ids": ["sig_20260418_0042"],
  "suggested_channel": "email" | "whatsapp",
  "recipient": "schmidt@diakonie-stuttgart.de",
  "bsh_fields": {
    "field_1": "<TBD: Martin — from Annex 2>",
    "field_2": "...",
    "field_3": "...",
    "field_4": "...",
    "field_5": "...",
    "field_6": "..."
  },
  "offer_body_rendered": "Dear Dr. Schmidt, …",
  "offer_subject": "Your offer: Bosch kitchen-appliance rental for …",
  "tco_calculation": {
    "monthly_rent_eur": 1680,
    "term_months": 60,
    "total_eur": 100800,
    "vs_purchase_eur": 128000,
    "savings_eur": 27200
  },
  "bsh_submission_draft": {
    "to": "B2BSales.AllinPlus@bshg.com",
    "prepared": true,
    "sent": false
  },
  "status": "ready" | "hold_for_review",
  "opt_in_reference": "call_20260418_0004#198",
  "created_at": "2026-04-18T10:19:04Z"
}
```

**Important:** `bsh_submission_draft.sent` stays **always `false`** inside
the hackathon. The demo ends at the submission-ready draft. Real transmission
to BSH is outside scope.

## Draft flow (behaviour contract)

1. **Pre-draft checks.**
   - Opt-in evidence valid? (phrase in whitelist, timestamp in transcript.)
   - Envelope completeness ≥ 0.8?
   - DNC check on the prospect's email / WhatsApp / phone.
   - Signal reference locatable.
   - Fail any → `status = hold_for_review`, escalate to human tray.
2. **Channel suggestion.**
   - From `opt_in_evidence.channel` or explicit prospect wording.
   - Default email.
3. **Rendering.**
   - Load the offer template (TBD). Merge envelope + entity data.
   - For WhatsApp: short form (~600 chars) + link to microsite / PDF.
4. **TCO calculation.**
   - Monthly rent × units × term (default 60 months).
   - Compare against purchase-cost estimate from the price template.
   - Surface `savings_eur` prominently.
5. **BSH-fields mapping.**
   - Derive the six BSH fields from envelope data.
   - Strict schema, no free-text additions.
6. **BSH draft preparation.**
   - Build the BSH target mail as a draft. Do **not** send.
7. **Hand back to Kate.**
   - Emit `otto.offer_ready` with the full draft.
   - Status `ready`.

## Guardrails (non-negotiable)

- **No direct send to prospects.** Kate always dispatches.
- **No send to BSH.** Draft only. Hard cap.
- **No draft without opt-in evidence.**
- **No draft if DNC conflict** even if opt-in appears present — data
  inconsistency → escalation.
- **No price deviation from the template.** If the template prescribes
  ranges, Otto must not improvise outside them.
- **One lead = one draft.** Idempotent on `lead_id`.

## Escalation triggers

| Trigger | Reason |
|---|---|
| Opt-in evidence not verifiable | `opt_in_missing` |
| Envelope completeness < 0.8 | `insufficient_info` |
| DNC conflict with opt-in | `dnc_conflict` |
| Price / region outside template | `out_of_template` |
| Deal size > €100k | `large_deal` (Kate also flags) |

## Happy Robot capabilities Otto uses

- **AI Compose / Generate** — for offer body personalisation around a
  templated spine.
- **Workflow engine** — for the draft-production step.
- **Contacts** — read-only, to enrich offer copy with prior context.

Otto does **not** touch email / SMS / WhatsApp send nodes. Those are Kate's.

## Observability — events to the cockpit

| Event | Payload | Cockpit display |
|---|---|---|
| `otto.draft_started` | `{lead_id, call_id}` | Now panel |
| `otto.tco_computed` | `{lead_id, monthly, total, savings}` | Offer preview |
| `otto.bsh_draft_prepared` | `{envelope_id, field_count}` | BSH badge |
| `otto.offer_ready` | Full `OfferDraft` | Hand-off to Kate, pipeline |
| `otto.held_for_review` | `{envelope_id, reason}` | Review tray |

## Demo contract

- **Scene 05:** An envelope appears in the cockpit with all six BSH fields
  filled and a TCO calculation. Button reads **"Prepare BSH draft"** (never
  "Send"). Alongside: opt-in quote from the transcript with timestamp link.

## Out of scope for 48h

- Real BSH dispatch. Draft only.
- PDF rendering. HTML mail is enough for the demo.
- Follow-up sequences (those are Kate's after dispatch).
- Custom mail infrastructure.
- CRM deduplication after send.

---

## TBD — what Martin still owes Otto

- [ ] Offer template (DE) — email long form + WhatsApp short form, with
      merge fields. 20 min.
- [ ] Exact six BSH fields (Annex 2, shared with Kate). 5 min.
- [ ] BSH target mail format — free text / key-value / structured header? 10 min.
- [ ] Price / product-bundle matrix, so Otto does not invent prices. 10 min.
- [ ] DNC list (shared with Kate).

## Questions Otto's owner answers before building

- Own template engine (Jinja / Mustache) or HR AI Compose only?
  Recommendation: template engine for the spine + AI for a single
  personalised opener sentence.
- Where does the audit chain live — HR logs alone, or an `audit.jsonl`?
- How do we visualise "submission-ready" so the judge instantly
  understands that real money is at stake but nothing has been sent?
