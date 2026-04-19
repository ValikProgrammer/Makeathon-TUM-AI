/**
 * db.ts — all lead reads/writes go to HappyRobot Twin (leads_untor table).
 * Audit log stays local (JSON file). DNC stays local (config file).
 */
import fs from "fs";
import path from "path";

// ── Twin config ────────────────────────────────────────────────────────────
const TWIN_BASE = "https://platform.eu.happyrobot.ai/api/v2";
const TWIN_TOKEN = process.env.TWIN_API_KEY ?? process.env.HAPPYROBOT_API_KEY ?? "";
const TWIN_TABLE = "leads_untor";

const DATA_DIR = path.join(process.cwd(), "data");
const AUDIT_FILE = path.join(DATA_DIR, "audit.json");
const DNC_FILE = path.join(process.cwd(), "../../config/dnc.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

const AUDIT_TABLE = process.env.TWIN_AUDIT_TABLE ?? "audit_untor";

// ── Types ──────────────────────────────────────────────────────────────────

export type Stage =
  | "new"
  | "qualified"
  | "homologation_fail"
  | "not_interested"
  | "escalated"
  | "offered"
  | "accepted"
  | "rejected"
  | "suppressed";

export type MotivationString = "simplify" | "scale" | "optimize" | "circular";

export type Lead = {
  // ── Actual DB columns (leads_untor) ──────────────────────────────────────
  id: string;
  stage: Stage;
  company_name: string;
  postal_address?: string; // combined address field in DB
  url?: string;
  person_name?: string;
  person_role?: string;
  person_email?: string;
  person_phone?: string;
  signal_url?: string;
  signal_summary?: string;
  motivation_string?: MotivationString;
  score?: number;
  num_units?: number;
  preferred_term_months?: number;
  bundle_leader?: number;
  bundle_profi?: number;
  bundle_top_feature?: number;

  // ── Virtual/display-only (not in DB — populated from postal_address) ───
  created_at?: string;
  updated_at?: string;
  city?: string;

  // ── Extra fields tracked locally / in audit only ──────────────────────
  street?: string;
  postal_code?: string;
  consent_given_at?: string;
  consent_text_version?: string;
  consent_ip?: string;
  facility_type?: string;
  timeline?: string;
  decision_maker?: string;
  opt_in?: boolean;
  preferred_channel?: "email" | "whatsapp" | "phone";
  contact_address?: string;
  call_transcript_url?: string;
  call_notes?: string;
  escalation_reason?: string;
  offer_sent_at?: string;
  offer_accepted_at?: string;
};

export type AuditEntry = {
  id: string;
  timestamp: string;
  agent: "scout" | "caller" | "closer" | "guardrail" | "orchestrator";
  event: string;
  leadId?: string;
  meta?: Record<string, unknown>;
};

// ── Twin helpers ───────────────────────────────────────────────────────────

// Exact columns that exist in leads_untor table — never send anything else in PATCH
const TWIN_COLUMNS = new Set([
  "id", "stage", "company_name", "postal_address", "url",
  "person_name", "person_role", "person_email", "person_phone",
  "signal_url", "signal_summary", "motivation_string",
  "score", "num_units", "preferred_term_months",
  "bundle_leader", "bundle_profi", "bundle_top_feature",
]);

/** Strip fields not in the DB schema before PATCH — unknown fields cause 400 */
function toDbFields(patch: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (TWIN_COLUMNS.has(k) && v !== undefined) filtered[k] = v;
    else if (!TWIN_COLUMNS.has(k)) console.log(`[Twin] skipping unknown field "${k}" (not in DB schema)`);
  }
  return filtered;
}

function twinHeaders() {
  return {
    "Authorization": `Bearer ${TWIN_TOKEN}`,
    "Content-Type": "application/json",
  };
}

