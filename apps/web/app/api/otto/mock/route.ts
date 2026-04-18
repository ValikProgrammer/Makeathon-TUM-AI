/**
 * POST /api/otto/mock
 * Simulates Otto offer generation when HAPPYROBOT_OTTO_WEBHOOK_URL is not set.
 * Computes totals from bundle mix, moves lead to "offered", fires the events endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { getLeadById, updateLeadStage, appendAudit, BUNDLE_MONTHLY_EUR, monthlyRate, totalContractValue } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { lead_id } = await req.json().catch(() => ({}));
  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const lead = await getLeadById(lead_id);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  const monthly = monthlyRate(lead);
  const total = totalContractValue(lead);

  await updateLeadStage(lead_id, "offered", { offer_sent_at: new Date().toISOString() });

  appendAudit({
    timestamp: new Date().toISOString(),
    agent: "closer",
    event: "otto.offer_ready",
    leadId: lead_id,
    meta: { monthly, total, mock: true },
  });

  console.log(`[Otto mock] Offer sent for ${lead_id} — €${monthly}/mo, €${total} total`);

  return NextResponse.json({ ok: true, lead_id, monthly, total, stage: "offered" });
}
