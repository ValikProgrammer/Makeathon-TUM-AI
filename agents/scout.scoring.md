# Jack — Prospect Scoring Card

**Purpose:** Decide which prospects are worth a postcard (~1,20 € contact cost + downstream call minutes). Jack runs this scorecard on every candidate before triggering Step 2 of the outbound flow.

**Decision:** Postcard is sent only if `Score ≥ 65` AND `Risk = false`.

---

## Who we are looking for (ICP)

lease-a-kitchen offers BSH **All-in+** leasing: household-class appliances — washing machines, dryers, fridges, dishwashers, cooktops, ovens, hoods, coffee machines, vacuums. These appliances are **certified (homologated) for household-typical use intensity**. Deploying them in any context that exceeds that intensity voids the certification, the warranty, and exposes the operator to liability.

**The core rule — homologation gate:**

Fit is decided by *how each appliance is used*, not by the building type.

- ✅ **Per-unit deployment:** one appliance per apartment, per resident room, per hotel suite → each used at household pattern
- ✅ **Light-shared rooms:** multiple appliances in a communal laundry, each running household-equivalent cycles
- ✅ **Staff break areas:** coffee machine, microwave, small fridge — household-typical
- ❌ **Commercial / professional kitchens** *inside* a care home, hospital, or hotel (canteen, cafeteria, central kitchen serving many residents) — even inside a fit building, these areas are off-limits
- ❌ **Central high-throughput laundry** with one machine running 8–12 h / day
- ❌ **Hospital central cooking**, industrial catering prep areas

**Concrete litmus test:** a Series 8 oven installed in a care-home cafeteria kitchen that cooks for 200 residents = homologation violated. The same Series 8 oven in each resident apartment's kitchenette = fine.

**Fit segments (where the per-unit / light-shared pattern dominates):**

| Segment | Typical fit deployment |
|---|---|
| **Senior-living operators** (Diakonie, Caritas, AWO, privat-gewerblich) | In-unit fridges, per-apartment washer/dryer, coffee machines in common lounges, staff-break SDA |
| **Student housing & co-living** | Per-apartment SDA, fridge/freezer, light-shared laundry rooms |
| **Serviced apartments & aparthotels** | In-room fridges, per-unit kitchenettes (oven, hob, dishwasher), back-of-house staff coffee |
| **Build-to-rent & housing cooperatives** | Built-in appliances in each unit, communal light-shared laundry |
| **Hospitals, rehab clinics** | Staff-kitchen coffee, ward-level pantry fridges, per-unit laundry where applicable |
| **Workforce housing, seasonal accommodation** | In-room appliances, light-shared laundry — not industrial laundries |

**Not our ICP — hard exclude:**
- Private households / single-family consumers
- Commercial kitchens of any kind — canteens, cafeterias, central cooking, Gastro-Großküche
- Central industrial laundries
- Pure retail resale

The filter is always: *would this appliance be used at a pattern comparable to a private household?* If yes, fit. If no, exclude.

---

## The Six Dimensions

| # | Dimension | Type | Weight | Purpose |
|---|---|---|---|---|
| 1 | Signal Strength | Score 0–100 | 30 % | How strong is the buying intent? |
| 2 | Deal Size | Score 0–100 | 25 % | What's the expected total contract value? |
| 3 | Inventory Fit | Score 0–100 | 20 % | Does the need match our All-in+ categories? |
| 4 | Contact Data Quality | Score 0–100 | 15 % | Can we reach the right person? |
| 5 | Timing / Urgency | Score 0–100 | 10 % | When will they decide? |
| 6 | Risk / Exclusion | Hard Filter | kill | Reasons to not contact at all |

**Final score** = weighted sum of 1–5, zeroed out if 6 fires.

---

## 1. Signal Strength (30 %)

How concrete is the buying intent, derived from public sources?

| Score | Signal | Example |
|---|---|---|
| 90–100 | Explicit public request | Published tender (TED, DTVP, Deutsches Vergabeportal) for laundry or white-goods leasing · job ad for facility manager for new building |
| 70–89 | Strong indirect signal | Diakonie/Caritas/AWO press release announcing new senior-home opening · KfW/BMWSB funding confirmation for pflegebau · developer announcing BTR project |
| 50–69 | Contextual signal | New building permit granted (Baugenehmigung) in care / student-housing segment · sustainability / DNK report mentioning appliance refresh |
| 30–49 | Weak signal | Operator listed in industry registry, no trigger event |
| 0–29 | No meaningful signal | Generic industry listing |

**Source discipline:** Every score ≥ 50 must cite the exact URL + date of the signal. No citation → cap at 29.

