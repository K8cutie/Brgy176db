// ChurchOS Scan-Extract — Supabase Edge Function (Deno)
//
// Digitizes a photo of a parish's paper document (a Mass collection sheet, an
// expense/receipt/voucher, or a baptismal record) into the ScannedExtraction
// contract (see src/lib/scanTypes.ts). Like the `ai` function, the
// ANTHROPIC_API_KEY lives here server-side and never in the browser; the browser
// POSTs the base64 image with the user's Supabase JWT.
//
// This mirrors supabase/functions/ai/index.ts EXACTLY on the money-guarding
// posture: JWT required (verify_jwt on + in-band getUser), and every billed call
// passes through the same per-tenant cost guardrails we shipped — rate_allow
// (burst throttle) and ai_budget_allow (per-tenant daily cap + kill-switch +
// no-tenant guard). A vision call is more expensive than a text one, so the gate
// matters more here, not less.
//
// Deploy:  supabase functions deploy scan-extract   (JWT verification ON — do NOT
//          pass --no-verify-jwt; this spends money on every call.)
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//          (optional) supabase secrets set AI_ALLOWED_ORIGIN=https://<app>.vercel.app
//
// Note: this runs on Deno, not the app's Vite build — it is NOT type-checked by
// `npm run build` (tsconfig.app.json includes only ./src). It is a deploy
// artifact. The ScanDocType/field contract below is duplicated from
// src/lib/scanTypes.ts because Deno can't import from the app's src tree; keep the
// two in sync.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/log.ts';

// Mirror of AI_ALLOWED_ORIGIN handling in functions/ai. Default '*' preserves
// behavior; set AI_ALLOWED_ORIGIN in prod to stop arbitrary sites firing billed calls.
const ALLOWED_ORIGIN = Deno.env.get('AI_ALLOWED_ORIGIN') || '*';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Haiku 4.5 — fast, cheap, and vision-capable; suits short structured extraction.
const MODEL = 'claude-haiku-4-5';

// Duplicated from src/lib/scanTypes.ts (Deno can't reach the app src tree).
type ScanDocType = 'collection' | 'expense' | 'baptism' | 'unknown';
const DOC_TYPE_FIELDS: Record<ScanDocType, string[]> = {
  collection: ['date', 'massTime', 'cash', 'checks', 'digital'],
  expense: ['date', 'description', 'amount', 'category'],
  baptism: ['childName', 'dateOfBaptism', 'fatherName', 'motherName', 'godparents', 'registryNumber'],
  unknown: [],
};

const SYSTEM = [
  'You are digitizing a Philippine Catholic parish\'s paper document.',
  'Identify the document type (a Mass collection sheet, an expense/receipt/voucher, or a baptismal record) and extract the fields.',
  'Amounts are Philippine pesos — return digits only, no ₱ sign and no thousands commas (e.g. "12500.50", not "₱12,500.50").',
  'Dates as YYYY-MM-DD if determinable.',
  'Return ONLY strict JSON of the form: {"docType": "collection"|"expense"|"baptism"|"unknown", "confidence": 0-1, "fields": { ... }, "note": "..."}.',
  'Put anything you could not read confidently in "note".',
  'Never invent values; leave a field out entirely if it is not present on the document.',
  'The target field keys per document type are: ' + JSON.stringify(DOC_TYPE_FIELDS) + '.',
  'Fill only the keys for the type you identified. If you cannot tell the type, use docType "unknown", confidence 0, and describe what you see in "note".',
].join('\n');

// ~6 MB decoded ceiling. base64 encodes 3 bytes as 4 chars, so decoded ≈ len*3/4.
const MAX_DECODED_BYTES = 6 * 1024 * 1024;

async function callClaude(key: string, body: unknown) {
  // Bound the outbound call so a hung upstream can't pin an edge invocation open.
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: SYSTEM, ...(body as object) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('Anthropic ' + res.status + ': ' + (await res.text()).slice(0, 300));
  return res.json();
}

