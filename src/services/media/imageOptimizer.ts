import {
  IMAGE_OPTIMIZATION_MAX_DIMENSION_PX,
  IMAGE_OPTIMIZATION_QUALITY,
  buildOptimizedFileName,
  calculateConstrainedDimensions,
  selectOptimizedResult,
  shouldAttemptImageOptimization,
  type OptimizedImageTargetMimeType,
} from '@/domain/imageOptimization';
import { normalizePatientFileMimeType } from '@/domain/patientFiles';

export interface ImageOptimizationOptions {
  readonly preserveOriginalQuality: boolean;
}

export interface ImageOptimizationOutcome {
  readonly file: File;
  readonly wasOptimized: boolean;
  readonly originalSizeBytes: number;
  readonly finalSizeBytes: number;
}

/**
 * Agnostic client-side image optimizer contract (SoC).
 * UI layers depend solely on this interface so browser Canvas implementations can
 * be mocked deterministically in tests or swapped without touching React code.
 */
export interface IImageOptimizer {
  optimizeIfNeeded(
    file: File,
    options: ImageOptimizationOptions,
  ): Promise<ImageOptimizationOutcome>;
}

function createPassthroughOutcome(file: File): ImageOptimizationOutcome {
  return Object.freeze({
    file,
    wasOptimized: false,
    originalSizeBytes: file.size,
    finalSizeBytes: file.size,
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: OptimizedImageTargetMimeType,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        mimeType,
        quality,
      );
    } catch {
      resolve(null);
    }
  });
}

export class BrowserCanvasImageOptimizer implements IImageOptimizer {
  async optimizeIfNeeded(
    file: File,
    options: ImageOptimizationOptions,
  ): Promise<ImageOptimizationOutcome> {
    const normalizedMime = normalizePatientFileMimeType(file.type);
    if (
      normalizedMime === null ||
      !shouldAttemptImageOptimization({
        mimeType: normalizedMime,
        fileSizeBytes: file.size,
        preserveOriginalQuality: options.preserveOriginalQuality,
      })
    ) {
      return createPassthroughOutcome(file);
    }

    if (
      typeof document === 'undefined' ||
      typeof globalThis.createImageBitmap !== 'function'
    ) {
      return createPassthroughOutcome(file);
    }

    let bitmap: ImageBitmap | null = null;

    try {
      bitmap = await globalThis.createImageBitmap(file);
      const dimensions = calculateConstrainedDimensions({
        width: bitmap.width,
        height: bitmap.height,
        maxDimension: IMAGE_OPTIMIZATION_MAX_DIMENSION_PX,
      });

      const canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;

      const context = canvas.getContext('2d');
      if (!context) {
        return createPassthroughOutcome(file);
      }

      context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);

      // Prefer WebP; verify blob.type explicitly because some browsers silently
      // fall back to image/png when WebP encoding is unsupported.
      let candidateBlob = await canvasToBlob(
        canvas,
        'image/webp',
        IMAGE_OPTIMIZATION_QUALITY,
      );
      let candidateMime: OptimizedImageTargetMimeType | null =
        candidateBlob &&
        candidateBlob.type === 'image/webp' &&
        candidateBlob.size > 0
          ? 'image/webp'
          : null;

      if (candidateMime === null) {
        candidateBlob = await canvasToBlob(
          canvas,
          'image/jpeg',
          IMAGE_OPTIMIZATION_QUALITY,
        );
        candidateMime =
          candidateBlob &&
          candidateBlob.type === 'image/jpeg' &&
          candidateBlob.size > 0
            ? 'image/jpeg'
            : null;
      }

      if (!candidateBlob || candidateMime === null) {
        return createPassthroughOutcome(file);
      }

      const selection = selectOptimizedResult({
        originalSizeBytes: file.size,
        optimizedSizeBytes: candidateBlob.size,
      });

      if (!selection.useOptimized) {
        return createPassthroughOutcome(file);
      }

      const optimizedFileName = buildOptimizedFileName(
        file.name,
        candidateMime,
      );
      const optimizedFile = new File([candidateBlob], optimizedFileName, {
        type: candidateMime,
        lastModified: file.lastModified,
      });

      return Object.freeze({
        file: optimizedFile,
        wasOptimized: true,
        originalSizeBytes: file.size,
        finalSizeBytes: optimizedFile.size,
      });
    } catch {
      return createPassthroughOutcome(file);
    } finally {
      bitmap?.close();
    }
  }
}

export function createDefaultImageOptimizer(): IImageOptimizer {
  return new BrowserCanvasImageOptimizer();
}
