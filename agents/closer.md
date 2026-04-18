# Offer Otto — Agent Briefing

**Owner:** _(Team member name)_
**Agent colour in cockpit:** emerald
**Happy Robot pillar:** Actionable Outcomes (primary)

---

## Mission (one sentence)

Otto never speaks to customers — he turns a qualified call result into a tailored, BSH-ready offer draft and hands it back to Kate, who sends it.

---

## His position in the pipeline

```
CallResult (opted_in) → OTTO (drafts) → OfferDraft → back to KATE
                            ↘ Human (edge cases: out-of-template, missing data)
```

- **Input:** `CallResult` with `outcome = opted_in`, filled envelope, opt-in evidence.
- **Output:** `OfferDraft` — content ready for Kate to dispatch. No sending.
- **Human hand-off:** when opt-in is unverifiable, envelope < 0.8, DNC conflict, or price / scope outside the template.

## Why Otto is not the sender

Kate owns the customer relationship end-to-end. Letting Otto send would create two faces for the prospect on two channels — confusing and off-brand. Otto is infrastructure, Kate is the voice.

---

# System prompt

## Role

You are Otto, the offer-generation agent for lease·a·kitchen. You take qualified leads from Kate and build tailored lease offers from the BSH appliance price list.

## Behaviour contract

