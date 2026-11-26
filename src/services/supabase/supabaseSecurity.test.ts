import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseAuthService } from '@/services/auth/authService';
import { SupabaseClinicAccessRepository } from '@/services/repositories/clinicAccessRepository';
import {
  createSupabaseClient,
  getSupabaseClient,
  resetSupabaseClientForTests,
  type DentalCareSupabaseClient,
} from './supabaseClient';
import { isSupabaseConfigured, readSupabaseConfig } from './supabaseConfig';

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Supabase frontend wrapper security and degraded mode (R-11)', () => {
  beforeEach(() => {
    resetSupabaseClientForTests();
  });

  it('degrades safely to null when public Supabase env variables are missing or blank', () => {
    expect(readSupabaseConfig({})).toBeNull();
    expect(isSupabaseConfigured({})).toBe(false);
    expect(getSupabaseClient({})).toBeNull();

    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: '   ',
        VITE_SUPABASE_ANON_KEY: 'anon-key',
      }),
    ).toBeNull();

    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: '',
      }),
    ).toBeNull();
  });

  it('creates an immutable public config and typed client when both public variables are present', () => {
    const config = readSupabaseConfig({
      VITE_SUPABASE_URL: ' https://example.supabase.co ',
      VITE_SUPABASE_ANON_KEY: ' public-anon-key-placeholder ',
    });

    expect(config).toEqual({
      url: 'https://example.supabase.co',
      anonKey: 'public-anon-key-placeholder',
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(
      isSupabaseConfigured({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'public-anon-key-placeholder',
      }),
    ).toBe(true);

    const client = createSupabaseClient(config!);
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });

  it('appends audit_log entries without chaining .select() so non-admin roles never hit RLS 42501', async () => {
    const selectSpy = vi.fn();
    const insertSpy = vi.fn().mockImplementation(() => {
      const promise = Promise.resolve({ data: null, error: null }) as Promise<{
        data: null;
        error: null;
      }> & { select: typeof selectSpy };
      promise.select = selectSpy;
      return promise;
    });

    const mockClient = {
      from: vi.fn().mockReturnValue({ insert: insertSpy }),
    } as unknown as DentalCareSupabaseClient;

    const repo = new SupabaseClinicAccessRepository(mockClient);

    await repo.appendAuditLog({
      clinicId: 'clinic-1',
      actorId: 'user-1',
      action: 'clinic.viewed',
      entityType: 'clinic',
      entityId: 'clinic-1',
      metadata: { locale: 'en' },
    });

    expect(mockClient.from).toHaveBeenCalledWith('audit_log');
    expect(insertSpy).toHaveBeenCalledWith({
      clinic_id: 'clinic-1',
      actor_id: 'user-1',
      action: 'clinic.viewed',
      entity_type: 'clinic',
      entity_id: 'clinic-1',
      metadata_json: { locale: 'en' },
    });
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it('propagates database errors from clinic repository instead of silencing them', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'new row violates row-level security policy' },
        }),
      }),
    } as unknown as DentalCareSupabaseClient;

    const repo = new SupabaseClinicAccessRepository(mockClient);

    await expect(
      repo.appendAuditLog({
        clinicId: 'clinic-1',
        actorId: 'user-1',
        action: 'clinic.viewed',
        entityType: 'clinic',
      }),
    ).rejects.toThrow('Failed to append audit log entry');
  });

  it('sends ONLY { preferred_locale } in updatePreferredLocale to satisfy private.guard_profile_update()', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy });

    const mockClient = {
      from: vi.fn().mockReturnValue({ update: updateSpy }),
    } as unknown as DentalCareSupabaseClient;

    const repo = new SupabaseClinicAccessRepository(mockClient);
    await repo.updatePreferredLocale('user-dentist-1', 'es');

    expect(mockClient.from).toHaveBeenCalledWith('profiles');
    expect(updateSpy).toHaveBeenCalledTimes(1);

    const payload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(['preferred_locale']);
    expect(payload).toEqual({ preferred_locale: 'es' });
    expect(eqSpy).toHaveBeenCalledWith('id', 'user-dentist-1');
  });

  it('propagates errors from updatePreferredLocale and rejects blank userId', async () => {
    const eqSpy = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'network timeout' },
    });
    const mockClient = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: eqSpy }),
      }),
    } as unknown as DentalCareSupabaseClient;

    const repo = new SupabaseClinicAccessRepository(mockClient);

    await expect(repo.updatePreferredLocale('   ', 'en')).rejects.toThrow(
      'Cannot update preferred locale without a valid userId',
    );
    await expect(repo.updatePreferredLocale('user-1', 'en')).rejects.toThrow(
      'Failed to update preferred locale',
    );
  });

  it('encapsulates Supabase Auth in SupabaseAuthService without logging credentials or tokens', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => {});
    const unsubscribeSpy = vi.fn();

    const mockClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'secret-jwt-token',
              user: { id: 'user-1', email: 'dentist@clinic.example' },
            },
          },
          error: null,
        }),
        signInWithPassword: vi.fn().mockResolvedValue({
          data: {
            user: { id: 'user-1', email: 'dentist@clinic.example' },
          },
          error: null,
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        onAuthStateChange: vi.fn().mockImplementation((cb) => {
          cb('SIGNED_IN', {
            user: { id: 'user-1', email: 'dentist@clinic.example' },
          });
          return { data: { subscription: { unsubscribe: unsubscribeSpy } } };
        }),
      },
    } as unknown as DentalCareSupabaseClient;

    const authService = new SupabaseAuthService(mockClient);
    const sessionUser = await authService.getCurrentSession();
    expect(sessionUser).toEqual({
      id: 'user-1',
      email: 'dentist@clinic.example',
    });

    const signedInUser = await authService.signInWithPassword(
      'dentist@clinic.example',
      'SuperSecretPassword!123',
    );
    expect(signedInUser).toEqual({
      id: 'user-1',
      email: 'dentist@clinic.example',
    });

    const events: string[] = [];
    const unsubscribe = authService.onAuthStateChange((event) => {
      events.push(event);
    });
    expect(events).toEqual(['SIGNED_IN']);
    unsubscribe();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);

    await authService.signOut();

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleInfoSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  it('falls back to signOut({ scope: "local" }) when global signOut returns an error or throws a network exception (B-01)', async () => {
    const signOutErrorCase = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: '503 Service Unavailable' } })
      .mockResolvedValueOnce({ error: null });

    const authServiceErrorCase = new SupabaseAuthService({
      auth: { signOut: signOutErrorCase },
    } as unknown as DentalCareSupabaseClient);

    await expect(authServiceErrorCase.signOut()).resolves.toBeUndefined();
    expect(signOutErrorCase).toHaveBeenCalledTimes(2);
    expect(signOutErrorCase).toHaveBeenNthCalledWith(1);
    expect(signOutErrorCase).toHaveBeenNthCalledWith(2, { scope: 'local' });

    const signOutThrowCase = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ error: null });

    const authServiceThrowCase = new SupabaseAuthService({
      auth: { signOut: signOutThrowCase },
    } as unknown as DentalCareSupabaseClient);

    await expect(authServiceThrowCase.signOut()).resolves.toBeUndefined();
    expect(signOutThrowCase).toHaveBeenCalledTimes(2);
    expect(signOutThrowCase).toHaveBeenNthCalledWith(1);
    expect(signOutThrowCase).toHaveBeenNthCalledWith(2, { scope: 'local' });

    const signOutDoubleFail = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'Network down' } })
      .mockResolvedValueOnce({ error: { message: 'Storage locked' } });

    const authServiceDoubleFail = new SupabaseAuthService({
      auth: { signOut: signOutDoubleFail },
    } as unknown as DentalCareSupabaseClient);

    await expect(authServiceDoubleFail.signOut()).rejects.toEqual({
      message: 'Storage locked',
    });
  });

  it('never imports @supabase/supabase-js directly inside domain, features, or ui layers (SoC)', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const protectedDirs = ['domain', 'features', 'ui'].map((dir) =>
      path.join(srcRoot, dir),
    );

    for (const dirPath of protectedDirs) {
      for (const filePath of collectSourceFiles(dirPath)) {
        const content = readFileSync(filePath, 'utf8');
        expect(
          content.includes('@supabase/supabase-js'),
          `Direct @supabase/supabase-js import found in ${filePath}`,
        ).toBe(false);
      }
    }
  });

  it('never references private server secrets (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_DB_URL) anywhere in src/', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const currentTestFile = path.resolve(
      srcRoot,
      'services',
      'supabase',
      'supabaseSecurity.test.ts',
    );
    const forbiddenTokens = [
      ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_'),
      ['SUPABASE', 'DB', 'URL'].join('_'),
    ];

    const files = collectSourceFiles(srcRoot).filter(
      (filePath) => path.resolve(filePath) !== path.resolve(currentTestFile),
    );
    expect(files.length).toBeGreaterThan(0);

    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf8');
      for (const token of forbiddenTokens) {
        expect(
          content.includes(token),
          `Forbidden secret identifier "${token}" found in ${filePath}`,
        ).toBe(false);
      }
    }
  });
});
