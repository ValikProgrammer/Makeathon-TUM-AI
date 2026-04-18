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
// Single flat Lead — mirrors the `leads` table in seed/scout-seed.sql.
// One row = one lead throughout the Jack → Kate → Otto pipeline.

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
  // Identity & lifecycle
  id: string;
  created_at: string;
  updated_at: string;
  stage: Stage;

  // Company (Jack, real)
  company_name: string;
  street?: string;
  postal_code?: string;
  city?: string;
  url?: string;

  // Contact
  person_name?: string;
  person_role?: string;
  person_email?: string;
  person_phone?: string; // captured on the landing page, NOT by Jack

  // Jack output
  signal_url?: string;
  signal_summary?: string;
  motivation_string?: MotivationString;
  score?: number;

  // Consent (landing-page submit)
  consent_given_at?: string;
  consent_text_version?: string;
  consent_ip?: string;

  // Kate output
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

  // Otto output
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
  lead.updated_at = new Date().toISOString();
  if (idx >= 0) leads[idx] = lead;
  else leads.unshift(lead);
  writeLeads(leads);
  return lead;
}

export function updateLead(id: string, patch: Partial<Lead>) {
  const leads = readLeads();
  const idx = leads.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  leads[idx] = { ...leads[idx], ...patch, updated_at: new Date().toISOString() };
  writeLeads(leads);
  return leads[idx];
}

export function updateLeadStage(id: string, stage: Stage, extra?: Partial<Lead>) {
  return updateLead(id, { stage, ...(extra ?? {}) });
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
  const key =
    type === "org"
      ? "organisations"
      : type === "phone"
      ? "phones"
      : type === "email"
      ? "emails"
      : "whatsapp";
  if (!dnc[key].includes(value)) dnc[key].push(value);
  fs.writeFileSync(DNC_FILE, JSON.stringify({ ...dnc, updated_at: new Date().toISOString() }, null, 2));
}

// ── Pricing helpers (computed values, never stored) ────────────────────────

export const BUNDLE_MONTHLY_EUR = { leader: 42, profi: 58, top_feature: 80 } as const;

export function monthlyRate(l: Lead): number {
  return (
    (l.bundle_leader ?? 0) * BUNDLE_MONTHLY_EUR.leader +
    (l.bundle_profi ?? 0) * BUNDLE_MONTHLY_EUR.profi +
    (l.bundle_top_feature ?? 0) * BUNDLE_MONTHLY_EUR.top_feature
  );
}

export function totalContractValue(l: Lead): number {
  const term = l.preferred_term_months ?? 60;
  return monthlyRate(l) * term;
}

/** Est. pipeline value per lead — rough indicator while we still don't know the mix.
 *  Falls back to num_units × 42 × 60 when Kate hasn't filled bundles yet. */
export function estPipelineValue(l: Lead): number {
  const fromMix = totalContractValue(l);
  if (fromMix > 0) return fromMix;
  const units = l.num_units ?? 0;
  return units * BUNDLE_MONTHLY_EUR.profi * 60;
}

// ── Seed — 10 real senior-living operators (mock person data) ─────────────

