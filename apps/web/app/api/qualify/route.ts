/**
 * POST /api/qualify
 * Triggers Kate (Caller) via HappyRobot webhook.
 * Called when user clicks "Qualify now" in the cockpit.
 *
 * Body: { lead_id: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getLeadById, updateLeadStage, appendAudit, isDnc, type MotivationString } from "@/lib/db";

const HAPPYROBOT_CALLER_WEBHOOK = process.env.HAPPYROBOT_CALLER_WEBHOOK_URL ?? "";
const HAPPYROBOT_API_KEY = process.env.HAPPYROBOT_API_KEY ?? "";
const CALLBACK_URL = process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api/callback` : "";
const EVENTS_URL = process.env.EVENTS_URL ?? "";

/**
 * Pick the BSH-aligned motivation_string for Kate's opener.
 * Primary: decision-maker role (keyword match). Secondary: score archetype.
 * Never pick motivation from score alone — see agents/scout.scoring.md §"Hook Selection".
 */
function pickMotivation(role: string | undefined, score: number | undefined): MotivationString {
  const r = (role ?? "").toLowerCase();

  // Primary: decision-maker role
  if (/nachhaltigkeit|esg|sustainability|quality|compliance/.test(r)) return "circular";
  if (/cfo|finanz|kaufmänn|controlling/.test(r))                      return "optimize";
  if (/einrichtungsleitung|facility|hausleitung|betriebsleitung|hausmeister|ops|operations/.test(r)) return "simplify";
  if (/geschäftsführ|ceo|managing director|projektentwickl|expansion|developer/.test(r))             return "scale";

  // Secondary: score archetype tie-breaker (when role is unknown or generic)
  const s = score ?? 0;
  if (s >= 70) return "simplify";  // premium steady-state senior-living
  if (s >= 40) return "optimize";  // budget-disciplined mid
  return "scale";                  // opportunistic new build
}

export async function POST(req: NextRequest) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 [POST /api/qualify] — trigger Kate (Caller) for a lead");
  console.log("   Purpose: called from cockpit 'Qualify now' → sends task to HappyRobot");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const { lead_id } = await req.json().catch(() => ({}));
  if (!lead_id) {
    console.log("❌ [/api/qualify] 400 — NOT CONNECTED: missing lead_id in request body");
    return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  }
  console.log(`🔍 [/api/qualify] Looking up lead: "${lead_id}"`);

  const lead = await getLeadById(lead_id);
  if (!lead) {
    console.log(`❌ [/api/qualify] 404 — Lead "${lead_id}" not found in DB`);
    return NextResponse.json({ error: "lead not found" }, { status: 404 });
  }
  console.log(`✅ [/api/qualify] Lead found: "${lead.company_name}" (${lead.city ?? "—"}), stage="${lead.stage}"`);

  if (!lead.person_phone) {
    console.log(`❌ [/api/qualify] 412 — No phone number for lead "${lead_id}". Kate cannot call without a number`);
    return NextResponse.json({ error: "no phone — lead has not opted in via landing page yet" }, { status: 412 });
  }
  console.log(`📱 [/api/qualify] Phone: ${lead.person_phone}`);

  // Guardrail: DNC check
  if (isDnc(lead.person_phone) || isDnc(lead.person_email ?? "")) {
    console.log(`🚫 [/api/qualify] 403 — Contact is on DNC list. Call blocked`);
    appendAudit({
      timestamp: new Date().toISOString(),
      agent: "guardrail",
      event: "guardrail.dnc_block",
      leadId: lead_id,
      meta: { reason: "contact on DNC list" },
    });
    return NextResponse.json({ error: "contact is on DNC list" }, { status: 403 });
  }
  console.log(`✅ [/api/qualify] DNC check passed`);

  // Trigger HappyRobot Caller workflow
  if (HAPPYROBOT_CALLER_WEBHOOK) {
    const motivation = lead.motivation_string ?? pickMotivation(lead.person_role, lead.score);
    console.log(`🧠 [/api/qualify] Motivation selected: "${motivation}" (role="${lead.person_role ?? "—"}", score=${lead.score ?? "—"})`);

    const payload: Record<string, unknown> = {
      to: lead.person_phone,
      contact_id: lead.id,
      lead_id: lead.id,
      contact_name: lead.person_name ?? "",
      contact_role: lead.person_role ?? "",
      contact_email: lead.person_email ?? "",
      company_name: lead.company_name,
      city: lead.city ?? "",
      signal_summary: lead.signal_summary ?? `new senior-living facility in ${lead.city ?? "Germany"}`,
      signal_url: lead.signal_url ?? "",
      motivation_string: motivation,
      hook: motivation,
      campaign_id: "makeathon-2026",
      callback_url: CALLBACK_URL,
      events_url: EVENTS_URL,
    };

    console.log(`🚀 [/api/qualify] Sending webhook to HappyRobot (Kate):`);
    console.log(`   → URL: ${HAPPYROBOT_CALLER_WEBHOOK}`);
    console.log(`   → Authorization: Bearer present: ${!!HAPPYROBOT_API_KEY}`);
    console.log(`   → callback_url (where Kate sends the result): ${CALLBACK_URL || "⚠️  NOT SET"}`);
    console.log(`   → events_url (where Kate sends events): ${EVENTS_URL || "⚠️  NOT SET"}`);

    const hrResponse = await fetch(HAPPYROBOT_CALLER_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(HAPPYROBOT_API_KEY ? { Authorization: `Bearer ${HAPPYROBOT_API_KEY}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!hrResponse.ok) {
      const err = await hrResponse.text();
      console.log(`❌ [/api/qualify] 502 — HappyRobot returned error: ${err}`);
      return NextResponse.json({ error: `HappyRobot error: ${err}` }, { status: 502 });
    }
    console.log(`✅ [/api/qualify] HappyRobot accepted task (${hrResponse.status}). Kate will start calling`);
  } else {
    console.log(`⚠️  [/api/qualify] HAPPYROBOT_CALLER_WEBHOOK_URL not set — call not initiated (audit only)`);
  }

  appendAudit({
    timestamp: new Date().toISOString(),
    agent: "orchestrator",
    event: "orchestrator.qualify_triggered",
    leadId: lead_id,
    meta: { triggered_by: "user" },
  });
  console.log(`📝 [/api/qualify] Audit entry "orchestrator.qualify_triggered" saved`);

  console.log(`✅ [/api/qualify] Done. Kate triggered for lead "${lead_id}"`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  return NextResponse.json({ ok: true, lead_id });
}
