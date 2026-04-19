/**
 * GET /api/debug
 * Shows env var status + tests Twin DB connection live.
 * DELETE THIS before going to production.
 */
import { NextResponse } from "next/server";

const TWIN_BASE = "https://platform.eu.happyrobot.ai/api/v2";
const TWIN_TABLE = "leads_untor";

function mask(val: string | undefined): string {
  if (!val) return "❌ NOT SET";
  if (val.length <= 8) return "***";
  return val.slice(0, 6) + "…" + val.slice(-4);
}

export async function GET() {
  const twinKey = process.env.TWIN_API_KEY ?? "";
  const hrKey = process.env.HAPPYROBOT_API_KEY ?? "";
  const effectiveKey = twinKey || hrKey;

  // Test Twin GET
  let twinGetStatus = "—";
  let twinGetRows = 0;
  try {
    const r = await fetch(`${TWIN_BASE}/twin/tables/${TWIN_TABLE}?limit=1`, {
      headers: { Authorization: `Bearer ${effectiveKey}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
    twinGetStatus = `${r.status} ${r.statusText}`;
    if (r.ok) {
      const d = await r.json() as { rows?: unknown[] };
      twinGetRows = d.rows?.length ?? 0;
    } else {
      twinGetStatus += ` — ${await r.text()}`;
    }
  } catch (e: unknown) {
    twinGetStatus = `network error: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test Twin PATCH on L-3004
  let twinPatchStatus = "—";
  try {
    const r = await fetch(`${TWIN_BASE}/twin/tables/${TWIN_TABLE}/rows`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${effectiveKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ primaryKey: { id: "L-3004" }, updates: { updated_at: new Date().toISOString() } }),
    });
    twinPatchStatus = `${r.status} ${r.statusText}`;
    if (!r.ok) twinPatchStatus += ` — ${await r.text()}`;
  } catch (e: unknown) {
    twinPatchStatus = `network error: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json({
    env: {
      TWIN_API_KEY:                mask(twinKey),
      HAPPYROBOT_API_KEY:          mask(hrKey),
      effective_key_used:          mask(effectiveKey),
      HAPPYROBOT_CALLER_WEBHOOK_URL: process.env.HAPPYROBOT_CALLER_WEBHOOK_URL ? "SET ✅" : "❌ NOT SET",
      HAPPYROBOT_OTTO_WEBHOOK_URL:   process.env.HAPPYROBOT_OTTO_WEBHOOK_URL   ? "SET ✅" : "❌ NOT SET",
      NEXT_PUBLIC_APP_URL:           process.env.NEXT_PUBLIC_APP_URL ?? "❌ NOT SET",
      EVENTS_URL:                    process.env.EVENTS_URL ?? "❌ NOT SET",
    },
    twin_tests: {
      GET:   twinGetStatus,
      GET_rows_returned: twinGetRows,
      PATCH: twinPatchStatus,
    },
  });
}
