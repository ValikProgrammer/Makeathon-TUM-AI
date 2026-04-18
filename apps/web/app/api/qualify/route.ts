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

  // Guardrail: call window Mon-Fri 09:00–17:00 CET
  const hour = new Date().getUTCHours() + 1; // rough CET
  const day = new Date().getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6 || hour < 9 || hour >= 17) {
    appendAudit({ timestamp: new Date().toISOString(), agent: "guardrail", event: "guardrail.call_window_block", leadId: lead_id, meta: { hour, day } });
    return NextResponse.json({ error: "outside call window (Mon-Fri 09:00-17:00 CET)" }, { status: 403 });
  }

  // Trigger HappyRobot Caller workflow
  if (HAPPYROBOT_CALLER_WEBHOOK) {
    const payload = {
      lead_id: lead.id,
      signal_ids: lead.signal?.signal_id ? [lead.signal.signal_id] : [],
      signal_summary: lead.signal?.title ?? "",
      entity: { name: lead.org, address: lead.city },
      contact: lead.contact ?? {},
      preferred_language: "de",
    };

    const hrResponse = await fetch(HAPPYROBOT_CALLER_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HAPPYROBOT_API_KEY}`,
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
