// ChurchOS — AI assistant (main process)
//
// The API key lives here, never in the renderer. Calls go to the Anthropic
// Messages API via raw fetch (Node 24 / Electron 42 has global fetch) — a
// deliberate choice for the Electron main process: no ESM/CJS friction, no
// extra dependency, and we only need the one endpoint with tool use.
//
// Key-ready: until an API key is set (Settings or ANTHROPIC_API_KEY), chat()
// returns { ok:false, error:'no_key' } and the UI prompts for one.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const db = require('./db.cjs');

const DEFAULT_MODEL = 'claude-opus-4-8';

function configPath() {
  return path.join(app.getPath('userData'), 'churchos-ai.json');
}
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; }
}
function writeConfig(cfg) {
  try { fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2)); return true; } catch { return false; }
}
function getKey() {
  return process.env.ANTHROPIC_API_KEY || readConfig().apiKey || '';
}
function setKey(key) {
  const cfg = readConfig();
  cfg.apiKey = (key || '').trim();
  return writeConfig(cfg);
}
function getStatus() {
  return { configured: !!getKey(), model: readConfig().model || DEFAULT_MODEL };
}

// ── Read the parish data out of SQLite (one parish per install) ──
function dataset(suffix) {
  const all = db.getAll();
  const key = Object.keys(all).find((k) => k.endsWith('_' + suffix));
  if (!key) return [];
  try { const v = JSON.parse(all[key]); return Array.isArray(v) ? v : []; } catch { return []; }
}

const QUARTERS = { q1: ['01', '02', '03'], q2: ['04', '05', '06'], q3: ['07', '08', '09'], q4: ['10', '11', '12'] };
const ALL_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
// Parse a natural period into the YYYY-MM months it covers. A bare quarter
// ("q2") means the CURRENT year's quarter — never a hardcoded one — and an
// explicit year anywhere ("q2 2027", "2025-q1", "2027") overrides it, so the
// app keeps working as the years roll over.
function monthsFor(period) {
  if (!period) return null;
  const p = String(period).toLowerCase().trim();
  if (p === 'all') return null;                          // everything on record
  if (/^\d{4}-\d{2}$/.test(p)) return [p];               // explicit month
  const ym = p.match(/(20\d{2})/);
  const year = ym ? ym[1] : String(new Date().getFullYear());
  if (/^\d{4}$/.test(p)) return ALL_MONTHS.map((m) => p + '-' + m);   // whole year
  const q = p.match(/q([1-4])/);
  if (q) return QUARTERS['q' + q[1]].map((m) => year + '-' + m);
  if (p === 'year') return ALL_MONTHS.map((m) => year + '-' + m);     // current year
  return null;
}
function inPeriod(dateStr, months) {
  return !months || months.includes((dateStr || '').slice(0, 7));
}

function financialSummary(period) {
  const months = monthsFor(period);
  const cols = dataset('collections').filter((c) => inPeriod(c.date, months));
  const jrnl = dataset('journal_entries').filter((j) => inPeriod(j.date, months));
  const income = cols.reduce((s, c) => s + (c.total || 0), 0);
  let expenses = 0;
  for (const j of jrnl) for (const l of j.lines || []) {
    if (l.debit > 0 && String(l.accountCode).startsWith('5')) expenses += l.debit;
  }
  return { period: period || 'all', currency: 'PHP', income, expenses, net: income - expenses, collectionCount: cols.length };
}
function expenseBreakdown(period) {
  const months = monthsFor(period);
  const jrnl = dataset('journal_entries').filter((j) => inPeriod(j.date, months));
  const exp = {};
  for (const j of jrnl) for (const l of j.lines || []) {
    if (l.debit > 0 && String(l.accountCode).startsWith('5')) exp[l.accountName] = (exp[l.accountName] || 0) + l.debit;
  }
  const sorted = Object.entries(exp).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount }));
  return { period: period || 'all', currency: 'PHP', expenses: sorted };
}
function collectionsSummary(period) {
  const months = monthsFor(period);
  const cols = dataset('collections').filter((c) => inPeriod(c.date, months));
  const byMassTime = {};
  for (const c of cols) byMassTime[c.massTime] = (byMassTime[c.massTime] || 0) + (c.total || 0);
  return { period: period || 'all', currency: 'PHP', total: cols.reduce((s, c) => s + (c.total || 0), 0), byMassTime, count: cols.length };
}
function sacramentCounts() {
  return {
    baptisms: dataset('baptism_records').length,
    marriages: dataset('marriage_records').length,
    confirmations: dataset('confirmation_records').length,
    deaths: dataset('death_records').length,
  };
}

