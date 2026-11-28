import {
  isAppointmentStatus,
  type AppointmentCreateInput,
  type AppointmentRecord,
  type AppointmentStatus,
  type AppointmentUpdateInput,
  type ArchivedAppointmentRecord,
  type ClinicProvider,
} from '@/domain/appointments';
import type {
  AppointmentInsert,
  AppointmentRow,
  AppointmentUpdate,
} from '@/services/supabase/database.types';
import {
  getSupabaseClient,
  type DentalCareSupabaseClient,
} from '@/services/supabase/supabaseClient';

const SAFE_ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,32}$/i;

export const APPOINTMENT_SELECT_WITH_CLINICAL_NOTES =
  'id, clinic_id, patient_id, dentist_id, starts_at, ends_at, status, reason, clinical_notes, reminder_sent_at, created_at, updated_at, deleted_at' as const;

export const APPOINTMENT_SELECT_WITHOUT_CLINICAL_NOTES =
  'id, clinic_id, patient_id, dentist_id, starts_at, ends_at, status, reason, reminder_sent_at, created_at, updated_at, deleted_at' as const;

export interface AppointmentDateRange {
  readonly startIso: string;
  readonly endIso: string;
}

export interface AppointmentQueryOptions {
  readonly includeClinicalNotes?: boolean;
}

/**
 * Agnostic repository contract for clinic appointments, visit clinical notes,
 * and active clinic providers (dentists/admins). Isolates Supabase access from
 * UI and domain layers, enforces privacy-aware column projection for receptionists,
 * and uses logical archiving (`deleted_at`) exclusively.
 */
export interface IAppointmentRepository {
  listClinicProviders(clinicId: string): Promise<readonly ClinicProvider[]>;
  listAppointmentsByRange(
    clinicId: string,
    range: AppointmentDateRange,
    options?: AppointmentQueryOptions,
  ): Promise<readonly AppointmentRecord[]>;
  listAppointmentsByPatient(
    clinicId: string,
    patientId: string,
    options?: AppointmentQueryOptions,
  ): Promise<readonly AppointmentRecord[]>;
  listArchivedAppointments(
    clinicId: string,
    options?: AppointmentQueryOptions,
  ): Promise<readonly ArchivedAppointmentRecord[]>;
  createAppointment(
    clinicId: string,
    input: AppointmentCreateInput,
    options?: AppointmentQueryOptions,
  ): Promise<AppointmentRecord>;
  updateAppointment(
    appointmentId: string,
    input: AppointmentUpdateInput,
    options?: AppointmentQueryOptions,
  ): Promise<AppointmentRecord>;
  updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
    options?: AppointmentQueryOptions,
  ): Promise<AppointmentRecord>;
  updateClinicalNotes(
    appointmentId: string,
    clinicalNotes: string | null,
  ): Promise<AppointmentRecord>;
  archiveAppointment(appointmentId: string): Promise<void>;
  restoreAppointment(appointmentId: string): Promise<void>;
}

type AppointmentRowWithoutNotes = Omit<AppointmentRow, 'clinical_notes'> & {
  readonly clinical_notes?: string | null;
};

