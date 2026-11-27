import type { SupportedLocale } from '@/domain/locale';

export const PATIENT_FILES_BUCKET_ID = 'patient-files' as const;
export const PATIENT_FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB = 10,485,760 bytes
export const PATIENT_FILE_SIGNED_URL_TTL_SECONDS = 300; // 5 minutes
export const PATIENT_FILE_NAME_MAX_LENGTH = 255;
export const PATIENT_FILE_SELF_PURGE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export const ALLOWED_PATIENT_FILE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedPatientFileMimeType =
  (typeof ALLOWED_PATIENT_FILE_MIME_TYPES)[number];

export type PatientFileExtension = 'jpg' | 'png' | 'webp' | 'pdf';
export type PatientFileTypeBadge = 'JPG' | 'PNG' | 'WEBP' | 'PDF';

export interface PatientFileRecord {
  readonly id: string;
  readonly clinicId: string;
  readonly patientId: string;
  readonly appointmentId: string | null;
  readonly storagePath: string;
  readonly fileName: string;
  readonly mimeType: AllowedPatientFileMimeType;
  readonly fileSizeBytes: number;
  readonly uploadedBy: string;
  readonly createdAt: string;
}

export interface ArchivedPatientFileRecord extends PatientFileRecord {
  readonly deletedAt: string;
}

export interface RawPatientFileUploadInput {
  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
}

export interface ValidatedPatientFileUpload {
  readonly fileName: string;
  readonly mimeType: AllowedPatientFileMimeType;
  readonly fileSizeBytes: number;
}

export type PatientFileUploadErrorCode =
  | 'unsupported_mime_type'
  | 'file_empty'
  | 'file_too_large'
  | 'file_name_invalid';

export type PatientFileUploadValidationResult =
  | {
      readonly valid: true;
      readonly value: ValidatedPatientFileUpload;
      readonly error: null;
    }
  | {
      readonly valid: false;
      readonly value: null;
      readonly error: PatientFileUploadErrorCode;
    };

export interface BuildPatientFileStoragePathParams {
  readonly clinicId: string;
  readonly patientId: string;
  readonly fileId: string;
  readonly mimeType: AllowedPatientFileMimeType;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

const MIME_TO_EXTENSION: Readonly<
  Record<AllowedPatientFileMimeType, PatientFileExtension>
> = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
});

const MIME_TO_BADGE: Readonly<
  Record<AllowedPatientFileMimeType, PatientFileTypeBadge>
> = Object.freeze({
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'application/pdf': 'PDF',
});

function isAllowedMimeType(value: string): value is AllowedPatientFileMimeType {
  return (ALLOWED_PATIENT_FILE_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Strips ASCII control characters (0x00-0x1F and 0x7F) without using regex
 * control-character literals (keeps ESLint no-control-regex happy).
 */
function stripControlCharacters(value: string): string {
  let result = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0x20 && code !== 0x7f) {
      result += value[i];
    }
  }
  return result;
}

/**
 * Normalizes a raw MIME string by discarding optional parameters (`; charset=...`)
 * and lowercasing, returning `null` if not in the strict clinical allowlist.
 */
export function normalizePatientFileMimeType(
  rawMimeType: string,
): AllowedPatientFileMimeType | null {
  if (typeof rawMimeType !== 'string') {
    return null;
  }

  const baseType = rawMimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return isAllowedMimeType(baseType) ? baseType : null;
}

/**
 * Sanitizes a user-supplied filename by removing control characters and any
 * directory path segments (`/` or `\`) to prevent path traversal or hidden chars.
 */
export function sanitizePatientFileName(rawFileName: string): string {
  if (typeof rawFileName !== 'string') {
    return '';
  }

  const withoutControl = stripControlCharacters(rawFileName);
  const pathSegments = withoutControl.split(/[/\\]+/);
  const baseName = pathSegments[pathSegments.length - 1] ?? '';
  return baseName.trim();
}

/**
 * Pure upload validator aligned 1:1 with Supabase Storage bucket settings and
 * PostgreSQL `public.patient_files` CHECK constraints. Returns typed error codes
 * only (zero hardcoded UI messages).
 */
