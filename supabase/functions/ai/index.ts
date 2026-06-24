// ChurchOS AI — Supabase Edge Function (Deno)
//
// The web equivalent of the Electron main-process AI. The ANTHROPIC_API_KEY
// lives here (server-side env), never in the browser. The browser POSTs the
// chat messages with the user's Supabase JWT; this function runs the tool-call
// loop, querying the caller's parish data UNDER THEIR RLS (so it can only ever
// read that user's own parish), then returns the answer.
//
// Deploy:  supabase functions deploy ai --no-verify-jwt
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Note: this runs on Deno, not the app's Vite build — it is not type-checked by
// `npm run build`. It is a deploy artifact.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL = 'claude-opus-4-8';

const SYSTEM = [
  'You are the assistant inside ChurchOS, a parish management system for a Catholic parish in the Philippines.',
  'For any question about money, sacraments, or parish data, CALL A TOOL and use the real figures it returns. Never invent numbers.',
  'All amounts are Philippine pesos (₱) — write them with the sign and thousands separators.',
  'When the user asks to open or show part of the app, call the navigate tool.',
  'Surface the insight that matters (the one expense that dominates) and flag one-time costs so figures are not misread.',
  'For sermons and fundraising, draw on Catholic teaching and Filipino parish culture; treat sermons as ideas for the priest to review, never as finished.',
  'Be warm, concise, and respectful. Address the priest as "Father" when natural.',
].join('\n');

const TOOLS = [
  { name: 'get_financial_summary', description: 'Income, expenses, net for a period. period: "q1".."q4", "YYYY-MM", or "all".', input_schema: { type: 'object', properties: { period: { type: 'string' } } } },
  { name: 'get_expense_breakdown', description: 'Expenses by category, largest first, for a period.', input_schema: { type: 'object', properties: { period: { type: 'string' } } } },
  { name: 'get_collections', description: 'Collection totals and breakdown by Mass time for a period.', input_schema: { type: 'object', properties: { period: { type: 'string' } } } },
  { name: 'get_sacrament_counts', description: 'Counts of baptisms, marriages, confirmations, deaths on record.', input_schema: { type: 'object', properties: {} } },
  { name: 'navigate', description: 'Open a page. page: dashboard, finance, registry, directory, calendar, ministries, ssdm, reports, settings.', input_schema: { type: 'object', properties: { page: { type: 'string' } }, required: ['page'] } },
];

const QUARTERS: Record<string, string[]> = { q1: ['01', '02', '03'], q2: ['04', '05', '06'], q3: ['07', '08', '09'], q4: ['10', '11', '12'] };
const ALL_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
// A bare quarter means the CURRENT year; an explicit year anywhere overrides it.
function monthsFor(period?: string): string[] | null {
  if (!period) return null;
  const p = period.toLowerCase().trim();
  if (p === 'all') return null;
  if (/^\d{4}-\d{2}$/.test(p)) return [p];
  const ym = p.match(/(20\d{2})/);
  const year = ym ? ym[1] : String(new Date().getFullYear());
  if (/^\d{4}$/.test(p)) return ALL_MONTHS.map((m) => p + '-' + m);
  const q = p.match(/q([1-4])/);
  if (q) return QUARTERS['q' + q[1]].map((m) => year + '-' + m);
  if (p === 'year') return ALL_MONTHS.map((m) => year + '-' + m);
  return null;
}
const inP = (d: string, months: string[] | null) => !months || months.includes((d || '').slice(0, 7));

// deno-lint-ignore no-explicit-any
async function executeTool(supa: any, name: string, input: any) {
  const months = monthsFor(input?.period);
  if (name === 'get_financial_summary') {
    const { data: cols } = await supa.from('collections').select('total,date');
    const { data: jrnl } = await supa.from('journal_entries').select('lines,date');
    const income = (cols || []).filter((c: any) => inP(c.date, months)).reduce((s: number, c: any) => s + (c.total || 0), 0);
    let expenses = 0;
    for (const j of (jrnl || []).filter((j: any) => inP(j.date, months))) for (const l of j.lines || []) if (l.debit > 0 && String(l.accountCode).startsWith('5')) expenses += l.debit;
    return { period: input?.period || 'all', currency: 'PHP', income, expenses, net: income - expenses };
  }
  if (name === 'get_expense_breakdown') {
    const { data: jrnl } = await supa.from('journal_entries').select('lines,date');
    const exp: Record<string, number> = {};
    for (const j of (jrnl || []).filter((j: any) => inP(j.date, months))) for (const l of j.lines || []) if (l.debit > 0 && String(l.accountCode).startsWith('5')) exp[l.accountName] = (exp[l.accountName] || 0) + l.debit;
    return { period: input?.period || 'all', expenses: Object.entries(exp).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })) };
  }
  if (name === 'get_collections') {
    const { data: cols } = await supa.from('collections').select('total,mass_time,date');
    const rows = (cols || []).filter((c: any) => inP(c.date, months));
    const byMassTime: Record<string, number> = {};
    for (const c of rows) byMassTime[c.mass_time] = (byMassTime[c.mass_time] || 0) + (c.total || 0);
    return { period: input?.period || 'all', total: rows.reduce((s: number, c: any) => s + (c.total || 0), 0), byMassTime };
  }
  if (name === 'get_sacrament_counts') {
    const count = async (t: string) => (await supa.from(t).select('id', { count: 'exact', head: true })).count || 0;
    return { baptisms: await count('baptism_records'), marriages: await count('marriage_records'), confirmations: await count('confirmation_records'), deaths: await count('death_records') };
  }
  if (name === 'navigate') return { ok: true, page: input?.page };
  return { error: 'unknown tool' };
}

async function callClaude(key: string, body: unknown) {
  // Bound the outbound call so a hung upstream can't pin an edge invocation open.
  // On timeout fetch rejects (AbortError) → caught by the Deno.serve try/catch →
  // generic server_error to the client, real detail logged server-side.
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: SYSTEM, tools: TOOLS, ...(body as object) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error('Anthropic ' + res.status + ': ' + (await res.text()).slice(0, 300));
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ ok: false, error: 'no_key' });

    const auth = req.headers.get('Authorization') || '';
    // RLS-scoped client: every query runs as THIS user → only their parish's rows.
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );

    const { messages } = await req.json();
    const convo = [...messages];
    let navigate: { page: string } | null = null;

    for (let step = 0; step < 6; step++) {
      const resp = await callClaude(key, { messages: convo });
      if (resp.stop_reason === 'tool_use') {
        convo.push({ role: 'assistant', content: resp.content });
        const results = [];
        for (const block of resp.content) {
          if (block.type === 'tool_use') {
            const out = await executeTool(supa, block.name, block.input);
            if (block.name === 'navigate' && (out as { page?: string }).page) navigate = { page: (out as { page: string }).page };
            results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
          }
        }
        convo.push({ role: 'user', content: results });
        continue;
      }
      const text = (resp.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
      return json({ ok: true, text, navigate });
    }
    return json({ ok: false, error: 'too_many_steps' });
  } catch (e) {
    // Log the real detail server-side only; never return it to the client (it can
    // leak upstream API errors, keys in URLs, or internal structure). request_id
    // lets us correlate this client-facing response with the server log line.
    const requestId = crypto.randomUUID();
    console.error(JSON.stringify({
      level: 'error', fn: 'ai', request_id: requestId,
      message: String((e as Error)?.message ?? e),
    }));
    return json({ ok: false, error: 'server_error', request_id: requestId });
  }
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { ...CORS, 'content-type': 'application/json' } });
}
