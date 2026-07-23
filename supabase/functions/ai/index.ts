// ChurchOS AI — Supabase Edge Function (Deno)
//
// The web equivalent of the Electron main-process AI. The ANTHROPIC_API_KEY
// lives here (server-side env), never in the browser. The browser POSTs the
// chat messages with the user's Supabase JWT; this function runs the tool-call
// loop, querying the caller's parish data UNDER THEIR RLS (so it can only ever
// read that user's own parish), then returns the answer.
//
// Deploy:  supabase functions deploy ai        (JWT verification ON — do NOT pass
//          --no-verify-jwt; this function spends money on every call, so the gateway
//          must require a valid JWT. The handler ALSO authenticates in-band below as
//          defense-in-depth, so an anon-key-only caller is still rejected.)
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//          (optional) supabase secrets set AI_ALLOWED_ORIGIN=https://<app>.vercel.app
//          Also set an Anthropic spend/budget alert on the key as an operator backstop.
//
// Note: this runs on Deno, not the app's Vite build — it is not type-checked by
// `npm run build`. It is a deploy artifact.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/log.ts';

// Default to '*' to preserve existing behavior; set AI_ALLOWED_ORIGIN to the app
// origin in production to stop arbitrary sites' JS from firing these (billed) calls.
const ALLOWED_ORIGIN = Deno.env.get('AI_ALLOWED_ORIGIN') || '*';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Haiku 4.5 — fast and ~5x cheaper than Opus ($1/$5 vs $5/$25 per M tokens),
// which suits this assistant's short, tool-grounded parish Q&A.
const MODEL = 'claude-haiku-4-5';

const SYSTEM = [
  'You are Cherub, the warm and patient helper living inside ChurchOS — a management system for a Catholic parish in the Philippines. Think of yourself as "the secretary\'s secretary": many of the people you help are parish staff who are not tech-savvy, so be gentle, encouraging, and never make them feel rushed or foolish.',
  'Reply in the SAME language the user writes in — English, Tagalog, or Taglish — in simple, everyday words. Match their language naturally; do not switch on them.',
  'When the user asks HOW to do something — record a baptism, wedding, or funeral; add a family or parishioner; schedule a ceremony; run a report; issue a certificate — explain the steps in plain, friendly language, one step at a time. Then OFFER to take them there and call the navigate tool to open the right page for them.',
  'For any question about money, sacraments, or parish data, CALL A TOOL and use the real figures it returns. Never invent or guess numbers.',
  'All amounts are Philippine pesos (₱) — write them with the sign and thousands separators.',
  'When the user asks to open or show part of the app, call the navigate tool.',
  'Surface the insight that matters (the one expense that dominates) and flag one-time costs so figures are not misread.',
  'For sermons and fundraising, draw on Catholic teaching and Filipino parish culture; treat sermons as ideas for the priest to review, never as finished.',
  'Be warm, concise, and respectful. Address the priest as "Father" when it feels natural.',
].join('\n');

