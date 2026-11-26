import {
  PATIENT_FILE_SIGNED_URL_TTL_SECONDS,
  PATIENT_FILES_BUCKET_ID,
  buildPatientFileStoragePath,
  validatePatientFileUpload,
  type PatientFileRecord,
} from '@/domain/patientFiles';
import type { PatientFileRow } from '@/services/supabase/database.types';
import {
  getSupabaseClient,
  type DentalCareSupabaseClient,
} from '@/services/supabase/supabaseClient';

const SAFE_ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,32}$/i;

export interface UploadPatientFileParams {
  readonly clinicId: string;
  readonly patientId: string;
  readonly uploadedBy: string;
  readonly file: File;
}

/**
 * Agnostic repository contract for private clinical attachments (intraoral photos
 * and synthetic X-rays). Enforces private Storage uploads (`upsert: false`),
 * short-lived signed URLs (`createSignedUrl`, never public URLs), and audited
 * logical archiving (`deleted_at`, never physical `DELETE` or `storage.remove`).
 */
export interface IPatientFileRepository {
  listPatientFiles(
    clinicId: string,
    patientId: string,
  ): Promise<readonly PatientFileRecord[]>;
  uploadPatientFile(
    params: UploadPatientFileParams,
  ): Promise<PatientFileRecord>;
  createSignedFileUrl(
    storagePath: string,
    expiresInSeconds?: number,
  ): Promise<string>;
  archivePatientFile(fileId: string): Promise<void>;
}

function mapPatientFileRow(row: PatientFileRow): PatientFileRecord {
  return Object.freeze({
    id: row.id,
    clinicId: row.clinic_id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  });
}

/**
 * Clamps signed URL TTL to `1..300` seconds, safely falling back to `300`
 * on `undefined`, `NaN`, `Infinity`, or `-Infinity`.
 */
function clampSignedUrlTtlSeconds(expiresInSeconds?: number): number {
  if (
    typeof expiresInSeconds !== 'number' ||
    !Number.isFinite(expiresInSeconds)
  ) {
    return PATIENT_FILE_SIGNED_URL_TTL_SECONDS;
  }

  const floored = Math.floor(expiresInSeconds);
  if (floored < 1) {
    return 1;
  }
  if (floored > PATIENT_FILE_SIGNED_URL_TTL_SECONDS) {
    return PATIENT_FILE_SIGNED_URL_TTL_SECONDS;
  }
  return floored;
}

/**
 * Builds a privacy-safe Error that NEVER echoes raw SDK/DB messages, filenames,
 * storage paths, or signed URL tokens (R-11 / SECURITY.md).
 */
function createSafePatientFileRepositoryError(
  operationMessage: string,
  sourceError: { readonly code?: string; readonly statusCode?: string | number } | null | undefined,
): Error {
  const rawCode =
    typeof sourceError?.code === 'string'
      ? sourceError.code.trim()
      : typeof sourceError?.statusCode === 'string' ||
          typeof sourceError?.statusCode === 'number'
        ? String(sourceError.statusCode).trim()
        : '';
  const safeCode = SAFE_ERROR_CODE_PATTERN.test(rawCode) ? rawCode : '';
  const message = safeCode
    ? `${operationMessage} (code: ${safeCode})`
    : operationMessage;

  return safeCode
    ? Object.assign(new Error(message), { code: safeCode })
    : new Error(message);
}

export class SupabasePatientFileRepository implements IPatientFileRepository {
  private readonly client: DentalCareSupabaseClient;

  constructor(client: DentalCareSupabaseClient) {
    this.client = client;
  }

  async listPatientFiles(
    clinicId: string,
    patientId: string,
  ): Promise<readonly PatientFileRecord[]> {
    const normalizedClinicId = clinicId.trim();
    const normalizedPatientId = patientId.trim();
    if (normalizedClinicId.length === 0 || normalizedPatientId.length === 0) {
      throw new Error(
        'Cannot list clinical files without valid clinicId and patientId',
      );
    }

    const { data, error } = await this.client
      .from('patient_files')
      .select('*')
      .eq('clinic_id', normalizedClinicId)
      .eq('patient_id', normalizedPatientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw createSafePatientFileRepositoryError(
        'Failed to list clinical files',
        error,
      );
    }

    return Object.freeze((data ?? []).map(mapPatientFileRow));
  }