function mapAppointmentRow(
  row: AppointmentRowWithoutNotes,
  includeClinicalNotes: boolean,
): AppointmentRecord {
  if (!isAppointmentStatus(row.status)) {
    throw new Error('Invalid appointment status received from database');
  }

  return Object.freeze({
    id: row.id,
    clinicId: row.clinic_id,
    patientId: row.patient_id,
    dentistId: row.dentist_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    reason: row.reason,
    clinicalNotes: includeClinicalNotes ? (row.clinical_notes ?? null) : null,
    reminderSentAt: row.reminder_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapArchivedAppointmentRow(
  row: AppointmentRowWithoutNotes & { readonly deleted_at: string },
  includeClinicalNotes: boolean,
): ArchivedAppointmentRecord {
  return Object.freeze({
    ...mapAppointmentRow(row, includeClinicalNotes),
    deletedAt: row.deleted_at,
  });
}

/**
 * Builds a PII-safe Error carrying only sanitized SQL error codes without
 * echoing raw PostgreSQL details, patient/provider identifiers, or clinical notes.
 */
function createSafeAppointmentRepositoryError(
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

export class SupabaseAppointmentRepository implements IAppointmentRepository {
  private readonly client: DentalCareSupabaseClient;

  constructor(client: DentalCareSupabaseClient) {
    this.client = client;
  }

  async listClinicProviders(
    clinicId: string,
  ): Promise<readonly ClinicProvider[]> {
    const normalizedClinicId = clinicId.trim();
    if (normalizedClinicId.length === 0) {
      throw new Error('Cannot list clinic providers without a valid clinicId');
    }

    const { data, error } = await this.client
      .from('profiles')
      .select('id, full_name, role')
      .eq('clinic_id', normalizedClinicId)
      .in('role', ['dentist', 'admin'])
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('full_name', { ascending: true });

    if (error) {
      throw createSafeAppointmentRepositoryError(
        'Failed to list clinic providers',
        error,
      );
    }

    const providers: ClinicProvider[] = [];
    for (const row of data ?? []) {
      if (row.role === 'admin' || row.role === 'dentist') {
        providers.push(
          Object.freeze({
            id: row.id,
            fullName: row.full_name,
            role: row.role,
          }),
        );
      }
    }

    return Object.freeze(providers);
  }

  async listAppointmentsByRange(
    clinicId: string,
    range: AppointmentDateRange,
    options?: AppointmentQueryOptions,
  ): Promise<readonly AppointmentRecord[]> {
    const normalizedClinicId = clinicId.trim();
    if (normalizedClinicId.length === 0) {
      throw new Error('Cannot list appointments without a valid clinicId');
    }

    const includeNotes = options?.includeClinicalNotes !== false;
    const response = includeNotes
      ? await this.client
          .from('appointments')
          .select(APPOINTMENT_SELECT_WITH_CLINICAL_NOTES)
          .eq('clinic_id', normalizedClinicId)
          .is('deleted_at', null)
          .lt('starts_at', range.endIso)
          .gt('ends_at', range.startIso)
          .order('starts_at', { ascending: true })
      : await this.client
          .from('appointments')
          .select(APPOINTMENT_SELECT_WITHOUT_CLINICAL_NOTES)
          .eq('clinic_id', normalizedClinicId)
          .is('deleted_at', null)
          .lt('starts_at', range.endIso)
          .gt('ends_at', range.startIso)
          .order('starts_at', { ascending: true });

    if (response.error) {
      throw createSafeAppointmentRepositoryError(
        'Failed to list clinic appointments',
        response.error,
      );
    }

    return Object.freeze(
      (response.data ?? []).map((row) => mapAppointmentRow(row, includeNotes)),
    );
  }

  async listAppointmentsByPatient(
    clinicId: string,
    patientId: string,
    options?: AppointmentQueryOptions,
  ): Promise<readonly AppointmentRecord[]> {
    const normalizedClinicId = clinicId.trim();
    const normalizedPatientId = patientId.trim();
    if (normalizedClinicId.length === 0 || normalizedPatientId.length === 0) {
      throw new Error(
        'Cannot list patient appointments without valid clinicId and patientId',
      );
    }

    const includeNotes = options?.includeClinicalNotes !== false;
    const response = includeNotes
      ? await this.client
          .from('appointments')
          .select(APPOINTMENT_SELECT_WITH_CLINICAL_NOTES)
          .eq('clinic_id', normalizedClinicId)
          .eq('patient_id', normalizedPatientId)
          .is('deleted_at', null)
          .order('starts_at', { ascending: false })
      : await this.client
          .from('appointments')
          .select(APPOINTMENT_SELECT_WITHOUT_CLINICAL_NOTES)
          .eq('clinic_id', normalizedClinicId)
          .eq('patient_id', normalizedPatientId)
          .is('deleted_at', null)
          .order('starts_at', { ascending: false });

    if (response.error) {
      throw createSafeAppointmentRepositoryError(
        'Failed to list patient appointments',
        response.error,
      );
    }

    return Object.freeze(
      (response.data ?? []).map((row) => mapAppointmentRow(row, includeNotes)),
    );
  }

  async listArchivedAppointments(
    clinicId: string,
    options?: AppointmentQueryOptions,
  ): Promise<readonly ArchivedAppointmentRecord[]> {
    const normalizedClinicId = clinicId.trim();
    if (normalizedClinicId.length === 0) {
      throw new Error(
        'Cannot list archived appointments without a valid clinicId',
      );
    }

    const includeNotes = options?.includeClinicalNotes !== false;
    const response = includeNotes
      ? await this.client
          .from('appointments')
          .select(APPOINTMENT_SELECT_WITH_CLINICAL_NOTES)
          .eq('clinic_id', normalizedClinicId)
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false })
      : await this.client
          .from('appointments')
          .select(APPOINTMENT_SELECT_WITHOUT_CLINICAL_NOTES)
          .eq('clinic_id', normalizedClinicId)
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false });

    if (response.error) {
      throw createSafeAppointmentRepositoryError(
        'Failed to list archived clinic appointments',
        response.error,
      );
    }

    const archivedRows = (response.data ?? []).filter(
      (
        row,
      ): row is AppointmentRowWithoutNotes & { readonly deleted_at: string } =>
        typeof row.deleted_at === 'string' && row.deleted_at.length > 0,
    );

    return Object.freeze(
      archivedRows.map((row) => mapArchivedAppointmentRow(row, includeNotes)),
    );
  }

  async createAppointment(
    clinicId: string,
    input: AppointmentCreateInput,
    options?: AppointmentQueryOptions,
  ): Promise<AppointmentRecord> {
    const normalizedClinicId = clinicId.trim();
    if (normalizedClinicId.length === 0) {
      throw new Error('Cannot create appointment without a valid clinicId');
    }

    const includeNotes = options?.includeClinicalNotes !== false;

    // IMPORTANT: Send ONLY allowed creation columns (never `id`, `reminder_sent_at`,
    // `created_at`, `updated_at`, or `deleted_at`) and omit `clinical_notes` when
    // the caller is not permitted to author clinical notes (M-01).
    const payload: AppointmentInsert = {
      clinic_id: normalizedClinicId,
      patient_id: input.patientId,
      dentist_id: input.dentistId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      status: input.status,
      reason: input.reason,
      ...(includeNotes &&
      input.clinicalNotes !== undefined &&
      input.clinicalNotes !== null
        ? { clinical_notes: input.clinicalNotes }
        : {}),
    };

    const response = includeNotes
      ? await this.client
          .from('appointments')
          .insert(payload)
          .select(APPOINTMENT_SELECT_WITH_CLINICAL_NOTES)
          .single()
      : await this.client
          .from('appointments')
          .insert(payload)
          .select(APPOINTMENT_SELECT_WITHOUT_CLINICAL_NOTES)
          .single();

    if (response.error) {
      throw createSafeAppointmentRepositoryError(
        'Failed to create appointment record',
        response.error,
      );
    }

    if (!response.data) {
      throw new Error('Failed to create appointment record: empty response');
    }

    return mapAppointmentRow(response.data, includeNotes);
  }

  async updateAppointment(
    appointmentId: string,
    input: AppointmentUpdateInput,
    options?: AppointmentQueryOptions,
  ): Promise<AppointmentRecord> {
    const normalizedAppointmentId = appointmentId.trim();
    if (normalizedAppointmentId.length === 0) {
      throw new Error('Cannot update appointment without a valid appointmentId');
    }

    const includeNotes = options?.includeClinicalNotes !== false;

    // IMPORTANT: Send ONLY provided editable columns (never `id`, `clinic_id`,
    // `patient_id`, `created_at`, `updated_at`, or `deleted_at`; and NEVER
    // include `clinical_notes` if undefined or disallowed).
    const payload: AppointmentUpdate = {
      ...(input.dentistId !== undefined ? { dentist_id: input.dentistId } : {}),
      ...(input.startsAt !== undefined ? { starts_at: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { ends_at: input.endsAt } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(includeNotes && input.clinicalNotes !== undefined
        ? { clinical_notes: input.clinicalNotes }
        : {}),
    };

    const response = includeNotes
      ? await this.client
          .from('appointments')
          .update(payload)
          .eq('id', normalizedAppointmentId)
          .is('deleted_at', null)
          .select(APPOINTMENT_SELECT_WITH_CLINICAL_NOTES)
          .single()
      : await this.client
          .from('appointments')
          .update(payload)
          .eq('id', normalizedAppointmentId)
          .is('deleted_at', null)
          .select(APPOINTMENT_SELECT_WITHOUT_CLINICAL_NOTES)
          .single();

    if (response.error) {
      throw createSafeAppointmentRepositoryError(
        'Failed to update appointment record',
        response.error,
      );
    }

    if (!response.data) {
      throw new Error(
        'Failed to update appointment record: record not found',
      );
    }

    return mapAppointmentRow(response.data, includeNotes);
  }

  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
    options?: AppointmentQueryOptions,
  ): Promise<AppointmentRecord> {
    const normalizedAppointmentId = appointmentId.trim();
    if (normalizedAppointmentId.length === 0) {
      throw new Error(
        'Cannot update appointment status without a valid appointmentId',
      );
    }

    const includeNotes = options?.includeClinicalNotes !== false;

    // IMPORTANT: Send ONLY `{ status }` so receptionists can update status
    // without ever touching `clinical_notes`.
    const response = includeNotes
      ? await this.client
          .from('appointments')
          .update({ status })
          .eq('id', normalizedAppointmentId)
          .is('deleted_at', null)
          .select(APPOINTMENT_SELECT_WITH_CLINICAL_NOTES)
          .single()
      : await this.client
          .from('appointments')
          .update({ status })
          .eq('id', normalizedAppointmentId)
          .is('deleted_at', null)
          .select(APPOINTMENT_SELECT_WITHOUT_CLINICAL_NOTES)
          .single();

    if (response.error) {
      throw createSafeAppointmentRepositoryError(
        'Failed to update appointment status',
        response.error,
      );
    }

    if (!response.data) {
      throw new Error(
        'Failed to update appointment status: record not found',
      );
    }

    return mapAppointmentRow(response.data, includeNotes);
  }

  async updateClinicalNotes(
    appointmentId: string,
    clinicalNotes: string | null,
  ): Promise<AppointmentRecord> {
    const normalizedAppointmentId = appointmentId.trim();
    if (normalizedAppointmentId.length === 0) {
      throw new Error(
        'Cannot update clinical notes without a valid appointmentId',
      );
    }

    // IMPORTANT: Send ONLY `{ clinical_notes }` so DB triggers audit clinical_notes_updated cleanly.
    const { data, error } = await this.client
      .from('appointments')
      .update({ clinical_notes: clinicalNotes })
      .eq('id', normalizedAppointmentId)
      .is('deleted_at', null)
      .select(APPOINTMENT_SELECT_WITH_CLINICAL_NOTES)
      .single();

    if (error) {
      throw createSafeAppointmentRepositoryError(
        'Failed to update clinical notes',
        error,
      );
    }

    if (!data) {
      throw new Error('Failed to update clinical notes: record not found');
    }

    return mapAppointmentRow(data, true);
  }

  async archiveAppointment(appointmentId: string): Promise<void> {
    const normalizedAppointmentId = appointmentId.trim();
    if (normalizedAppointmentId.length === 0) {
      throw new Error(
        'Cannot archive appointment without a valid appointmentId',
      );
    }

    // IMPORTANT: Pure soft-delete via `{ deleted_at }` WITHOUT `.select()` or `.delete()`.
    const { error } = await this.client
      .from('appointments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', normalizedAppointmentId)
      .is('deleted_at', null);

    if (error) {
      throw createSafeAppointmentRepositoryError(
        'Failed to archive appointment record',
        error,
      );
    }
  }

  async restoreAppointment(appointmentId: string): Promise<void> {
    const normalizedAppointmentId = appointmentId.trim();
    if (normalizedAppointmentId.length === 0) {
      throw new Error(
        'Cannot restore appointment without a valid appointmentId',
      );
    }

    // IMPORTANT: Pure admin-only restore sends ONLY `{ deleted_at: null }` WITHOUT `.select()`.
    const { error } = await this.client
      .from('appointments')
      .update({ deleted_at: null })
      .eq('id', normalizedAppointmentId)
      .not('deleted_at', 'is', null);

    if (error) {
      throw createSafeAppointmentRepositoryError(
        'Failed to restore appointment record',
        error,
      );
    }
  }
}

/**
 * Returns the default browser appointment repository when Supabase public env
 * vars are configured, or `null` in safe degraded mode.
 */
export function createDefaultAppointmentRepository(): IAppointmentRepository | null {
  const client = getSupabaseClient();
  return client ? new SupabaseAppointmentRepository(client) : null;
}
