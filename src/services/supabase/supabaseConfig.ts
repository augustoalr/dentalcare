export interface SupabasePublicConfig {
  readonly url: string;
  readonly anonKey: string;
}

export interface SupabaseEnvSource {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

function normalizeNonEmpty(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reads only the public Supabase browser configuration (`VITE_SUPABASE_URL`
 * and `VITE_SUPABASE_ANON_KEY`). Returns `null` when unconfigured so the app
 * degrades safely without crashing at startup.
 */
export function readSupabaseConfig(
  env: SupabaseEnvSource = import.meta.env,
): SupabasePublicConfig | null {
  const url = normalizeNonEmpty(env.VITE_SUPABASE_URL);
  const anonKey = normalizeNonEmpty(env.VITE_SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    return null;
  }

  return Object.freeze({ url, anonKey });
}

export function isSupabaseConfigured(
  env: SupabaseEnvSource = import.meta.env,
): boolean {
  return readSupabaseConfig(env) !== null;
}