/** Normalise a raw Twin row → Lead (nulls → undefined, coerce types) */
function rowToLead(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    stage: (row.stage as Stage) ?? "new",
    company_name: String(row.company_name ?? "Unknown"),
    // DB has postal_address (combined), map it to city for display
    city: row.postal_address != null ? String(row.postal_address) : undefined,
    url: row.url != null ? String(row.url) : undefined,
    person_name: row.person_name != null ? String(row.person_name) : undefined,
    person_role: row.person_role != null ? String(row.person_role) : undefined,
    person_email: row.person_email != null ? String(row.person_email) : undefined,
    person_phone: row.person_phone != null ? String(row.person_phone) : undefined,
    signal_url: row.signal_url != null ? String(row.signal_url) : undefined,
    signal_summary: row.signal_summary != null ? String(row.signal_summary) : undefined,
    motivation_string: row.motivation_string != null ? (row.motivation_string as MotivationString) : undefined,
    score: row.score != null ? Number(row.score) : undefined,
    num_units: row.num_units != null ? Number(row.num_units) : undefined,
    preferred_term_months: row.preferred_term_months != null ? Number(row.preferred_term_months) : undefined,
    bundle_leader: row.bundle_leader != null ? Number(row.bundle_leader) : undefined,
    bundle_profi: row.bundle_profi != null ? Number(row.bundle_profi) : undefined,
    bundle_top_feature: row.bundle_top_feature != null ? Number(row.bundle_top_feature) : undefined,
  };
}

// ── Lead CRUD (async — all go to Twin) ────────────────────────────────────

export async function getLeads(): Promise<Lead[]> {
  if (!TWIN_TOKEN) {
    console.error("[Twin] getLeads: TWIN_API_KEY is not set — returning empty list!");
    return [];
  }
  const res = await fetch(`${TWIN_BASE}/twin/tables/${TWIN_TABLE}?limit=500`, {
    headers: twinHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[Twin] getLeads failed: ${res.status} ${body}`);
    return [];
  }
  const data = await res.json() as { rows: Record<string, unknown>[] };
  console.log(`[Twin] getLeads ok: ${data.rows?.length ?? 0} rows`);
  return (data.rows ?? []).map(rowToLead);
}

export async function getLeadById(id: string): Promise<Lead | undefined> {
  const leads = await getLeads();
  return leads.find((l) => l.id === id);
}

export async function getLeadByPhone(phone: string): Promise<Lead | undefined> {
  if (!phone) return undefined;
  const normalized = phone.replace(/\s+/g, "");
  const leads = await getLeads();
  return leads.find((l) => l.person_phone?.replace(/\s+/g, "") === normalized);
}

export async function upsertLead(lead: Partial<Lead> & { id: string; company_name: string }): Promise<Lead> {
  const values = toDbFields(lead as Record<string, unknown>);

  // Try INSERT first (upsert via primary key)
  const res = await fetch(`${TWIN_BASE}/twin/tables/${TWIN_TABLE}/rows`, {
    method: "POST",
    headers: twinHeaders(),
    body: JSON.stringify({ values }),
  });

  if (res.ok) {
    const row = await res.json() as Record<string, unknown>;
    console.log(`[Twin] upsertLead INSERT ok: ${lead.id}`);
    return rowToLead(row);
  }

  // If insert fails (duplicate PK), fall back to PATCH
  const patchRes = await fetch(`${TWIN_BASE}/twin/tables/${TWIN_TABLE}/rows`, {
    method: "PATCH",
    headers: twinHeaders(),
    body: JSON.stringify({ primaryKey: { id: lead.id }, updates: values }),
  });
  if (!patchRes.ok) {
    console.error(`[Twin] upsertLead PATCH failed: ${patchRes.status} ${await patchRes.text()}`);
  } else {
    console.log(`[Twin] upsertLead PATCH ok: ${lead.id}`);
  }
  const existing = await getLeadById(lead.id);
  return existing ?? (lead as Lead);
}

export async function updateLead(id: string, patch: Partial<Lead>): Promise<Lead | null> {
  if (!TWIN_TOKEN) {
    console.error(`[Twin] updateLead: TWIN_API_KEY not set — cannot update lead "${id}"!`);
    return null;
  }
  // Filter to only columns that exist in the DB schema
  const updates = toDbFields(patch as Record<string, unknown>);
  if (Object.keys(updates).length === 0) {
    console.log(`[Twin] updateLead: no valid DB fields in patch for "${id}" — skipping`);
    return await getLeadById(id) ?? null;
  }
  console.log(`[Twin] updateLead "${id}": sending fields ${Object.keys(updates).join(", ")}`);
  const res = await fetch(`${TWIN_BASE}/twin/tables/${TWIN_TABLE}/rows`, {
    method: "PATCH",
    headers: twinHeaders(),
    body: JSON.stringify({ primaryKey: { id }, updates }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[Twin] updateLead FAILED for "${id}": ${res.status} ${body}`);
    return null;
  }
  console.log(`[Twin] updateLead ok: "${id}"`);
  return (await getLeadById(id)) ?? null;
}

