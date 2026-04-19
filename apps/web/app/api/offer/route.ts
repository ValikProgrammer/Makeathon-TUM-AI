/**
 * GET /api/offer?id=LEAD_ID
 * Returns a rendered HTML email body for Otto to send via Outlook.
 * No AI — just variable substitution into public/offer-email.html
 *
 * Otto workflow: HTTP GET this URL → use response body as Outlook Body field.
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getLeadById, BUNDLE_MONTHLY_EUR, monthlyRate, totalContractValue } from "@/lib/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://makeathontumai.vercel.app";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  console.log(`[GET /api/offer] id="${id}"`);

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const lead = await getLeadById(id);
  if (!lead) {
    console.error(`[GET /api/offer] lead "${id}" not found`);
    return NextResponse.json({ error: "lead not found" }, { status: 404 });
  }

  const leader = lead.bundle_leader ?? 0;
  const profi = lead.bundle_profi ?? 0;
  const top = lead.bundle_top_feature ?? 0;
  const term = lead.preferred_term_months ?? 60;
  const monthly = monthlyRate(lead);
  const total = totalContractValue(lead);

  // Build bundle rows — skip zero-unit bundles
  const rows: string[] = [];
  if (leader > 0) rows.push(`<tr><td>Leader (Bosch Serie 2–4) × ${leader} units</td><td>€${(leader * BUNDLE_MONTHLY_EUR.leader).toLocaleString("de-DE")}/mo</td></tr>`);
  if (profi > 0)  rows.push(`<tr><td>Profi (Bosch Serie 4–6) × ${profi} units</td><td>€${(profi * BUNDLE_MONTHLY_EUR.profi).toLocaleString("de-DE")}/mo</td></tr>`);
  if (top > 0)    rows.push(`<tr><td>Top Feature (Bosch Serie 6–8) × ${top} units</td><td>€${(top * BUNDLE_MONTHLY_EUR.top_feature).toLocaleString("de-DE")}/mo</td></tr>`);
  if (rows.length === 0) rows.push(`<tr><td colspan="2" style="color:#888">Bundle mix to be confirmed</td></tr>`);

  const tokens: Record<string, string> = {
    contact_name:  lead.person_name  ?? "there",
    company_name:  lead.company_name,
    bundle_rows:   rows.join("\n"),
    term_months:   String(term),
    monthly_rate:  monthly.toLocaleString("de-DE"),
    total_value:   total.toLocaleString("de-DE"),
    purchase_url:  `${APP_URL}/api/purchase?id=${id}`,
    lead_id:       id,
  };

  const templatePath = path.join(process.cwd(), "public", "offer-email.html");
  let html = fs.readFileSync(templatePath, "utf-8");
  for (const [key, val] of Object.entries(tokens)) {
    html = html.replaceAll(`{{${key}}}`, val);
  }

  console.log(`[GET /api/offer] rendered for "${id}" — monthly €${monthly}, total €${total}`);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
