import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseAuthService } from '@/services/auth/authService';
import { SupabaseClinicAccessRepository } from '@/services/repositories/clinicAccessRepository';
import { SupabasePatientFileRepository } from '@/services/repositories/patientFileRepository';
import { SupabasePatientRepository } from '@/services/repositories/patientRepository';
import {
  isDuplicateTreatmentCodeError,
  SupabaseTreatmentRepository,
} from '@/services/repositories/treatmentRepository';
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

  it('sends ONLY the 7 editable clinic columns in updateClinicSettings, does not call audit_log manually, and propagates DB errors', async () => {
    const singleSpy = vi.fn().mockResolvedValue({
      data: {
        id: 'clinic-1',
        name: 'Clínica Sintética Madrid',
        currency_code: 'EUR',
        currency_symbol: '€',
        tax_rate_bps: 2100,
        tax_label: 'IVA',
        timezone: 'Europe/Madrid',
        default_locale: 'es',
        created_at: '2026-11-25T00:00:00Z',
        updated_at: '2026-11-26T00:00:00Z',
        deleted_at: null,
      },
      error: null,
    });
    const selectSpy = vi.fn().mockReturnValue({ single: singleSpy });
    const isSpy = vi.fn().mockReturnValue({ select: selectSpy });
    const eqSpy = vi.fn().mockReturnValue({ is: isSpy });
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const fromSpy = vi.fn().mockReturnValue({ update: updateSpy });

    const mockClient = {
      from: fromSpy,
    } as unknown as DentalCareSupabaseClient;

    const repo = new SupabaseClinicAccessRepository(mockClient);
    const updated = await repo.updateClinicSettings('clinic-1', {
      name: 'Clínica Sintética Madrid',
      currencyCode: 'EUR',
      currencySymbol: '€',
      taxRateBps: 2100,
      taxLabel: 'IVA',
      timezone: 'Europe/Madrid',
      defaultLocale: 'es',
    });

    expect(fromSpy).toHaveBeenCalledTimes(1);
    expect(fromSpy).toHaveBeenCalledWith('clinics');
    expect(fromSpy).not.toHaveBeenCalledWith('audit_log');

    const payload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      'currency_code',
      'currency_symbol',
      'default_locale',
      'name',
      'tax_label',
      'tax_rate_bps',
      'timezone',
    ]);
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('created_at');
    expect(payload).not.toHaveProperty('updated_at');
    expect(payload).not.toHaveProperty('deleted_at');

    expect(eqSpy).toHaveBeenCalledWith('id', 'clinic-1');
    expect(isSpy).toHaveBeenCalledWith('deleted_at', null);
    expect(selectSpy).toHaveBeenCalledWith('*');
    expect(Object.isFrozen(updated)).toBe(true);
    expect(updated).toEqual({
      id: 'clinic-1',
      name: 'Clínica Sintética Madrid',
      currencyCode: 'EUR',
      currencySymbol: '€',
      taxRateBps: 2100,
      taxLabel: 'IVA',
      timezone: 'Europe/Madrid',
      defaultLocale: 'es',
    });

    await expect(
      repo.updateClinicSettings('   ', {
        name: 'Clínica Sintética Madrid',
        currencyCode: 'EUR',
        currencySymbol: '€',
        taxRateBps: 2100,
        taxLabel: 'IVA',
        timezone: 'Europe/Madrid',
        defaultLocale: 'es',
      }),
    ).rejects.toThrow('Cannot update clinic settings without a valid clinicId');

    singleSpy.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for table clinics' },
    });

    await expect(
      repo.updateClinicSettings('clinic-1', {
        name: 'Clínica Sintética Madrid',
        currencyCode: 'EUR',
        currencySymbol: '€',
        taxRateBps: 2100,
        taxLabel: 'IVA',
        timezone: 'Europe/Madrid',
        defaultLocale: 'es',
      }),
    ).rejects.toThrow('Failed to update clinic settings');
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

  it('enforces least-privilege columns in SupabasePatientRepository (createPatient & updatePatient), archives via deleted_at WITHOUT .select() or .delete(), and strips PII from errors', async () => {
    const samplePatientRow = {
      id: 'patient-1',
      clinic_id: 'clinic-1',
      full_name: 'Nadia Synthetic Al Harbi',
      phone: '+971 50 000 1111',
      email: 'nadia.synthetic@dentalcare.test',
      date_of_birth: '1992-08-19',
      medical_alerts: 'Severe Penicillin and Latex allergy',
      general_notes: 'Synthetic anxious patient note',
      created_at: '2026-11-26T08:00:00Z',
      updated_at: '2026-11-26T09:00:00Z',
      deleted_at: null,
    };

    const insertSingleSpy = vi
      .fn()
      .mockResolvedValue({ data: samplePatientRow, error: null });
    const insertSelectSpy = vi.fn().mockReturnValue({ single: insertSingleSpy });
    const insertSpy = vi.fn().mockReturnValue({ select: insertSelectSpy });

    const updateSingleSpy = vi
      .fn()
      .mockResolvedValue({ data: samplePatientRow, error: null });
    const updateSelectSpy = vi.fn().mockReturnValue({ single: updateSingleSpy });

    const archiveSelectSpy = vi.fn();
    let mode: 'update' | 'archive' = 'update';

    const isSpy = vi.fn().mockImplementation(() => {
      if (mode === 'archive') {
        const archivePromise = Promise.resolve({
          data: null,
          error: null,
        }) as Promise<{ data: null; error: null }> & {
          select: typeof archiveSelectSpy;
        };
        archivePromise.select = archiveSelectSpy;
        return archivePromise;
      }
      return { select: updateSelectSpy };
    });

    const eqSpy = vi.fn().mockReturnValue({ is: isSpy });
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const deleteSpy = vi.fn();

    const fromSpy = vi.fn().mockReturnValue({
      insert: insertSpy,
      update: updateSpy,
      delete: deleteSpy,
    });

    const mockClient = {
      from: fromSpy,
    } as unknown as DentalCareSupabaseClient;

    const repo = new SupabasePatientRepository(mockClient);

    // 1. createPatient sends ONLY clinic_id + 6 business columns
    const created = await repo.createPatient('clinic-1', {
      fullName: samplePatientRow.full_name,
      phone: samplePatientRow.phone,
      email: samplePatientRow.email,
      dateOfBirth: samplePatientRow.date_of_birth,
      medicalAlerts: samplePatientRow.medical_alerts,
      generalNotes: samplePatientRow.general_notes,
    });

    const insertPayload = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(insertPayload).sort()).toEqual([
      'clinic_id',
      'date_of_birth',
      'email',
      'full_name',
      'general_notes',
      'medical_alerts',
      'phone',
    ]);
    expect(insertPayload).not.toHaveProperty('id');
    expect(insertPayload).not.toHaveProperty('deleted_at');
    expect(Object.isFrozen(created)).toBe(true);

    // 2. updatePatient sends ONLY the 6 editable columns (never id, clinic_id, created_at, updated_at, deleted_at)
    mode = 'update';
    await repo.updatePatient('patient-1', {
      fullName: samplePatientRow.full_name,
      phone: samplePatientRow.phone,
      email: samplePatientRow.email,
      dateOfBirth: samplePatientRow.date_of_birth,
      medicalAlerts: samplePatientRow.medical_alerts,
      generalNotes: samplePatientRow.general_notes,
    });

    const updatePayload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(updatePayload).sort()).toEqual([
      'date_of_birth',
      'email',
      'full_name',
      'general_notes',
      'medical_alerts',
      'phone',
    ]);
    expect(updatePayload).not.toHaveProperty('id');
    expect(updatePayload).not.toHaveProperty('clinic_id');
    expect(updatePayload).not.toHaveProperty('created_at');
    expect(updatePayload).not.toHaveProperty('updated_at');
    expect(updatePayload).not.toHaveProperty('deleted_at');

    // 3. archivePatient sets deleted_at WITHOUT chaining .select() and NEVER calls .delete()
    mode = 'archive';
    await repo.archivePatient('patient-1');

    const archivePayload = updateSpy.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(Object.keys(archivePayload)).toEqual(['deleted_at']);
    expect(typeof archivePayload.deleted_at).toBe('string');
    expect(archiveSelectSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();

    // 4. Error privacy: never echoes patient PII or clinical alerts even if PostgREST error contains them
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    updateSingleSpy.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23514',
        message:
          'Failing row contains (Nadia Synthetic Al Harbi, +971 50 000 1111, nadia.synthetic@dentalcare.test, Severe Penicillin and Latex allergy, Synthetic anxious patient note)',
      },
    });
    mode = 'update';

    let thrownError: Error | null = null;
    try {
      await repo.updatePatient('patient-1', {
        fullName: samplePatientRow.full_name,
        phone: samplePatientRow.phone,
        email: samplePatientRow.email,
        dateOfBirth: samplePatientRow.date_of_birth,
        medicalAlerts: samplePatientRow.medical_alerts,
        generalNotes: samplePatientRow.general_notes,
      });
    } catch (err) {
      thrownError = err as Error;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError?.message).toBe(
      'Failed to update patient record (code: 23514)',
    );
    expect(thrownError?.message).not.toContain('Nadia');
    expect(thrownError?.message).not.toContain('+971');
    expect(thrownError?.message).not.toContain('nadia.synthetic');
    expect(thrownError?.message).not.toContain('Penicillin');
    expect(thrownError?.message).not.toContain('anxious');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('enforces private bucket upsert:false, 7-column metadata insert, clamped signed URLs, soft-delete without .select()/.delete()/.remove(), and zero PII/token leakage in SupabasePatientFileRepository', async () => {
    const clinicId = '11111111-1111-4111-8111-111111111111';
    const patientId = '22222222-2222-4222-8222-222222222222';
    const uploadedBy = '33333333-3333-4333-8333-333333333333';

    const uploadSpy = vi.fn().mockResolvedValue({ data: { path: 'ok' }, error: null });
    const createSignedUrlSpy = vi.fn().mockResolvedValue({
      data: {
        signedUrl:
          'https://example.supabase.co/storage/v1/object/sign/patient-files/path?token=super-secret-signed-token',
      },
      error: null,
    });
    const removeSpy = vi.fn();
    const storageFromSpy = vi.fn().mockReturnValue({
      upload: uploadSpy,
      createSignedUrl: createSignedUrlSpy,
      remove: removeSpy,
    });

    const insertSingleSpy = vi.fn().mockImplementation(() => {
      const uploadedPath = uploadSpy.mock.calls[0]?.[0] as string;
      return Promise.resolve({
        data: {
          id: '44444444-4444-4444-8444-444444444444',
          clinic_id: clinicId,
          patient_id: patientId,
          appointment_id: null,
          storage_path: uploadedPath,
          file_name: 'intraoral_clean.png',
          mime_type: 'image/png',
          file_size_bytes: 16,
          uploaded_by: uploadedBy,
          created_at: '2026-11-26T12:00:00Z',
          updated_at: '2026-11-26T12:00:00Z',
          deleted_at: null,
        },
        error: null,
      });
    });
    const insertSelectSpy = vi.fn().mockReturnValue({ single: insertSingleSpy });
    const insertSpy = vi.fn().mockReturnValue({ select: insertSelectSpy });

    const archiveSelectSpy = vi.fn();
    const isSpy = vi.fn().mockImplementation(() => {
      const archivePromise = Promise.resolve({
        data: null,
        error: null,
      }) as Promise<{ data: null; error: null }> & {
        select: typeof archiveSelectSpy;
      };
      archivePromise.select = archiveSelectSpy;
      return archivePromise;
    });
    const eqSpy = vi.fn().mockReturnValue({ is: isSpy });
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const deleteSpy = vi.fn();
    const fromSpy = vi.fn().mockReturnValue({
      insert: insertSpy,
      update: updateSpy,
      delete: deleteSpy,
    });

    const mockClient = {
      from: fromSpy,
      storage: { from: storageFromSpy },
    } as unknown as DentalCareSupabaseClient;

    const repo = new SupabasePatientFileRepository(mockClient);

    // 1. uploadPatientFile uses private bucket 'patient-files', upsert:false, and inserts ONLY the 7 allowed columns with sanitized values
    const syntheticFile = new File(['synthetic-bytes!'], 'folder/intraoral_clean\u0000.png', {
      type: 'IMAGE/PNG; charset=binary',
    });

    const uploadedRecord = await repo.uploadPatientFile({
      clinicId,
      patientId,
      uploadedBy,
      file: syntheticFile,
    });

    expect(storageFromSpy).toHaveBeenCalledWith('patient-files');
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    const [uploadedStoragePath, uploadedBlob, uploadOptions] =
      uploadSpy.mock.calls[0] as [string, File, Record<string, unknown>];
    expect(uploadedStoragePath).toMatch(
      new RegExp(`^${clinicId}/${patientId}/[0-9a-f-]{36}\\.png$`),
    );
    expect(uploadedBlob).toBe(syntheticFile);
    expect(uploadOptions).toEqual({
      contentType: 'image/png',
      upsert: false,
    });

    const insertPayload = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(insertPayload).sort()).toEqual([
      'clinic_id',
      'file_name',
      'file_size_bytes',
      'mime_type',
      'patient_id',
      'storage_path',
      'uploaded_by',
    ]);
    expect(insertPayload.file_name).toBe('intraoral_clean.png');
    expect(insertPayload.mime_type).toBe('image/png');
    expect(insertPayload).not.toHaveProperty('id');
    expect(insertPayload).not.toHaveProperty('deleted_at');
    expect(Object.isFrozen(uploadedRecord)).toBe(true);

    // 2. createSignedFileUrl clamps TTL safely across edge values (NaN, Infinity, decimals, <=0, >300)
    await repo.createSignedFileUrl(uploadedStoragePath);
    expect(createSignedUrlSpy).toHaveBeenLastCalledWith(uploadedStoragePath, 300);

    await repo.createSignedFileUrl(uploadedStoragePath, 9999);
    expect(createSignedUrlSpy).toHaveBeenLastCalledWith(uploadedStoragePath, 300);

    await repo.createSignedFileUrl(uploadedStoragePath, Number.NaN);
    expect(createSignedUrlSpy).toHaveBeenLastCalledWith(uploadedStoragePath, 300);

    await repo.createSignedFileUrl(uploadedStoragePath, Number.POSITIVE_INFINITY);
    expect(createSignedUrlSpy).toHaveBeenLastCalledWith(uploadedStoragePath, 300);

    await repo.createSignedFileUrl(uploadedStoragePath, 0);
    expect(createSignedUrlSpy).toHaveBeenLastCalledWith(uploadedStoragePath, 1);

    await repo.createSignedFileUrl(uploadedStoragePath, -12);
    expect(createSignedUrlSpy).toHaveBeenLastCalledWith(uploadedStoragePath, 1);

    await repo.createSignedFileUrl(uploadedStoragePath, 45.9);
    expect(createSignedUrlSpy).toHaveBeenLastCalledWith(uploadedStoragePath, 45);

    // 3. archivePatientFile sets ONLY deleted_at without .select(), never calls .delete() or storage.remove()
    await repo.archivePatientFile('44444444-4444-4444-8444-444444444444');
    const archivePayload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(archivePayload)).toEqual(['deleted_at']);
    expect(typeof archivePayload.deleted_at).toBe('string');
    expect(archiveSelectSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();

    // 4. Privacy in errors: never leaks fileName, storagePath, or signed URL tokens
    uploadSpy.mockResolvedValueOnce({
      data: null,
      error: {
        statusCode: '403',
        message: `Access denied for ${uploadedStoragePath} (Layla_Private_Xray.png)`,
      },
    });

    let uploadErr: Error | null = null;
    try {
      await repo.uploadPatientFile({
        clinicId,
        patientId,
        uploadedBy,
        file: new File(['bytes'], 'Layla_Private_Xray.png', { type: 'image/png' }),
      });
    } catch (err) {
      uploadErr = err as Error;
    }

    expect(uploadErr?.message).toBe(
      'Failed to upload clinical file to private storage (code: 403)',
    );
    expect(uploadErr?.message).not.toContain('Layla');
    expect(uploadErr?.message).not.toContain(clinicId);
    expect(uploadErr?.message).not.toContain(patientId);

    createSignedUrlSpy.mockResolvedValueOnce({
      data: null,
      error: {
        statusCode: '400',
        message: `Failed signing ${uploadedStoragePath}?token=LEAKED_SECRET_TOKEN`,
      },
    });

    let signErr: Error | null = null;
    try {
      await repo.createSignedFileUrl(uploadedStoragePath, 120);
    } catch (err) {
      signErr = err as Error;
    }

    expect(signErr?.message).toBe(
      'Failed to generate temporary signed file URL (code: 400)',
    );
    expect(signErr?.message).not.toContain(uploadedStoragePath);
    expect(signErr?.message).not.toContain('LEAKED_SECRET_TOKEN');
  });

  it('enforces least-privilege payloads for restorePatient, restorePatientFile, purgeArchivedPatientFile, and purgeMistakenUpload, including B-03 silent storage denial protection', async () => {
    const patientId = '22222222-2222-4222-8222-222222222222';
    const fileId = '44444444-4444-4444-8444-444444444444';
    const storagePath =
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/44444444-4444-4444-8444-444444444444.jpg';

    // 1. restorePatient sends ONLY { deleted_at: null } without .select() or .delete()
    const restorePatientSelectSpy = vi.fn();
    const restorePatientNotSpy = vi.fn().mockImplementation(() => {
      const p = Promise.resolve({ data: null, error: null }) as Promise<{
        data: null;
        error: null;
      }> & { select: typeof restorePatientSelectSpy };
      p.select = restorePatientSelectSpy;
      return p;
    });
    const restorePatientEqSpy = vi
      .fn()
      .mockReturnValue({ not: restorePatientNotSpy });
    const restorePatientUpdateSpy = vi
      .fn()
      .mockReturnValue({ eq: restorePatientEqSpy });
    const restorePatientDeleteSpy = vi.fn();

    const patientRepo = new SupabasePatientRepository({
      from: vi.fn().mockReturnValue({
        update: restorePatientUpdateSpy,
        delete: restorePatientDeleteSpy,
      }),
    } as unknown as DentalCareSupabaseClient);

    await patientRepo.restorePatient(patientId);
    expect(restorePatientUpdateSpy).toHaveBeenCalledWith({ deleted_at: null });
    expect(
      Object.keys(
        restorePatientUpdateSpy.mock.calls[0]?.[0] as Record<string, unknown>,
      ),
    ).toEqual(['deleted_at']);
    expect(restorePatientEqSpy).toHaveBeenCalledWith('id', patientId);
    expect(restorePatientNotSpy).toHaveBeenCalledWith('deleted_at', 'is', null);
    expect(restorePatientSelectSpy).not.toHaveBeenCalled();
    expect(restorePatientDeleteSpy).not.toHaveBeenCalled();

    // 2. restorePatientFile sends ONLY { deleted_at: null } without .select(), .delete(), or storage.remove()
    const fileSelectSpy = vi.fn();
    const callOrder: string[] = [];

    const makeTerminalResult = () => {
      const p = Promise.resolve({ data: null, error: null }) as Promise<{
        data: null;
        error: null;
      }> & { select: typeof fileSelectSpy };
      p.select = fileSelectSpy;
      return p;
    };

    const removeSpy = vi.fn().mockImplementation(async () => {
      callOrder.push('storage.remove');
      return { data: [{ name: storagePath }], error: null };
    });

    const recordedChainCalls: {
      eqCalls: [string, unknown][];
      notCalls: [string, string, unknown][];
      isCalls: [string, unknown][];
    } = { eqCalls: [], notCalls: [], isCalls: [] };

    const updateFileSpy = vi.fn().mockImplementation(() => {
      callOrder.push('db.update');
      const chain = {
        eq(col: string, val: unknown) {
          recordedChainCalls.eqCalls.push([col, val]);
          return chain;
        },
        not(col: string, op: string, val: unknown) {
          recordedChainCalls.notCalls.push([col, op, val]);
          return chain;
        },
        is(col: string, val: unknown) {
          recordedChainCalls.isCalls.push([col, val]);
          if (col === 'purged_at') {
            return makeTerminalResult();
          }
          return chain;
        },
      };
      return chain;
    });
    const deleteFileSpy = vi.fn();

    const fileRepo = new SupabasePatientFileRepository({
      from: vi.fn().mockReturnValue({
        update: updateFileSpy,
        delete: deleteFileSpy,
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          remove: removeSpy,
        }),
      },
    } as unknown as DentalCareSupabaseClient);

    await fileRepo.restorePatientFile(fileId);
    expect(updateFileSpy).toHaveBeenCalledWith({ deleted_at: null });
    expect(
      Object.keys(updateFileSpy.mock.calls[0]?.[0] as Record<string, unknown>),
    ).toEqual(['deleted_at']);
    expect(fileSelectSpy).not.toHaveBeenCalled();
    expect(deleteFileSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();

    // 3. purgeArchivedPatientFile calls storage.remove([storagePath]) FIRST, then updates ONLY { purged_at } with .eq('storage_path')
    callOrder.length = 0;
    recordedChainCalls.eqCalls.length = 0;
    recordedChainCalls.notCalls.length = 0;
    recordedChainCalls.isCalls.length = 0;

    await fileRepo.purgeArchivedPatientFile(fileId, storagePath);
    expect(callOrder).toEqual(['storage.remove', 'db.update']);
    expect(removeSpy).toHaveBeenLastCalledWith([storagePath]);
    const archivedPurgePayload = updateFileSpy.mock.calls[1]?.[0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(archivedPurgePayload)).toEqual(['purged_at']);
    expect(typeof archivedPurgePayload.purged_at).toBe('string');
    expect(recordedChainCalls.eqCalls).toEqual([
      ['id', fileId],
      ['storage_path', storagePath],
    ]);
    expect(recordedChainCalls.notCalls).toEqual([['deleted_at', 'is', null]]);
    expect(recordedChainCalls.isCalls).toEqual([['purged_at', null]]);
    expect(fileSelectSpy).not.toHaveBeenCalled();
    expect(deleteFileSpy).not.toHaveBeenCalled();

    // 4. purgeMistakenUpload calls storage.remove([storagePath]) FIRST, then updates ONLY { deleted_at, purged_at } with .eq('storage_path')
    callOrder.length = 0;
    recordedChainCalls.eqCalls.length = 0;
    recordedChainCalls.notCalls.length = 0;
    recordedChainCalls.isCalls.length = 0;

    await fileRepo.purgeMistakenUpload(fileId, storagePath);
    expect(callOrder).toEqual(['storage.remove', 'db.update']);
    expect(removeSpy).toHaveBeenLastCalledWith([storagePath]);
    const mistakenPurgePayload = updateFileSpy.mock.calls[2]?.[0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(mistakenPurgePayload).sort()).toEqual([
      'deleted_at',
      'purged_at',
    ]);
    expect(recordedChainCalls.eqCalls).toEqual([
      ['id', fileId],
      ['storage_path', storagePath],
    ]);
    expect(recordedChainCalls.isCalls).toEqual([
      ['deleted_at', null],
      ['purged_at', null],
    ]);
    expect(fileSelectSpy).not.toHaveBeenCalled();
    expect(deleteFileSpy).not.toHaveBeenCalled();

    // 5. B-03: Silent storage denial `{ data: [], error: null }` AND storage error MUST throw sanitized error and NEVER update DB
    const updatesBeforeB03 = updateFileSpy.mock.calls.length;

    removeSpy.mockResolvedValueOnce({ data: [], error: null });
    await expect(
      fileRepo.purgeArchivedPatientFile(fileId, storagePath),
    ).rejects.toThrow(
      'Failed to purge archived clinical file from private storage',
    );
    expect(updateFileSpy).toHaveBeenCalledTimes(updatesBeforeB03);

    removeSpy.mockResolvedValueOnce({ data: [], error: null });
    await expect(
      fileRepo.purgeMistakenUpload(fileId, storagePath),
    ).rejects.toThrow(
      'Failed to purge recent clinical file from private storage',
    );
    expect(updateFileSpy).toHaveBeenCalledTimes(updatesBeforeB03);

    removeSpy.mockResolvedValueOnce({
      data: null,
      error: {
        statusCode: '403',
        message: `Denied deleting ${storagePath} (Layla_Private_Xray.jpg)`,
      },
    });
    let archivedPurgeErr: Error | null = null;
    try {
      await fileRepo.purgeArchivedPatientFile(fileId, storagePath);
    } catch (err) {
      archivedPurgeErr = err as Error;
    }
    expect(archivedPurgeErr?.message).toBe(
      'Failed to purge archived clinical file from private storage (code: 403)',
    );
    expect(archivedPurgeErr?.message).not.toContain(storagePath);
    expect(archivedPurgeErr?.message).not.toContain('Layla_Private_Xray');
    expect(updateFileSpy).toHaveBeenCalledTimes(updatesBeforeB03);

    removeSpy.mockResolvedValueOnce({
      data: null,
      error: {
        statusCode: '403',
        message: `Denied deleting ${storagePath} (Secret_Bitewing.webp)`,
      },
    });
    let mistakenPurgeErr: Error | null = null;
    try {
      await fileRepo.purgeMistakenUpload(fileId, storagePath);
    } catch (err) {
      mistakenPurgeErr = err as Error;
    }
    expect(mistakenPurgeErr?.message).toBe(
      'Failed to purge recent clinical file from private storage (code: 403)',
    );
    expect(mistakenPurgeErr?.message).not.toContain(storagePath);
    expect(mistakenPurgeErr?.message).not.toContain('Secret_Bitewing');
    expect(updateFileSpy).toHaveBeenCalledTimes(updatesBeforeB03);
  });

  it('enforces least-privilege payloads, pure archive/restore without .select()/.delete(), safe 23505 propagation, and defensive row validation in SupabaseTreatmentRepository (T-07)', async () => {
    const sampleRow = {
      id: 'treatment-1',
      clinic_id: 'clinic-1',
      code: 'CLEAN-01',
      name_en: 'Dental Prophylaxis',
      name_es: 'Limpieza Dental',
      category: 'preventive',
      default_price_cents: 15_050,
      default_duration_min: 45,
      is_active: true,
      created_at: '2026-11-27T08:00:00Z',
      updated_at: '2026-11-27T08:00:00Z',
      deleted_at: null,
    };

    const insertSingleSpy = vi
      .fn()
      .mockResolvedValue({ data: sampleRow, error: null });
    const insertSelectSpy = vi.fn().mockReturnValue({ single: insertSingleSpy });
    const insertSpy = vi.fn().mockReturnValue({ select: insertSelectSpy });

    const updateSingleSpy = vi
      .fn()
      .mockResolvedValue({ data: sampleRow, error: null });
    const updateSelectSpy = vi.fn().mockReturnValue({ single: updateSingleSpy });

    const archiveOrRestoreSelectSpy = vi.fn();
    let updateMode: 'edit' | 'archive' | 'restore' = 'edit';

    const makeNoSelectTerminal = () => {
      const promise = Promise.resolve({ data: null, error: null }) as Promise<{
        data: null;
        error: null;
      }> & { select: typeof archiveOrRestoreSelectSpy };
      promise.select = archiveOrRestoreSelectSpy;
      return promise;
    };

    const isSpy = vi.fn().mockImplementation(() => {
      if (updateMode === 'archive') {
        return makeNoSelectTerminal();
      }
      return { select: updateSelectSpy };
    });

    const notSpy = vi.fn().mockImplementation(() => makeNoSelectTerminal());
    const eqSpy = vi.fn().mockImplementation(() => ({
      is: isSpy,
      not: notSpy,
    }));
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const deleteSpy = vi.fn();
    const fromSpy = vi.fn().mockReturnValue({
      insert: insertSpy,
      update: updateSpy,
      delete: deleteSpy,
    });

    const repo = new SupabaseTreatmentRepository({
      from: fromSpy,
    } as unknown as DentalCareSupabaseClient);

    const input = {
      code: 'CLEAN-01',
      nameEn: 'Dental Prophylaxis',
      nameEs: 'Limpieza Dental',
      category: 'preventive' as const,
      defaultPriceCents: 15_050,
      defaultDurationMin: 45,
      isActive: true,
    };

    // 1. createTreatment sends ONLY clinic_id + 7 business columns
    const created = await repo.createTreatment('clinic-1', input);
    expect(fromSpy).toHaveBeenCalledWith('treatments_catalog');
    const insertPayload = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(insertPayload).sort()).toEqual([
      'category',
      'clinic_id',
      'code',
      'default_duration_min',
      'default_price_cents',
      'is_active',
      'name_en',
      'name_es',
    ]);
    expect(insertPayload).not.toHaveProperty('id');
    expect(insertPayload).not.toHaveProperty('created_at');
    expect(insertPayload).not.toHaveProperty('updated_at');
    expect(insertPayload).not.toHaveProperty('deleted_at');
    expect(Object.isFrozen(created)).toBe(true);

    // 2. updateTreatment sends ONLY the 7 editable columns
    updateMode = 'edit';
    await repo.updateTreatment('treatment-1', input);
    const editPayload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(editPayload).sort()).toEqual([
      'category',
      'code',
      'default_duration_min',
      'default_price_cents',
      'is_active',
      'name_en',
      'name_es',
    ]);
    expect(editPayload).not.toHaveProperty('id');
    expect(editPayload).not.toHaveProperty('clinic_id');
    expect(editPayload).not.toHaveProperty('created_at');
    expect(editPayload).not.toHaveProperty('updated_at');
    expect(editPayload).not.toHaveProperty('deleted_at');

    // 3. archiveTreatment sends ONLY { deleted_at } without .select() or .delete()
    updateMode = 'archive';
    await repo.archiveTreatment('treatment-1');
    const archivePayload = updateSpy.mock.calls[1]?.[0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(archivePayload)).toEqual(['deleted_at']);
    expect(typeof archivePayload.deleted_at).toBe('string');
    expect(archiveOrRestoreSelectSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();

    // 4. restoreTreatment sends ONLY { deleted_at: null } without .select() or .delete()
    updateMode = 'restore';
    await repo.restoreTreatment('treatment-1');
    const restorePayload = updateSpy.mock.calls[2]?.[0] as Record<
      string,
      unknown
    >;
    expect(restorePayload).toEqual({ deleted_at: null });
    expect(Object.keys(restorePayload)).toEqual(['deleted_at']);
    expect(notSpy).toHaveBeenCalledWith('deleted_at', 'is', null);
    expect(archiveOrRestoreSelectSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();

    // 5. Propagates code 23505 safely without leaking raw PostgreSQL error details
    insertSingleSpy.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "idx_treatments_catalog_clinic_code_active" Key (clinic_id, code)=(clinic-1, CLEAN-01) already exists',
      },
    });

    let dupErr: Error | null = null;
    try {
      await repo.createTreatment('clinic-1', input);
    } catch (err) {
      dupErr = err as Error;
    }
    expect(dupErr).not.toBeNull();
    expect(dupErr?.message).toBe(
      'Failed to create treatment record (code: 23505)',
    );
    expect(dupErr?.message).not.toContain('idx_treatments_catalog');
    expect(dupErr?.message).not.toContain('clinic-1');
    expect(isDuplicateTreatmentCodeError(dupErr)).toBe(true);

    // 6. Defensive row mapping rejects invalid category or unsafe/out-of-range prices
    insertSingleSpy.mockResolvedValueOnce({
      data: { ...sampleRow, category: 'unknown_category' },
      error: null,
    });
    await expect(repo.createTreatment('clinic-1', input)).rejects.toThrow(
      'Invalid treatment category received from database',
    );

    insertSingleSpy.mockResolvedValueOnce({
      data: { ...sampleRow, default_price_cents: 100_000_000_000 },
      error: null,
    });
    await expect(repo.createTreatment('clinic-1', input)).rejects.toThrow(
      'Invalid treatment price received from database',
    );
  });

  it('never calls getPublicUrl anywhere in src/ (private Storage signed URLs only)', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const currentTestFile = path.resolve(
      srcRoot,
      'services',
      'supabase',
      'supabaseSecurity.test.ts',
    );
    const forbiddenPublicUrlCall = ['get', 'Public', 'Url'].join('');

    const files = collectSourceFiles(srcRoot).filter(
      (filePath) => path.resolve(filePath) !== path.resolve(currentTestFile),
    );
    expect(files.length).toBeGreaterThan(0);

    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf8');
      expect(
        content.includes(forbiddenPublicUrlCall),
        `Forbidden "${forbiddenPublicUrlCall}" reference found in ${filePath}`,
      ).toBe(false);
    }
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
