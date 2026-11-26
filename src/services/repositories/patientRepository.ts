import type { PatientInput, PatientRecord } from '@/domain/patients';
import type { PatientRow } from '@/services/supabase/database.types';
import {
  getSupabaseClient,
  type DentalCareSupabaseClient,
} from '@/services/supabase/supabaseClient';

const SAFE_ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,32}$/i;

/**
 * Agnostic repository contract for clinic patient records.
 * Enforces logical archiving (`deleted_at`) and strict separation of concerns
 * so UI and domain layers never depend directly on Supabase.
 */
export interface IPatientRepository {
  listPatients(clinicId: string): Promise<readonly PatientRecord[]>;
  getPatientById(patientId: string): Promise<PatientRecord | null>;
  createPatient(clinicId: string, input: PatientInput): Promise<PatientRecord>;
  updatePatient(patientId: string, input: PatientInput): Promise<PatientRecord>;
  archivePatient(patientId: string): Promise<void>;
}

function mapPatientRow(row: PatientRow): PatientRecord {
  return Object.freeze({
    id: row.id,
    clinicId: row.clinic_id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    dateOfBirth: row.date_of_birth,
    medicalAlerts: row.medical_alerts,
    generalNotes: row.general_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/**
 * Builds a PII-safe Error without interpolating raw database error messages or
 * row details (which could echo patient names, emails, phones, or medical alerts).
 */
function createSafePatientRepositoryError(
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

export class SupabasePatientRepository implements IPatientRepository {
  private readonly client: DentalCareSupabaseClient;

  constructor(client: DentalCareSupabaseClient) {
    this.client = client;
  }

  async listPatients(clinicId: string): Promise<readonly PatientRecord[]> {
    const normalizedClinicId = clinicId.trim();
    if (normalizedClinicId.length === 0) {
      throw new Error('Cannot list patients without a valid clinicId');
    }

    const { data, error } = await this.client
      .from('patients')
      .select('*')
      .eq('clinic_id', normalizedClinicId)
      .is('deleted_at', null)
      .order('full_name', { ascending: true });

    if (error) {
      throw createSafePatientRepositoryError(
        'Failed to list clinic patients',
        error,
      );
    }

    return Object.freeze((data ?? []).map(mapPatientRow));
  }

  async getPatientById(patientId: string): Promise<PatientRecord | null> {
    const normalizedPatientId = patientId.trim();
    if (normalizedPatientId.length === 0) {
      return null;
    }

    const { data, error } = await this.client
      .from('patients')
      .select('*')
      .eq('id', normalizedPatientId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw createSafePatientRepositoryError(
        'Failed to load patient record',
        error,
      );
    }

    return data ? mapPatientRow(data) : null;
  }

  async createPatient(
    clinicId: string,
    input: PatientInput,
  ): Promise<PatientRecord> {
    const normalizedClinicId = clinicId.trim();
    if (normalizedClinicId.length === 0) {
      throw new Error('Cannot create patient without a valid clinicId');
    }

    // IMPORTANT: Send ONLY `clinic_id` and the 6 editable patient fields
    // (never `id`, `created_at`, `updated_at`, or `deleted_at`).
    const { data, error } = await this.client
      .from('patients')
      .insert({
        clinic_id: normalizedClinicId,
        full_name: input.fullName,
        phone: input.phone,
        email: input.email,
        date_of_birth: input.dateOfBirth,
        medical_alerts: input.medicalAlerts,
        general_notes: input.generalNotes,
      })
      .select('*')
      .single();

    if (error) {
      throw createSafePatientRepositoryError(
        'Failed to create patient record',
        error,
      );
    }

    if (!data) {
      throw new Error('Failed to create patient record: empty response');
    }

    return mapPatientRow(data);
  }

  async updatePatient(
    patientId: string,
    input: PatientInput,
  ): Promise<PatientRecord> {
    const normalizedPatientId = patientId.trim();
    if (normalizedPatientId.length === 0) {
      throw new Error('Cannot update patient without a valid patientId');
    }

    // IMPORTANT: Send ONLY the 6 editable business columns (`full_name`, `phone`,
    // `email`, `date_of_birth`, `medical_alerts`, `general_notes`), never `id`,
    // `clinic_id`, `created_at`, `updated_at`, or `deleted_at`.
    const { data, error } = await this.client
      .from('patients')
      .update({
        full_name: input.fullName,
        phone: input.phone,
        email: input.email,
        date_of_birth: input.dateOfBirth,
        medical_alerts: input.medicalAlerts,
        general_notes: input.generalNotes,
      })
      .eq('id', normalizedPatientId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error) {
      throw createSafePatientRepositoryError(
        'Failed to update patient record',
        error,
      );
    }

    if (!data) {
      throw new Error('Failed to update patient record: record not found');
    }

    return mapPatientRow(data);
  }

  async archivePatient(patientId: string): Promise<void> {
    const normalizedPatientId = patientId.trim();
    if (normalizedPatientId.length === 0) {
      throw new Error('Cannot archive patient without a valid patientId');
    }

    // IMPORTANT: Soft-delete via `deleted_at` WITHOUT chaining `.select()`.
    // `patients_select_same_clinic` requires `deleted_at IS NULL`, so chaining
    // `.select()` on an archived row would trigger PostgreSQL 42501.
    // Physical `.delete()` is strictly prohibited across DentalCare.
    const { error } = await this.client
      .from('patients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', normalizedPatientId)
      .is('deleted_at', null);

    if (error) {
      throw createSafePatientRepositoryError(
        'Failed to archive patient record',
        error,
      );
    }
  }
}

/**
 * Returns the default browser patient repository when Supabase public env vars
 * are configured, or `null` in safe degraded mode.
 */
export function createDefaultPatientRepository(): IPatientRepository | null {
  const client = getSupabaseClient();
  return client ? new SupabasePatientRepository(client) : null;
}
