/**
 * POST /api/events
 * HappyRobot webhook receiver. All three agents post here.
 */
import { NextRequest, NextResponse } from "next/server";
import { appendAudit, updateLeadStage, getLeadById, upsertLead, type Lead, type MotivationString, type Stage } from "@/lib/db";

export async function POST(req: NextRequest) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📡 [POST /api/events] — HappyRobot event receiver (all agents)");
  console.log("   Purpose: receives Scout/Kate/Otto events and updates Twin pipeline");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const body = await req.json().catch(() => null);
  if (!body || !body.event) {
    console.log("❌ [/api/events] 400 — NOT CONNECTED: missing 'event' field");
    console.log("   Body received:", JSON.stringify(body));
    console.log("   Expected: { event: 'scout.*' | 'kate.*' | 'otto.*', lead_id?, meta? }");
    return NextResponse.json({ error: "missing event field", received: body }, { status: 400 });
  }

  const { event, lead_id, meta } = body as {
    event: string;
    lead_id?: string;
    meta?: Record<string, unknown>;
  };

  const agent = agentFromEvent(event);
  console.log(`📥 [/api/events] Event: "${event}" | agent: ${agent} | lead_id: "${lead_id ?? "—"}"`);
  if (meta) console.log(`   meta:`, JSON.stringify(meta));

  appendAudit({ timestamp: new Date().toISOString(), agent, event, leadId: lead_id, meta });
  console.log(`📝 [/api/events] Audit entry saved`);

  switch (event) {
    // ── Jack (Scout) ───────────────────────────────────────────────────────
    case "scout.lead_candidate_created": {
      if (!meta) { console.log("⚠️  [/api/events] scout.lead_candidate_created — no meta, skipping"); break; }
      const newId = lead_id ?? `L-${Date.now()}`;
      console.log(`🔭 [/api/events] Scout found a new candidate → upsert lead "${newId}": ${meta.company_name ?? meta.org}`);
      await upsertLead({
        id: newId,
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
        person_phone: meta.person_phone ? String(meta.person_phone) : undefined,
        signal_url: meta.signal_url ? String(meta.signal_url) : undefined,
        signal_summary: meta.signal_summary ? String(meta.signal_summary) : undefined,
        motivation_string: meta.motivation_string as MotivationString | undefined,
        score: meta.score !== undefined ? Number(meta.score) : undefined,
      });
      console.log(`✅ [/api/events] Lead "${newId}" upserted to Twin (stage: new)`);
      break;
    }

    // ── Kate (Caller) ──────────────────────────────────────────────────────
    case "kate.call_started":
      console.log(`📞 [/api/events] Kate started call for lead "${lead_id}" — stage unchanged`);
      break;

    case "kate.field_extracted": {
      if (!lead_id) { console.log("⚠️  [/api/events] kate.field_extracted — no lead_id, skipping"); break; }
      const field = String(meta?.field ?? "");
      const value = meta?.value;
      if (!field) { console.log("⚠️  [/api/events] kate.field_extracted — no field, skipping"); break; }
      const allowed: (keyof Lead)[] = [
        "facility_type", "num_units", "timeline", "preferred_term_months", "decision_maker",
        "bundle_leader", "bundle_profi", "bundle_top_feature", "preferred_channel", "contact_address", "call_notes",
      ];
      if (allowed.includes(field as keyof Lead)) {
        console.log(`✏️  [/api/events] Kate extracted field "${field}" = ${JSON.stringify(value)} for lead "${lead_id}"`);
        const existing = await getLeadById(lead_id);
        await updateLeadStage(lead_id, existing?.stage ?? "new", { [field]: value } as Partial<Lead>);
      } else {
        console.log(`⚠️  [/api/events] Field "${field}" is not Kate-writable — ignoring`);
      }
      break;
    }

    case "kate.opt_in_detected":
      if (lead_id) {
        console.log(`🙋 [/api/events] Kate detected opt-in for lead "${lead_id}" → stage: qualified`);
        await updateLeadStage(lead_id, "qualified", { opt_in: true });
      }
      break;

    case "kate.call_ended": {
      if (!lead_id || !meta) { console.log("⚠️  [/api/events] kate.call_ended — no lead_id or meta, skipping"); break; }
      const outcome = String(meta.outcome ?? meta.call_outcome ?? "");
      const existing = await getLeadById(lead_id);
      let nextStage: Stage = existing?.stage ?? "new";
      if (outcome === "opted_in" || outcome === "qualified") nextStage = "qualified";
      else if (outcome === "opted_out" || outcome === "not_interested") nextStage = "not_interested";
      else if (outcome === "homologation_fail") nextStage = "homologation_fail";
      else if (outcome === "escalated") nextStage = "escalated";
      console.log(`📴 [/api/events] Call ended. outcome="${outcome}" → lead "${lead_id}" stage: "${nextStage}"`);
      await updateLeadStage(lead_id, nextStage);
      break;
    }

    case "kate.offer_dispatched":
      if (lead_id) {
        console.log(`📨 [/api/events] Kate dispatched offer to lead "${lead_id}" → stage: offered`);
        await updateLeadStage(lead_id, "offered");
      }
      break;

    case "kate.deal_closed":
      if (lead_id) {
        console.log(`🎉 [/api/events] Kate closed deal with lead "${lead_id}" → stage: accepted`);
        await updateLeadStage(lead_id, "accepted");
      }
      break;

    case "kate.escalated":
      if (lead_id) {
        console.log(`🚨 [/api/events] Kate escalated lead "${lead_id}" → stage: escalated. Reason: ${meta?.reason ?? "—"}`);
        await updateLeadStage(lead_id, "escalated", {
          escalation_reason: meta?.reason ? String(meta.reason) : undefined,
        });
      }
      break;

    // ── Otto (Closer) ──────────────────────────────────────────────────────
    case "otto.offer_ready":
      if (lead_id) {
        console.log(`📄 [/api/events] Otto prepared offer for lead "${lead_id}" → stage: offered`);
        await updateLeadStage(lead_id, "offered", { offer_sent_at: new Date().toISOString() });
      }
      break;

    case "otto.held_for_review":
      if (lead_id) {
        const reason = meta?.reason ? String(meta.reason) : "hold_for_review";
        console.log(`⏸️  [/api/events] Otto held lead "${lead_id}" for review → stage: escalated. Reason: ${reason}`);
        await updateLeadStage(lead_id, "escalated", { escalation_reason: reason });
      }
      break;

    default:
      console.log(`❓ [/api/events] Unknown event "${event}" — skipping (audit already saved)`);
      break;
  }

  console.log(`✅ [/api/events] Event "${event}" handled successfully`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  return NextResponse.json({ ok: true, event });
}

function agentFromEvent(event: string): "scout" | "caller" | "closer" | "guardrail" | "orchestrator" {
  if (event.startsWith("scout.")) return "scout";
  if (event.startsWith("kate.")) return "caller";
  if (event.startsWith("otto.")) return "closer";
  if (event.startsWith("guardrail.")) return "guardrail";
  return "orchestrator";
}
