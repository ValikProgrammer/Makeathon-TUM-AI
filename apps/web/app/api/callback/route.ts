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
import { getLeadById, getLeadByPhone, updateLeadStage, appendAudit, type Lead, type Stage } from "@/lib/db";

const OTTO_WEBHOOK = process.env.HAPPYROBOT_OTTO_WEBHOOK_URL ?? "";
const OTTO_API_KEY = process.env.OTTO_API_KEY ?? "";
const HAPPYROBOT_API_KEY = process.env.HAPPYROBOT_API_KEY ?? "";
const EVENTS_URL = process.env.EVENTS_URL ?? "";

// HappyRobot probes the URL with GET before sending data
export function GET() {
  return NextResponse.json({ ok: true, endpoint: "callback" });
}

export async function POST(req: NextRequest) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📞 [POST /api/callback] — Kate (Caller) call-ended webhook");
  console.log("   Purpose: receives Kate's call result → updates lead → triggers Otto");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const body = await req.json().catch(() => null);
  if (!body) {
    console.log("❌ [/api/callback] 400 — NOT CONNECTED: request body is not valid JSON");
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  console.log("📥 [/api/callback] Body received:", JSON.stringify(body, null, 2));

  // Try every possible ID field HappyRobot might send
  const raw_id: string = body.contact_id ?? body.lead_id ?? body.id ?? body.user_id ?? "";
  console.log(`🔍 [/api/callback] Looking up lead: contact_id="${body.contact_id}" | lead_id="${body.lead_id}" | to="${body.to}"`);
  console.log(`📋 [/api/callback] Full body keys: ${Object.keys(body).join(", ")}`);

  // 1. By explicit ID   2. By phone number   3. By email
  const lead = (raw_id ? await getLeadById(raw_id) : undefined)
    ?? await getLeadByPhone(body.to ?? "")
    ?? await getLeadByPhone(body.phone ?? "");

  if (!lead) {
    // Return 200 so HappyRobot doesn't retry — log for debugging
    console.log(`⚠️  [/api/callback] Lead not found — raw_id="${raw_id}", to="${body.to}". Returning 200 to stop retries.`);
    return NextResponse.json({ ok: false, error: "lead not found", received_id: raw_id, received_to: body.to });
  }
  console.log(`✅ [/api/callback] Lead found: id="${lead.id}", company="${lead.company_name}", current stage="${lead.stage}"`);

  // Always use the DB lead's actual ID (phone fallback may have resolved it)
  const lead_id = lead.id;

  // Unwrap extracted JSON blob if present
  let extracted: Record<string, unknown> = {};
  if (body.extracted && typeof body.extracted === "string") {
    try {
      const raw = body.extracted.trim().replace(/^```json|^```|```$/g, "").trim();
      extracted = JSON.parse(raw);
      console.log("📦 [/api/callback] Unpacked 'extracted' JSON blob from HappyRobot");
    } catch {
      console.log("⚠️  [/api/callback] Could not parse 'extracted' — skipping");
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

  console.log(`📊 [/api/callback] Call results:`);
  console.log(`   opt_in=${optIn} | call_outcome="${callOutcome}" | escalate=${escalate}`);
  console.log(`   bundles → leader=${bundleLeader}, profi=${bundleProfi}, top_feature=${bundleTopFeature} (total units=${numUnits})`);
  console.log(`   channel="${m.preferred_channel}" | contact_address="${m.contact_address}"`);

  // Map call outcome → pipeline stage
  let nextStage: Stage = lead.stage;
  if (callOutcome === "homologation_fail") nextStage = "homologation_fail";
  else if (escalate || escalationReason) nextStage = "escalated";
  else if (optIn) nextStage = "qualified";
  else nextStage = "not_interested";

  console.log(`🔀 [/api/callback] Stage transition: "${lead.stage}" → "${nextStage}"`);

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
  console.log(`📝 [/api/callback] Audit entry "kate.call_ended" saved`);

  await updateLeadStage(lead_id, nextStage, patch);
  console.log(`💾 [/api/callback] Lead "${lead_id}" updated in DB. New stage: "${nextStage}"`);

  // Fire Otto if prospect opted in and passed homologation
  if (optIn && callOutcome === "qualified") {
    if (OTTO_WEBHOOK) {
      const ottoPayload = { lead_id };

      console.log(`🚀 [/api/callback] opt_in=true + outcome=qualified → firing Otto`);
      console.log(`   → POST ${OTTO_WEBHOOK}`);
      console.log(`   → Header x-api-key present: ${!!OTTO_API_KEY}`);
      console.log(`   → Body:`, JSON.stringify(ottoPayload));

      fetch(OTTO_WEBHOOK, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(OTTO_API_KEY ? { "x-api-key": OTTO_API_KEY } : {}),
        },
        body: JSON.stringify(ottoPayload),
      }).then(async (r) => {
        console.log(`   Otto responded: ${r.status} ${r.statusText}`);
        if (!r.ok) console.log(`   ⚠️  Otto returned error: ${await r.text()}`);
        else console.log(`   ✅ Otto accepted the task for lead "${lead_id}"`);
      }).catch((err) => {
        console.log(`   ❌ Otto unreachable (network error): ${err?.message ?? err}`);
      });

      appendAudit({
        timestamp: new Date().toISOString(),
        agent: "orchestrator",
        event: "orchestrator.otto_triggered",
        leadId: lead_id,
        meta: { reason: "opt_in=true after Kate call" },
      });
    } else {
      console.log(`⚠️  [/api/callback] opt_in=true but HAPPYROBOT_OTTO_WEBHOOK_URL is not set → Otto NOT fired`);
    }
  } else {
    console.log(`ℹ️  [/api/callback] Otto not triggered: opt_in=${optIn}, outcome="${callOutcome}"`);
  }

  console.log(`✅ [/api/callback] Done. Response: { ok: true, lead_id: "${lead_id}", stage: "${nextStage}", opt_in: ${optIn} }`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  return NextResponse.json({ ok: true, lead_id, stage: nextStage, opt_in: optIn });
}