function buildSeedLeads(): Lead[] {
  const now = new Date().toISOString();
  const seeds: Omit<Lead, "id" | "created_at" | "updated_at" | "stage">[] = [
    {
      company_name: "Evangelische Heimstiftung GmbH", street: "Hackstraße 12", postal_code: "70190", city: "Stuttgart", url: "https://www.ev-heimstiftung.de/",
      person_name: "Dr. Stefan Bürkle", person_role: "Leitung Einkauf", person_email: "s.buerkle@ev-heimstiftung.de",
      signal_url: "https://www.bund.de/mock-tender/EHS-2026-07",
      signal_summary: "Public tender for KfW-funded senior residence opening Stuttgart Q3 2026, approximately 120 residential units",
      motivation_string: "optimize", score: 88,
    },
    {
      company_name: "Pro Seniore Residenz Kempten", street: "Stiftskellerweg 43", postal_code: "87439", city: "Kempten", url: "https://kempten.pro-seniore.de/",
      person_name: "Martina Hoffmann", person_role: "Hausleitung", person_email: "m.hoffmann@pro-seniore.com",
      signal_url: "https://mock-bauportal.de/permits/kempten-sued-2026",
      signal_summary: "Renovation permit granted for Pro Seniore Kempten-Süd, 45 apartments, construction start Q4 2026",
      motivation_string: "simplify", score: 76,
    },
    {
      company_name: "Dorea GmbH", street: "Siemensdamm 62", postal_code: "13627", city: "Berlin", url: "https://www.dorea.de/",
      person_name: "Andreas Richter", person_role: "Geschäftsführer", person_email: "a.richter@dorea.de",
      signal_url: "https://mock-care-invest.de/news/dorea-expansion-2026",
      signal_summary: "Press release: Dorea announcing three new assisted-living sites across Berlin-Brandenburg region",
      motivation_string: "scale", score: 82,
    },
    {
      company_name: "DOMIZILIUM GmbH", street: "Wilhelm-Köhler-Straße 50", postal_code: "86956", city: "Schongau", url: "https://www.domizilium.de/",
      person_name: "Julia Schwarz", person_role: "Einrichtungsleitung", person_email: "j.schwarz@domizilium.de",
      signal_url: "https://mock-bauportal.de/permits/schongau-bw-2026",
      signal_summary: "Building permit granted for new betreutes Wohnen complex in Schongau, 60 residential units",
      motivation_string: "simplify", score: 79,
    },
    {
      company_name: "AWO Arbeiterwohlfahrt", street: "Blücherstraße 62/63", postal_code: "10961", city: "Berlin", url: "https://www.awo.org/",
      person_name: "Thomas Weber", person_role: "Regionalleitung", person_email: "t.weber@awo.org",
      signal_url: "https://mock-vergabeportal.de/tender/AWO-BE-2026-41",
      signal_summary: "Öffentliche Ausschreibung for household-appliance leasing across 5 AWO senior residences, approximately 200 units",
      motivation_string: "scale", score: 74,
    },
    {
      company_name: "BRK SeniorenWohnen", street: "Garmischer Straße 19-21", postal_code: "81373", city: "München", url: "https://www.brk-seniorenwohnen.de/",
      person_name: "Dr. Christine Bauer", person_role: "Leitung Hauswirtschaft", person_email: "c.bauer@brk-seniorenwohnen.de",
      signal_url: "https://mock-brk.de/news/serienrenovierung-muenchen-2026-2028",
      signal_summary: "Serial renovation plan for Munich region 2026–2028: 8 senior homes, approximately 400 residential units with appliance refresh",
      motivation_string: "simplify", score: 91,
    },
    {
      company_name: "Tertianum Service GmbH", street: "Hackescher Markt 2-3", postal_code: "10178", city: "Berlin", url: "https://tertianum-premiumresidences.de/",
      person_name: "Michael Krause", person_role: "Prokurist", person_email: "m.krause@tertianum-premiumresidences.de",
      signal_url: "https://mock-immobilien-zeitung.de/news/tertianum-mitte-opening",
      signal_summary: "Opening announcement for new Tertianum Premium Residence Berlin-Mitte, projected Q2 2027",
      motivation_string: "optimize", score: 68,
    },
    {
      company_name: "Caritas Trägergesellschaft St. Elisabeth gGmbH", street: "Von-Hompesch-Straße 1", postal_code: "53123", city: "Bonn", url: "https://www.cts-mbh.de/",
      person_name: "Petra Müller", person_role: "Leitung Einkauf", person_email: "p.mueller@cts-mbh.de",
      signal_url: "https://mock-bundesanzeiger.de/jahresabschluss/CTS-2025",
      signal_summary: "Annual report 2025 mentions appliance refresh across senior-care facilities in 2026, specific budget line allocated",
      motivation_string: "optimize", score: 85,
    },
    {
      company_name: "EMVIA Living GmbH", street: "Aachener Straße 1053-1055", postal_code: "50858", city: "Köln", url: "https://www.emvia.de/",
      person_name: "Frank Schmidt", person_role: "Geschäftsführer", person_email: "f.schmidt@emvia.de",
      signal_url: "https://mock-care-invest.de/news/emvia-acquisition-q1-2026",
      signal_summary: "Acquisition of two smaller care operators announced; appliance harmonization across acquired sites planned",
      motivation_string: "scale", score: 70,
    },
    {
      company_name: "Augustinum Gruppe", street: "Stiftsbogen 74", postal_code: "81375", city: "München", url: "https://www.augustinum.de/",
      person_name: "Sabine Fischer", person_role: "Hausleitung", person_email: "s.fischer@augustinum.de",
      signal_url: "https://mock-augustinum.de/news/jubilaeum-refurbishment-2026",
      signal_summary: "50th-anniversary refurbishment project across Munich residences: 180 apartments scheduled for renewal 2026–2027",
      motivation_string: "simplify", score: 87,
    },
  ];
  return seeds.map((s, i) => ({
    id: `L-${1000 + i + 1}`,
    created_at: now,
    updated_at: now,
    stage: "new" as Stage,
    ...s,
  }));
}
