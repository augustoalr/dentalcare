import type { AuthSessionUser } from '@/domain/auth';
import {
  getSupabaseClient,
  type DentalCareSupabaseClient,
} from '@/services/supabase/supabaseClient';

export type AuthChangeEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'INITIAL_SESSION';

const SUPPORTED_AUTH_EVENTS: ReadonlySet<string> = new Set<AuthChangeEvent>([
  'SIGNED_IN',
  'SIGNED_OUT',
  'TOKEN_REFRESHED',
  'USER_UPDATED',
  'INITIAL_SESSION',
]);

/**
 * Agnostic authentication contract so UI and state layers never import
 * `@supabase/supabase-js` directly.
 */
export interface IAuthService {
  getCurrentSession(): Promise<AuthSessionUser | null>;
  signInWithPassword(email: string, password: string): Promise<AuthSessionUser>;
  signOut(): Promise<void>;
  onAuthStateChange(
    listener: (event: AuthChangeEvent, user: AuthSessionUser | null) => void,
  ): () => void;
}

function mapSupabaseSessionUser(user: {
  id: string;
  email?: string | null;
}): AuthSessionUser {
  return Object.freeze({
    id: user.id,
    email: user.email ?? null,
  });
}

export class SupabaseAuthService implements IAuthService {
  private readonly client: DentalCareSupabaseClient;

  constructor(client: DentalCareSupabaseClient) {
    this.client = client;
  }

  async getCurrentSession(): Promise<AuthSessionUser | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      throw error;
    }

    const sessionUser = data.session?.user;
    return sessionUser ? mapSupabaseSessionUser(sessionUser) : null;
  }

  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<AuthSessionUser> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    if (!data.user) {
      throw new Error('Authentication completed without a user session');
    }

    return mapSupabaseSessionUser(data.user);
  }

  async signOut(): Promise<void> {
    let globalSignOutError: unknown = null;

    try {
      const { error } = await this.client.auth.signOut();
      if (error) {
        globalSignOutError = error;
      }
    } catch (err) {
      globalSignOutError = err;
    }

    if (!globalSignOutError) {
      return;
    }

    // Fallback: if global sign-out fails due to offline/5xx network errors,
    // `@supabase/auth-js` returns early before clearing browser storage.
    // Force `scope: 'local'` so local credentials/tokens are always wiped.
    const { error: localError } = await this.client.auth.signOut({
      scope: 'local',
    });
    if (localError) {
      throw localError;
    }
  }

  onAuthStateChange(
    listener: (event: AuthChangeEvent, user: AuthSessionUser | null) => void,
  ): () => void {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      if (!SUPPORTED_AUTH_EVENTS.has(event)) {
        return;
      }

      const mappedUser = session?.user
        ? mapSupabaseSessionUser(session.user)
        : null;
      listener(event as AuthChangeEvent, mappedUser);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }
}

/**
 * Returns the default browser auth service when Supabase public env vars are configured,
 * or `null` in safe degraded mode.
 */
export function createDefaultAuthService(): IAuthService | null {
  const client = getSupabaseClient();
  return client ? new SupabaseAuthService(client) : null;
}
