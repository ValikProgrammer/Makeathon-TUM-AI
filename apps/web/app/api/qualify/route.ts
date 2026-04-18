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
  const { lead_id } = await req.json().catch(() => ({}));
  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const lead = getLeadById(lead_id);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  // Require phone (captured on landing page) before calling
  if (!lead.person_phone) {
    return NextResponse.json({ error: "no phone — lead has not opted in via landing page yet" }, { status: 412 });
  }

  // Guardrail: DNC check
  if (isDnc(lead.person_phone) || isDnc(lead.person_email ?? "")) {
    appendAudit({
      timestamp: new Date().toISOString(),
      agent: "guardrail",
      event: "guardrail.dnc_block",
      leadId: lead_id,
      meta: { reason: "contact on DNC list" },
    });
    return NextResponse.json({ error: "contact is on DNC list" }, { status: 403 });
  }

  // Trigger HappyRobot Caller workflow
  if (HAPPYROBOT_CALLER_WEBHOOK) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const motivation = lead.motivation_string ?? pickMotivation(lead.person_role, lead.score);

    const payload: Record<string, unknown> = {
      to: lead.person_phone,
      contact_id: lead.id,
      lead_id: lead.id,
      contact_name: lead.person_name ?? "",
      contact_role: lead.person_role ?? "",
      facility_name: lead.company_name,
      city: lead.city ?? "",
      signal_summary: lead.signal_summary ?? `new senior-living facility in ${lead.city ?? "Germany"}`,
      signal_url: lead.signal_url ?? "",
      motivation_string: motivation,
      hook: motivation, // backwards compat with existing HappyRobot workflow variable name
      campaign_id: "makeathon-2026",
      callback_url: appUrl ? `${appUrl}/api/callback` : "",
    };

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
      return NextResponse.json({ error: `HappyRobot error: ${err}` }, { status: 502 });
    }
  }

  appendAudit({
    timestamp: new Date().toISOString(),
    agent: "orchestrator",
    event: "orchestrator.qualify_triggered",
    leadId: lead_id,
    meta: { triggered_by: "user" },
  });

  return NextResponse.json({ ok: true, lead_id });
}