// Pull the first JSON object out of the model's text (it may wrap it in prose or a
// ```json fence despite instructions) and coerce it to the ScannedExtraction shape.
function coerceExtraction(text: string): { docType: ScanDocType; confidence: number; fields: Record<string, string>; note?: string } {
  const fallback = { docType: 'unknown' as ScanDocType, confidence: 0, fields: {} as Record<string, string> };
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return fallback;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return fallback;
  }
  const dt = parsed.docType;
  const docType: ScanDocType = dt === 'collection' || dt === 'expense' || dt === 'baptism' ? dt : 'unknown';
  let confidence = typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));
  const fields: Record<string, string> = {};
  if (parsed.fields && typeof parsed.fields === 'object') {
    for (const [k, v] of Object.entries(parsed.fields as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      fields[k] = typeof v === 'string' ? v : String(v);
    }
  }
  const note = typeof parsed.note === 'string' && parsed.note.trim() ? parsed.note : undefined;
  return { docType, confidence, fields, ...(note ? { note } : {}) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const log = createLogger('scan');
  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ ok: false, error: 'no_key' });

    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return json({ ok: false, error: 'unauthorized' }, 401);

    // RLS-scoped client: any query runs as THIS user only.
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );

    // Authenticate BEFORE spending any money — a bare anon key resolves to no user
    // here and is rejected, closing the "any internet caller burns the key" hole.
    const { data: userData, error: authErr } = await supa.auth.getUser();
    const uid = userData?.user?.id;
    if (authErr || !uid) return json({ ok: false, error: 'unauthorized' }, 401);

    // Per-user burst throttle (same RPC + gate-on-value pattern as functions/ai).
    // Only an explicit false blocks; a missing grant/function surfaces as an error,
    // not a false, so the scanner is never bricked by a missing throttle.
    {
      const { data: allowed, error: rlErr } = await supa.rpc('rate_allow', { p_key: 'scan:' + uid, p_limit: 30, p_window: '1 minute' });
      if (!rlErr && allowed === false) return json({ ok: false, error: 'rate_limited' }, 429);
    }

    // Per-tenant budget + kill-switch + no-tenant guard — the real spend ceiling,
    // checked BEFORE the Anthropic call. Only an explicit block status returns early.
    {
      const { data: budget, error: bErr } = await supa.rpc('ai_budget_allow');
      if (!bErr) {
        if (budget === 'no_tenant') return json({ ok: false, error: 'no_parish' }, 403);
        if (budget === 'disabled') return json({ ok: false, error: 'ai_disabled' }, 403);
        if (budget === 'budget_exceeded') return json({ ok: false, error: 'budget_exceeded' }, 429);
      }
    }

    const body = await req.json().catch(() => null) as
      { image?: unknown; mimeType?: unknown; hint?: unknown } | null;
    const image = body?.image;
    const mimeType = body?.mimeType;
    // Validate + bound the untrusted input so a caller can't force huge spend.
    if (typeof image !== 'string' || image.length === 0) return json({ ok: false, error: 'bad_request' }, 400);
    if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') return json({ ok: false, error: 'bad_request' }, 400);
    // base64 length → approx decoded byte count.
    if ((image.length * 3) / 4 > MAX_DECODED_BYTES) return json({ ok: false, error: 'payload_too_large' }, 413);
    const hint = body?.hint;
    const hintText = hint === 'collection' || hint === 'expense' || hint === 'baptism'
      ? `The user believes this is a ${hint} document — verify, but prefer that type if plausible.`
      : 'Identify the document type yourself.';

    const messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: image } },
        { type: 'text', text: hintText + ' Extract the fields and return ONLY the strict JSON described in the system instructions.' },
      ],
    }];

    const resp = await callClaude(key, { messages });
    const text = (resp.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
    const extraction = coerceExtraction(text);
    return json({ ok: true, extraction });
  } catch (e) {
    // Log real detail server-side only; return only a correlatable request_id.
    log.error('unhandled_error', { detail: String((e as Error)?.message ?? e) });
    return json({ ok: false, error: 'server_error', request_id: log.requestId });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
