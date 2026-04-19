/**
 * POST /api/purchase
 * Called when a prospect accepts the offer (clicks "Accept" in the offer email).
 *
 * Body: { lead_id: string }
 *
 * Sets stage → "accepted", records offer_accepted_at.
 */
import { NextRequest, NextResponse } from "next/server";
import { getLeadById, updateLeadStage, appendAudit } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const lead_id: string = body?.lead_id ?? "";

  if (!lead_id) {
    return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  }

  const lead = await getLeadById(lead_id);
  if (!lead) {
    return NextResponse.json({ error: "lead not found" }, { status: 404 });
  }

  await updateLeadStage(lead_id, "accepted", {
    offer_accepted_at: new Date().toISOString(),
  });

  appendAudit({
    timestamp: new Date().toISOString(),
    agent:     "closer",
    event:     "otto.offer_accepted",
    leadId:    lead_id,
    meta:      { company: lead.company_name, city: lead.city },
  });

  console.log(`[/api/purchase] lead="${lead_id}" → accepted`);
  return NextResponse.json({ ok: true, lead_id, stage: "accepted" });
}

// GET for accept-link in offer email: /api/purchase?id=L-V1
export async function GET(req: NextRequest) {
  const lead_id = req.nextUrl.searchParams.get("id") ?? "";

  if (!lead_id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const lead = await getLeadById(lead_id);
  if (!lead) {
    return NextResponse.json({ error: "lead not found" }, { status: 404 });
  }

  await updateLeadStage(lead_id, "accepted", {
    offer_accepted_at: new Date().toISOString(),
  });

  appendAudit({
    timestamp: new Date().toISOString(),
    agent:     "closer",
    event:     "otto.offer_accepted",
    leadId:    lead_id,
    meta:      { company: lead.company_name, triggered_by: "accept_link" },
  });

  console.log(`[/api/purchase] GET lead="${lead_id}" → accepted`);

  // Redirect to a thank-you page (landing page with confirmation param)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const redirect = appUrl
    ? `${appUrl}/api/l?id=${lead_id}&accepted=1`
    : `/api/l?id=${lead_id}&accepted=1`;

  return NextResponse.redirect(redirect, 302);
}
