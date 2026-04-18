import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit.json");
const DNC_FILE = path.join(process.cwd(), "../../config/dnc.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Types ──────────────────────────────────────────────────────────────────

export type Stage = "signal" | "calling" | "qualified" | "offered" | "dnc";

export type Lead = {
  id: string;
  org: string;
  facility: string;
  units: number;
  city: string;
  stage: Stage;
  icp: "high" | "mid" | "low";
  value: number;
  signal?: { source: string; title: string; date: string; url: string; signal_id: string };
  contact?: { name: string; role: string; phone: string; email?: string };
  envelope?: Partial<Envelope>;
  optIn?: boolean | null;
  escalated?: boolean;
  escalationReason?: string;
  transcript?: TranscriptLine[];
  createdAt: string;
  updatedAt: string;
};

export type Envelope = {
  usage_type: "residential" | "commercial";
  facility_type: string;
  num_units: number;
  timeline: string;
  budget_range: string;
  decision_maker: string;
};

export type AuditEntry = {
  id: string;
  timestamp: string;
  agent: "scout" | "caller" | "closer" | "guardrail" | "orchestrator";
  event: string;
  leadId?: string;
  meta?: Record<string, unknown>;
};

export type TranscriptLine = { who: "agent" | "contact"; line: string; ts?: number };

// ── Leads ──────────────────────────────────────────────────────────────────

function readLeads(): Lead[] {
  ensureDir();
  if (!fs.existsSync(LEADS_FILE)) {
    const seed = buildSeedLeads();
    fs.writeFileSync(LEADS_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  return JSON.parse(fs.readFileSync(LEADS_FILE, "utf-8"));
}

function writeLeads(leads: Lead[]) {
  ensureDir();
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

export function getLeads(): Lead[] {
  return readLeads();
}

export function getLeadById(id: string): Lead | undefined {
  return readLeads().find((l) => l.id === id);
}

export function upsertLead(lead: Lead) {
  const leads = readLeads();
  const idx = leads.findIndex((l) => l.id === lead.id);
  lead.updatedAt = new Date().toISOString();
  if (idx >= 0) leads[idx] = lead;
  else leads.unshift(lead);
  writeLeads(leads);
  return lead;
}

export function updateLeadStage(id: string, stage: Stage, extra?: Partial<Lead>) {
  const leads = readLeads();
  const idx = leads.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  leads[idx] = { ...leads[idx], stage, ...extra, updatedAt: new Date().toISOString() };
  writeLeads(leads);
  return leads[idx];
}

// ── Audit ──────────────────────────────────────────────────────────────────

export function appendAudit(entry: Omit<AuditEntry, "id">) {
  ensureDir();
  const entries: AuditEntry[] = fs.existsSync(AUDIT_FILE)
    ? JSON.parse(fs.readFileSync(AUDIT_FILE, "utf-8"))
    : [];
  const full: AuditEntry = { id: `audit_${Date.now()}`, ...entry };
  entries.push(full);
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries, null, 2));
  return full;
}

export function getAudit(): AuditEntry[] {
  if (!fs.existsSync(AUDIT_FILE)) return [];
  return JSON.parse(fs.readFileSync(AUDIT_FILE, "utf-8"));
}

// ── DNC ───────────────────────────────────────────────────────────────────

type DncList = { phones: string[]; emails: string[]; whatsapp: string[]; organisations: string[] };

function readDnc(): DncList {
  if (!fs.existsSync(DNC_FILE)) return { phones: [], emails: [], whatsapp: [], organisations: [] };
  const raw = JSON.parse(fs.readFileSync(DNC_FILE, "utf-8"));
  return { phones: raw.phones ?? [], emails: raw.emails ?? [], whatsapp: raw.whatsapp ?? [], organisations: raw.organisations ?? [] };
}

export function isDnc(value: string): boolean {
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
  fs.writeFileSync(DNC_FILE, JSON.stringify({ ...dnc, updated_at: new Date().toISOString() }, null, 2));
}

// ── Seed data ─────────────────────────────────────────────────────────────

function buildSeedLeads(): Lead[] {
  const now = new Date().toISOString();
  return [
    { id: "L-1055", org: "Kreuzbund Leipzig", facility: "Haus Eichenblick", units: 46, city: "Leipzig", stage: "dnc", icp: "high", value: 23184, createdAt: now, updatedAt: now },
    { id: "L-1047", org: "Diakoniewerk Munich", facility: "Haidhausen Senior Residence", units: 42, city: "Munich", stage: "offered", icp: "high", value: 21168, contact: { name: "Dr. Klaus Weber", role: "Facility Director", phone: "+49891234567", email: "weber@diakoniewerk.de" }, envelope: { usage_type: "residential", facility_type: "senior_care", num_units: 42, timeline: "Q3 2026", budget_range: "2000-5000", decision_maker: "Dr. Klaus Weber, Director" }, optIn: true, createdAt: now, updatedAt: now },
    { id: "L-1048", org: "Caritas Freiburg", facility: "St. Elisabeth", units: 68, city: "Freiburg", stage: "qualified", icp: "high", value: 34272, contact: { name: "Dr. Maria Wehner", role: "Managing Director", phone: "+4976112345", email: "wehner@caritas-freiburg.de" }, signal: { source: "TED", title: "Küchengeräte Ausstattung Wohnbereich", date: "2026-04-18", url: "https://ted.europa.eu/notice/123", signal_id: "sig_20260418_0002" }, createdAt: now, updatedAt: now },
    { id: "L-1049", org: "AWO Hannover", facility: "Haus am Park", units: 34, city: "Hannover", stage: "qualified", icp: "mid", value: 17136, escalated: true, escalationReason: "budget_unclear", contact: { name: "Thomas Bauer", role: "Facility Manager", phone: "+4951198765" }, createdAt: now, updatedAt: now },
    { id: "L-TEST-1", org: "Seniorenheim Vova", facility: "Haus Vova", units: 40, city: "Munich", stage: "signal", icp: "high", value: 20160, contact: { name: "Vova", role: "Facility Manager", phone: "+4916095428835" }, signal: { source: "TED", title: "Küchengeräte Ausstattung Wohnbereich", date: "2026-04-18", url: "https://ted.europa.eu/test-1", signal_id: "sig_test_0001" }, createdAt: now, updatedAt: now },
    { id: "L-TEST-2", org: "Seniorenheim Mikhail", facility: "Haus Mikhail", units: 35, city: "Berlin", stage: "signal", icp: "high", value: 17640, contact: { name: "Mikhail", role: "Facility Director", phone: "+4915753254948" }, signal: { source: "BundDe", title: "Küchengeräte für Wohnbereich", date: "2026-04-18", url: "https://bund.de/test-2", signal_id: "sig_test_0002" }, createdAt: now, updatedAt: now },
    { id: "L-1050", org: "Johanniter Stift Cologne", facility: "Haus Lindenthal", units: 56, city: "Cologne", stage: "signal", icp: "high", value: 28224, signal: { source: "BundDe", title: "Küchengeräte für Wohnbereich", date: "2026-04-18", url: "https://bund.de/987", signal_id: "sig_20260418_0004" }, createdAt: now, updatedAt: now },
    { id: "L-1053", org: "Malteser Nuremberg", facility: "Haus St. Katharina", units: 44, city: "Nuremberg", stage: "signal", icp: "high", value: 22176, signal: { source: "TED", title: "Küchengeräte Malteser", date: "2026-04-18", url: "https://ted.europa.eu/555", signal_id: "sig_20260418_0005" }, createdAt: now, updatedAt: now },
    { id: "L-1052", org: "Evangelische Stiftung Bonn", facility: "Haus am Rhein", units: 38, city: "Bonn", stage: "signal", icp: "mid", value: 19152, signal: { source: "DNK", title: "DNK Nachhaltigkeitsbericht 2025", date: "2026-04-18", url: "https://dnk.de/bonn", signal_id: "sig_20260418_0006" }, createdAt: now, updatedAt: now },
    { id: "L-1054", org: "Paritätischer Essen", facility: "Wohnpark Ruhr", units: 28, city: "Essen", stage: "signal", icp: "low", value: 14112, signal: { source: "Indeed", title: "Haustechnik Betreutes Wohnen", date: "2026-04-18", url: "https://indeed.de/456", signal_id: "sig_20260418_0007" }, createdAt: now, updatedAt: now },
  ];
}
