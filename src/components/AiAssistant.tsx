import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Send, X, KeyRound } from 'lucide-react';
import { buildAiContext, isAiContextEnabled, setAiContextEnabled, pageNameFromPath } from '@/lib/aiContext';
import { isCloud } from '@/lib/cloudStore';
import { getSupabase } from '@/lib/supabaseClient';

// The unified shape Cherub speaks in — returned by BOTH the desktop bridge
// (Electron main process) and the cloud Edge Function (supabase/functions/ai).
type ChatResult = {
  ok: boolean;
  text?: string;
  navigate?: { page: string } | null;
  error?: string;
  message?: string;
};

// The preload bridge (desktop only). Undefined in a plain browser build.
interface AiBridge {
  status: () => Promise<{ configured: boolean; model: string }>;
  setKey: (key: string) => Promise<{ ok: boolean }>;
  chat: (messages: { role: 'user' | 'assistant'; content: string }[]) => Promise<ChatResult>;
}
function bridge(): AiBridge | null {
  const w = window as unknown as { churchos?: { ai?: AiBridge } };
  return w.churchos?.ai ?? null;
}

// Minimal structural view of the cloud client's Edge-Function caller. The shared
// AnySupabase type doesn't declare `.functions`, so we narrow to just what we call
// here (keeps this to the two files in scope — no change to supabaseClient.ts).
type SupabaseFunctions = {
  functions: { invoke: (name: string, opts: { body: unknown }) => Promise<{ data: ChatResult | null; error: unknown }> };
};

const PAGE_PATHS: Record<string, string> = {
  dashboard: '/', finance: '/finance', registry: '/registry', directory: '/directory',
  calendar: '/calendar', requests: '/requests', intentions: '/intentions',
  ministries: '/ministries', ssdm: '/ssdm', reports: '/reports', settings: '/settings', import: '/import',
};

type Msg = { role: 'user' | 'assistant'; content: string };