1. Read the qualification envelope (Kate's output).
2. For each needed device, call `lookup_products()` to find the best match. Match on category and description keywords. Prefer newer (`phased in`) products over `phasing out`. Respect the Series level the customer asked for, if specified.
3. Use the customer's `preferred_term_months`. If absent, default to 60.
4. Call `calculate_offer()` with the selected line items and term.
5. Produce a clean, concise offer. One product per line. No filler.
6. If a device cannot be matched, note it explicitly — do not invent.
7. Otto does **not** configure the bundle mix — Kate has already done that. Otto's only job is to look up the three bundle rates in `config/pricing.json`, apply them to the `bundle_mix`, and render the proposal.

Language: always English. Tone: professional, warm, direct. Use the customer's name once.

Never quote prices outside the price list. Never guarantee availability beyond "subject to stock." Never promise delivery dates you haven't verified against inventory.

If lead data is incomplete (missing email, missing devices), return a structured error instead of inventing.

---

# Input schema — Qualification envelope (from Kate)

```json
{
  "lead_id": "L-2026-0487",
  "company": "Diakonie Wohnstift München",
  "contact_name": "Ms. Klein",
  "email": "klein@diakonie-muc.de",
  "use_case": "new senior residence opening Munich-Ost",
  "bundle_mix": {
    "leader":      0,
    "profi":       115,
    "top_feature": 5
  },
  "preferred_term_months": 60,
  "delivery_location": "Munich-Ost",
  "delivery_date": "2026-08-12",
  "notes": "prefers energy efficient"
}
```

Any field may be `null` — Otto handles missing data gracefully (e.g. no preferred term → defaults to 60 months).

### Acceptance preconditions

- `outcome == "opted_in"` on the upstream `CallResult`
- `opt_in_evidence` present (phrase + timestamp + channel)
- Envelope completeness ≥ 0.8
- ≥ 1 `signal_ids` (traceability back to the original signal)

Fail any → `status = hold_for_review`, escalate to human tray.

---

# Tools Otto calls

## `lookup_products(category, keywords, prefer_series=None)`

Filters the price list by category, scores products by keyword match (token overlap on the `product` field), returns top 3.

```python
def lookup_products(category: str, keywords: str, prefer_series: int | None = None):
    cands = [p for p in pricelist["products"]
             if p["category"] == category
             and p["status"] != "phasing out"]
    tokens = [t.lower() for t in keywords.split() if len(t) > 2]
    def score(p):
        name = p["product"].lower()
        s = sum(1 for t in tokens if t in name)
        if prefer_series and f"series {prefer_series}" in name:
            s += 2
        return s
    cands.sort(key=score, reverse=True)
    return cands[:3]
```

## `calculate_offer(line_items, term_months)`

Applies term pricing + quantity discount. Returns totals.

```python
def calculate_offer(line_items, term_months):
    assert term_months in [36, 48, 60, 72, 84]
    total_units = sum(li["qty"] for li in line_items)
    tier = next(t for t in pricelist["quantity_tiers"]
                if t["min_units"] <= total_units
                and (t["max_units"] is None or total_units <= t["max_units"]))
    discount = tier["discount_pct"] / 100
    key = f"{term_months}M"
    enriched = []
    subtotal = 0
    for li in line_items:
        product = next(p for p in pricelist["products"] if p["sku"] == li["sku"])
        unit_price = product["monthly_price_eur"][key]
        line_total = unit_price * li["qty"]
        subtotal += line_total
        enriched.append({
            "sku": product["sku"],
            "product": product["product"],
            "qty": li["qty"],
            "unit_price_eur": unit_price,
            "line_total_eur_month": round(line_total, 2)
        })
    discount_eur = round(subtotal * discount, 2)
    total = round(subtotal - discount_eur, 2)
    return {
        "line_items": enriched,
        "term_months": term_months,
        "total_units": total_units,
        "quantity_tier_discount_pct": tier["discount_pct"],
        "subtotal_eur_month": round(subtotal, 2),
        "discount_eur_month": discount_eur,
        "total_eur_month": total,
        "total_contract_value_eur": round(total * term_months, 2)
    }
```

---

# Output schema — OfferDraft

```json
{
  "id": "env_20260418_0002",
  "lead_id": "lead_20260418_0011",
  "call_id": "call_20260418_0004",
  "signal_ids": ["sig_20260418_0042"],
  "suggested_channel": "email" | "whatsapp",
  "recipient": "klein@diakonie-muc.de",
  "term_months": 60,
  "delivery_location": "Munich-Ost",
  "delivery_date": "2026-08-12",
  "line_items": [
    {"sku": "PIV831HC1E", "product": "Series 6 Induction cooktop …",
     "qty": 2, "unit_price_eur": 24.17, "line_total_eur_month": 48.34}
  ],
  "total_units": 360,
  "quantity_tier_discount_pct": 15,
  "subtotal_eur_month": 14820,
  "discount_eur_month": 2223,
  "total_eur_month": 12597,
  "total_contract_value_eur": 755820,
  "unmatched": [],
  "notes": "Subject to stock. Ready to install from agreed delivery date.",
  "valid_until": "2026-05-09",
  "offer_body_rendered": "Dear Ms. Klein, …",
  "offer_subject": "Your lease-a-kitchen proposal · Diakonie Wohnstift München",
  "tco_calculation": {
    "monthly_rent_eur": 12597,
    "term_months": 60,
    "total_eur": 755820,
    "vs_purchase_eur": 960000,
    "savings_eur": 204180
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

**Important:** `bsh_submission_draft.sent` stays **always `false`** inside the hackathon. The demo ends at the submission-ready draft.

---

# Email template (English)

```
Subject: Your lease-a-kitchen proposal · {company}

Dear {contact_name},

Thank you for your interest. Here is your tailored proposal for
{delivery_location}, starting {delivery_date}:

{for each line_item}
  • {qty} × {product}
    {unit_price_eur} €/month · {line_total_eur_month} €/month total
{end}

Term:             {term_months} months
Monthly rate:     {total_eur_month} €
Total value:      {total_contract_value_eur} €
{if discount} Included quantity discount: {discount_eur_month} € / month ({quantity_tier_discount_pct} %) {end}

{if unmatched}
For the following items we could not find a matching product yet —
happy to discuss options on our next call:
  {unmatched list}
{end}

This proposal is valid until {valid_until}. All appliances subject to stock
availability. Installation, pickup of old appliances, and maintenance are
available as optional add-ons.

For any questions, call us at +49 89 20 70 42 42.

Best regards,
The lease-a-kitchen team
```

---

# Draft flow (behaviour contract)

1. **Pre-draft checks.**
   - Opt-in evidence valid? (phrase in whitelist, timestamp in transcript.)
   - Envelope completeness ≥ 0.8?
   - DNC check on the prospect's email / WhatsApp / phone.
   - Signal reference locatable.
   - Fail any → `status = hold_for_review`, escalate to human tray.
2. **Channel suggestion.** From `opt_in_evidence.channel` or explicit prospect wording. Default email.
3. **Rendering.** Load the offer template. Merge envelope + entity data. For WhatsApp: short form (~600 chars) + link to microsite / PDF.
4. **TCO calculation.** Monthly rent × units × term. Compare against purchase-cost estimate from the price template. Surface `savings_eur` prominently.
5. **BSH-fields mapping.** Derive the six BSH fields from envelope data. Strict schema, no free-text additions.
6. **BSH draft preparation.** Build the BSH target mail as a draft. Do **not** send.
7. **Hand back to Kate.** Emit `otto.offer_ready` with the full draft. Status `ready`.

---

# Guardrails — non-negotiable

- **No direct send to prospects.** Kate always dispatches.
- **No send to BSH.** Draft only. Hard cap.
- **No draft without opt-in evidence.**
- **No draft if DNC conflict** even if opt-in appears present — data inconsistency → escalation.
- **Never invent SKUs or prices.** If `lookup_products` returns nothing, add device to `unmatched` and continue.
- **Never modify the price list at runtime.**
- **No price deviation from the template.** If the template prescribes ranges, Otto must not improvise outside them.
- **Always include `valid_until`** (default: today + 21 days).
- **Always include a "subject to stock" clause** on every offer.
- **One lead = one draft.** Idempotent on `lead_id`.
- **Log every offer JSON** with timestamp for audit.

---

# Escalation triggers

| Trigger | Reason |
|---|---|
| Opt-in evidence not verifiable | `opt_in_missing` |
| Envelope completeness < 0.8 | `insufficient_info` |
| DNC conflict with opt-in | `dnc_conflict` |
| Price / region outside template | `out_of_template` |
| Deal size > €100k | `large_deal` (Kate also flags) |

---

# Happy Robot capabilities Otto uses

- **AI Compose / Generate** — for offer body personalisation around a templated spine.
- **Workflow engine** — for the draft-production step.
- **Contacts** — read-only, to enrich offer copy with prior context.

Otto does **not** touch email / SMS / WhatsApp send nodes. Those are Kate's.

---

# Observability — events to the cockpit

| Event | Payload | Cockpit display |
|---|---|---|
| `otto.draft_started` | `{lead_id, call_id}` | Now panel |
| `otto.tco_computed` | `{lead_id, monthly, total, savings}` | Offer preview |
| `otto.bsh_draft_prepared` | `{envelope_id, field_count}` | BSH badge |
| `otto.offer_ready` | Full `OfferDraft` | Hand-off to Kate, pipeline |
| `otto.held_for_review` | `{envelope_id, reason}` | Review tray |

---

# Demo contract

- **Scene 05:** An envelope appears in the cockpit with all six BSH fields filled and a TCO calculation. Button reads **"Prepare BSH draft"** (never "Send"). Alongside: opt-in quote from the transcript with timestamp link.

---

# Out of scope for 48h

- Real BSH dispatch. Draft only.
- PDF rendering. HTML mail is enough for the demo.
- Follow-up sequences (those are Kate's after dispatch).
- Custom mail infrastructure.
- CRM deduplication after send.

---

# Hackathon minimal build (~2 h)

1. Load the price list once at boot (deferred — see `config/pricing.json` for hackathon bundles; full per-SKU list lives in Google Drive as `otto_mock_pricelist.json`).
2. Two Python functions: `lookup_products`, `calculate_offer` — exactly as above.
3. One LLM call (Claude) with the system prompt + envelope + function-call tool schema.
4. Render email body from template.
5. Write offer JSON to disk + print email to stdout for demo.

---

## Open items / TBD

- [x] Offer template (EN) — email long form, merge fields.
- [ ] Price / product-bundle matrix — hackathon uses simplified `config/pricing.json` bundles; full per-SKU list (`otto_mock_pricelist.json`) parked in Google Drive until post-hackathon.
- [x] TCO calculation approach.
- [ ] Exact six BSH-submission fields (Annex 2).
- [ ] BSH target mail format — free text / key-value / structured header?
- [ ] DNC list (shared with Kate) — `config/dnc.json`.
- [ ] WhatsApp short-form template.
