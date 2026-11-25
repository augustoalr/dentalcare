import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import {
  readSupabaseConfig,
  type SupabaseEnvSource,
  type SupabasePublicConfig,
} from './supabaseConfig';

export type DentalCareSupabaseClient = SupabaseClient<Database>;

let cachedClient: DentalCareSupabaseClient | null = null;

/**
 * Factory for creating an isolated typed Supabase client (e.g. for tests or DI).
 */
export function createSupabaseClient(
  config: SupabasePublicConfig,
): DentalCareSupabaseClient {
  return createClient<Database>(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/**
 * Returns the singleton browser Supabase client when public env vars are set,
 * or `null` in safe degraded mode when backend credentials are not configured.
 */
export function getSupabaseClient(
  env?: SupabaseEnvSource,
): DentalCareSupabaseClient | null {
  if (env !== undefined) {
    const config = readSupabaseConfig(env);
    return config ? createSupabaseClient(config) : null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  const config = readSupabaseConfig();
  if (!config) {
    return null;
  }

  cachedClient = createSupabaseClient(config);
  return cachedClient;
}

/**
 * Clears the cached singleton client (for deterministic unit tests only).
 */
export function resetSupabaseClientForTests(): void {
  cachedClient = null;
}
