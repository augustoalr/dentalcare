import type { SupportedLocale } from '@/domain/locale';
import type {
  ClinicRole,
  ClinicRow,
  Json,
  ProfileRow,
} from '@/services/supabase/database.types';
import {
  getSupabaseClient,
  type DentalCareSupabaseClient,
} from '@/services/supabase/supabaseClient';

export interface ClinicSummary {
  readonly id: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly currencySymbol: string;
  readonly taxRateBps: number;
  readonly taxLabel: string;
  readonly timezone: string;
  readonly defaultLocale: SupportedLocale;
}

export interface UserProfile {
  readonly id: string;
  readonly clinicId: string;
  readonly fullName: string;
  readonly role: ClinicRole;
  readonly preferredLocale: SupportedLocale;
  readonly isActive: boolean;
}

export interface CreateAuditLogInput {
  readonly clinicId: string;
  readonly actorId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly metadata?: Json;
}

/**
 * Agnostic repository contract for clinic identity, user profile, and immutable
 * audit trail entries. UI and domain layers depend on this interface, never on
 * Supabase directly.
 */
export interface IClinicAccessRepository {
  getActiveClinic(): Promise<ClinicSummary | null>;
  getCurrentProfile(userId: string): Promise<UserProfile | null>;
  updatePreferredLocale(userId: string, locale: SupportedLocale): Promise<void>;
  appendAuditLog(input: CreateAuditLogInput): Promise<void>;
}

function mapClinicRow(row: ClinicRow): ClinicSummary {
  return Object.freeze({
    id: row.id,
    name: row.name,
    currencyCode: row.currency_code,
    currencySymbol: row.currency_symbol,
    taxRateBps: row.tax_rate_bps,
    taxLabel: row.tax_label,
    timezone: row.timezone,
    defaultLocale: row.default_locale,
  });
}

function mapProfileRow(row: ProfileRow): UserProfile {
  return Object.freeze({
    id: row.id,
    clinicId: row.clinic_id,
    fullName: row.full_name,
    role: row.role,
    preferredLocale: row.preferred_locale,
    isActive: row.is_active,
  });
}

export class SupabaseClinicAccessRepository implements IClinicAccessRepository {
  private readonly client: DentalCareSupabaseClient;

  constructor(client: DentalCareSupabaseClient) {
    this.client = client;
  }

  async getActiveClinic(): Promise<ClinicSummary | null> {
    const { data, error } = await this.client
      .from('clinics')
      .select('*')
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch active clinic: ${error.message}`);
    }

    return data ? mapClinicRow(data) : null;
  }

  async getCurrentProfile(userId: string): Promise<UserProfile | null> {
    if (userId.trim().length === 0) {
      return null;
    }

    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch user profile: ${error.message}`);
    }

    return data ? mapProfileRow(data) : null;
  }

  async updatePreferredLocale(
    userId: string,
    locale: SupportedLocale,
  ): Promise<void> {
    if (userId.trim().length === 0) {
      throw new Error('Cannot update preferred locale without a valid userId');
    }

    // IMPORTANT: Send ONLY `{ preferred_locale: locale }` so `private.guard_profile_update()`
    // permits non-admin roles (`dentist`, `receptionist`) to update their own language
    // without triggering PostgreSQL 42501.
    const { error } = await this.client
      .from('profiles')
      .update({ preferred_locale: locale })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to update preferred locale: ${error.message}`);
    }
  }

  async appendAuditLog(input: CreateAuditLogInput): Promise<void> {
    // IMPORTANT: Never chain `.select()` after `.insert()` on `audit_log`.
    // `dentist` and `receptionist` roles are intentionally denied SELECT on `audit_log` by RLS,
    // so chaining `.select()` would fail with PostgreSQL 42501 for non-admin members.
    const { error } = await this.client.from('audit_log').insert({
      clinic_id: input.clinicId,
      actor_id: input.actorId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      metadata_json: input.metadata ?? {},
    });

    if (error) {
      throw new Error(`Failed to append audit log entry: ${error.message}`);
    }
  }
}

/**
 * Returns the default browser clinic repository when Supabase public env vars are configured,
 * or `null` in safe degraded mode.
 */
export function createDefaultClinicAccessRepository(): IClinicAccessRepository | null {
  const client = getSupabaseClient();
  return client ? new SupabaseClinicAccessRepository(client) : null;
}