const TOOLS = [
  { name: 'get_financial_summary', description: 'Income, expenses, net for a period. period: "q1".."q4", "YYYY-MM", or "all".', input_schema: { type: 'object', properties: { period: { type: 'string' } } } },
  { name: 'get_expense_breakdown', description: 'Expenses by category, largest first, for a period.', input_schema: { type: 'object', properties: { period: { type: 'string' } } } },
  { name: 'get_collections', description: 'Collection totals and breakdown by Mass time for a period.', input_schema: { type: 'object', properties: { period: { type: 'string' } } } },
  { name: 'get_sacrament_counts', description: 'Counts of baptisms, marriages, confirmations, deaths on record.', input_schema: { type: 'object', properties: {} } },
  { name: 'navigate', description: 'Take the user to a page in ChurchOS. Call this whenever they want to go somewhere or you are showing them how to do a task. page must be one of: dashboard (home/overview), finance (collections, expenses, reports), registry (sacramental records — baptism, marriage, confirmation, death, certificates), directory (families & parishioners), calendar (schedule Masses & ceremonies), requests (certificate/document requests), intentions (Mass intentions), ministries (parish groups & ministries), ssdm (social services & disbursements), reports (parish reports), settings (parish setup & configuration), import (import existing data).', input_schema: { type: 'object', properties: { page: { type: 'string', enum: ['dashboard', 'finance', 'registry', 'directory', 'calendar', 'requests', 'intentions', 'ministries', 'ssdm', 'reports', 'settings', 'import'] } }, required: ['page'] } },
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
    const { data: cols, error: e1 } = await supa.from('collections').select('total,date');
    const { data: jrnl, error: e2 } = await supa.from('journal_entries').select('lines,date');
    // Never report ₱0 as a fact when a query errored — throw so the caller returns an
    // error to the priest instead of a confidently-wrong zero.
    if (e1 || e2) throw new Error('financial summary query failed: ' + ((e1 || e2) as any).message);
    const income = (cols || []).filter((c: any) => inP(c.date, months)).reduce((s: number, c: any) => s + (c.total || 0), 0);
    let expenses = 0;
    for (const j of (jrnl || []).filter((j: any) => inP(j.date, months))) for (const l of j.lines || []) if (l.debit > 0 && String(l.accountCode).startsWith('5')) expenses += l.debit;
    return { period: input?.period || 'all', currency: 'PHP', income, expenses, net: income - expenses };
  }
  if (name === 'get_expense_breakdown') {
    const { data: jrnl, error: ej } = await supa.from('journal_entries').select('lines,date');
    if (ej) throw new Error('expense breakdown query failed: ' + (ej as any).message);
    const exp: Record<string, number> = {};
    for (const j of (jrnl || []).filter((j: any) => inP(j.date, months))) for (const l of j.lines || []) if (l.debit > 0 && String(l.accountCode).startsWith('5')) exp[l.accountName] = (exp[l.accountName] || 0) + l.debit;
    return { period: input?.period || 'all', expenses: Object.entries(exp).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })) };
  }
  if (name === 'get_collections') {
    const { data: cols, error: ec } = await supa.from('collections').select('total,mass_time,date');
    if (ec) throw new Error('collections query failed: ' + (ec as any).message);
    const rows = (cols || []).filter((c: any) => inP(c.date, months));
    const byMassTime: Record<string, number> = {};
    for (const c of rows) byMassTime[c.mass_time] = (byMassTime[c.mass_time] || 0) + (c.total || 0);
    return { period: input?.period || 'all', total: rows.reduce((s: number, c: any) => s + (c.total || 0), 0), byMassTime };
  }
  if (name === 'get_sacrament_counts') {
    const count = async (t: string) => {
      const { count: ct, error } = await supa.from(t).select('id', { count: 'exact', head: true });
      if (error) throw new Error('count(' + t + ') failed: ' + (error as any).message);
      return ct || 0;
    };
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
  // Request-scoped structured logger; its request_id is echoed in error responses.
  const log = createLogger('ai');
  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ ok: false, error: 'no_key' });

    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return json({ ok: false, error: 'unauthorized' }, 401);

    // RLS-scoped client: every query runs as THIS user → only their parish's rows.
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );

    // AUTHENTICATE THE CALLER BEFORE SPENDING ANY MONEY. Without this an anonymous
    // internet caller (or any website's JS) could invoke the tool-call loop and burn
    // the server-side ANTHROPIC_API_KEY — an unbounded cost / vendor-billing DoS. A
    // bare anon key resolves to no user here, so it is rejected too.
    const { data: userData, error: authErr } = await supa.auth.getUser();
    const uid = userData?.user?.id;
    if (authErr || !uid) return json({ ok: false, error: 'unauthorized' }, 401);

    // Per-user burst throttle. rate_allow RETURNS a boolean (allowed) — gate on the VALUE, not
    // on string-matching a raised message. (The old rate_check RAISES 'too many requests…', which
    // the /rate limit/i test never matched, so this throttle was a silent no-op — Overseer L004 #1.)
    // A missing grant/function surfaces as an error, not a false, so only an explicit false blocks.
    {
      const { data: allowed, error: rlErr } = await supa.rpc('rate_allow', { p_key: 'ai:' + uid, p_limit: 20, p_window: '1 minute' });
      if (!rlErr && allowed === false) return json({ ok: false, error: 'rate_limited' }, 429);
    }

    const body = await req.json().catch(() => null);
    const messages = (body as { messages?: unknown } | null)?.messages;
    // Validate + bound the untrusted input so a caller can't force huge/looping spend.
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
      return json({ ok: false, error: 'bad_request' }, 400);
    }
    if (JSON.stringify(messages).length > 100_000) return json({ ok: false, error: 'payload_too_large' }, 413);

    // Per-tenant budget + kill-switch + no-tenant guard — the real spend ceiling, checked BEFORE
    // any Anthropic call (Overseer L004 #2/#3). ai_budget_allow resolves the caller's parish (or
    // diocese, for a bishop) from auth.uid(), applies the per-tenant daily cap + enabled flag, and
    // increments usage. A brand-new self-signup with no tenancy → 'no_tenant' → rejected before
    // spend, closing the "unlimited free accounts each burn the key" hole. A missing function must
    // not brick the assistant, so only an explicit block status returns early.
    {
      const { data: budget, error: bErr } = await supa.rpc('ai_budget_allow');
      if (!bErr) {
        if (budget === 'no_tenant') return json({ ok: false, error: 'no_parish' }, 403);
        if (budget === 'disabled') return json({ ok: false, error: 'ai_disabled' }, 403);
        if (budget === 'budget_exceeded') return json({ ok: false, error: 'budget_exceeded' }, 429);
      }
    }

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
    log.error('unhandled_error', { detail: String((e as Error)?.message ?? e) });
    return json({ ok: false, error: 'server_error', request_id: log.requestId });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
