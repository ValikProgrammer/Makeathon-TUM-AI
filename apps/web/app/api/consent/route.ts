/**
 * POST /api/consent
 *
 * Called from the landing page (public/l.html) when the prospect submits
 * phone + consent checkbox. This is the moment the prospect opts in —
 * UWG §7 is satisfied because the prospect initiates.
 *
 * Body: { lead_id, phone, consent_text_version, motivation? }
 *
 * Side effects:
 *   - Writes person_phone, consent_given_at, consent_text_version, consent_ip
 *     on the leads row (stage stays "new"; only person_phone unlocks the
 *     "Qualify now" button in the cockpit).
 *   - Writes an audit entry `lead.consent_given`.
 *   - Optionally updates motivation_string if the LP submitted a different
 *     motivation than what was stored (user clicked the demo switcher).
 */
import { NextRequest, NextResponse } from "next/server";
import { getLeadById, updateLead, appendAudit, type MotivationString } from "@/lib/db";

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const lead_id = String(body.lead_id ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const consent_text_version = String(body.consent_text_version ?? "v1.0");
  const motivation = body.motivation as MotivationString | undefined;

  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });
  // Very loose phone check — HR does the real validation at dial time
  if (!/^\+?[\d\s().\-/]{6,25}$/.test(phone)) {
    return NextResponse.json({ error: "phone looks malformed" }, { status: 400 });
  }

  const lead = getLeadById(lead_id);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  const now = new Date().toISOString();
  const ip = clientIp(req);

  const patch = {
    person_phone: phone,
    consent_given_at: now,
    consent_text_version,
    consent_ip: ip,
    // Only overwrite motivation if the LP explicitly sent one and it's valid
    ...(motivation && ["simplify", "scale", "optimize", "circular"].includes(motivation)
      ? { motivation_string: motivation as MotivationString }
      : {}),
  };
  updateLead(lead_id, patch);

  const reference = `REF-${Date.now().toString(36).toUpperCase()}`;
  appendAudit({
    timestamp: now,
    agent: "orchestrator",
    event: "lead.consent_given",
    leadId: lead_id,
    meta: { reference, consent_text_version, ip, motivation: patch.motivation_string ?? lead.motivation_string },
  });

  return NextResponse.json({ ok: true, lead_id, reference });
}