export async function updateLeadStage(id: string, stage: Stage, extra?: Partial<Lead>): Promise<Lead | null> {
  return updateLead(id, { stage, ...(extra ?? {}) });
}

// ── Audit (local JSON) ─────────────────────────────────────────────────────

export function appendAudit(entry: Omit<AuditEntry, "id">): AuditEntry {
  const full: AuditEntry = { id: `audit_${Date.now()}`, ...entry };

  // Write to Twin (fire-and-forget — never blocks the caller)
  if (TWIN_TOKEN) {
    fetch(`${TWIN_BASE}/twin/tables/${AUDIT_TABLE}/rows`, {
      method: "POST",
      headers: twinHeaders(),
      body: JSON.stringify({
        values: {
          id:        full.id,
          timestamp: full.timestamp,
          agent:     full.agent,
          event:     full.event,
          lead_id:   full.leadId ?? null,
          meta:      full.meta ? JSON.stringify(full.meta) : null,
        },
      }),
    }).catch((err) => console.log("[audit] Twin write failed:", err?.message));
  }

  // Also write to local file in dev (silently skip on Vercel read-only FS)
  try {
    ensureDir();
    const entries: AuditEntry[] = fs.existsSync(AUDIT_FILE)
      ? JSON.parse(fs.readFileSync(AUDIT_FILE, "utf-8"))
      : [];
    entries.push(full);
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries, null, 2));
  } catch {
    console.log("[audit]", JSON.stringify(full));
  }

  return full;
}

export function getAudit(): AuditEntry[] {
  if (!fs.existsSync(AUDIT_FILE)) return [];
  return JSON.parse(fs.readFileSync(AUDIT_FILE, "utf-8"));
}

// ── DNC (local JSON) ───────────────────────────────────────────────────────

type DncList = { phones: string[]; emails: string[]; whatsapp: string[]; organisations: string[] };

function readDnc(): DncList {
  if (!fs.existsSync(DNC_FILE)) return { phones: [], emails: [], whatsapp: [], organisations: [] };
  const raw = JSON.parse(fs.readFileSync(DNC_FILE, "utf-8"));
  return {
    phones: raw.phones ?? [],
    emails: raw.emails ?? [],
    whatsapp: raw.whatsapp ?? [],
    organisations: raw.organisations ?? [],
  };
}

export function isDnc(value: string): boolean {
  if (!value) return false;
  const dnc = readDnc();
  const v = value.toLowerCase().trim();
  return [...dnc.phones, ...dnc.emails, ...dnc.whatsapp, ...dnc.organisations]
    .map((x) => x.toLowerCase().trim())
    .includes(v);
}

export function addDnc(type: "phone" | "email" | "whatsapp" | "org", value: string) {
  const dnc = readDnc();
  const key = type === "org" ? "organisations" : type === "phone" ? "phones" : type === "email" ? "emails" : "whatsapp";
  if (!dnc[key].includes(value)) dnc[key].push(value);
  try {
    fs.writeFileSync(DNC_FILE, JSON.stringify({ ...dnc, updated_at: new Date().toISOString() }, null, 2));
  } catch {
    console.log("[dnc] filesystem read-only, DNC entry not persisted:", type, value);
  }
}

// ── Pricing helpers ────────────────────────────────────────────────────────

export const BUNDLE_MONTHLY_EUR = { leader: 42, profi: 58, top_feature: 80 } as const;

export function monthlyRate(l: Lead): number {
  return (
    (l.bundle_leader ?? 0) * BUNDLE_MONTHLY_EUR.leader +
    (l.bundle_profi ?? 0) * BUNDLE_MONTHLY_EUR.profi +
    (l.bundle_top_feature ?? 0) * BUNDLE_MONTHLY_EUR.top_feature
  );
}

export function totalContractValue(l: Lead): number {
  return monthlyRate(l) * (l.preferred_term_months ?? 60);
}

export function estPipelineValue(l: Lead): number {
  const fromMix = totalContractValue(l);
  if (fromMix > 0) return fromMix;
  return (l.num_units ?? 0) * BUNDLE_MONTHLY_EUR.profi * 60;
}
