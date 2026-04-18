# Outbound Kate — Agent Briefing

**Owner:** _(Team member name)_
**Agent colour in cockpit:** amber
**Happy Robot pillar:** Autonomous Agents (primary) · Dashboard (live transcript)

---

## Mission (one sentence)

Kate is the one-and-only face to the customer — she reaches out on signal,
qualifies, follows up, sends Otto's offer, and closes the deal across voice,
SMS and email, hands off to a human only when truly stuck.

---

## Her position in the pipeline

```
Lead → KATE ──(qualify)──► opted_in ──(Otto drafts)──► KATE (send) ──(follow-up, close)──► Deal
                                                                         ↘ Human (escalation)
```

- **Input:** `Lead` with ≥ 1 `signal_id` + ≥ 1 channel (phone, email, WhatsApp).
- **Output:** `CallResult` → (after Otto) `DispatchedOffer` → `DealResult`.
- Kate owns the customer relationship end-to-end. Otto is her backroom,
  not her substitute.

## Channels Kate handles

| Channel  | Direction | When used |
|---|---|---|
| Voice    | out / in  | Primary first-touch, complex qualification, closing |
| SMS      | out / in  | Short follow-ups, quick questions, callback scheduling |
| Email    | out / in  | Offer delivery, longer replies, document exchange |
| WhatsApp | out / in  | If prospect prefers it, same role as SMS |

All channels share one conversation thread per lead (Happy Robot Contacts +
Memory). Kate always sees the full prior history before answering.

## Behaviour contract — end-to-end

### Phase 1 · First touch (outbound)

1. **Pre-call check.** DNC list, call window (Mon-Fri 9–17), `signal_ids`
   present. Fail → stop.
2. **Disclosure.** The exact AI-disclosure sentence (TBD) is Kate's first
   utterance on any new channel.
3. **Signal hook.** Reference the signal as the reason for contact.
4. **No path.** Prospect declines → polite sign-off, mark `opted_out`.
5. **Qualification.** Six envelope fields via `happyrobot.ai_extract` against
   the live transcript / message thread.
6. **Opt-in.** Explicit phrase, detectable in transcript / message.

### Phase 2 · Offer handoff (internal)

7. Once opt-in + ≥ 0.8 envelope completeness: Kate pings Otto with the
   `CallResult`. Otto returns `OfferDraft`. Kate reviews the draft briefly
   (AI-side, not human), then moves to dispatch.

### Phase 3 · Dispatch + follow-up (customer-facing)

8. **Channel routing.** Use the channel the prospect named. Default email.
9. **Send.** Kate sends Otto's draft through the chosen channel. Status
   `dispatched`.
10. **Inbound handling.** If the prospect replies on any channel, Kate
    answers — using the shared thread context.
11. **Follow-up cadence.** Silence after 3 working days → one gentle
    reminder. Silence after 8 working days → mark `cold`, stop.
12. **Closing.** Prospect confirms the offer → Kate marks `deal_closed`,
    triggers BSH-envelope preparation (still draft only in the demo).

### Phase 4 · Inbound-initiated leads (new)

- Lead reaches Kate first (SMS/email/callback request).
- Kate must check: is there a known signal? If yes — fine. If no — ask
  briefly what led them to reach out, record as implicit signal, continue.

## Input schema

```json
{
  "lead_id": "lead_20260418_0011",
  "signal_ids": ["sig_20260418_0042"],
  "signal_summary": "New senior residence Bad Cannstatt, 40 units, Q3 2026",
  "entity": { "name": "Diakonie Stuttgart gGmbH", "address": "..." },
  "contact": {
    "name": "Dr. Maria Schmidt",
    "role": "Managing Director",
    "phone": "+49...",
    "email": "...",
    "preferred_channel": "email" | "phone" | "whatsapp" | null
  },
  "preferred_language": "de"
}
```

## Output schemas

### CallResult (after phase 1)

```json
{
  "id": "call_20260418_0004",
  "lead_id": "lead_20260418_0011",
  "channel": "voice" | "sms" | "email" | "whatsapp",
  "started_at": "2026-04-18T10:14:00Z",
  "ended_at": "2026-04-18T10:18:12Z",
  "transcript_url": "happyrobot://transcripts/...",
  "outcome": "opted_in" | "opted_out" | "callback" | "escalated" | "not_reached",
  "envelope": { "...": "six fields, see Martin's TBD" },
  "envelope_completeness": 0.83,
  "opt_in_evidence": {
    "phrase_detected": "Yes, please send me the offer by email.",
    "timestamp_in_transcript_sec": 198,
    "channel": "voice"
  },
  "preferred_channel_for_offer": "email",
  "escalation_reason": null
}
```