export function validatePatientFileUpload(
  input: RawPatientFileUploadInput,
): PatientFileUploadValidationResult {
  const normalizedMimeType = normalizePatientFileMimeType(input.mimeType);
  if (normalizedMimeType === null) {
    return Object.freeze({
      valid: false,
      value: null,
      error: 'unsupported_mime_type',
    });
  }

  if (
    typeof input.fileSizeBytes !== 'number' ||
    !Number.isFinite(input.fileSizeBytes) ||
    !Number.isInteger(input.fileSizeBytes) ||
    input.fileSizeBytes <= 0
  ) {
    return Object.freeze({
      valid: false,
      value: null,
      error: 'file_empty',
    });
  }

  if (input.fileSizeBytes > PATIENT_FILE_MAX_SIZE_BYTES) {
    return Object.freeze({
      valid: false,
      value: null,
      error: 'file_too_large',
    });
  }

  const sanitizedFileName = sanitizePatientFileName(input.fileName);
  if (
    sanitizedFileName.length === 0 ||
    sanitizedFileName === '.' ||
    sanitizedFileName === '..' ||
    sanitizedFileName.length > PATIENT_FILE_NAME_MAX_LENGTH
  ) {
    return Object.freeze({
      valid: false,
      value: null,
      error: 'file_name_invalid',
    });
  }

  return Object.freeze({
    valid: true,
    value: Object.freeze({
      fileName: sanitizedFileName,
      mimeType: normalizedMimeType,
      fileSizeBytes: input.fileSizeBytes,
    }),
    error: null,
  });
}

function assertValidUuid(value: string, fieldName: string): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return normalized;
}

/**
 * Builds the canonical private Storage path `<clinicId>/<patientId>/<fileId>.<ext>`
 * in lowercase, validating UUID format on every segment so path traversal and
 * patient-name leakage in Storage paths are impossible.
 */
export function buildPatientFileStoragePath(
  params: BuildPatientFileStoragePathParams,
): string {
  const clinicId = assertValidUuid(params.clinicId, 'clinicId');
  const patientId = assertValidUuid(params.patientId, 'patientId');
  const fileId = assertValidUuid(params.fileId, 'fileId');

  const normalizedMime = normalizePatientFileMimeType(params.mimeType);
  if (normalizedMime === null) {
    throw new Error('Unsupported MIME type for storage path');
  }

  const extension = MIME_TO_EXTENSION[normalizedMime];
  return `${clinicId}/${patientId}/${fileId}.${extension}`;
}

export function isImageMimeType(mimeType: AllowedPatientFileMimeType): boolean {
  return (
    mimeType === 'image/jpeg' ||
    mimeType === 'image/png' ||
    mimeType === 'image/webp'
  );
}

export function getPatientFileTypeBadge(
  mimeType: AllowedPatientFileMimeType,
): PatientFileTypeBadge {
  return MIME_TO_BADGE[mimeType];
}

/**
 * Formats a byte count into a locale-aware human-readable size (`B`, `KB`, `MB`).
 */
export function formatFileSize(bytes: number, locale: SupportedLocale): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${Math.trunc(bytes)} B`;
  }

  const formatter = new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', {
    maximumFractionDigits: 1,
  });

  if (bytes < 1024 * 1024) {
    return `${formatter.format(bytes / 1024)} KB`;
  }

  return `${formatter.format(bytes / (1024 * 1024))} MB`;
}

/**
 * Formats an ISO timestamp (`YYYY-MM-DDT...`) into a deterministic calendar date
 * (`DD/MM/YYYY` in Spanish, `YYYY-MM-DD` in English) without timezone drift.
 */
export function formatPatientFileDate(
  isoTimestamp: string,
  locale: SupportedLocale,
): string {
  const match = ISO_DATE_PREFIX_PATTERN.exec(isoTimestamp.trim());
  if (!match) {
    return isoTimestamp;
  }

  const [, year, month, day] = match;
  return locale === 'es' ? `${day}/${month}/${year}` : `${year}-${month}-${day}`;
}

/**
 * Pure UI-visibility helper checking whether the signed-in user is the original
 * uploader of a clinical file still within the 15-minute mistaken-upload window.
 *
 * NOTE: Client-side check controls UI button visibility only; real authorization
 * is enforced server-side by PostgreSQL RLS and `guard_patient_file_update()`.
 */
export function canSelfPurgeMistakenUpload(
  file: Pick<PatientFileRecord, 'uploadedBy' | 'createdAt'>,
  currentUserId: string | null | undefined,
  referenceDate: Date = new Date(),
): boolean {
  if (typeof currentUserId !== 'string') {
    return false;
  }

  const normalizedCurrentUser = currentUserId.trim().toLowerCase();
  const normalizedUploader = file.uploadedBy.trim().toLowerCase();
  if (
    normalizedCurrentUser.length === 0 ||
    normalizedUploader !== normalizedCurrentUser
  ) {
    return false;
  }

  const createdTimeMs = Date.parse(file.createdAt);
  const referenceTimeMs = referenceDate.getTime();
  if (!Number.isFinite(createdTimeMs) || !Number.isFinite(referenceTimeMs)) {
    return false;
  }

  const ageMs = referenceTimeMs - createdTimeMs;
  return ageMs >= 0 && ageMs <= PATIENT_FILE_SELF_PURGE_WINDOW_MS;
}
