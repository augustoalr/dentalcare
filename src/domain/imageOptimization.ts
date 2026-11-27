import {
  PATIENT_FILE_NAME_MAX_LENGTH,
  isImageMimeType,
  normalizePatientFileMimeType,
  sanitizePatientFileName,
} from '@/domain/patientFiles';

export const IMAGE_OPTIMIZATION_SIZE_THRESHOLD_BYTES = 1 * 1024 * 1024; // 1 MB
export const IMAGE_OPTIMIZATION_MAX_DIMENSION_PX = 2048;
export const IMAGE_OPTIMIZATION_QUALITY = 0.88;

export type OptimizedImageTargetMimeType = 'image/webp' | 'image/jpeg';

export interface ShouldAttemptImageOptimizationParams {
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly preserveOriginalQuality: boolean;
  readonly width?: number;
  readonly height?: number;
}

export interface ConstrainedDimensionsInput {
  readonly width: number;
  readonly height: number;
  readonly maxDimension?: number;
}

export interface ConstrainedDimensionsResult {
  readonly width: number;
  readonly height: number;
  readonly wasResized: boolean;
}

export interface SelectOptimizedResultInput {
  readonly originalSizeBytes: number;
  readonly optimizedSizeBytes: number;
}

export interface SelectOptimizedResultOutcome {
  readonly useOptimized: boolean;
  readonly finalSizeBytes: number;
  readonly savedBytes: number;
}

/**
 * Determines whether client-side image optimization should be attempted.
 * Never touches PDFs or files when `preserveOriginalQuality` is enabled (e.g., X-rays).
 */
export function shouldAttemptImageOptimization(
  params: ShouldAttemptImageOptimizationParams,
): boolean {
  if (params.preserveOriginalQuality) {
    return false;
  }

  const normalizedMime = normalizePatientFileMimeType(params.mimeType);
  if (normalizedMime === null || !isImageMimeType(normalizedMime)) {
    return false;
  }

  if (
    typeof params.fileSizeBytes === 'number' &&
    Number.isFinite(params.fileSizeBytes) &&
    params.fileSizeBytes > IMAGE_OPTIMIZATION_SIZE_THRESHOLD_BYTES
  ) {
    return true;
  }

  if (
    typeof params.width === 'number' &&
    Number.isFinite(params.width) &&
    params.width > IMAGE_OPTIMIZATION_MAX_DIMENSION_PX
  ) {
    return true;
  }

  if (
    typeof params.height === 'number' &&
    Number.isFinite(params.height) &&
    params.height > IMAGE_OPTIMIZATION_MAX_DIMENSION_PX
  ) {
    return true;
  }

  return false;
}

/**
 * Calculates integer target dimensions constrained to `maxDimension` on the long edge
 * while preserving aspect ratio and never upscaling smaller images.
 */
export function calculateConstrainedDimensions(
  input: ConstrainedDimensionsInput,
): ConstrainedDimensionsResult {
  const maxDimension =
    typeof input.maxDimension === 'number' &&
    Number.isFinite(input.maxDimension) &&
    input.maxDimension >= 1
      ? Math.floor(input.maxDimension)
      : IMAGE_OPTIMIZATION_MAX_DIMENSION_PX;

  const safeWidth =
    Number.isFinite(input.width) && input.width >= 1
      ? Math.round(input.width)
      : 1;
  const safeHeight =
    Number.isFinite(input.height) && input.height >= 1
      ? Math.round(input.height)
      : 1;

  const longestSide = Math.max(safeWidth, safeHeight);
  if (longestSide <= maxDimension) {
    return Object.freeze({
      width: safeWidth,
      height: safeHeight,
      wasResized: false,
    });
  }

  const scale = maxDimension / longestSide;
  const targetWidth = Math.max(1, Math.round(safeWidth * scale));
  const targetHeight = Math.max(1, Math.round(safeHeight * scale));

  return Object.freeze({
    width: targetWidth,
    height: targetHeight,
    wasResized: true,
  });
}

/**
 * Accepts the optimized file strictly when it is non-empty and smaller than the
 * original file, guaranteeing optimization never increases upload size.
 */
export function selectOptimizedResult(
  input: SelectOptimizedResultInput,
): SelectOptimizedResultOutcome {
  const { originalSizeBytes, optimizedSizeBytes } = input;
  const validOriginal =
    Number.isFinite(originalSizeBytes) && originalSizeBytes > 0;
  const validOptimized =
    Number.isFinite(optimizedSizeBytes) && optimizedSizeBytes > 0;

  if (validOriginal && validOptimized && optimizedSizeBytes < originalSizeBytes) {
    return Object.freeze({
      useOptimized: true,
      finalSizeBytes: optimizedSizeBytes,
      savedBytes: originalSizeBytes - optimizedSizeBytes,
    });
  }

  return Object.freeze({
    useOptimized: false,
    finalSizeBytes: validOriginal ? originalSizeBytes : 0,
    savedBytes: 0,
  });
}

/**
 * Updates the filename extension to match the optimized output MIME (`webp`/`jpg`)
 * while truncating the base name if needed so total length never exceeds 255 chars.
 */
export function buildOptimizedFileName(
  rawFileName: string,
  targetMimeType: OptimizedImageTargetMimeType,
): string {
  const sanitized = sanitizePatientFileName(rawFileName);
  const extension = targetMimeType === 'image/webp' ? '.webp' : '.jpg';
  const lastDotIndex = sanitized.lastIndexOf('.');
  const rawBase =
    lastDotIndex > 0 ? sanitized.slice(0, lastDotIndex) : sanitized;
  const fallbackBase = rawBase.trim().length > 0 ? rawBase.trim() : 'image';
  const maxBaseLength = PATIENT_FILE_NAME_MAX_LENGTH - extension.length;
  const truncatedBase = fallbackBase.slice(0, maxBaseLength).trim() || 'image';

  return `${truncatedBase}${extension}`;
}
