# lease·a·kitchen · Sales Cockpit — Agent Instructions

## Scope (one sentence)
Three autonomous B2B sales agents (Scout/Jack, Caller/Kate, Closer/Otto) for lease·a·kitchen — BSH appliance rental to German senior-living operators.

## Demo end-state (the only thing that matters)
Open `demo/endstate-cockpit.html` in a browser. Every feature we build must appear there. If it doesn't appear in that file → don't build it.

## Stack
- **Frontend + API**: Next.js 15 App Router, TypeScript, Tailwind CSS — lives in `apps/web/`
- **DB**: JSON file store in `apps/web/data/` (no external DB)
- **Agents**: HappyRobot platform workflows — NOT code in this repo
- **Config**: `config/` — icp-rules.json, envelope-schema.json, dnc.json, pricing.json, ai-disclosure.json

## API contract (frozen)
- `GET  /api/leads`      → all leads
- `POST /api/events`     → HappyRobot webhook receiver (all agents post here)
- `POST /api/qualify`    → trigger Kate on a lead { lead_id }
- `POST /api/dnc`        → add to DNC { type, value }

## Event names (frozen — match HappyRobot workflow output exactly)
Scout:  scout.lead_candidate_created, scout.signal_ingested, scout.icp_reject
Kate:   kate.call_started, kate.transcript_delta, kate.field_extracted, kate.opt_in_detected, kate.call_ended, kate.offer_dispatched, kate.deal_closed, kate.escalated
Otto:   otto.draft_started, otto.tco_computed, otto.offer_ready, otto.held_for_review

## Data schemas
See `lib/db.ts` for Lead, Envelope, AuditEntry types. DO NOT change field names.

## Guardrails (enforced in /api/qualify)
- DNC check before every call
- Call window: Mon–Fri 09:00–17:00 CET only
- No call without signal_ids
- Deal > €100k → escalate, never auto-send

## Hard stops
- Hour 12: end-to-end happy path runs (Scout seed → Caller → fields in cockpit)
- Hour 30: feature freeze
- Hour 44: code freeze

## What NOT to build
- Auth / multi-user
- Real BSH email dispatch (button is cosmetic)
- CRM integration
- Mobile app
- A second vertical

## Stop signal
If HappyRobot credentials are missing → use seed data + mock webhooks. Never block on missing credentials.