Primary signal sources:
- Tenders Electronic Daily (TED), DTVP, Deutsches Vergabeportal
- Bundesanzeiger (Jahresabschlüsse, DNK-Berichte)
- Regional press + trade publications (Altenheim, Care Invest, Immobilien Zeitung, Fachbereich Gesundheitswesen)
- KfW / BMWSB / Länder-Förderbekanntmachungen
- Stellenbörsen (facility/technical leadership roles signal new sites)
- Baugenehmigungs-Register (landesweit, wo öffentlich)

---

## 2. Deal Size (25 %)

Expected total contract value over the lease term. Drives whether a prospect deserves a premium postcard or a standard one.

| Score | Profile | Expected TCV (typ. 60-month term) |
|---|---|---|
| 90–100 | Multi-site operator, portfolio-wide refresh (200+ units) | > 250.000 € |
| 70–89 | Single large new build: 80–200 units with full appliance fit-out | 80.000 – 250.000 € |
| 50–69 | Mid-size facility: 30–80 units, partial or shared equipment | 25.000 – 80.000 € |
| 30–49 | Small operator: <30 units, single-category need | 5.000 – 25.000 € |
| 0–29 | Minimal scope, one-off replacements | < 5.000 € |

**Inputs:** Number of units / rooms / apartments · operator size (employee count, site count) · known refresh cycle · match to All-in+ pricing (see `otto_mock_pricelist.json`).

---

## 3. Inventory Fit (20 %)

Does the prospect's need map cleanly onto the All-in+ catalog categories — **SDA, Cooking, Cooling, Dishcare, Laundry Care, Accessories**?

| Score | Fit |
|---|---|
| 90–100 | Need matches 3+ All-in+ categories in volume (e.g. laundry + cooling + dishcare in 80-unit care home) |
| 70–89 | Need matches 2 categories in clear volume (e.g. fridges + dishwashers across a student dorm) |
| 50–69 | Need matches 1 category at scale, or several in small numbers |
| 30–49 | Marginal: partial category overlap, unclear volume |
| 0–29 | Outside All-in+ scope — industrial Gastro-Großküche, single-piece replacement, purely private |

Rule: If the prospect clearly needs industrial gastronomy equipment (combi steamer, salamander, tilt pan, walk-in cold room) → inventory fit = 0 and ICP exclusion triggers.

---

## 4. Contact Data Quality (15 %)

Can we reach the right decision-maker at a valid postal address?

| Score | Quality |
|---|---|
| 90–100 | Decision-maker named (procurement lead, Geschäftsführung, Einrichtungsleitung) + validated postal address + role confirmed |
| 70–89 | Decision-maker named + postal address validated |
| 50–69 | Role identified, address valid, person unnamed |
| 30–49 | Corporate / Träger address only, no local contact at the facility |
| 0–29 | Only holding / PO-box address, no operational site |

Address validation via Deutsche Post API or equivalent. Unvalidated = cap at 49.

---

## 5. Timing / Urgency (10 %)

When does the prospect need to decide? Drives *when* Jack sends, not *whether*.

| Score | Timing |
|---|---|
| 90–100 | Need in next 30 days (imminent opening, tender closing, equipment handover) |
| 70–89 | Need in 30–90 days |
| 50–69 | Need in 90–180 days |
| 30–49 | Need > 180 days, exploratory or long-term planning horizon |
| 0–29 | No timing signal at all |

Low timing score does **not** suppress the lead — it moves them to a deferred queue for later re-scoring.

---

## 6. Risk / Exclusion (Hard Filter)

Any single match → lead is suppressed, no postcard.

- Insolvency on record (Insolvenzbekanntmachungen)
- Creditreform / Bürgel negative flag
- Already an active customer
- Contacted in last 6 months
- On internal do-not-contact list
- External opt-out registered
- GDPR objection on file
- Holding / umbrella entity only (route to operating subsidiary)
- **ICP exclusion:** private household · pure retail · industrial Gastro-Großküche need

Every suppression is logged with reason + date.

---

## Thresholds & Actions

| Final Score | Action | Cost Band |
|---|---|---|
| ≥ 85 | Premium postcard (hand-signed, heavy stock), priority routing to senior SDR on callback | ~3,00 € |
| 65 – 84 | Standard postcard | ~1,20 € |
| 45 – 64 | No postcard. LinkedIn outreach or watchlist (cheaper channels) | < 0,20 € |
| < 45 | Watchlist only — re-score in 30 days as signals evolve | 0 € |

Risk = true at any level → Suppress permanently.

---

## Feedback Loop

Jack calibrates weights based on outcomes. Every 50 closed deals:

