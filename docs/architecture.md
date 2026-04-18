# Architecture

## The shape

```
    PUBLIC SIGNALS              HAPPYROBOT                  OUR APP
    (TED, DNK, etc.)            (3 workflows)               (Next.js cockpit)
         │                           │                           │
         │                           │                           │
         ▼                           ▼                           ▼
    ┌─────────┐   signal       ┌──────────┐   lead        ┌───────────┐
    │  Scout  │──────────────▶ │  lead    │──────────────▶│  pipeline │
    │ (cron)  │                │  store   │               │   view    │
    └─────────┘                └──────────┘               └───────────┘
                                    │                           │
                                    ▼                           │
                               ┌──────────┐                     │
                               │  Caller  │◀────────────────────┤
                               │  (voice) │   "qualify now"     │
                               └──────────┘                     │
                                    │                           │
                          transcript, extracted fields          │
                                    ▼                           │
                               ┌──────────┐                     │
                               │  Closer  │                     │
                               │ (email/  │                     │
                               │ whatsapp)│                     │
                               └──────────┘                     │
                                    │                           │
                                    ▼                           │
                               ┌──────────┐                     │
                               │ envelope │────────────────────▶│
                               │ (6 fields)│                    │
                               └──────────┘                     │
                                                                │
                                                                ▼
                                                          ┌───────────┐
                                                          │ escalation│
                                                          │   queue   │
                                                          └───────────┘
```

## The three agents — all on HappyRobot

### Scout

- **Trigger**: scheduled (HR native), every 15 min
- **Nodes**: Custom Code (fetch TED / DNK / Bund.de) → AI Classify (is this residential?) → Conditional → Webhook (post lead to our app)
- **Guardrail enforced here**: ICP filter — reject commercial kitchens, catering, canteens
- **Output**: new Lead record in our app with signal provenance

### Caller

- **Trigger**: webhook (fired by our app when user clicks "Qualify now", OR auto-fired by Scout for hot signals)
- **Nodes**: Outbound Voice Agent → AI Extract (6 envelope fields + opt-in flag) → Conditional → Webhook
- **Guardrail enforced here**: AI disclosure spoken at start, recording consent requested, residential-vs-central confirmed early
- **Output**: transcript + 6 fields + opt-in boolean → back to our app

### Closer

- **Trigger**: webhook (fired when Caller returns opt-in = true)
- **Nodes**: AI Generate (offer email / WhatsApp) → Email or SMS Action Node → Conditional (wait for reply) → Webhook
- **Guardrail enforced here**: no send without opt-in, deal-size threshold escalates to human
- **Output**: envelope marked "ready" in our app; or escalation ticket if edge case

## Our cockpit — Next.js

Everything the user sees. Lives at `apps/web/`.

**Routes:**
- `/` — live feed (default), agent status pills, sidebar with guardrails + today's stats
- `/pipeline` — Kanban view across stages: Signal / Qualifying / Qualified / Offered / DNC
- `/escalations` — queue of human-required leads
- `/audit` — append-only log of every agent decision
- `/lead/[id]` — detail view with signal, transcript, envelope

**Data sources:**
- Polls `GET /runs/` on HappyRobot for workflow state (~3s interval)
- Receives webhooks from HR into our own `/api/events` endpoint
- Local Postgres (or sqlite) for Leads, Envelopes, DNC list, Escalations

**No polling magic required** — HR's API + webhook contract is enough.

## What the orchestrator layer does

Thin Next.js backend module. Not a separate service.

Responsibilities:
- Receive HR webhooks, persist results
- Enforce guardrails before triggering next agent (DNC check, deal-size gate, call-window check)
- Route escalations to the queue
- Expose REST endpoints the frontend polls

**Policy rules are hardcoded in TypeScript** — no YAML, no DSL, no rule engine.

## Guardrails (enforced, not documented)

| Rule | Enforced by | On violation |
|---|---|---|
| ICP = residential only | Scout (AI Classify) | Reject signal, log rejection |
| Signal required | Scout | No signal, no lead |
| DNC list | Orchestrator | Block all agent actions on contact |
| Max 50 calls / day | Orchestrator | Queue for next day |
| Call window Mon-Fri 9–17 | Orchestrator | Schedule for next window |
| AI disclosure | Caller prompt | Without it, call is invalid |
| Deal size > €100k | Orchestrator | Escalate instead of auto-send |

## What we do NOT build

- ❌ Pipedrive / CRM integration (HR Contacts + our DB is enough)
- ❌ Paperclip or other orchestration frameworks
- ❌ Configurable product briefings / multi-vertical (lease·a·kitchen only)
- ❌ TCO calculator (only if time after core is done)
- ❌ Real BSH email sending (preview only — "Send to BSH" button is cosmetic for demo)
- ❌ Live TED scraping during demo (1 real API call at startup, rest seeded)
- ❌ Authentication / multi-user
- ❌ Mobile app
- ❌ A second vertical to prove genericness

## Data shapes (the minimum)

```typescript
type Lead = {
  id: string;               // "L-1048"
  org: string;              // "Caritas Freiburg"
  facility: string;
  units: number;
  city: string;
  stage: "signal" | "calling" | "qualified" | "offered" | "dnc";
  signal: { source: string; title: string; date: string; url: string };
  contact: { name: string; role: string; phone: string };
  fields: Partial<Envelope>;
  optIn: boolean | null;
  escalated?: boolean;
  escalationReason?: string;
};

type Envelope = {
  usage_type: "residential" | "commercial";   // must be residential
  facility_type: string;
  num_units: number;
  timeline: string;
  budget_range: string;
  decision_maker: string;
};

type AuditEntry = {
  timestamp: string;
  agent: "scout" | "caller" | "closer" | "guardrail" | "orchestrator";
  event: string;            // "signal_matched", "icp_reject", "call_ended", ...
  leadId?: string;
  meta?: Record<string, unknown>;
};
```

That's the contract. Keep it exactly this shape so frontend and backend people don't drift.

## What's on HappyRobot vs. what's in our app

| Concern | Where |
|---|---|
| Voice / SMS / Email channels | HR |
| Transcript / recording | HR |
| AI extraction from transcript | HR (AI Extract node) |
| Workflow orchestration (within an agent) | HR |
| Cross-agent orchestration + guardrails | Our app |
| Pipeline UI | Our app |
| DNC list | Our app |
| Escalation queue | Our app |
| Audit log (viewer) | Our app, hydrated from HR runs |

## Hard stops (scope discipline)

- **Hour 12** — end-to-end happy path must run. Scout (mocked) → Caller (real voice) → extracted fields in cockpit.
- **Hour 30** — feature freeze. After this, only polish + bugs.
- **Hour 44** — code freeze. Only the demo rehearsal and the backup video matter after this.
