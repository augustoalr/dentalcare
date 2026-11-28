import { MAX_MONEY_AMOUNT_CENTS } from '@/domain/money';
import {
  isTreatmentCategory,
  TREATMENT_MAX_DURATION_MIN,
  TREATMENT_MIN_DURATION_MIN,
  type ArchivedTreatmentRecord,
  type TreatmentInput,
  type TreatmentRecord,
} from '@/domain/treatments';
import type { TreatmentCatalogRow } from '@/services/supabase/database.types';
import {
  getSupabaseClient,
  type DentalCareSupabaseClient,
} from '@/services/supabase/supabaseClient';

const SAFE_ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,32}$/i;

/**
 * Agnostic repository contract for the clinic treatments catalog.
 * Isolates Supabase access from domain and UI layers, enforces logical archiving
 * (`deleted_at`), and validates untrusted database rows defensively.
 */
export interface ITreatmentRepository {
  listTreatments(clinicId: string): Promise<readonly TreatmentRecord[]>;
  listArchivedTreatments(
    clinicId: string,
  ): Promise<readonly ArchivedTreatmentRecord[]>;
  createTreatment(
    clinicId: string,
    input: TreatmentInput,
  ): Promise<TreatmentRecord>;
  updateTreatment(
    treatmentId: string,
    input: TreatmentInput,
  ): Promise<TreatmentRecord>;
  archiveTreatment(treatmentId: string): Promise<void>;
  restoreTreatment(treatmentId: string): Promise<void>;
}

/**
 * Pure check for PostgreSQL unique violation (`23505`), used when an active
 * treatment code already exists in the clinic.
 */
export function isDuplicateTreatmentCodeError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === '23505'
  );
}

