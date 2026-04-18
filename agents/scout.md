# Jack the Scout — Agent Briefing

**Owner:** _(Team member name)_
**Agent colour in cockpit:** blue
**Happy Robot pillar:** Autonomous Agents · Actionable Outcomes (upstream)

---

## Mission (one sentence)

Jack finds signals of real buying intent in public data sources, checks them
against the ICP ruleset, scores each accepted lead as high / mid / low tier,
and hands a prioritised pipeline to Kate — never from bought lists.

---

## Your position in the pipeline

```
[Public sources] → SCOUT → Signal → (ICP filter) → Lead → Caller
```

- **Input:** raw items from external sources (APIs, scrapes).
- **Output:** a structured `Signal` object plus `icp_evaluation` (accept/reject).
- **Downstream:** accepted signals are enriched into leads (enrichment can
  live inside Scout or in a small step in front of Caller — team call).

---

## Input schema (what sources give you)

Each source has its own raw shape. Normalise to:

```json
{
  "source": "TED" | "DNK" | "BundDe" | "Bauportal" | "Indeed" | "Manual",
  "source_url": "https://...",
  "captured_at": "2026-04-18T09:12:00Z",
  "raw_title": "New construction senior residence Bad Cannstatt, 40 units",
  "raw_body": "..."
}
```

## Output schema (what you emit)

```json
{
  "id": "sig_20260418_0042",
  "source": "Bauportal",
  "source_url": "https://...",
  "captured_at": "2026-04-18T09:12:00Z",
  "raw_title": "New construction senior residence Bad Cannstatt, 40 units",
  "signal_type": "building_permit",
  "entity": {
    "name": "Diakonie Stuttgart gGmbH",
    "legal_form": "gGmbH",
    "address": "Bad Cannstatt, Stuttgart",
    "website": null
  },
  "signal_payload": {
    "description": "New assisted-living construction, 40 residential units",
    "size_units": 40,
    "use_case_hints": ["residential", "assisted-living"],
    "timeline_hint": "Q3 2026",
    "budget_hint": null
  },
  "icp_evaluation": {
    "decision": "accept",
    "tier": "high" | "mid" | "low",
    "reason": "residential assisted-living, 40 units inside ICP range",
    "rules_fired": ["whitelist:senior-living", "size:20-80", "tier:high"]
  }
}
```

## Decision logic (behaviour contract)

1. **Normalise** — raw item → shape above.
2. **Classify** — set `signal_type` (rule-based or
   `happyrobot.ai_classify`). No custom fine-tuning.
3. **ICP check + tiering** — load rules from `config/icp-rules.json`.
   First reject rule wins. On accept, assign a `tier`:
   - **high** — residential fit + strong signal (tender, building permit) + 30–80 units
   - **mid**  — residential fit + softer signal (job post, ESG report) or < 30 units
   - **low**  — residential fit but signal weak or size outside sweet spot
   Store the reasoning in `rules_fired` — surfaces as cockpit tooltip.
4. **Dedupe** — if the same entity already produced a signal within 30
   days, record as `related_signal_ids`, do not create a new lead.
5. **Emit events** → `signal_ingested`, on accept additionally
   `lead_candidate_created`.

## Guardrails (non-negotiable)

- **No call without a signal.** Every lead handed to Caller must carry at
  least one `signal_id` in `signal_ids`. Caller enforces this on entry.
- **No commercial-kitchen context.** Reject rules for gastronomy, large
  industrial kitchens, canteens, restaurants, hotel F&B and corporate
  restaurants are hard. Demo scene 01 depends on this.
- **No scraping behind logins.** Public endpoints only.

## Happy Robot capabilities you should use

- `ai_extract` — for free-text fields inside unstructured sources
  (building-permit notices, DNK reports).
- `ai_classify` — for `signal_type` assignment when rules don't fire.
- Contacts / Memory — store dedup hashes there, not in your own DB.

## Observability — events to the cockpit

| Event | Payload | Cockpit display |
|---|---|---|
| `scout.signals_scanned` | `{source, count}` | Ticker at the top |
| `scout.signal_ingested` | Signal object | Stream feed |
| `scout.icp_reject` | `{signal_id, reason}` | Reject counter + tooltip |
| `scout.lead_candidate_created` | `{signal_id, lead_id}` | Pipeline +1 |

## Demo contract — what you must visibly show

- **Scene 01:** 10 signals enter. 3 are rejected with a clearly readable
  reason (commercial kitchens). 7 pass.
- **Scene 02:** The lead Caller is about to phone carries a visible
  `signal_id` as the stated call reason.

## Out of scope for 48h

- Custom ML models. Rules plus Happy Robot AI primitives only.
- Real live scrapes across all sources. One live scrape (Bauportal
  preferred) plus seed data for the others is enough.
- Multi-language support. German only.

---

## TBD — what I (Martin) still owe you

- [ ] `config/icp-rules.json` — whitelist/reject keywords, size band,
      operator types. Martin, 10 min.
- [ ] `seed/signals.json` — 20 labelled example signals (6 reject, 3 of
      them commercial-kitchen, 14 accept). Martin, 20 min.
- [ ] Access/API key for at least one live source (Bauportal preferred).
- [ ] Green light for using Happy Robot `ai_extract` / `ai_classify`
      from the shared account.

## Questions you (Scout owner) answer before you build

- Which single live source do you pick that will run stably for 48 h?
- Which enrichment fields are missing from the output so Caller can
  phone meaningfully? (At minimum: one phone number at entity level.)
