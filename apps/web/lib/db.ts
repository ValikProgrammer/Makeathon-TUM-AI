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
  id: string;
  created_at: string;
  updated_at: string;
  stage: Stage;
  company_name: string;
  street?: string;
  postal_code?: string;
  city?: string;
  url?: string;
  person_name?: string;
  person_role?: string;
  person_email?: string;
  person_phone?: string;
  signal_url?: string;
  signal_summary?: string;
  motivation_string?: MotivationString;
  score?: number;
  consent_given_at?: string;
  consent_text_version?: string;
  consent_ip?: string;
  facility_type?: string;
  num_units?: number;
  timeline?: string;
  preferred_term_months?: number;
  decision_maker?: string;
  bundle_leader?: number;
  bundle_profi?: number;
  bundle_top_feature?: number;
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
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    stage: (row.stage as Stage) ?? "new",
    company_name: String(row.company_name ?? "Unknown"),
    street: row.street != null ? String(row.street) : undefined,
    postal_code: row.postal_code != null ? String(row.postal_code) : undefined,
    city: row.city != null ? String(row.city) : undefined,
    url: row.url != null ? String(row.url) : undefined,
    person_name: row.person_name != null ? String(row.person_name) : undefined,
    person_role: row.person_role != null ? String(row.person_role) : undefined,
    person_email: row.person_email != null ? String(row.person_email) : undefined,
    person_phone: row.person_phone != null ? String(row.person_phone) : undefined,
    signal_url: row.signal_url != null ? String(row.signal_url) : undefined,
    signal_summary: row.signal_summary != null ? String(row.signal_summary) : undefined,
    motivation_string: row.motivation_string != null ? (row.motivation_string as MotivationString) : undefined,
    score: row.score != null ? Number(row.score) : undefined,
    consent_given_at: row.consent_given_at != null ? String(row.consent_given_at) : undefined,
    consent_text_version: row.consent_text_version != null ? String(row.consent_text_version) : undefined,
    consent_ip: row.consent_ip != null ? String(row.consent_ip) : undefined,
    facility_type: row.facility_type != null ? String(row.facility_type) : undefined,
    num_units: row.num_units != null ? Number(row.num_units) : undefined,
    timeline: row.timeline != null ? String(row.timeline) : undefined,
    preferred_term_months: row.preferred_term_months != null ? Number(row.preferred_term_months) : undefined,
    decision_maker: row.decision_maker != null ? String(row.decision_maker) : undefined,
    bundle_leader: row.bundle_leader != null ? Number(row.bundle_leader) : undefined,
    bundle_profi: row.bundle_profi != null ? Number(row.bundle_profi) : undefined,
    bundle_top_feature: row.bundle_top_feature != null ? Number(row.bundle_top_feature) : undefined,
    opt_in: row.opt_in != null ? Boolean(row.opt_in) : undefined,
    preferred_channel: row.preferred_channel != null ? (row.preferred_channel as Lead["preferred_channel"]) : undefined,
    contact_address: row.contact_address != null ? String(row.contact_address) : undefined,
    call_transcript_url: row.call_transcript_url != null ? String(row.call_transcript_url) : undefined,
    call_notes: row.call_notes != null ? String(row.call_notes) : undefined,
    escalation_reason: row.escalation_reason != null ? String(row.escalation_reason) : undefined,
    offer_sent_at: row.offer_sent_at != null ? String(row.offer_sent_at) : undefined,
    offer_accepted_at: row.offer_accepted_at != null ? String(row.offer_accepted_at) : undefined,
  };
}

// ── Lead CRUD (async — all go to Twin) ────────────────────────────────────

export async function getLeads(): Promise<Lead[]> {
  const res = await fetch(`${TWIN_BASE}/twin/tables/${TWIN_TABLE}?limit=500`, {
    headers: twinHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(`[Twin] getLeads failed: ${res.status} ${await res.text()}`);
    return [];
  }
  const data = await res.json() as { rows: Record<string, unknown>[] };
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
  const now = new Date().toISOString();
  const values = { ...lead, updated_at: now };

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
  const updates = { ...patch, updated_at: new Date().toISOString() };
  const res = await fetch(`${TWIN_BASE}/twin/tables/${TWIN_TABLE}/rows`, {
    method: "PATCH",
    headers: twinHeaders(),
    body: JSON.stringify({ primaryKey: { id }, updates }),
  });
  if (!res.ok) {
    console.error(`[Twin] updateLead failed for ${id}: ${res.status} ${await res.text()}`);
    return null;
  }
  console.log(`[Twin] updateLead ok: ${id}`, Object.keys(updates).join(", "));
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
