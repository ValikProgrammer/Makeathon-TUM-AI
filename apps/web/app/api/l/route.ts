/**
 * GET /api/l?id=L-V1
 * One landing page for all leads.
 * Reads lead from DB by ?id=, substitutes {{tokens}} in public/l.html, returns HTML.
 * Falls back to generic copy if id is missing or DB is unreachable.
 */
import { NextRequest, NextResponse } from "next/server";
import { getLeadById } from "@/lib/db";
import fs from "fs";
import path from "path";

const BENEFIT: Record<string, string> = {
  simplify: "simpler service for your team",
  scale:    "capex-free appliances as you grow",
  optimize: "predictable monthly OpEx instead of big refresh cycles",
  circular: "certified circular appliances for your sustainability report",
};

const ALLOWED_HOOKS = ["simplify", "scale", "optimize", "circular"];

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";

  // 4 s timeout so a dead Twin API doesn't hang the page
  const lead = id
    ? await Promise.race([
        getLeadById(id),
        new Promise<undefined>((res) => setTimeout(() => res(undefined), 4000)),
      ])
    : undefined;

  const motivation = ALLOWED_HOOKS.includes(lead?.motivation_string ?? "")
    ? (lead!.motivation_string as string)
    : "simplify";

  const name    = lead?.person_name   ?? "there";
  const company = lead?.company_name  ?? "your organisation";
  const units   = String(lead?.num_units ?? 120);
  const signal  = lead?.signal_summary ?? "your recent public announcement";
  const phone   = lead?.person_phone  ?? "";

  const templatePath = path.join(process.cwd(), "public", "l.html");
  let html: string;
  try {
    html = fs.readFileSync(templatePath, "utf-8");
  } catch {
    return new NextResponse("Landing page template not found", { status: 500 });
  }

  // Set correct data-hook on <body>
  html = html.replace(
    /(<body[^>]*data-hook=")[^"]*(")/,
    `$1${motivation}$2`,
  );

  // Encode company for the mailto href, plain text everywhere else
  html = html.replace(
    /href="mailto:[^"]*\{\{company\}\}[^"]*"/g,
    (m) => m.replaceAll("{{company}}", encodeURIComponent(company)),
  );

  html = html
    .replaceAll("{{contact_name}}",       name)
    .replaceAll("{{company}}",            company)
    .replaceAll("{{units}}",              units)
    .replaceAll("{{signal_summary}}",     signal)
    .replaceAll("{{hook_short_benefit}}", BENEFIT[motivation] ?? "")
    .replaceAll("{{phone_hint}}",         phone)
    .replaceAll("{{lead_id}}",            id);

  // Stop client-side JS from overriding data-hook and title (already resolved server-side)
  html = html
    .replace(
      /document\.body\.dataset\.hook\s*=\s*ALLOWED\.includes\(motivation\)[^;]+;/,
      `// motivation resolved server-side`,
    )
    .replace(
      /document\.title\s*=\s*name\s*\+[^;]+;/,
      `// title set server-side`,
    );

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
