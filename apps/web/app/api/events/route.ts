/**
 * POST /api/events
 * HappyRobot webhook receiver. All three agents post here.
 */
import { NextRequest, NextResponse } from "next/server";
import { appendAudit, updateLeadStage, getLeadById, upsertLead, type Lead, type MotivationString, type Stage } from "@/lib/db";

const TWIN_KEY = process.env.TWIN_API_KEY ?? process.env.HAPPYROBOT_API_KEY ?? "";

async function safeUpdate(
  label: string,
  lead_id: string,
  stage: Stage,
  extra?: Partial<Lead>,
): Promise<{ ok: boolean; warning?: string }> {
  if (!TWIN_KEY) {
    const msg = `TWIN_API_KEY not set — cannot update lead "${lead_id}" to stage "${stage}"`;
    console.error(`❌ [/api/events] ${msg}`);
    return { ok: false, warning: msg };
  }
  const result = await updateLeadStage(lead_id, stage, extra);
  if (!result) {
    const msg = `Twin DB update failed for lead "${lead_id}" → stage "${stage}" (${label})`;
    console.error(`❌ [/api/events] ${msg}`);
    return { ok: false, warning: msg };
  }
  console.log(`✅ [/api/events] ${label} — lead "${lead_id}" → stage "${stage}" saved to Twin`);
  return { ok: true };
}

