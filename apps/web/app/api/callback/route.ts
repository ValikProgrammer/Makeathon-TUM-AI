/**
 * POST /api/callback
 * Receives call completion data from HappyRobot after Kate finishes a call.
 * HappyRobot should be configured to POST to this URL with extracted envelope fields.
 *
 * Expected body (from HappyRobot Prompt step output, matching Kate v3 prompt):
 * {
 *   contact_id: string,           // lead ID passed when triggering
 *   lead_id: string,              // fallback
 *   duration: number,
 *   call_outcome: string,         // qualified | homologation_fail | not_interested | callback_requested | escalated | dropped
 *   opt_in: boolean,
 *   usage_type: string,
 *   facility_type: string,
 *   num_units: number,
 *   timeline: string,
 *   budget_indicator: string,     // prompt uses budget_indicator (also accept budget_range)
 *   preferred_term_months: number,
 *   decision_maker: string,
 *   preferred_channel: string,
 *   escalate: boolean,
 *   escalation_reason: string,
 *   callback_time: string,
 *   qualification_partial: boolean,
 *   notes: string,
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { getLeadById, updateLeadStage, appendAudit } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const lead_id: string = body.contact_id ?? body.lead_id ?? "";
  if (!lead_id) return NextResponse.json({ error: "contact_id required" }, { status: 400 });

  const lead = getLeadById(lead_id);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  // If HappyRobot Prompt node returned JSON as text in `extracted`, parse it
  let extracted: Record<string, unknown> = {};
  if (body.extracted && typeof body.extracted === "string") {
    try {
      const raw = body.extracted.trim().replace(/^```json|^```|```$/g, "").trim();
      extracted = JSON.parse(raw);
    } catch {
      // not valid JSON — continue with direct fields
    }
  }

  // Merge: direct fields take priority, extracted fields as fallback
  const merged = { ...extracted, ...body };

  const optIn: boolean = merged.opt_in === true || merged.opt_in === "true";
  const escalate: boolean = merged.escalate === true || merged.escalate === "true";
  const escalationReason: string = String(merged.escalation_reason ?? "");
  const callOutcome: string = String(merged.call_outcome ?? (optIn ? "qualified" : "not_interested"));

  const envelope = {
    usage_type: String(merged.usage_type ?? ""),
    facility_type: String(merged.facility_type ?? ""),
    num_units: Number(merged.num_units ?? 0),
    timeline: String(merged.timeline ?? ""),
    budget_range: String(merged.budget_indicator ?? merged.budget_range ?? ""),
    decision_maker: String(merged.decision_maker ?? ""),
  };

  appendAudit({
    timestamp: new Date().toISOString(),
    agent: "caller",
    event: "kate.call_ended",
    leadId: lead_id,
    meta: {
      duration: body.duration,
      call_outcome: callOutcome,
      opt_in: optIn,
      escalate,
      escalation_reason: escalationReason,
      preferred_channel: merged.preferred_channel,
      preferred_term_months: merged.preferred_term_months,
      callback_time: merged.callback_time,
      qualification_partial: merged.qualification_partial,
      notes: merged.notes,
      envelope,
    },
  });

  if (callOutcome === "homologation_fail") {
    updateLeadStage(lead_id, "dnc", { envelope });
  } else if (escalate || escalationReason) {
    updateLeadStage(lead_id, lead.stage, {
      escalated: true,
      escalationReason: escalationReason || callOutcome,
      envelope,
    });
  } else if (optIn) {
    updateLeadStage(lead_id, "qualified", { optIn: true, envelope });
  } else {
    updateLeadStage(lead_id, "signal", { optIn: false, envelope });
  }

  return NextResponse.json({ ok: true, lead_id, opt_in: optIn });
}