const TOOLS = [
  { name: 'get_financial_summary', description: 'Parish income, expenses, and net for a period. period is "q1".."q4", a "YYYY-MM" month, or "all".', input_schema: { type: 'object', properties: { period: { type: 'string' } } } },
  { name: 'get_expense_breakdown', description: 'Parish expenses by category, largest first, for a period.', input_schema: { type: 'object', properties: { period: { type: 'string' } } } },
  { name: 'get_collections', description: 'Sunday collection totals and breakdown by Mass time for a period.', input_schema: { type: 'object', properties: { period: { type: 'string' } } } },
  { name: 'get_sacrament_counts', description: 'How many baptisms, marriages, confirmations, and deaths are on record.', input_schema: { type: 'object', properties: {} } },
  { name: 'navigate', description: 'Open a page in ChurchOS for the user. page is one of: dashboard, finance, registry, directory, calendar, ministries, ssdm, reports, settings.', input_schema: { type: 'object', properties: { page: { type: 'string' } }, required: ['page'] } },
];

function executeTool(name, input) {
  const i = input || {};
  switch (name) {
    case 'get_financial_summary': return financialSummary(i.period);
    case 'get_expense_breakdown': return expenseBreakdown(i.period);
    case 'get_collections': return collectionsSummary(i.period);
    case 'get_sacrament_counts': return sacramentCounts();
    case 'navigate': return { ok: true, page: i.page };
    default: return { error: 'unknown tool: ' + name };
  }
}

const SYSTEM = [
  'You are the assistant inside ChurchOS, a parish management system for a Catholic parish in the Philippines.',
  'You help the parish priest and secretary with finances, records, sermons, and ministry.',
  'Rules:',
  '- For any question about money, sacraments, or parish data, CALL A TOOL and use the real figures it returns. Never invent numbers.',
  '- All amounts are Philippine pesos. Write them with a ₱ sign and thousands separators.',
  '- When the user asks to open, show, or go to part of the app, call the navigate tool.',
  '- Surface the insight that matters (e.g. the single expense that dominates), and flag one-time costs so figures are not misread.',
  '- For sermons and fundraising, draw on Catholic teaching and Filipino parish culture. Treat any sermon as ideas for the priest to review and make his own — never present a sermon as finished or authoritative.',
  '- Be warm, concise, and respectful. Address the priest as "Father" when natural.',
].join('\n');

async function callClaude(key, model, body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1500, system: SYSTEM, tools: TOOLS, ...body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 300));
  }
  return res.json();
}

async function chat(messages) {
  const key = getKey();
  if (!key) return { ok: false, error: 'no_key' };
  const model = readConfig().model || DEFAULT_MODEL;
  const convo = (messages || []).map((m) => ({ role: m.role, content: m.content }));
  let navigate = null;

  for (let step = 0; step < 6; step++) {
    let resp;
    try {
      resp = await callClaude(key, model, { messages: convo });
    } catch (e) {
      return { ok: false, error: 'api_error', message: String((e && e.message) || e) };
    }
    if (resp.stop_reason === 'tool_use') {
      convo.push({ role: 'assistant', content: resp.content });
      const results = [];
      for (const block of resp.content) {
        if (block.type === 'tool_use') {
          const out = executeTool(block.name, block.input);
          if (block.name === 'navigate' && out.page) navigate = { page: out.page };
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
        }
      }
      convo.push({ role: 'user', content: results });
      continue;
    }
    const text = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { ok: true, text, navigate };
  }
  return { ok: false, error: 'too_many_steps' };
}

module.exports = {
  getStatus, setKey, getKey, chat, executeTool,
  financialSummary, expenseBreakdown, collectionsSummary, sacramentCounts,
};
