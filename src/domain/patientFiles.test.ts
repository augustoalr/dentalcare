import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PATIENT_FILE_MIME_TYPES,
  PATIENT_FILE_MAX_SIZE_BYTES,
  PATIENT_FILE_NAME_MAX_LENGTH,
  PATIENT_FILE_SIGNED_URL_TTL_SECONDS,
  PATIENT_FILES_BUCKET_ID,
  buildPatientFileStoragePath,
  formatFileSize,
  formatPatientFileDate,
  getPatientFileTypeBadge,
  isImageMimeType,
  normalizePatientFileMimeType,
  sanitizePatientFileName,
  validatePatientFileUpload,
} from '@/domain/patientFiles';

const CLINIC_UUID = '11111111-1111-4111-8111-111111111111';
const PATIENT_UUID = '22222222-2222-4222-8222-222222222222';
const FILE_UUID = '33333333-3333-4333-8333-333333333333';

describe('patientFiles pure domain (T-06)', () => {
  it('exports constants aligned 1:1 with PostgreSQL CHECKs and private Storage bucket', () => {
    expect(PATIENT_FILES_BUCKET_ID).toBe('patient-files');
    expect(PATIENT_FILE_MAX_SIZE_BYTES).toBe(10_485_760);
    expect(PATIENT_FILE_SIGNED_URL_TTL_SECONDS).toBe(300);
    expect(ALLOWED_PATIENT_FILE_MIME_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]);
  });

  it('validates allowed JPG, PNG, WEBP, and PDF uploads and normalizes MIME parameters', () => {
    const cases = [
      {
        fileName: 'synthetic-panoramic.jpg',
        mimeType: 'IMAGE/JPEG; charset=binary',
        fileSizeBytes: 512_000,
        expectedMime: 'image/jpeg',
      },
      {
        fileName: 'intraoral-upper.png',
        mimeType: 'image/png',
        fileSizeBytes: 1_048_576,
        expectedMime: 'image/png',
      },
      {
        fileName: 'bitewing.webp',
        mimeType: 'image/webp',
        fileSizeBytes: 256_000,
        expectedMime: 'image/webp',
      },
      {
        fileName: 'synthetic-radiology-report.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: PATIENT_FILE_MAX_SIZE_BYTES,
        expectedMime: 'application/pdf',
      },
    ] as const;

    for (const item of cases) {
      const result = validatePatientFileUpload({
        fileName: item.fileName,
        mimeType: item.mimeType,
        fileSizeBytes: item.fileSizeBytes,
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.value).toEqual({
        fileName: item.fileName,
        mimeType: item.expectedMime,
        fileSizeBytes: item.fileSizeBytes,
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });

  it('rejects disallowed MIME types (SVG, HTML, EXE, blank)', () => {
    for (const badMime of [
      'image/svg+xml',
      'text/html',
      'application/x-msdownload',
      'application/octet-stream',
      '',
      '   ',
    ]) {
      const result = validatePatientFileUpload({
        fileName: 'file.bin',
        mimeType: badMime,
        fileSizeBytes: 1024,
      });
      expect(result).toEqual({
        valid: false,
        value: null,
        error: 'unsupported_mime_type',
      });
    }
  });

  it('rejects empty, negative, non-finite, non-integer, and oversized (> 10 MB) files', () => {
    for (const emptySize of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 12.5]) {
      expect(
        validatePatientFileUpload({
          fileName: 'xray.jpg',
          mimeType: 'image/jpeg',
          fileSizeBytes: emptySize,
        }),
      ).toEqual({
        valid: false,
        value: null,
        error: 'file_empty',
      });
    }

    expect(
      validatePatientFileUpload({
        fileName: 'too-large.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: PATIENT_FILE_MAX_SIZE_BYTES + 1,
      }),
    ).toEqual({
      valid: false,
      value: null,
      error: 'file_too_large',
    });
  });

  it('sanitizes paths and control characters in file names and rejects invalid/overlong names', () => {
    expect(sanitizePatientFileName('C:\\fakepath\\synthetic_xray.png')).toBe(
      'synthetic_xray.png',
    );
    expect(sanitizePatientFileName('../../secret/panoramic.jpg')).toBe(
      'panoramic.jpg',
    );
    expect(sanitizePatientFileName('rx\u0000\u0007_clean\n.webp')).toBe(
      'rx_clean.webp',
    );

    const sanitizedResult = validatePatientFileUpload({
      fileName: 'folder/nested\\photo\u0000.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 2048,
    });
    expect(sanitizedResult.valid).toBe(true);
    expect(sanitizedResult.value?.fileName).toBe('photo.jpg');

    for (const invalidName of [
      '',
      '   ',
      '///',
      '..',
      '.',
      '\u0000\u001f',
      `${'a'.repeat(PATIENT_FILE_NAME_MAX_LENGTH + 1)}.jpg`,
    ]) {
      expect(
        validatePatientFileUpload({
          fileName: invalidName,
          mimeType: 'image/jpeg',
          fileSizeBytes: 2048,
        }),
      ).toEqual({
        valid: false,
        value: null,
        error: 'file_name_invalid',
      });
    }
  });

  it('builds canonical lowercase storage paths and blocks path traversal or non-UUID segments', () => {
    expect(
      buildPatientFileStoragePath({
        clinicId: CLINIC_UUID.toUpperCase(),
        patientId: PATIENT_UUID.toUpperCase(),
        fileId: FILE_UUID.toUpperCase(),
        mimeType: 'image/jpeg',
      }),
    ).toBe(`${CLINIC_UUID}/${PATIENT_UUID}/${FILE_UUID}.jpg`);

    expect(
      buildPatientFileStoragePath({
        clinicId: CLINIC_UUID,
        patientId: PATIENT_UUID,
        fileId: FILE_UUID,
        mimeType: 'application/pdf',
      }),
    ).toBe(`${CLINIC_UUID}/${PATIENT_UUID}/${FILE_UUID}.pdf`);

    expect(() =>
      buildPatientFileStoragePath({
        clinicId: '../other-clinic',
        patientId: PATIENT_UUID,
        fileId: FILE_UUID,
        mimeType: 'image/png',
      }),
    ).toThrow('Invalid UUID for clinicId');

    expect(() =>
      buildPatientFileStoragePath({
        clinicId: CLINIC_UUID,
        patientId: 'layla-al-mansoor',
        fileId: FILE_UUID,
        mimeType: 'image/png',
      }),
    ).toThrow('Invalid UUID for patientId');

    expect(() =>
      buildPatientFileStoragePath({
        clinicId: CLINIC_UUID,
        patientId: PATIENT_UUID,
        fileId: '../../evil',
        mimeType: 'image/webp',
      }),
    ).toThrow('Invalid UUID for fileId');
  });

  it('classifies image vs PDF types and formats file sizes and dates for EN/ES', () => {
    expect(normalizePatientFileMimeType('IMAGE/PNG')).toBe('image/png');
    expect(normalizePatientFileMimeType('image/svg+xml')).toBeNull();

    expect(isImageMimeType('image/jpeg')).toBe(true);
    expect(isImageMimeType('image/png')).toBe(true);
    expect(isImageMimeType('image/webp')).toBe(true);
    expect(isImageMimeType('application/pdf')).toBe(false);

    expect(getPatientFileTypeBadge('image/jpeg')).toBe('JPG');
    expect(getPatientFileTypeBadge('image/png')).toBe('PNG');
    expect(getPatientFileTypeBadge('image/webp')).toBe('WEBP');
    expect(getPatientFileTypeBadge('application/pdf')).toBe('PDF');

    expect(formatFileSize(0, 'en')).toBe('0 B');
    expect(formatFileSize(-50, 'es')).toBe('0 B');
    expect(formatFileSize(512, 'en')).toBe('512 B');
    expect(formatFileSize(1536, 'en')).toBe('1.5 KB');
    expect(formatFileSize(1536, 'es')).toBe('1,5 KB');
    expect(formatFileSize(2.5 * 1024 * 1024, 'en')).toBe('2.5 MB');
    expect(formatFileSize(2.5 * 1024 * 1024, 'es')).toBe('2,5 MB');

    expect(formatPatientFileDate('2026-11-26T14:30:00Z', 'en')).toBe(
      '2026-11-26',
    );
    expect(formatPatientFileDate('2026-11-26T14:30:00Z', 'es')).toBe(
      '26/11/2026',
    );
  });
});
