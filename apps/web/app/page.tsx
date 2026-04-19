"use client";
import { useEffect, useState, useCallback, useRef } from "react";

type Stage =
  | "new"
  | "qualified"
  | "homologation_fail"
  | "not_interested"
  | "escalated"
  | "offered"
  | "accepted"
  | "rejected"
  | "suppressed";

type MotivationString = "simplify" | "scale" | "optimize" | "circular";

type Lead = {
  id: string;
  stage: Stage;
  created_at: string;
  updated_at: string;

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

const BUNDLE_MONTHLY_EUR = { leader: 42, profi: 58, top_feature: 80 };

// Kanban columns — collapses the 9-value stage enum into 5 display buckets
const COLUMNS: { key: string; label: string; accent: string; matches: (s: Stage) => boolean }[] = [
  { key: "new",        label: "Signal identified", accent: "#0071e3", matches: (s) => s === "new" },
  { key: "qualified",  label: "Qualified",         accent: "#af52de", matches: (s) => s === "qualified" },
  { key: "offered",    label: "Offer sent",        accent: "#ff9500", matches: (s) => s === "offered" },
  { key: "closed",     label: "Closed",            accent: "#34c759", matches: (s) => s === "accepted" },
  { key: "archive",    label: "Archive",           accent: "#8e8e93", matches: (s) => s === "homologation_fail" || s === "not_interested" || s === "suppressed" || s === "rejected" || s === "escalated" },
];

const MOTIVATION_COLOR: Record<MotivationString, string> = {
  simplify: "#0F766E",
  scale:    "#9A3412",
  optimize: "#1E40AF",
  circular: "#166534",
};

function isEscalated(l: Lead): boolean {
  return l.stage === "escalated";
}

function monthlyRate(l: Lead): number {
  return (
    (l.bundle_leader ?? 0) * BUNDLE_MONTHLY_EUR.leader +
    (l.bundle_profi ?? 0) * BUNDLE_MONTHLY_EUR.profi +
    (l.bundle_top_feature ?? 0) * BUNDLE_MONTHLY_EUR.top_feature
  );
}

function estPipelineValue(l: Lead): number {
  const term = l.preferred_term_months ?? 60;
  const fromMix = monthlyRate(l) * term;
  if (fromMix > 0) return fromMix;
  return (l.num_units ?? 0) * BUNDLE_MONTHLY_EUR.profi * 60;
}

function scoreTier(score: number | undefined): "high" | "mid" | "low" {
  if (score === undefined) return "mid";
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

const SCORE_COLOR: Record<string, string> = { high: "#34c759", mid: "#ff9500", low: "#8e8e93" };

export default function Cockpit() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [qualifying, setQualifying] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [selected, setSelected] = useState<Lead | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads");
      const data: Lead[] = await res.json();
      setLeads(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
    pollRef.current = setInterval(fetchLeads, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchLeads]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function qualifyNow(lead: Lead) {
    setQualifying(lead.id);
    try {
      const res = await fetch("/api/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Kate is calling ${lead.company_name}…`, true);
        fetchLeads();
      } else {
        showToast(data.error ?? "Error", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setQualifying(null);
    }
  }

  const kpis = {
    total: leads.length,
    pipeline: leads.filter((l) => ["new", "qualified", "offered"].includes(l.stage)).length,
    qualified: leads.filter((l) => l.stage === "qualified").length,
    offered: leads.filter((l) => l.stage === "offered").length,
    closed: leads.filter((l) => l.stage === "accepted").length,
    escalated: leads.filter(isEscalated).length,
    pipelineValue: leads
      .filter((l) => ["new", "qualified", "offered"].includes(l.stage))
      .reduce((s, l) => s + estPipelineValue(l), 0),
  };

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f]" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-black/5 px-6 py-3 flex items-center justify-between">
        <div>
          <span className="font-semibold text-[15px]">undeterministic tornado</span>
          <span className="ml-2 text-[13px] text-neutral-400">· lease·a·kitchen Sales Cockpit</span>
        </div>
        <div className="flex items-center gap-4 text-[13px] text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Agents live
          </span>
          <span suppressHydrationWarning>{new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} CET</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            { label: "Active leads", value: kpis.pipeline, color: "#0071e3" },
            { label: "Qualified", value: kpis.qualified, color: "#af52de" },
            { label: "Offer sent", value: kpis.offered, color: "#ff9500" },
            { label: "Deals closed", value: kpis.closed, color: "#34c759" },
            { label: "Est. pipeline value", value: `€${(kpis.pipelineValue / 1000).toFixed(0)}k`, color: "#1d1d1f" },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
              <div className="text-[28px] font-semibold leading-none tabular-nums" style={{ color: k.color }} suppressHydrationWarning>{k.value}</div>
              <div className="text-[11px] text-neutral-400 mt-1">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Kanban */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {COLUMNS.map((col) => {
            const colLeads = leads.filter((l) => col.matches(l.stage) && !isEscalated(l));
            return (
              <div key={col.key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: col.accent }} suppressHydrationWarning />
                  <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">{col.label}</span>
                  <span className="ml-auto text-[11px] text-neutral-400">{colLeads.length}</span>
                </div>
                {loading && colLeads.length === 0 && (
                  <div className="bg-white rounded-xl border border-black/5 p-4 animate-pulse h-20" />
                )}
                {colLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    accent={col.accent}
                    qualifying={qualifying === lead.id}
                    onQualify={() => qualifyNow(lead)}
                    onOpen={() => setSelected(lead)}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Escalations */}
        {leads.filter(isEscalated).length > 0 && (
          <div className="bg-white rounded-2xl border border-orange-200 shadow-sm p-5">
            <div className="text-[13px] font-semibold text-orange-600 mb-3">⚠ Escalations — human required</div>
            <div className="space-y-2">
              {leads.filter(isEscalated).map((l) => (
                <div key={l.id} className="flex items-center justify-between text-[13px]">
                  <span className="font-medium">{l.company_name}</span>
                  <span className="text-neutral-400 text-[11px] bg-orange-50 px-2 py-0.5 rounded-full">{l.escalation_reason ?? "escalated"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Lead detail modal */}
      {selected && (
        <LeadModal lead={selected} onClose={() => setSelected(null)} onQualify={() => { qualifyNow(selected); setSelected(null); }} qualifying={qualifying === selected.id} />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-white text-[13px] font-medium shadow-lg z-50 transition-all ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead, accent, qualifying, onQualify, onOpen }: {
  lead: Lead; accent: string; qualifying: boolean;
  onQualify: () => void; onOpen: () => void;
}) {
  const canQualify = lead.stage === "new" && !!lead.person_phone && !isEscalated(lead);
  const tier = scoreTier(lead.score);
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-sm p-4 space-y-3 cursor-pointer hover:shadow-md transition-shadow" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold leading-tight">{lead.company_name}</div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            {lead.person_name && <span className="text-neutral-600">{lead.person_name} · </span>}
            {[lead.street, lead.city].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: SCORE_COLOR[tier] }} title={`Score tier: ${tier}`} suppressHydrationWarning />
      </div>
      <div className="flex items-center gap-3 text-[11px] text-neutral-500">
        {lead.num_units !== undefined && <><span>{lead.num_units} units</span><span>·</span></>}
        <span>{lead.city ?? "—"}</span>
        <span
          className="ml-auto font-medium text-neutral-700"
          title="Estimated pipeline value — Otto will quote the exact monthly rate from the BSH catalog"
        >
          ~€{(estPipelineValue(lead) / 1000).toFixed(0)}k est.
        </span>
      </div>
      {lead.motivation_string && (
        <div
          className="text-[10px] rounded px-2 py-1 truncate text-white"
          style={{ background: MOTIVATION_COLOR[lead.motivation_string] }}
          suppressHydrationWarning
        >
          Hook: {lead.motivation_string}
        </div>
      )}
      {lead.signal_summary && (
        <div className="text-[10px] text-blue-600 bg-blue-50 rounded px-2 py-1 truncate">{lead.signal_summary}</div>
      )}
      {lead.person_phone && (
        <div className="text-[10px] text-green-700 bg-green-50 rounded px-2 py-1">✓ Consent given · {lead.person_phone}</div>
      )}
      {isEscalated(lead) && (
        <div className="text-[10px] text-orange-600 bg-orange-50 rounded px-2 py-1">⚠ {lead.escalation_reason ?? "escalated"}</div>
      )}
      {canQualify && (
        <button
          onClick={(e) => { e.stopPropagation(); onQualify(); }}
          disabled={qualifying}
          className="w-full text-[12px] font-medium py-1.5 rounded-lg text-white transition-opacity disabled:opacity-50"
          style={{ background: accent }}
          suppressHydrationWarning
        >
          {qualifying ? "Calling…" : "Qualify now →"}
        </button>
      )}
      {lead.stage === "new" && !lead.person_phone && (
        <div className="text-[10px] text-neutral-400">Awaiting landing-page consent</div>
      )}
    </div>
  );
}

function LeadModal({ lead, onClose, onQualify, qualifying }: {
  lead: Lead; onClose: () => void; onQualify: () => void; qualifying: boolean;
}) {
  const envFields: { key: keyof Lead; label: string }[] = [
    { key: "facility_type",         label: "Facility type" },
    { key: "num_units",             label: "Units" },
    { key: "timeline",              label: "Timeline" },
    { key: "preferred_term_months", label: "Term (months)" },
    { key: "decision_maker",        label: "Decision maker" },
    { key: "preferred_channel",     label: "Channel" },
  ];
  const bundles: { key: keyof Lead; label: string; monthly: number }[] = [
    { key: "bundle_leader",      label: "Leader",      monthly: 42 },
    { key: "bundle_profi",       label: "Profi",       monthly: 58 },
    { key: "bundle_top_feature", label: "Top Feature", monthly: 80 },
  ];
  const filled = envFields.filter((f) => lead[f.key] !== undefined && lead[f.key] !== null && lead[f.key] !== "").length;
  const completeness = envFields.length > 0 ? filled / envFields.length : 0;
  const bundleTotal = bundles.reduce((s, b) => s + Number(lead[b.key] ?? 0), 0);

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-semibold text-[16px]">{lead.company_name}</div>
            <div className="text-[13px] text-neutral-400">{[lead.street, lead.postal_code, lead.city].filter(Boolean).join(" · ")}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[11px] font-mono bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded select-all">{lead.id}</span>
              <a
                href={`/api/l?id=${lead.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-blue-500 hover:underline"
              >
                Landing ↗
              </a>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl">×</button>
        </div>

        {/* Signal */}
        {(lead.signal_summary || lead.signal_url) && (
          <div className="bg-blue-50 rounded-xl p-4 text-[13px]">
            <div className="font-medium text-blue-700 mb-1">Signal</div>
            {lead.signal_summary && <div className="text-blue-600">{lead.signal_summary}</div>}
            {lead.signal_url && (
              <a href={lead.signal_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-400 mt-1 block hover:underline">
                {lead.signal_url}
              </a>
            )}
          </div>
        )}

        {/* Contact */}
        <div className="space-y-1.5 text-[13px]">
          <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">Contact</div>
          {lead.person_name && <div className="font-medium">{lead.person_name}{lead.person_role && <span className="font-normal text-neutral-400"> · {lead.person_role}</span>}</div>}
          {lead.person_email && (
            <a href={`mailto:${lead.person_email}`} className="flex items-center gap-1.5 text-neutral-600 hover:text-blue-600">
              <span>✉</span> {lead.person_email}
            </a>
          )}
          {lead.person_phone && (
            <div className="flex items-center gap-1.5 text-neutral-600">
              <span>📞</span> {lead.person_phone}
              {lead.consent_given_at && (
                <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                  consent {new Date(lead.consent_given_at).toLocaleDateString("de-DE")}
                </span>
              )}
            </div>
          )}
          {lead.url && (
            <a href={lead.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-neutral-400 hover:text-blue-500 text-[12px]">
              <span>🌐</span> {lead.url}
            </a>
          )}
        </div>

        {/* Qualification fields */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">Qualification</div>
            <div className="text-[11px] text-neutral-500">{filled}/{envFields.length} fields</div>
          </div>
          <div className="w-full bg-neutral-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${completeness * 100}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {envFields.map((f) => (
              <div key={String(f.key)} className="bg-neutral-50 rounded-lg p-2.5">
                <div className="text-[10px] text-neutral-400">{f.label}</div>
                <div className="text-[13px] font-medium text-neutral-700 truncate">{String(lead[f.key] ?? "—")}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bundle mix */}
        {bundleTotal > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">Bundle mix</div>
            <div className="grid grid-cols-3 gap-2">
              {bundles.map((b) => (
                <div key={String(b.key)} className="bg-neutral-50 rounded-lg p-2.5">
                  <div className="text-[10px] text-neutral-400">{b.label}</div>
                  <div className="text-[14px] font-semibold text-neutral-700">{Number(lead[b.key] ?? 0)} ×</div>
                  <div className="text-[10px] text-neutral-400">€{b.monthly}/mo each</div>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-neutral-500 text-right">
              Monthly rate ≈ €{monthlyRate(lead).toLocaleString()} · Total ≈ €{(estPipelineValue(lead) / 1000).toFixed(0)}k
            </div>
          </div>
        )}

        {/* Opt-in / consent badge */}
        {lead.opt_in !== undefined && lead.opt_in !== null && (
          <div className={`text-[12px] px-3 py-1.5 rounded-lg font-medium ${lead.opt_in ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {lead.opt_in ? "✓ Opt-in confirmed" : "✗ Opted out"}
          </div>
        )}

        {/* Call notes */}
        {lead.call_notes && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">Call notes</div>
            <div className="text-[12px] text-neutral-600 bg-neutral-50 rounded-lg p-3 leading-relaxed">{lead.call_notes}</div>
          </div>
        )}

        {/* Transcript link */}
        {lead.call_transcript_url && (
          <a
            href={lead.call_transcript_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[12px] text-blue-500 hover:underline"
          >
            📄 View call transcript ↗
          </a>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          {lead.stage === "new" && lead.person_phone && !isEscalated(lead) && (
            <button onClick={onQualify} disabled={qualifying} className="flex-1 py-2.5 rounded-xl text-white text-[14px] font-medium bg-[#1d1d1f] disabled:opacity-50">
              {qualifying ? "Calling…" : "Qualify now"}
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-neutral-100 text-[14px] font-medium text-neutral-700">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