export async function POST(req: NextRequest) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📡 [POST /api/events] — HappyRobot event receiver");
  console.log(`   TWIN_API_KEY present: ${TWIN_KEY ? "YES ✅" : "NO ❌ — DB writes will fail!"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const body = await req.json().catch(() => null);
  if (!body || !body.event) {
    console.log("❌ [/api/events] 400 — missing 'event' field");
    console.log("   Body received:", JSON.stringify(body));
    return NextResponse.json({ error: "missing event field", received: body }, { status: 400 });
  }

  const { event, lead_id, meta } = body as {
    event: string;
    lead_id?: string;
    meta?: Record<string, unknown>;
  };

  const agent = agentFromEvent(event);
  console.log(`📥 [/api/events] event="${event}" | agent=${agent} | lead_id="${lead_id ?? "—"}"`);
  if (meta) console.log(`   meta: ${JSON.stringify(meta)}`);

  appendAudit({ timestamp: new Date().toISOString(), agent, event, leadId: lead_id, meta });

  const warnings: string[] = [];

  switch (event) {
    // ── Jack (Scout) ───────────────────────────────────────────────────────
    case "scout.lead_candidate_created": {
      if (!meta) { console.log("⚠️  no meta — skipping"); break; }
      const newId = lead_id ?? `L-${Date.now()}`;
      console.log(`🔭 Scout → upsert lead "${newId}": ${meta.company_name ?? meta.org}`);
      const r = await upsertLead({
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
      if (!r) warnings.push(`upsert failed for lead "${newId}"`);
      else console.log(`✅ Lead "${newId}" upserted`);
      break;
    }

    // ── Kate (Caller) ──────────────────────────────────────────────────────
    case "kate.call_started":
      console.log(`📞 Kate started call for lead "${lead_id}" — no stage change`);
      break;

    case "kate.field_extracted": {
      if (!lead_id) { warnings.push("kate.field_extracted — no lead_id"); break; }
      const field = String(meta?.field ?? "");
      const value = meta?.value;
      if (!field) { warnings.push("kate.field_extracted — no field name"); break; }
      const allowed: (keyof Lead)[] = [
        "facility_type", "num_units", "timeline", "preferred_term_months", "decision_maker",
        "bundle_leader", "bundle_profi", "bundle_top_feature", "preferred_channel", "contact_address", "call_notes",
      ];
      if (allowed.includes(field as keyof Lead)) {
        console.log(`✏️  Kate extracted "${field}" = ${JSON.stringify(value)} for lead "${lead_id}"`);
        const existing = await getLeadById(lead_id);
        const r = await updateLeadStage(lead_id, existing?.stage ?? "new", { [field]: value } as Partial<Lead>);
        if (!r) warnings.push(`field_extracted: Twin update failed for field "${field}" on lead "${lead_id}"`);
      } else {
        warnings.push(`field "${field}" not in Kate-writable allowlist — ignored`);
        console.log(`⚠️  Field "${field}" not Kate-writable`);
      }
      break;
    }

    case "kate.opt_in_detected":
      if (!lead_id) { warnings.push("kate.opt_in_detected — no lead_id"); break; }
      { const r = await safeUpdate("kate.opt_in_detected", lead_id, "qualified", { opt_in: true });
        if (!r.ok && r.warning) warnings.push(r.warning); }
      break;

    case "kate.call_ended": {
      if (!lead_id || !meta) { warnings.push("kate.call_ended — missing lead_id or meta"); break; }
      const outcome = String(meta.outcome ?? meta.call_outcome ?? "");
      const existing = await getLeadById(lead_id);
      let nextStage: Stage = existing?.stage ?? "new";
      if (outcome === "opted_in" || outcome === "qualified") nextStage = "qualified";
      else if (outcome === "opted_out" || outcome === "not_interested") nextStage = "not_interested";
      else if (outcome === "homologation_fail") nextStage = "homologation_fail";
      else if (outcome === "escalated") nextStage = "escalated";
      console.log(`📴 Call ended. outcome="${outcome}" → nextStage="${nextStage}"`);
      const r = await safeUpdate("kate.call_ended", lead_id, nextStage);
      if (!r.ok && r.warning) warnings.push(r.warning);
      break;
    }

    case "kate.offer_dispatched": {
      if (!lead_id) { warnings.push("kate.offer_dispatched — no lead_id"); break; }
      const r = await safeUpdate("kate.offer_dispatched", lead_id, "offered");
      if (!r.ok && r.warning) warnings.push(r.warning);
      break;
    }

    case "kate.deal_closed": {
      if (!lead_id) { warnings.push("kate.deal_closed — no lead_id"); break; }
      const r = await safeUpdate("kate.deal_closed", lead_id, "accepted");
      if (!r.ok && r.warning) warnings.push(r.warning);
      break;
    }

    case "kate.escalated": {
      if (!lead_id) { warnings.push("kate.escalated — no lead_id"); break; }
      const r = await safeUpdate("kate.escalated", lead_id, "escalated", {
        escalation_reason: meta?.reason ? String(meta.reason) : undefined,
      });
      if (!r.ok && r.warning) warnings.push(r.warning);
      break;
    }

    // ── Otto (Closer) ──────────────────────────────────────────────────────
    case "otto.offer_ready": {
      if (!lead_id) { warnings.push("otto.offer_ready — no lead_id"); break; }
      const r = await safeUpdate("otto.offer_ready", lead_id, "offered", { offer_sent_at: new Date().toISOString() });
      if (!r.ok && r.warning) warnings.push(r.warning);
      break;
    }

    case "otto.held_for_review": {
      if (!lead_id) { warnings.push("otto.held_for_review — no lead_id"); break; }
      const reason = meta?.reason ? String(meta.reason) : "hold_for_review";
      const r = await safeUpdate("otto.held_for_review", lead_id, "escalated", { escalation_reason: reason });
      if (!r.ok && r.warning) warnings.push(r.warning);
      break;
    }

    default:
      console.log(`❓ Unknown event "${event}" — skipping`);
      break;
  }

  if (warnings.length > 0) {
    console.warn(`⚠️  [/api/events] Completed with warnings:`, warnings);
  }
  console.log(`━━━ done: event="${event}" warnings=${warnings.length} ━━━\n`);

  return NextResponse.json({
    ok: warnings.length === 0,
    event,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

function agentFromEvent(event: string): "scout" | "caller" | "closer" | "guardrail" | "orchestrator" {
  if (event.startsWith("scout.")) return "scout";
  if (event.startsWith("kate.")) return "caller";
  if (event.startsWith("otto.")) return "closer";
  if (event.startsWith("guardrail.")) return "guardrail";
  return "orchestrator";
}