1. Recompute conversion rate per score band
2. Identify highest-converting dimension combinations
3. Flag over- or under-weighted dimensions
4. Human-in-the-loop review before weight change takes effect

Without the loop, Jack scores on gut forever. Outcome telemetry is mandatory input.

---

## Worked Examples

**Prospect A — Diakonie regional association, new senior residence**
Funding confirmed by KfW (Pflegebau), 120-unit residence in Stuttgart, opening Q3 2026, procurement lead named in the association's annual report, postal address verified via trade-press article.
- Signal: 85 (KfW funding + press) × 0.30 = 25.5
- Deal: 88 (120 units, laundry + cooling + dishcare + SDA) × 0.25 = 22.0
- Fit: 92 (4 All-in+ categories at volume) × 0.20 = 18.4
- Contact: 88 (procurement lead named + address verified) × 0.15 = 13.2
- Timing: 82 (opening in ~75 days) × 0.10 = 8.2
- Risk: clean
- **Final: 87.3 → Premium postcard, senior routing**

**Prospect B — Independent student-dorm operator, small project**
Single 22-unit micro-apartment building, owner is a local developer, no procurement role named, just a company address, timing unknown.
- Signal: 25 × 0.30 = 7.5
- Deal: 38 × 0.25 = 9.5
- Fit: 55 × 0.20 = 11.0
- Contact: 35 × 0.15 = 5.3
- Timing: 20 × 0.10 = 2.0
- Risk: clean
- **Final: 35.3 → Watchlist, no send**

**Prospect C — Care-home cafeteria kitchen refit — excluded**
Diakonie operator publishes tender for new cafeteria kitchen in senior-residence: industrial ovens, large tilt pan, commercial dishwasher feeding 200 residents. Building itself is ICP-fit, but this specific deployment is a commercial kitchen.
- ICP exclusion triggers: commercial kitchen deployment → homologation gate violated
- **Final: Suppress.** Tag the operator in watchlist for their *other* sites — per-unit laundry, resident-room fridges etc. may still qualify.

---

## Hook Selection — which value angle to lead with

Once a lead clears the scoring and the homologation gate, Jack also picks the **hook** — the value proposition the postcard and landing page lead with. The four hooks mirror BSH's own positioning (`Simplify · Scale · Optimize · Repeat/Circular`).

**Signals are not the selector.** A prospect with a DNK publication does not necessarily care most about sustainability — the publication may come from comms while the person reading the postcard wrangles broken dishwashers. Signals say *why now*; hook says *what they care about*.

### Primary selector — decision-maker role

| Role on the prospect side | → Hook |
|---|---|
| Einrichtungsleitung · Facility Manager · Hausleitung · Betriebsleitung | **Simplify** — bundled service, one contract, one invoice |
| CFO · Kaufmännische Leitung · Finanzvorstand · Controlling | **Optimize** — OpEx, balance sheet, cash flow |
| Geschäftsführung · Projektentwickler · Expansion Lead | **Scale** — growth without CapEx, fast site rollouts |
| Nachhaltigkeitsbeauftragte/r · ESG Officer · Quality/Compliance | **Circular** — DNV-certified +20 % lifespan, ESRS E1 relief |

### Secondary selector — organizational archetype (when role is ambiguous)

| Archetype | Default hook |
|---|---|
| Steady-state operator (senior living, hospitals in operation) | Simplify |
| Expansion phase (BTR, student-housing rollout, new builds) | Scale |
| Financially disciplined (cooperatives, public Träger, non-profits) | Optimize |
| Reporting-obliged (large GmbH, listed, CSRD-affected) | Circular |

### Rule

If both selectors agree → high confidence, lead with that hook.
If they disagree → role wins. Organizational archetype is the tie-breaker only when the role is unknown.

Signals inform the **Context strip** on the landing page (*"We saw your new senior-residence permit was granted in Stuttgart…"*) — the "why now" text that makes the outreach feel specific. Never the hook.

### Hook must be logged per lead

Every prospect record carries the chosen hook + the reason (role X or archetype Y). If Kate observes on the call that the customer's actual priority was different, she logs that back — the outcome loop eventually recalibrates role-to-hook mapping.

---

## Cockpit Display Requirements

Every scored lead in Jack's UI must show:
- Final score + threshold badge (Premium / Standard / Watchlist / Suppress)
- Per-dimension score with one-line justification
- Source links for every signal ≥ 50
- Risk flags if any triggered (including ICP exclusion reason)
- Suggested action button

Transparency is a feature: jurors and sales ops need to understand *why* Jack picked a lead, not just *that* he did.
