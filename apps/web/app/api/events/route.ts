/**
 * POST /api/events
 * HappyRobot webhook receiver. All three agents post here.
 * Payload shape depends on event type — see agents/ briefings.
 */
import { NextRequest, NextResponse } from "next/server";
import { appendAudit, updateLeadStage, getLeadById, upsertLead, type Lead, type MotivationString, type Stage } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.event) {
    return NextResponse.json({ error: "missing event field" }, { status: 400 });
  }

  const { event, lead_id, meta } = body as {
    event: string;
    lead_id?: string;
    meta?: Record<string, unknown>;
  };

  appendAudit({ timestamp: new Date().toISOString(), agent: agentFromEvent(event), event, leadId: lead_id, meta });

  switch (event) {
    // ── Jack (Scout) ───────────────────────────────────────────────────────
    case "scout.lead_candidate_created": {
      if (!meta) break;
      upsertLead({
        id: lead_id ?? `L-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        stage: "new",
        company_name: String(meta.company_name ?? meta.org ?? "Unknown"),
        street: meta.street ? String(meta.street) : undefined,
        postal_code: meta.postal_code ? String(meta.postal_code) : undefined,
        city: meta.city ? String(meta.city) : undefined,
        url: meta.url ? String(meta.url) : undefined,
        person_name: meta.person_name ? String(meta.person_name) : undefined,
        person_role: meta.person_role ? String(meta.person_role) : undefined,
        person_email: meta.person_email ? String(meta.person_email) : undefined,
        signal_url: meta.signal_url ? String(meta.signal_url) : undefined,
        signal_summary: meta.signal_summary ? String(meta.signal_summary) : undefined,
        motivation_string: meta.motivation_string as MotivationString | undefined,
        score: meta.score !== undefined ? Number(meta.score) : undefined,
      });
      break;
    }

    // ── Kate (Caller) ──────────────────────────────────────────────────────
    case "kate.call_started":
      // No stage change — we already moved to the call when qualify was triggered.
      break;

    case "kate.field_extracted": {
      if (!lead_id) break;
      const field = String(meta?.field ?? "");
      const value = meta?.value;
      if (!field) break;
      // Only allow writes to Kate-owned columns
      const allowed: (keyof Lead)[] = [
        "facility_type",
        "num_units",
        "timeline",
        "preferred_term_months",
        "decision_maker",
        "bundle_leader",
        "bundle_profi",
        "bundle_top_feature",
        "preferred_channel",
        "contact_address",
        "call_notes",
      ];
      if (allowed.includes(field as keyof Lead)) {
        updateLeadStage(lead_id, getLeadById(lead_id)?.stage ?? "new", { [field]: value } as Partial<Lead>);
      }
      break;
    }

    case "kate.opt_in_detected":
      if (lead_id) updateLeadStage(lead_id, "qualified", { opt_in: true });
      break;

    case "kate.call_ended": {
      if (!lead_id || !meta) break;
      const outcome = String(meta.outcome ?? meta.call_outcome ?? "");
      let nextStage: Stage = getLeadById(lead_id)?.stage ?? "new";
      if (outcome === "opted_in" || outcome === "qualified") nextStage = "qualified";
      else if (outcome === "opted_out" || outcome === "not_interested") nextStage = "not_interested";
      else if (outcome === "homologation_fail") nextStage = "homologation_fail";
      else if (outcome === "escalated") nextStage = "escalated";
      updateLeadStage(lead_id, nextStage);
      break;
    }

    case "kate.offer_dispatched":
      if (lead_id) updateLeadStage(lead_id, "offered");
      break;

    case "kate.deal_closed":
      if (lead_id) updateLeadStage(lead_id, "accepted");
      break;

    case "kate.escalated":
      if (lead_id) {
        updateLeadStage(lead_id, "escalated", {
          escalation_reason: meta?.reason ? String(meta.reason) : undefined,
        });
      }
      break;

    // ── Otto (Closer) ──────────────────────────────────────────────────────
    case "otto.offer_ready":
      if (lead_id) updateLeadStage(lead_id, "offered", { offer_sent_at: new Date().toISOString() });
      break;

    case "otto.held_for_review":
      if (lead_id) {
        updateLeadStage(lead_id, "escalated", {
          escalation_reason: meta?.reason ? String(meta.reason) : "hold_for_review",
        });
      }
      break;

    default:
      break;
  }

  return NextResponse.json({ ok: true, event });
}

function agentFromEvent(event: string): "scout" | "caller" | "closer" | "guardrail" | "orchestrator" {
  if (event.startsWith("scout.")) return "scout";
  if (event.startsWith("kate.")) return "caller";
  if (event.startsWith("otto.")) return "closer";
  if (event.startsWith("guardrail.")) return "guardrail";
  return "orchestrator";
}
