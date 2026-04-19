## Справочник событий `/api/events`

Все события шлются на `POST https://makeathontumai.vercel.app/api/events`

---

### Scout

**`scout.lead_candidate_created`** — новый лид найден
```json
{
  "event": "scout.lead_candidate_created",
  "lead_id": "L-123",
  "meta": {
    "company_name": "Seniorenstift GmbH",
    "postal_address": "München",
    "url": "https://example.de",
    "person_name": "Hans Müller",
    "person_role": "Einrichtungsleitung",
    "person_email": "h.mueller@example.de",
    "person_phone": "+4916000000",
    "signal_summary": "Neubau 80 Einheiten geplant",
    "signal_url": "https://...",
    "motivation_string": "simplify",
    "score": 75
  }
}
```

---

### Kate (Caller)

**`kate.call_started`** — звонок начался (стадия не меняется)
```json
{ "event": "kate.call_started", "lead_id": "L-123" }
```

**`kate.opt_in_detected`** → `qualified`
```json
{ "event": "kate.opt_in_detected", "lead_id": "L-123" }
```

**`kate.field_extracted`** — Kate заполнила одно поле
```json
{
  "event": "kate.field_extracted",
  "lead_id": "L-123",
  "meta": { "field": "num_units", "value": 50 }
}
```
Допустимые поля: `num_units`, `bundle_leader`, `bundle_profi`, `bundle_top_feature`, `preferred_term_months`, `facility_type`, `timeline`, `decision_maker`, `preferred_channel`, `contact_address`, `call_notes`

**`kate.call_ended`** — звонок завершён, outcome определяет стадию
```json
{
  "event": "kate.call_ended",
  "lead_id": "L-123",
  "meta": { "outcome": "qualified" }
}
```
| `outcome` | Стадия |
|---|---|
| `qualified` / `opted_in` | `qualified` |
| `not_interested` / `opted_out` | `not_interested` → Archive |
| `homologation_fail` | `homologation_fail` → Archive |
| `escalated` | `escalated` → Archive |

**`kate.offer_dispatched`** → `offered`
```json
{ "event": "kate.offer_dispatched", "lead_id": "L-123" }
```

**`kate.deal_closed`** → `accepted` (Closed)
```json
{ "event": "kate.deal_closed", "lead_id": "L-123" }
```

**`kate.escalated`** → `escalated` (Archive)
```json
{
  "event": "kate.escalated",
  "lead_id": "L-123",
  "meta": { "reason": "price negotiation" }
}
```

---

### Otto (Closer)

**`otto.offer_ready`** → `offered` + записывает `offer_sent_at`
```json
{ "event": "otto.offer_ready", "lead_id": "L-123" }
```

**`otto.held_for_review`** → `escalated` (Archive, сделка >€100k)
```json
{
  "event": "otto.held_for_review",
  "lead_id": "L-123",
  "meta": { "reason": "deal exceeds 100k" }
}
```

---

### Полный happy path
```
scout.lead_candidate_created
  → kate.call_started
  → kate.opt_in_detected       [qualified]
  → kate.field_extracted (x N)
  → kate.call_ended outcome=qualified
  → otto.offer_ready           [offered]
  → kate.deal_closed           [accepted / Closed]
```