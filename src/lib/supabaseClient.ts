// ═══════════════════════════════════════════════════════════
// Shared Supabase client (SaaS / cloud edition)
//
// Created ONCE and reused by cloudStore (data) and cloudAuth (auth) so they
// share a single session. Dynamically imported, so the offline/desktop build
// never bundles supabase-js — this module is inert until cloud mode actually
// asks for the client.
// ═══════════════════════════════════════════════════════════

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

export function hasSupabaseConfig(): boolean {
  return !!env?.VITE_SUPABASE_URL && !!env?.VITE_SUPABASE_ANON_KEY;
}

// Minimal structural type — enough for our data + auth calls without statically
// importing supabase-js types into the desktop bundle.
export type AnySupabase = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auth: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

let clientPromise: Promise<AnySupabase> | null = null;

export async function getSupabase(): Promise<AnySupabase> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(env!.VITE_SUPABASE_URL!, env!.VITE_SUPABASE_ANON_KEY!, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      }) as unknown as AnySupabase,
    );
  }
  return clientPromise;
}
