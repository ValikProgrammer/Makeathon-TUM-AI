/**
 * POST /api/callback
 * Receives Kate's call-ended payload from HappyRobot.
 *
 * Expected body (flat — matches leads table columns):
 * {
 *   contact_id: string,            // lead ID passed when triggering
 *   lead_id: string,               // fallback
 *   duration?: number,
 *   call_outcome?: "qualified" | "homologation_fail" | "not_interested" | "callback_requested" | "escalated" | "dropped",
 *
 *   // Qualification
 *   facility_type?: string,
 *   num_units?: number,
 *   timeline?: string,
 *   preferred_term_months?: number,
 *   decision_maker?: string,
 *
 *   // Bundle mix
 *   bundle_leader?: number,
 *   bundle_profi?: number,
 *   bundle_top_feature?: number,
 *
 *   // Outcome
 *   opt_in?: boolean,
 *   preferred_channel?: "email" | "whatsapp" | "phone",
 *   contact_address?: string,
 *   call_transcript_url?: string,
 *   call_notes?: string,
 *
 *   // Control-plane fields
 *   escalate?: boolean,
 *   escalation_reason?: string,
 * }
 *
 * If HappyRobot emits the payload as a JSON string in `extracted`, we parse it.
 */
import { NextRequest, NextResponse } from "next/server";
import { getLeadById, updateLeadStage, appendAudit, type Lead, type Stage } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const lead_id: string = body.contact_id ?? body.lead_id ?? "";
  if (!lead_id) return NextResponse.json({ error: "contact_id required" }, { status: 400 });

  const lead = getLeadById(lead_id);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  // Unwrap extracted JSON blob if present
  let extracted: Record<string, unknown> = {};
  if (body.extracted && typeof body.extracted === "string") {
    try {
      const raw = body.extracted.trim().replace(/^```json|^```|```$/g, "").trim();
      extracted = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }
  const m: Record<string, unknown> = { ...extracted, ...body };

  const optIn = m.opt_in === true || m.opt_in === "true";
  const escalate = m.escalate === true || m.escalate === "true";
  const escalationReason = String(m.escalation_reason ?? "");
  const callOutcome = String(m.call_outcome ?? (optIn ? "qualified" : "not_interested"));

  const bundleLeader = Number(m.bundle_leader ?? 0);
  const bundleProfi = Number(m.bundle_profi ?? 0);
  const bundleTopFeature = Number(m.bundle_top_feature ?? 0);
  const numUnits = Number(m.num_units ?? bundleLeader + bundleProfi + bundleTopFeature);

  // Map call outcome → pipeline stage
  let nextStage: Stage = lead.stage;
  if (callOutcome === "homologation_fail") nextStage = "homologation_fail";
  else if (escalate || escalationReason) nextStage = "escalated";
  else if (optIn) nextStage = "qualified";
  else nextStage = "not_interested";

  const patch: Partial<Lead> = {
    facility_type: m.facility_type ? String(m.facility_type) : undefined,
    num_units: numUnits || undefined,
    timeline: m.timeline ? String(m.timeline) : undefined,
    preferred_term_months: m.preferred_term_months ? Number(m.preferred_term_months) : undefined,
    decision_maker: m.decision_maker ? String(m.decision_maker) : undefined,
    bundle_leader: bundleLeader || undefined,
    bundle_profi: bundleProfi || undefined,
    bundle_top_feature: bundleTopFeature || undefined,
    opt_in: optIn,
    preferred_channel: m.preferred_channel as Lead["preferred_channel"],
    contact_address: m.contact_address ? String(m.contact_address) : undefined,
    call_transcript_url: m.call_transcript_url ? String(m.call_transcript_url) : undefined,
    call_notes: m.call_notes ? String(m.call_notes) : undefined,
    escalation_reason: escalationReason || undefined,
  };

  appendAudit({
    timestamp: new Date().toISOString(),
    agent: "caller",
    event: "kate.call_ended",
    leadId: lead_id,
    meta: {
      duration: body.duration,
      call_outcome: callOutcome,
      next_stage: nextStage,
      ...patch,
    },
  });

  updateLeadStage(lead_id, nextStage, patch);

  return NextResponse.json({ ok: true, lead_id, stage: nextStage, opt_in: optIn });
}
