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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Offer accepted · lease·a·kitchen</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #f1f5f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: white; border-radius: 12px; padding: 56px 48px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 8px 30px rgba(15,23,42,.08); }
  .icon { font-size: 48px; margin-bottom: 24px; }
  h1 { font-size: 24px; font-weight: 700; color: #0F172A; margin-bottom: 12px; letter-spacing: -0.02em; }
  p { font-size: 15px; color: #64748B; line-height: 1.6; margin-bottom: 8px; }
  .ref { margin-top: 32px; font-size: 12px; color: #94A3B8; font-family: monospace; }
  .brand { margin-top: 40px; font-size: 12px; color: #94A3B8; }
  .brand strong { color: #115E59; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">✅</div>
  <h1>Thank you, ${lead.person_name ?? ""}!</h1>
  <p>Your proposal for <strong>${lead.company_name}</strong> has been accepted.</p>
  <p>Our team will be in touch within one business day to confirm next steps.</p>
  <div class="ref">Ref: ${lead_id}</div>
  <div class="brand">operated by <strong>lease·a·kitchen</strong> · orgaloom GmbH · Munich</div>
</div>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
