"use client";
import { useEffect, useState, useCallback, useRef } from "react";

type Stage = "signal" | "calling" | "qualified" | "offered" | "dnc";

type Lead = {
  id: string;
  org: string;
  facility: string;
  units: number;
  city: string;
  stage: Stage;
  icp: "high" | "mid" | "low";
  value: number;
  signal?: { source: string; title: string; date: string; url: string };
  contact?: { name: string; role: string; phone: string; email?: string };
  envelope?: Record<string, string | number>;
  optIn?: boolean | null;
  escalated?: boolean;
  escalationReason?: string;
  updatedAt: string;
};

const STAGES: { key: Stage; label: string; accent: string }[] = [
  { key: "signal",    label: "Signal identified", accent: "#0071e3" },
  { key: "calling",   label: "Calling",           accent: "#ff9500" },
  { key: "qualified", label: "Lead qualified",     accent: "#af52de" },
  { key: "offered",   label: "Offer made",         accent: "#8e8e93" },
  { key: "dnc",       label: "Deal closed / DNC",  accent: "#34c759" },
];

const ICP_COLOR: Record<string, string> = { high: "#34c759", mid: "#ff9500", low: "#8e8e93" };

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
        showToast(`Kate is calling ${lead.org}…`, true);
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
    pipeline: leads.filter((l) => ["signal", "calling", "qualified", "offered"].includes(l.stage)).length,
    qualified: leads.filter((l) => l.stage === "qualified" || l.stage === "offered").length,
    closed: leads.filter((l) => l.stage === "dnc").length,
    escalated: leads.filter((l) => l.escalated).length,
    pipelineValue: leads
      .filter((l) => l.stage !== "dnc")
      .reduce((s, l) => s + l.value, 0),
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
          <span>{new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} CET</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            { label: "Active leads", value: kpis.pipeline, color: "#0071e3" },
            { label: "Qualified", value: kpis.qualified, color: "#af52de" },
            { label: "Deals closed", value: kpis.closed, color: "#34c759" },
            { label: "Escalated", value: kpis.escalated, color: "#ff9500" },
            { label: "Est. pipeline value", value: `€${(kpis.pipelineValue / 1000).toFixed(0)}k`, color: "#1d1d1f" },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
              <div className="text-[28px] font-semibold leading-none tabular-nums" style={{ color: k.color }}>{k.value}</div>
              <div className="text-[11px] text-neutral-400 mt-1">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Kanban */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {STAGES.map((stage) => {
            const stageLeads = leads.filter((l) => l.stage === stage.key);
            return (
              <div key={stage.key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: stage.accent }} />
                  <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">{stage.label}</span>
                  <span className="ml-auto text-[11px] text-neutral-400">{stageLeads.length}</span>
                </div>
                {loading && stageLeads.length === 0 && (
                  <div className="bg-white rounded-xl border border-black/5 p-4 animate-pulse h-20" />
                )}
                {stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    accent={stage.accent}
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
        {leads.filter((l) => l.escalated).length > 0 && (
          <div className="bg-white rounded-2xl border border-orange-200 shadow-sm p-5">
            <div className="text-[13px] font-semibold text-orange-600 mb-3">⚠ Escalations — human required</div>
            <div className="space-y-2">
              {leads.filter((l) => l.escalated).map((l) => (
                <div key={l.id} className="flex items-center justify-between text-[13px]">
                  <span className="font-medium">{l.org}</span>
                  <span className="text-neutral-400 text-[11px] bg-orange-50 px-2 py-0.5 rounded-full">{l.escalationReason}</span>
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
  const canQualify = lead.stage === "signal" && !lead.escalated;
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-sm p-4 space-y-3 cursor-pointer hover:shadow-md transition-shadow" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold leading-tight">{lead.org}</div>
          <div className="text-[11px] text-neutral-400 mt-0.5">{lead.facility}</div>
        </div>
        <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: ICP_COLOR[lead.icp] ?? "#8e8e93" }} title={`ICP: ${lead.icp}`} />
      </div>
      <div className="flex items-center gap-3 text-[11px] text-neutral-500">
        <span>{lead.units} units</span>
        <span>·</span>
        <span>{lead.city}</span>
        <span className="ml-auto font-medium text-neutral-700" title="Estimated pipeline value — Otto will quote the exact monthly rate from the BSH catalog">~€{(lead.value / 1000).toFixed(0)}k est.</span>
      </div>
      {lead.signal && (
        <div className="text-[10px] text-blue-600 bg-blue-50 rounded px-2 py-1 truncate">{lead.signal.source}: {lead.signal.title}</div>
      )}
      {lead.escalated && (
        <div className="text-[10px] text-orange-600 bg-orange-50 rounded px-2 py-1">⚠ {lead.escalationReason}</div>
      )}
      {canQualify && (
        <button
          onClick={(e) => { e.stopPropagation(); onQualify(); }}
          disabled={qualifying}
          className="w-full text-[12px] font-medium py-1.5 rounded-lg text-white transition-opacity disabled:opacity-50"
          style={{ background: accent }}
        >
          {qualifying ? "Calling…" : "Qualify now →"}
        </button>
      )}
      {lead.stage === "calling" && (
        <div className="flex items-center gap-2 text-[12px] text-orange-600">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
          Kate is calling…
        </div>
      )}
    </div>
  );
}

function LeadModal({ lead, onClose, onQualify, qualifying }: {
  lead: Lead; onClose: () => void; onQualify: () => void; qualifying: boolean;
}) {
  const envFields = [
    { key: "usage_type", label: "Usage type" },
    { key: "facility_type", label: "Facility type" },
    { key: "num_units", label: "Units" },
    { key: "timeline", label: "Timeline" },
    { key: "budget_range", label: "Budget range" },
    { key: "decision_maker", label: "Decision maker" },
  ];
  const filled = envFields.filter((f) => lead.envelope?.[f.key]).length;
  const completeness = envFields.length > 0 ? filled / envFields.length : 0;

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-semibold text-[16px]">{lead.org}</div>
            <div className="text-[13px] text-neutral-400">{lead.facility} · {lead.city}</div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl">×</button>
        </div>

        {/* Signal */}
        {lead.signal && (
          <div className="bg-blue-50 rounded-xl p-4 text-[13px]">
            <div className="font-medium text-blue-700 mb-1">Signal · {lead.signal.source}</div>
            <div className="text-blue-600">{lead.signal.title}</div>
            <a href={lead.signal.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-400 mt-1 block hover:underline">{lead.signal.url}</a>
          </div>
        )}

        {/* Contact */}
        {lead.contact && (
          <div className="space-y-1 text-[13px]">
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">Contact</div>
            <div className="font-medium">{lead.contact.name}</div>
            <div className="text-neutral-500">{lead.contact.role} · {lead.contact.phone}</div>
            {lead.contact.email && <div className="text-neutral-500">{lead.contact.email}</div>}
          </div>
        )}

        {/* Envelope */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">Envelope</div>
            <div className="text-[11px] text-neutral-500">{filled}/{envFields.length} fields</div>
          </div>
          <div className="w-full bg-neutral-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${completeness * 100}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {envFields.map((f) => (
              <div key={f.key} className="bg-neutral-50 rounded-lg p-2.5">
                <div className="text-[10px] text-neutral-400">{f.label}</div>
                <div className="text-[13px] font-medium text-neutral-700 truncate">{String(lead.envelope?.[f.key] ?? "—")}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Opt-in badge */}
        {lead.optIn !== null && lead.optIn !== undefined && (
          <div className={`text-[12px] px-3 py-1.5 rounded-lg font-medium ${lead.optIn ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {lead.optIn ? "✓ Opt-in confirmed" : "✗ Opted out"}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          {lead.stage === "signal" && !lead.escalated && (
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