export default function AiAssistant() {
  const ai = bridge();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  // Parish-context bridge: on by default, persisted opt-out.
  const [contextOn, setContextOn] = useState(() => isAiContextEnabled());
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && ai && configured === null) {
      ai.status().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
    }
  }, [open, ai, configured]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  if (!ai && !isCloud()) return null; // available on desktop (bridge) OR cloud (Edge Function)

  const saveKey = async () => {
    // Desktop-only: this runs solely from the bridge key-entry UI (never rendered in
    // cloud, where the key is server-side), so `ai` is guaranteed present here.
    if (!ai || !keyInput.trim()) return;
    await ai.setKey(keyInput.trim());
    const s = await ai.status();
    setConfigured(s.configured);
    setKeyInput('');
  };

  const toggleContext = () => {
    setContextOn((v) => {
      setAiContextEnabled(!v);
      return !v;
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError('');
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      // Context bridge: prepend the parish/app context to the OUTBOUND copy of
      // the latest message only — the transcript shown in the panel stays clean.
      // buildAiContext degrades to '' on any failure, which sends without context.
      const contextBlock = contextOn ? buildAiContext(location.pathname) : '';
      const outbound = contextBlock
        ? [...messages, { role: 'user' as const, content: `${contextBlock}\n\nUser message: ${text}` }]
        : next;

      // Unified send: desktop talks to the Electron bridge (ai.chat); cloud talks to
      // the Supabase Edge Function (key server-side). Both return the same ChatResult.
      let res: ChatResult;
      if (ai) {
        res = await ai.chat(outbound);
      } else {
        const supa = await getSupabase();
        const { data, error: invokeErr } = await (supa as unknown as SupabaseFunctions)
          .functions.invoke('ai', { body: { messages: outbound } });
        if (invokeErr || !data) {
          setError("Couldn't reach Cherub. Please check your connection and try again.");
          return;
        }
        res = data;
      }

      if (res.ok) {
        if (res.text) setMessages((m) => [...m, { role: 'assistant', content: res.text! }]);
        if (res.navigate?.page && PAGE_PATHS[res.navigate.page]) {
          navigate(PAGE_PATHS[res.navigate.page]);
        }
      } else if (res.error === 'no_key') {
        setConfigured(false);
      } else {
        setError(res.message || 'Something went wrong. Please try again.');
      }
    } catch {
      setError("Couldn't reach Cherub. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open Cherub, your parish helper"
        className="fixed bottom-6 right-6 z-overlay flex items-center justify-center w-14 h-14 rounded-full text-white shadow-modal hover:brightness-105 transition-all"
        style={{ backgroundColor: '#C9963B' }}
      >
        {open ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-overlay w-[380px] max-w-[calc(100vw-3rem)] h-[520px] max-h-[calc(100vh-8rem)] flex flex-col rounded-2xl bg-white dark:bg-dm-surface border border-parchment dark:border-dm-border shadow-modal overflow-hidden"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-parchment dark:border-dm-border" style={{ backgroundColor: '#FAF8F3' }}>
            <Sparkles className="w-5 h-5" style={{ color: '#C9963B' }} />
            <div>
              <p className="text-sm font-semibold text-charcoal">Cherub</p>
              <p className="text-[11px] text-warm-gray">Your parish helper — ask me how to do anything</p>
            </div>
          </div>

          {configured === false ? (
            ai ? (
              // DESKTOP (bridge present): the key lives on this computer, so let the
              // user enter it here. Unchanged from the original desktop behavior.
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <KeyRound className="w-8 h-8" style={{ color: '#C9963B' }} />
                <p className="text-sm text-charcoal dark:text-dm-text font-medium">Add your Anthropic API key</p>
                <p className="text-xs text-warm-gray">Cherub is ready — it just needs a key to start. It stays on this computer and is never shown again.</p>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full h-9 px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                />
                <button
                  onClick={saveKey}
                  className="w-full h-9 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: '#C9963B' }}
                >
                  Save key & start
                </button>
              </div>
            ) : (
              // CLOUD: the key is server-side (Edge Function secret). Never show a key
              // field here — just a calm nudge to whoever administers the parish.
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <Sparkles className="w-8 h-8" style={{ color: '#C9963B' }} />
                <p className="text-sm text-charcoal dark:text-dm-text font-medium">Cherub isn't switched on yet</p>
                <p className="text-xs text-warm-gray">Your parish admin needs to add the AI key before Cherub can help. Once it's set, just come back here.</p>
              </div>
            )
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                  <div className="text-xs text-warm-gray space-y-2 mt-2">
                    <p>Hi, I'm Cherub. Ask me how to do something, or I'll take you straight there.</p>
                    <p className="italic">"How do I record a wedding?"</p>
                    <p className="italic">"Where do I add a new family?"</p>
                    <p className="italic">"Take me to the finance report"</p>
                    <p className="italic">"Paano mag-record ng binyag?"</p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div
                      className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${m.role === 'user' ? 'text-white' : 'text-charcoal dark:text-dm-text bg-cream dark:bg-dm-surface-raised'}`}
                      style={m.role === 'user' ? { backgroundColor: '#C9963B' } : undefined}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {busy && <div className="text-xs text-warm-gray italic">Thinking…</div>}
                {error && <div className="text-xs text-error">{error}</div>}
              </div>

              {/* Context indicator + persisted opt-out toggle */}
              <div className="border-t border-parchment dark:border-dm-border px-3 py-1.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-warm-gray" title={contextOn ? 'Your parish name, current page, enabled modules, and record counts are attached to each message. No individual records or names are shared.' : 'Messages are sent without any parish context.'}>
                  <span className={`w-1.5 h-1.5 rounded-full ${contextOn ? 'bg-success' : 'bg-parchment dark:bg-dm-border'}`} />
                  {contextOn ? `Parish context attached (${pageNameFromPath(location.pathname)})` : 'Parish context off'}
                </span>
                <button
                  onClick={toggleContext}
                  aria-label={contextOn ? 'Turn off parish context' : 'Turn on parish context'}
                  className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${contextOn ? 'bg-gold' : 'bg-parchment dark:bg-dm-border'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${contextOn ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="border-t border-parchment dark:border-dm-border p-2 flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Ask Cherub…"
                  rows={1}
                  className="flex-1 resize-none max-h-24 px-3 py-2 rounded-lg border border-parchment bg-cream text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                />
                <button
                  onClick={send}
                  disabled={busy || !input.trim()}
                  className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-white disabled:opacity-40"
                  style={{ backgroundColor: '#C9963B' }}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
