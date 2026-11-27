import { describe, expect, it } from 'vitest';
import {
  IMAGE_OPTIMIZATION_MAX_DIMENSION_PX,
  IMAGE_OPTIMIZATION_QUALITY,
  IMAGE_OPTIMIZATION_SIZE_THRESHOLD_BYTES,
  buildOptimizedFileName,
  calculateConstrainedDimensions,
  selectOptimizedResult,
  shouldAttemptImageOptimization,
} from '@/domain/imageOptimization';
import { PATIENT_FILE_NAME_MAX_LENGTH } from '@/domain/patientFiles';

describe('imageOptimization pure domain (T-06b)', () => {
  it('exports expected threshold, max dimension, and quality constants', () => {
    expect(IMAGE_OPTIMIZATION_SIZE_THRESHOLD_BYTES).toBe(1_048_576);
    expect(IMAGE_OPTIMIZATION_MAX_DIMENSION_PX).toBe(2048);
    expect(IMAGE_OPTIMIZATION_QUALITY).toBe(0.88);
  });

  it('skips PDFs, unsupported MIMEs, and any file when preserveOriginalQuality is true', () => {
    expect(
      shouldAttemptImageOptimization({
        mimeType: 'application/pdf',
        fileSizeBytes: 5 * 1024 * 1024,
        preserveOriginalQuality: false,
      }),
    ).toBe(false);

    expect(
      shouldAttemptImageOptimization({
        mimeType: 'image/jpeg',
        fileSizeBytes: 4 * 1024 * 1024,
        preserveOriginalQuality: true,
      }),
    ).toBe(false);

    expect(
      shouldAttemptImageOptimization({
        mimeType: 'image/svg+xml',
        fileSizeBytes: 4 * 1024 * 1024,
        preserveOriginalQuality: false,
      }),
    ).toBe(false);
  });

  it('triggers optimization for JPEG/PNG/WEBP when > 1 MB or when dimensions exceed 2048 px', () => {
    expect(
      shouldAttemptImageOptimization({
        mimeType: 'IMAGE/JPEG; charset=binary',
        fileSizeBytes: IMAGE_OPTIMIZATION_SIZE_THRESHOLD_BYTES + 1,
        preserveOriginalQuality: false,
      }),
    ).toBe(true);

    expect(
      shouldAttemptImageOptimization({
        mimeType: 'image/png',
        fileSizeBytes: IMAGE_OPTIMIZATION_SIZE_THRESHOLD_BYTES,
        preserveOriginalQuality: false,
      }),
    ).toBe(false);

    expect(
      shouldAttemptImageOptimization({
        mimeType: 'image/webp',
        fileSizeBytes: 500_000,
        preserveOriginalQuality: false,
        width: 3000,
        height: 1500,
      }),
    ).toBe(true);

    expect(
      shouldAttemptImageOptimization({
        mimeType: 'image/png',
        fileSizeBytes: 500_000,
        preserveOriginalQuality: false,
        width: 1200,
        height: 2500,
      }),
    ).toBe(true);
  });

  it('constrains dimensions preserving exact aspect ratio and never upscales small images', () => {
    const unchanged = calculateConstrainedDimensions({
      width: 1600,
      height: 1200,
      maxDimension: 2048,
    });
    expect(unchanged).toEqual({ width: 1600, height: 1200, wasResized: false });
    expect(Object.isFrozen(unchanged)).toBe(true);

    const landscape = calculateConstrainedDimensions({
      width: 4096,
      height: 2048,
      maxDimension: 2048,
    });
    expect(landscape).toEqual({ width: 2048, height: 1024, wasResized: true });

    const portrait = calculateConstrainedDimensions({
      width: 1500,
      height: 3000,
      maxDimension: 2048,
    });
    expect(portrait).toEqual({ width: 1024, height: 2048, wasResized: true });
  });

  it('only accepts optimized output when strictly smaller than original and non-empty', () => {
    const smaller = selectOptimizedResult({
      originalSizeBytes: 4_000_000,
      optimizedSizeBytes: 500_000,
    });
    expect(smaller).toEqual({
      useOptimized: true,
      finalSizeBytes: 500_000,
      savedBytes: 3_500_000,
    });
    expect(Object.isFrozen(smaller)).toBe(true);

    expect(
      selectOptimizedResult({
        originalSizeBytes: 1_500_000,
        optimizedSizeBytes: 1_500_000,
      }),
    ).toEqual({
      useOptimized: false,
      finalSizeBytes: 1_500_000,
      savedBytes: 0,
    });

    expect(
      selectOptimizedResult({
        originalSizeBytes: 1_500_000,
        optimizedSizeBytes: 1_800_000,
      }),
    ).toEqual({
      useOptimized: false,
      finalSizeBytes: 1_500_000,
      savedBytes: 0,
    });

    expect(
      selectOptimizedResult({
        originalSizeBytes: 1_500_000,
        optimizedSizeBytes: 0,
      }),
    ).toEqual({
      useOptimized: false,
      finalSizeBytes: 1_500_000,
      savedBytes: 0,
    });
  });

  it('builds safe optimized filenames within 255 characters', () => {
    expect(buildOptimizedFileName('intraoral-photo.PNG', 'image/webp')).toBe(
      'intraoral-photo.webp',
    );
    expect(buildOptimizedFileName('bitewing.webp', 'image/jpeg')).toBe(
      'bitewing.jpg',
    );

    const overlong = `${'a'.repeat(255)}.png`;
    const webpResult = buildOptimizedFileName(overlong, 'image/webp');
    expect(webpResult.length).toBeLessThanOrEqual(PATIENT_FILE_NAME_MAX_LENGTH);
    expect(webpResult.endsWith('.webp')).toBe(true);
  });
});
