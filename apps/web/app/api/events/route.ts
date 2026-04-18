/**
 * POST /api/events
 * HappyRobot webhook receiver. All three agents post here.
 * Payload shape depends on event type — see agents/ briefings.
 */
import { NextRequest, NextResponse } from "next/server";
import { appendAudit, updateLeadStage, getLeadById, upsertLead } from "@/lib/db";

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

  // Append to audit log
  appendAudit({ timestamp: new Date().toISOString(), agent: agentFromEvent(event), event, leadId: lead_id, meta });

  // State machine — update lead stage based on event
  switch (event) {
    // ── Scout ──────────────────────────────────────────────────────────────
    case "scout.lead_candidate_created": {
      if (!meta) break;
      upsertLead({
        id: lead_id ?? `L-${Date.now()}`,
        org: String(meta.org ?? "Unknown"),
        facility: String(meta.facility ?? ""),
        units: Number(meta.units ?? 0),
        city: String(meta.city ?? ""),
        stage: "signal",
        icp: (meta.icp as "high" | "mid" | "low") ?? "mid",
        value: Number(meta.units ?? 0) * 42 * 60 * 0.07,
        signal: meta.signal as never,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      break;
    }

    // ── Kate (Caller) ──────────────────────────────────────────────────────
    case "kate.call_started": {
      if (lead_id) updateLeadStage(lead_id, "calling");
      break;
    }
    case "kate.field_extracted": {
      if (!lead_id) break;
      const lead = getLeadById(lead_id);
      if (!lead) break;
      const field = String(meta?.field ?? "");
      const value = meta?.value;
      updateLeadStage(lead_id, lead.stage, {
        envelope: { ...(lead.envelope ?? {}), [field]: value } as never,
      });
      break;
    }
    case "kate.opt_in_detected": {
      if (lead_id) updateLeadStage(lead_id, "calling", { optIn: true });
      break;
    }
    case "kate.call_ended": {
      if (!lead_id || !meta) break;
      const outcome = meta.outcome as string;
      const envelope = meta.envelope as Partial<Envelope> | undefined;
      if (outcome === "opted_in") {
        updateLeadStage(lead_id, "qualified", { optIn: true, ...(envelope ? { envelope } : {}) });
      } else if (outcome === "opted_out") {
        updateLeadStage(lead_id, "signal", { optIn: false, ...(envelope ? { envelope } : {}) });
      } else if (outcome === "escalated") {
        const lead = getLeadById(lead_id);
        if (lead) updateLeadStage(lead_id, lead.stage, { escalated: true, escalationReason: String(meta.reason ?? ""), ...(envelope ? { envelope } : {}) });
      }
      break;
    }
    case "kate.offer_dispatched": {
      if (lead_id) updateLeadStage(lead_id, "offered");
      break;
    }
    case "kate.deal_closed": {
      if (lead_id) updateLeadStage(lead_id, "dnc");
      break;
    }
    case "kate.escalated": {
      if (!lead_id) break;
      const lead = getLeadById(lead_id);
      if (lead) updateLeadStage(lead_id, lead.stage, { escalated: true, escalationReason: String(meta?.reason ?? "") });
      break;
    }

    // ── Otto (Closer) ──────────────────────────────────────────────────────
    case "otto.offer_ready": {
      if (lead_id) updateLeadStage(lead_id, "qualified");
      break;
    }
    case "otto.held_for_review": {
      if (!lead_id) break;
      const lead = getLeadById(lead_id);
      if (lead) updateLeadStage(lead_id, lead.stage, { escalated: true, escalationReason: String(meta?.reason ?? "hold_for_review") });
      break;
    }

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
