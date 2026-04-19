/**
 * POST /api/consent
 * Called by the landing page when a prospect submits phone + consent checkbox.
 *
 * Body: {
 *   lead_id: string
 *   phone: string               — prospect's phone number
 *   consent_text_version?: string
 *   motivation?: string
 * }
 *
 * 1. Writes person_phone + consent fields to the lead row.
 * 2. Immediately fires Kate's webhook so the call starts without operator input.
 */
import { NextRequest, NextResponse } from "next/server";
import { getLeadById, updateLead, appendAudit, isDnc, type MotivationString } from "@/lib/db";

const KATE_WEBHOOK   = process.env.HAPPYROBOT_CALLER_WEBHOOK_URL ?? "";
const HR_API_KEY     = process.env.HAPPYROBOT_API_KEY ?? "";
const CALLBACK_URL   = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/callback`
  : "";
const EVENTS_URL     = process.env.EVENTS_URL ?? "";

function makeRef(): string {
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `REF-${seg()}-${seg()}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { lead_id, phone, consent_text_version = "v1.0", motivation } = body as {
    lead_id?: string;
    phone?: string;
    consent_text_version?: string;
    motivation?: string;
  };

  if (!lead_id || typeof lead_id !== "string") {
    return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  }
  if (!phone || typeof phone !== "string" || phone.trim().length < 5) {
    return NextResponse.json({ error: "valid phone required" }, { status: 400 });
  }

  const lead = await getLeadById(lead_id);
  if (!lead) {
    return NextResponse.json({ error: "lead not found" }, { status: 404 });
  }

  const cleanPhone = phone.trim();

  // DNC check
  if (isDnc(cleanPhone) || isDnc(lead.person_email ?? "")) {
    return NextResponse.json({ error: "contact is on DNC list" }, { status: 403 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const resolvedMotivation = (motivation ?? lead.motivation_string ?? "simplify") as MotivationString;

  // 1. Save consent + phone to DB
  await updateLead(lead_id, {
    person_phone:         cleanPhone,
    consent_given_at:     new Date().toISOString(),
    consent_text_version: consent_text_version,
    consent_ip:           ip,
    motivation_string:    resolvedMotivation,
  });

  appendAudit({
    timestamp: new Date().toISOString(),
    agent:     "orchestrator",
    event:     "lead.consent_given",
    leadId:    lead_id,
    meta:      { phone: cleanPhone, consent_text_version, motivation: resolvedMotivation, ip },
  });

  const reference = makeRef();
  console.log(`[/api/consent] lead="${lead_id}" phone="${cleanPhone}" ref="${reference}"`);

  // 2. Fire Kate immediately (fire-and-forget, don't block the response)
  if (KATE_WEBHOOK) {
    const katePayload = {
      to:               cleanPhone,
      contact_id:       lead_id,
      lead_id:          lead_id,
      contact_name:     lead.person_name   ?? "",
      contact_role:     lead.person_role   ?? "",
      contact_email:    lead.person_email  ?? "",
      facility_name:    lead.company_name,
      city:             lead.city          ?? "",
      signal_summary:   lead.signal_summary ?? `new senior-living facility in ${lead.city ?? "Germany"}`,
      signal_url:       lead.signal_url    ?? "",
      motivation_string: resolvedMotivation,
      hook:             resolvedMotivation,
      campaign_id:      "makeathon-2026",
      callback_url:     CALLBACK_URL,
      events_url:       EVENTS_URL,
    };

    fetch(KATE_WEBHOOK, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        ...(HR_API_KEY ? { Authorization: `Bearer ${HR_API_KEY}` } : {}),
      },
      body: JSON.stringify(katePayload),
    })
      .then(async (r) => {
        const text = await r.text();
        console.log(`[/api/consent] Kate webhook → ${r.status}: ${text}`);
        appendAudit({
          timestamp: new Date().toISOString(),
          agent:     "caller",
          event:     "kate.call_started",
          leadId:    lead_id,
          meta:      { run: JSON.parse(text), triggered_by: "landing_page_consent" },
        });
      })
      .catch((err) => console.error(`[/api/consent] Kate webhook failed: ${err?.message}`));
  } else {
    console.warn("[/api/consent] HAPPYROBOT_CALLER_WEBHOOK_URL not set — Kate not triggered");
  }

  return NextResponse.json({ ok: true, reference });
}
