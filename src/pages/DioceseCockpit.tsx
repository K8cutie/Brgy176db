// ═══════════════════════════════════════════════════════════
// Diocese Cockpit — the bishop's cross-parish view (SaaS only)
//
// Queries across every parish in the diocese. RLS lets a diocese_admin /
// bishop READ all their parishes (and only theirs), so this is a handful of
// aggregating queries against the cloud Postgres — the whole point of going
// SaaS: the roll-up that an offline install can never do.
//
// This is the SaaS build's /diocese route. It is intentionally NOT wired into
// the offline desktop app (which has no cloud + one parish), so the Supabase
// import never reaches the desktop bundle.
// ═══════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const supabase = createClient(env?.VITE_SUPABASE_URL ?? '', env?.VITE_SUPABASE_ANON_KEY ?? '');

const peso = (n: number) => '₱' + Math.round(n).toLocaleString();

interface ParishRow { id: string; name: string; collections: number; expenses: number; net: number; }
interface Cockpit {
  parishes: ParishRow[];
  diocese: { collections: number; expenses: number; net: number };
  byMass: { mass: string; total: number }[];
  pareto: { name: string; amount: number }[];
  flaggedWaivers: { parish: string; by: string; amount: number; count: number }[];
}

export default function DioceseCockpit() {
  const [data, setData] = useState<Cockpit | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // RLS scopes this to the bishop's diocese. We read the monthly financial
        // PACKETS (diocese_reports) parishes push — NOT raw records. Parishioner
        // PII never reaches the cloud.
        const [{ data: parishes }, { data: reports }] = await Promise.all([
          supabase.from('parishes').select('id,name'),
          supabase.from('diocese_reports').select('parish_id,period,collections_total,expense_total,by_mass_time,by_category,flagged_waivers'),
        ]);

        const pName: Record<string, string> = {};
        for (const p of (parishes as { id: string; name: string }[]) || []) pName[p.id] = p.name;

        type Report = { parish_id: string; period: string; collections_total: number; expense_total: number; by_mass_time: Record<string, number>; by_category: Record<string, number>; flagged_waivers: { by: string; amount: number; person?: string }[] };
        const colByParish: Record<string, number> = {};
        const expByParish: Record<string, number> = {};
        const byMass: Record<string, number> = {};
        const expByCat: Record<string, number> = {};
        const waiverAgg: Record<string, { parish: string; by: string; amount: number; count: number }> = {};

        for (const r of (reports as Report[]) || []) {
          colByParish[r.parish_id] = (colByParish[r.parish_id] || 0) + (r.collections_total || 0);
          expByParish[r.parish_id] = (expByParish[r.parish_id] || 0) + (r.expense_total || 0);
          for (const [mass, amt] of Object.entries(r.by_mass_time || {})) byMass[mass] = (byMass[mass] || 0) + (amt || 0);
          for (const [cat, amt] of Object.entries(r.by_category || {})) expByCat[cat] = (expByCat[cat] || 0) + (amt || 0);
          // Aggregate flagged waivers by parish+priest across months (split-evasion safe).
          for (const w of r.flagged_waivers || []) {
            const k = r.parish_id + '|' + w.by;
            waiverAgg[k] ??= { parish: pName[r.parish_id] || '—', by: w.by, amount: 0, count: 0 };
            waiverAgg[k].amount += w.amount || 0;
            waiverAgg[k].count += 1;
          }
        }

        const parishRows: ParishRow[] = Object.keys(pName).map((id) => ({
          id, name: pName[id], collections: colByParish[id] || 0, expenses: expByParish[id] || 0,
          net: (colByParish[id] || 0) - (expByParish[id] || 0),
        })).sort((a, b) => b.collections - a.collections);

        const flaggedWaivers = Object.values(waiverAgg).filter((w) => w.amount >= 3000).sort((a, b) => b.amount - a.amount);

        setData({
          parishes: parishRows,
          diocese: {
            collections: Object.values(colByParish).reduce((s, v) => s + v, 0),
            expenses: Object.values(expByParish).reduce((s, v) => s + v, 0),
            net: Object.values(colByParish).reduce((s, v) => s + v, 0) - Object.values(expByParish).reduce((s, v) => s + v, 0),
          },
          byMass: Object.entries(byMass).map(([mass, total]) => ({ mass, total })).sort((a, b) => a.total - b.total),
          pareto: Object.entries(expByCat).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
          flaggedWaivers,
        });
      } catch (e) {
        setError(String((e as Error).message));
      }
    })();
  }, []);

  if (error) return <div className="p-6 text-error text-sm">Could not load the diocese view: {error}</div>;
  if (!data) return <div className="p-6 text-warm-gray text-sm">Loading diocese…</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="display-md font-playfair text-charcoal">Diocese Overview</h1>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Kpi label="Parishes" value={String(data.parishes.length)} />
        <Kpi label="Total collections" value={peso(data.diocese.collections)} />
        <Kpi label="Total expenses" value={peso(data.diocese.expenses)} />
        <Kpi label="Net" value={peso(data.diocese.net)} />
      </div>

      <Card title="Parishes (by collections)">
        <table className="w-full text-sm">
          <thead><tr className="text-warm-gray text-left"><th className="py-1">Parish</th><th className="text-right">Collections</th><th className="text-right">Expenses</th><th className="text-right">Net</th></tr></thead>
          <tbody>
            {data.parishes.map((p) => (
              <tr key={p.id} className="border-t border-parchment/40">
                <td className="py-1.5">{p.name}</td>
                <td className="text-right font-mono">{peso(p.collections)}</td>
                <td className="text-right font-mono">{peso(p.expenses)}</td>
                <td className="text-right font-mono">{peso(p.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Collections by Mass time (diocese-wide)">
          {data.byMass.map((m) => (
            <div key={m.mass} className="flex justify-between text-sm py-0.5"><span className="text-warm-gray">{m.mass}</span><span className="font-mono">{peso(m.total)}</span></div>
          ))}
          <p className="text-xs text-warm-gray mt-2">Lowest: {data.byMass[0]?.mass} ({peso(data.byMass[0]?.total || 0)})</p>
        </Card>
        <Card title="Where the money goes (Pareto)">
          {data.pareto.slice(0, 6).map((e) => (
            <div key={e.name} className="flex justify-between text-sm py-0.5"><span className="text-warm-gray">{e.name}</span><span className="font-mono">{peso(e.amount)}</span></div>
          ))}
        </Card>
      </div>

      {data.flaggedWaivers.length > 0 && (
        <Card title="⚠ Waivers to review (priest self-approved, ≥ ₱3,000 total)">
          {data.flaggedWaivers.map((w, i) => (
            <div key={i} className="text-sm py-1 border-t border-parchment/40 first:border-0">
              <span className="font-medium">{w.parish}</span> — {w.count} waiver{w.count > 1 ? 's' : ''} by {w.by} totaling <span className="font-mono">{peso(w.amount)}</span>
              {w.count > 1 && <span className="text-warm-gray"> (split across {w.count} entries)</span>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-4" style={{ backgroundColor: '#FAF8F3' }}>
      <p className="text-xs text-warm-gray mb-1">{label}</p>
      <p className="text-2xl font-semibold text-charcoal">{value}</p>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-parchment bg-white p-4">
      <h3 className="text-sm font-semibold text-charcoal mb-3">{title}</h3>
      {children}
    </div>
  );
}