function mapTreatmentRow(row: TreatmentCatalogRow): TreatmentRecord {
  if (!isTreatmentCategory(row.category)) {
    throw new Error('Invalid treatment category received from database');
  }

  if (
    !Number.isSafeInteger(row.default_price_cents) ||
    row.default_price_cents < 0 ||
    row.default_price_cents > MAX_MONEY_AMOUNT_CENTS
  ) {
    throw new Error('Invalid treatment price received from database');
  }

  if (
    !Number.isSafeInteger(row.default_duration_min) ||
    row.default_duration_min < TREATMENT_MIN_DURATION_MIN ||
    row.default_duration_min > TREATMENT_MAX_DURATION_MIN
  ) {
    throw new Error('Invalid treatment duration received from database');
  }

  return Object.freeze({
    id: row.id,
    clinicId: row.clinic_id,
    code: row.code,
    nameEn: row.name_en,
    nameEs: row.name_es,
    category: row.category,
    defaultPriceCents: row.default_price_cents,
    defaultDurationMin: row.default_duration_min,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapArchivedTreatmentRow(
  row: TreatmentCatalogRow & { readonly deleted_at: string },
): ArchivedTreatmentRecord {
  return Object.freeze({
    ...mapTreatmentRow(row),
    deletedAt: row.deleted_at,
  });
}

/**
 * Builds a safe Error carrying only sanitized SQL error codes (such as `23505`)
 * without exposing raw PostgreSQL error details.
 */
function createSafeTreatmentRepositoryError(
  operationMessage: string,
  dbError: { readonly code?: string } | null | undefined,
): Error {
  const rawCode =
    typeof dbError?.code === 'string' ? dbError.code.trim() : '';
  const safeCode = SAFE_ERROR_CODE_PATTERN.test(rawCode) ? rawCode : '';
  const message = safeCode
    ? `${operationMessage} (code: ${safeCode})`
    : operationMessage;

  return safeCode
    ? Object.assign(new Error(message), { code: safeCode })
    : new Error(message);
}

export class SupabaseTreatmentRepository implements ITreatmentRepository {
  private readonly client: DentalCareSupabaseClient;

  constructor(client: DentalCareSupabaseClient) {
    this.client = client;
  }

  async listTreatments(clinicId: string): Promise<readonly TreatmentRecord[]> {
    const normalizedClinicId = clinicId.trim();
    if (normalizedClinicId.length === 0) {
      throw new Error('Cannot list treatments without a valid clinicId');
    }

    const { data, error } = await this.client
      .from('treatments_catalog')
      .select('*')
      .eq('clinic_id', normalizedClinicId)
      .is('deleted_at', null)
      .order('category', { ascending: true })
      .order('name_en', { ascending: true });

    if (error) {
      throw createSafeTreatmentRepositoryError(
        'Failed to list clinic treatments',
        error,
      );
    }

    return Object.freeze((data ?? []).map(mapTreatmentRow));
  }

  async listArchivedTreatments(
    clinicId: string,
  ): Promise<readonly ArchivedTreatmentRecord[]> {
    const normalizedClinicId = clinicId.trim();
    if (normalizedClinicId.length === 0) {
      throw new Error(
        'Cannot list archived treatments without a valid clinicId',
      );
    }

    const { data, error } = await this.client
      .from('treatments_catalog')
      .select('*')
      .eq('clinic_id', normalizedClinicId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) {
      throw createSafeTreatmentRepositoryError(
        'Failed to list archived clinic treatments',
        error,
      );
    }

    const archivedRows = (data ?? []).filter(
      (row): row is TreatmentCatalogRow & { readonly deleted_at: string } =>
        typeof row.deleted_at === 'string' && row.deleted_at.length > 0,
    );

    return Object.freeze(archivedRows.map(mapArchivedTreatmentRow));
  }

  async createTreatment(
    clinicId: string,
    input: TreatmentInput,
  ): Promise<TreatmentRecord> {
    const normalizedClinicId = clinicId.trim();
    if (normalizedClinicId.length === 0) {
      throw new Error('Cannot create treatment without a valid clinicId');
    }

    // IMPORTANT: Send ONLY `clinic_id` + the 7 business columns
    // (never `id`, `created_at`, `updated_at`, or `deleted_at`).
    const { data, error } = await this.client
      .from('treatments_catalog')
      .insert({
        clinic_id: normalizedClinicId,
        code: input.code,
        name_en: input.nameEn,
        name_es: input.nameEs,
        category: input.category,
        default_price_cents: input.defaultPriceCents,
        default_duration_min: input.defaultDurationMin,
        is_active: input.isActive,
      })
      .select('*')
      .single();

    if (error) {
      throw createSafeTreatmentRepositoryError(
        'Failed to create treatment record',
        error,
      );
    }

    if (!data) {
      throw new Error('Failed to create treatment record: empty response');
    }

    return mapTreatmentRow(data);
  }

  async updateTreatment(
    treatmentId: string,
    input: TreatmentInput,
  ): Promise<TreatmentRecord> {
    const normalizedTreatmentId = treatmentId.trim();
    if (normalizedTreatmentId.length === 0) {
      throw new Error('Cannot update treatment without a valid treatmentId');
    }

    // IMPORTANT: Send ONLY the 7 editable columns (`code`, `name_en`, `name_es`,
    // `category`, `default_price_cents`, `default_duration_min`, `is_active`),
    // never `id`, `clinic_id`, `created_at`, `updated_at`, or `deleted_at`.
    const { data, error } = await this.client
      .from('treatments_catalog')
      .update({
        code: input.code,
        name_en: input.nameEn,
        name_es: input.nameEs,
        category: input.category,
        default_price_cents: input.defaultPriceCents,
        default_duration_min: input.defaultDurationMin,
        is_active: input.isActive,
      })
      .eq('id', normalizedTreatmentId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error) {
      throw createSafeTreatmentRepositoryError(
        'Failed to update treatment record',
        error,
      );
    }

    if (!data) {
      throw new Error('Failed to update treatment record: record not found');
    }

    return mapTreatmentRow(data);
  }

  async archiveTreatment(treatmentId: string): Promise<void> {
    const normalizedTreatmentId = treatmentId.trim();
    if (normalizedTreatmentId.length === 0) {
      throw new Error('Cannot archive treatment without a valid treatmentId');
    }

    // IMPORTANT: Pure soft-delete via `{ deleted_at }` WITHOUT `.select()` or
    // `.delete()`, matching `private.guard_treatment_catalog_update()` (B-01).
    const { error } = await this.client
      .from('treatments_catalog')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', normalizedTreatmentId)
      .is('deleted_at', null);

    if (error) {
      throw createSafeTreatmentRepositoryError(
        'Failed to archive treatment record',
        error,
      );
    }
  }

  async restoreTreatment(treatmentId: string): Promise<void> {
    const normalizedTreatmentId = treatmentId.trim();
    if (normalizedTreatmentId.length === 0) {
      throw new Error('Cannot restore treatment without a valid treatmentId');
    }

    // IMPORTANT: Pure admin-only restore sends ONLY `{ deleted_at: null }`
    // without `.select()`, matching `private.guard_treatment_catalog_update()`.
    const { error } = await this.client
      .from('treatments_catalog')
      .update({ deleted_at: null })
      .eq('id', normalizedTreatmentId)
      .not('deleted_at', 'is', null);

    if (error) {
      throw createSafeTreatmentRepositoryError(
        'Failed to restore treatment record',
        error,
      );
    }
  }
}

/**
 * Returns the default browser treatment repository when Supabase public env vars
 * are configured, or `null` in safe degraded mode.
 */
export function createDefaultTreatmentRepository(): ITreatmentRepository | null {
  const client = getSupabaseClient();
  return client ? new SupabaseTreatmentRepository(client) : null;
}
