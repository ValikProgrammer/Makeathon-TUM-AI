# lease·a·kitchen — the product in one page

## What we sell

BSH home appliances (Bosch, Siemens) as a monthly lease to senior-living operators in Germany.

- **€42/month net** per unit, typical contract
- **3–5 year term**, includes maintenance + ESG reporting
- **Target customer**: senior-living operators with 20–80 residential units
  (Diakonie, Caritas, AWO, Johanniter, private operators)
- **Commercial agent** for BSH Hausgeräte GmbH since 01.03.2026
- **Commission**: 7% of net order volume, no territorial limits

## The rule that cannot be broken

**Our appliances are for household use only.** Never commercial kitchens.

| ✅ In scope | ❌ Out of scope |
|---|---|
| In-unit kitchens in apartments | Central kitchens |
| Shared kitchens for 6–12 residents | Catering kitchens |
| Dementia wing community kitchens | University canteens / mensas |
| Residential wing appliances | Commercial / gastro appliances |

The Scout agent must filter commercial signals out. The Caller agent must confirm "residential vs. central kitchen" early in every call. If the answer is central/commercial, agent ends the call politely.

## Who decides on the customer side

- Facility Manager / Haustechnik
- Einrichtungsleiter (facility director)
- Geschäftsführung / Vorstand (managing director / board)

Larger deals need board approval, which means longer sales cycles.

## How a deal closes

Structured email to BSH with **6 mandatory fields**:

1. `usage_type` — must be residential (this is the ICP gate)
2. `facility_type` — senior care / assisted living / dementia / etc.
3. `num_units` — number of residential units
4. `timeline` — when is the decision / installation?
5. `budget_range` — rough order of magnitude
6. `decision_maker` — who signs off

No portal. No CRM. Just a mail with 6 fields — BSH takes it from there.

## Sales cycle reality

- **3–9 months** from first touch to signed contract
- The call does NOT close the deal — it qualifies the lead and gets **permission to send an offer**
- Commission flows 3–9 months later, when the operator actually orders

What the AI agents do: turn public signals into qualified leads with consent, fast. The human still closes.

## Legal framing (short version)

- **§7 UWG (Germany)** — AI cold calls in B2B need "mutmaßliche Einwilligung": a real business reason + a concrete trigger (= our public signal).
- **EU AI Act Art. 50** — the voice agent must disclose it is an AI at the start of the call.
- **GDPR** — recording only with explicit consent spoken into the call.

Our guardrails enforce all three — they're in the cockpit sidebar as live rules, not afterthought disclaimers.

## Why this matters for how we build

- The Scout's ICP filter is **load-bearing**. A false positive on a commercial kitchen = wasted call + reputation damage with BSH.
- The envelope has **6 fields, not 5, not 7**. Exact match, exact format.
- "No spam, high precision" isn't marketing copy — it's the design principle. Every feature should reinforce it, nothing should fight it.