  async uploadPatientFile(
    params: UploadPatientFileParams,
  ): Promise<PatientFileRecord> {
    const normalizedClinicId = params.clinicId.trim().toLowerCase();
    const normalizedPatientId = params.patientId.trim().toLowerCase();
    const normalizedUploadedBy = params.uploadedBy.trim();

    if (
      normalizedClinicId.length === 0 ||
      normalizedPatientId.length === 0 ||
      normalizedUploadedBy.length === 0
    ) {
      throw new Error(
        'Cannot upload clinical file without valid clinicId, patientId, and uploadedBy',
      );
    }

    // 1. Validate MIME, size, and sanitized filename before touching network
    const validation = validatePatientFileUpload({
      fileName: params.file.name,
      mimeType: params.file.type,
      fileSizeBytes: params.file.size,
    });

    if (!validation.valid) {
      throw Object.assign(new Error('Invalid clinical file upload'), {
        code: validation.error,
      });
    }

    const validated = validation.value;

    // 2. Generate canonical UUID-only private Storage path (zero PII in path)
    const fileId = globalThis.crypto.randomUUID();
    const storagePath = buildPatientFileStoragePath({
      clinicId: normalizedClinicId,
      patientId: normalizedPatientId,
      fileId,
      mimeType: validated.mimeType,
    });

    // 3. Upload append-only object to private bucket (`upsert: false`)
    const { error: uploadError } = await this.client.storage
      .from(PATIENT_FILES_BUCKET_ID)
      .upload(storagePath, params.file, {
        contentType: validated.mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw createSafePatientFileRepositoryError(
        'Failed to upload clinical file to private storage',
        uploadError as { code?: string; statusCode?: string | number },
      );
    }

    // 4. Persist ONLY the 7 permitted metadata columns using validated/sanitized values
    const { data, error: insertError } = await this.client
      .from('patient_files')
      .insert({
        clinic_id: normalizedClinicId,
        patient_id: normalizedPatientId,
        storage_path: storagePath,
        file_name: validated.fileName,
        mime_type: validated.mimeType,
        file_size_bytes: validated.fileSizeBytes,
        uploaded_by: normalizedUploadedBy,
      })
      .select('*')
      .single();

    if (insertError) {
      throw createSafePatientFileRepositoryError(
        'Failed to save clinical file metadata',
        insertError,
      );
    }

    if (!data) {
      throw new Error('Failed to save clinical file metadata: empty response');
    }

    return mapPatientFileRow(data);
  }

  async createSignedFileUrl(
    storagePath: string,
    expiresInSeconds?: number,
  ): Promise<string> {
    const normalizedStoragePath = storagePath.trim();
    if (normalizedStoragePath.length === 0) {
      throw new Error('Cannot sign clinical file URL without a storage path');
    }

    const clampedTtl = clampSignedUrlTtlSeconds(expiresInSeconds);

    // STRICT SECURITY: Exclusively use short-lived signed URLs; never public URLs.
    const { data, error } = await this.client.storage
      .from(PATIENT_FILES_BUCKET_ID)
      .createSignedUrl(normalizedStoragePath, clampedTtl);

    if (error || !data?.signedUrl) {
      throw createSafePatientFileRepositoryError(
        'Failed to generate temporary signed file URL',
        error as { code?: string; statusCode?: string | number } | null,
      );
    }

    return data.signedUrl;
  }

  async archivePatientFile(fileId: string): Promise<void> {
    const normalizedFileId = fileId.trim();
    if (normalizedFileId.length === 0) {
      throw new Error('Cannot archive clinical file without a valid fileId');
    }

    // IMPORTANT: Soft-delete via `deleted_at` WITHOUT chaining `.select()`.
    // Never call `.delete()` or `storage.remove()` (append-only Storage + audit trail).
    const { error } = await this.client
      .from('patient_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', normalizedFileId)
      .is('deleted_at', null);

    if (error) {
      throw createSafePatientFileRepositoryError(
        'Failed to archive clinical file',
        error,
      );
    }
  }
}

/**
 * Returns the default browser clinical file repository when Supabase public env
 * vars are configured, or `null` in safe degraded mode.
 */
export function createDefaultPatientFileRepository(): IPatientFileRepository | null {
  const client = getSupabaseClient();
  return client ? new SupabasePatientFileRepository(client) : null;
}
