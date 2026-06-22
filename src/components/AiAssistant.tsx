import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, X, KeyRound } from 'lucide-react';

// The preload bridge (desktop only). Undefined in a plain browser build.
interface AiBridge {
  status: () => Promise<{ configured: boolean; model: string }>;
  setKey: (key: string) => Promise<{ ok: boolean }>;
  chat: (messages: { role: 'user' | 'assistant'; content: string }[]) => Promise<{
    ok: boolean;
    text?: string;
    navigate?: { page: string } | null;
    error?: string;
    message?: string;
  }>;
}
function bridge(): AiBridge | null {
  const w = window as unknown as { churchos?: { ai?: AiBridge } };
  return w.churchos?.ai ?? null;
}

const PAGE_PATHS: Record<string, string> = {
  dashboard: '/', finance: '/finance', registry: '/registry', directory: '/directory',
  calendar: '/calendar', ministries: '/ministries', ssdm: '/ssdm', reports: '/reports', settings: '/settings',
};

type Msg = { role: 'user' | 'assistant'; content: string };

export default function AiAssistant() {
  const ai = bridge();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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

  if (!ai) return null; // desktop-only feature

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    await ai.setKey(keyInput.trim());
    const s = await ai.status();
    setConfigured(s.configured);
    setKeyInput('');
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
      const res = await ai.chat(next);
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
      setError('Could not reach the assistant.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open ChurchOS Assistant"
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
              <p className="text-sm font-semibold text-charcoal">ChurchOS Assistant</p>
              <p className="text-[11px] text-warm-gray">Ask about your parish, finances, or sermons</p>
            </div>
          </div>

          {configured === false ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <KeyRound className="w-8 h-8" style={{ color: '#C9963B' }} />
              <p className="text-sm text-charcoal dark:text-dm-text font-medium">Add your Anthropic API key</p>
              <p className="text-xs text-warm-gray">The assistant is ready — it just needs a key to start. It stays on this computer and is never shown again.</p>
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
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                  <div className="text-xs text-warm-gray space-y-2 mt-2">
                    <p>Try asking:</p>
                    <p className="italic">"Open the financials and focus on first-quarter revenue"</p>
                    <p className="italic">"Where did we spend the most in Q1, aside from payroll?"</p>
                    <p className="italic">"Bounce me sermon ideas on the Prodigal Son — make it warm"</p>
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

              <div className="border-t border-parchment dark:border-dm-border p-2 flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Ask the assistant…"
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