### DispatchedOffer (after phase 3)

```json
{
  "id": "disp_20260418_0004",
  "offer_id": "env_20260418_0002",
  "lead_id": "lead_20260418_0011",
  "channel": "email",
  "dispatched_at": "2026-04-18T10:22:00Z",
  "follow_ups_sent": 0,
  "status": "dispatched" | "replied" | "deal_closed" | "cold" | "declined"
}
```

## Guardrails (non-negotiable)

- **Disclosure first.** On any new channel or new thread, the AI
  disclosure precedes everything else.
- **No contact without `signal_ids`** (or explicit inbound opt-in).
- **DNC check on every channel** — phone, email, WhatsApp.
- **Max one clarification per field.** Two strikes → escalate.
- **No price statements without Otto's draft.** Kate never invents prices.
- **Max 2 outbound touches total.** Initial + one reminder. No badgering.

## Escalation triggers

| Trigger | Reason | Demo-relevant? |
|---|---|---|
| Budget unclear after one follow-up | `budget_unclear` | Yes — scene 04 |
| Legal / contractual question | `legal_question` | No |
| AI objection | `ai_objection` | No |
| Envelope completeness < 0.5 | `insufficient_info` | No |
| Wrong contact / no decision-maker | `wrong_contact` | No |
| Deal size > €100k (from Otto draft) | `large_deal` | Optional |

## Happy Robot capabilities Kate uses

- **Voice + SMS + Email + WhatsApp channels** — including inbound handling.
- **AI Extract** against live + post-contact transcripts for the six fields.
- **Contacts / Memory** — persistent thread context across channels.
- **Workflow engine** — follow-up timers, channel routing.

## Observability — events to the cockpit

| Event | Payload | Cockpit display |
|---|---|---|
| `kate.call_started` | `{lead_id, contact_name, channel}` | Now panel |
| `kate.transcript_delta` | `{lead_id, text_chunk, speaker}` | Live transcript |
| `kate.field_extracted` | `{lead_id, field, value, confidence}` | Envelope progress |
| `kate.opt_in_detected` | `{lead_id, phrase, timestamp, channel}` | Green check |
| `kate.offer_dispatched` | `{lead_id, channel, recipient}` | Pipeline → offer made |
| `kate.follow_up_sent` | `{lead_id, channel, attempt}` | Activity log |
| `kate.deal_closed` | `{lead_id, value_estimate}` | Pipeline → deal closed |
| `kate.escalated` | `{lead_id, reason, snippet}` | Escalation tray |

## Demo contract

- **Scene 02:** Kate starts a voice call. Transcript streams into the cockpit.
- **Scene 03:** Envelope fields fill live.
- **Scene 04:** A second lead escalates with `budget_unclear`.
- **Scene 05:** After opt-in, Kate dispatches Otto's draft via email. The
  dispatch appears in the activity log. Pipeline moves to "Offer made".
- **Scene 06 (bonus):** Inbound SMS from prospect — Kate picks it up in
  the same thread and replies.

## Out of scope for 48h

- Multi-turn personality simulation (standard HR voice is enough).
- Dialect handling (Standard German).
- Channels beyond voice/SMS/email/WhatsApp.
- Custom telephony gateway.

---

## TBD — what Martin still owes Kate

- [ ] Exact six envelope fields (Annex 2). 5 min.
- [ ] AI-disclosure sentence in German, legally defensible. 10 min.
- [ ] Opt-in phrasing — canonical + 2 variants. 5 min.
- [ ] DNC list — ≥ 2 phone numbers + 1 email + 1 WhatsApp. 5 min.
- [ ] Test numbers (mobile + landline), test email, test WhatsApp. 10 min.
- [ ] Follow-up cadence phrasing (gentle reminder body). 10 min.
- [ ] HappyRobot voice workflow template, if one exists.

## Questions Kate's owner answers before building

- Streaming AI Extract or one pass at call end?
- Where does the cross-channel thread state live — HR Memory, or your own?
- How does Kate know when Otto's draft is ready — event push or polling?
- How do you guarantee the disclosure is literally the first utterance?
