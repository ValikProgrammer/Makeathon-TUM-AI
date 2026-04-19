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
  const profi  = lead.bundle_profi  ?? 0;
  const top    = lead.bundle_top_feature ?? 0;
  const term   = lead.preferred_term_months ?? 60;
  const monthly = monthlyRate(lead);
  const total   = totalContractValue(lead);

  const fmt = (n: number) => n.toLocaleString("de-DE");
  const now = new Date();
  const validUntil = new Date(now); validUntil.setDate(validUntil.getDate() + 14);
  const dateStr = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  // Build table rows — skip zero-unit bundles
  const rowHtml = (name: string, sub: string, sku: string, qty: number, unit: number) =>
    `<tr><td><div class="product-name">${name}</div><div class="product-cat">${sub} · <span class="sku">${sku}</span></div></td><td class="num">${qty}</td><td class="num">${unit} €</td><td class="num">${fmt(qty * unit)} €</td></tr>`;

  const lineRows: string[] = [];
  if (leader > 0) lineRows.push(rowHtml("Leader bundle", "Bosch Serie 2–4", "LAK-LEADER", leader, BUNDLE_MONTHLY_EUR.leader));
  if (profi  > 0) lineRows.push(rowHtml("Profi bundle",  "Bosch Serie 4–6", "LAK-PROFI",  profi,  BUNDLE_MONTHLY_EUR.profi));
  if (top    > 0) lineRows.push(rowHtml("Top Feature bundle", "Bosch Serie 6–8", "LAK-TOP", top,  BUNDLE_MONTHLY_EUR.top_feature));
  if (lineRows.length === 0) lineRows.push(`<tr><td colspan="4" style="color:#888;padding:14px 12px">Bundle mix to be confirmed</td></tr>`);

  const tokens: Record<string, string> = {
    issued_date:             dateStr(now),
    valid_until:             dateStr(validUntil),
    offer_id:                `OFFER-${id}`,
    contact_name:            lead.person_name ?? "there",
    company:                 lead.company_name,
    recipient_address_line:  lead.city ?? lead.postal_address ?? "",
    delivery_location:       lead.city ?? lead.postal_address ?? "Germany",
    delivery_date:           "Upon agreement",
    term_months:             String(term),
    line_rows:               lineRows.join("\n"),
    total_eur_month:         fmt(monthly),
    total_contract_value_eur: fmt(total),
    accept_url:              `${APP_URL}/api/purchase?id=${id}`,
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
