/**
 * POST /api/qualify
 * Triggers Kate (Caller) via HappyRobot webhook.
 * Called when user clicks "Qualify now" in the cockpit.
 *
 * Body: { lead_id: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getLeadById, updateLeadStage, appendAudit, isDnc } from "@/lib/db";

const HAPPYROBOT_CALLER_WEBHOOK = process.env.HAPPYROBOT_CALLER_WEBHOOK_URL ?? "";
const HAPPYROBOT_API_KEY = process.env.HAPPYROBOT_API_KEY ?? "";

export async function POST(req: NextRequest) {
  const { lead_id } = await req.json().catch(() => ({}));
  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const lead = getLeadById(lead_id);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });
  if (lead.stage === "calling") return NextResponse.json({ error: "already calling" }, { status: 409 });

  // Guardrail: DNC check
  const contactPhone = lead.contact?.phone ?? "";
  const contactEmail = lead.contact?.email ?? "";
  if (isDnc(contactPhone) || isDnc(contactEmail)) {
    appendAudit({ timestamp: new Date().toISOString(), agent: "guardrail", event: "guardrail.dnc_block", leadId: lead_id, meta: { reason: "contact on DNC list" } });
    return NextResponse.json({ error: "contact is on DNC list" }, { status: 403 });
  }

  // Trigger HappyRobot Caller workflow
  if (HAPPYROBOT_CALLER_WEBHOOK) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    // Pick hook based on ICP and available signal
    const hook = lead.icp === "high" ? "simplify" : lead.icp === "mid" ? "optimize" : "scale";

    const payload: Record<string, unknown> = {
      to: lead.contact?.phone ?? "",
      contact_id: lead.id,
      lead_id: lead.id,
      contact_name: lead.contact?.name ?? "",
      contact_role: lead.contact?.role ?? "",
      facility_name: lead.facility ?? lead.org,
      org: lead.org,
      city: lead.city,
      signal_summary: lead.signal?.title ?? `new senior-living facility in ${lead.city}`,
      signal_source: lead.signal?.source ?? "",
      hook,
      campaign_id: `makeathon-2026`,
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

  updateLeadStage(lead_id, "calling");
  appendAudit({ timestamp: new Date().toISOString(), agent: "orchestrator", event: "orchestrator.qualify_triggered", leadId: lead_id, meta: { triggered_by: "user" } });

  return NextResponse.json({ ok: true, lead_id, stage: "calling" });
}
