import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Lock,
  Upload,
} from 'lucide-react';
import {
  ALLOWED_PATIENT_FILE_MIME_TYPES,
  PATIENT_FILE_SIGNED_URL_TTL_SECONDS,
  canSelfPurgeMistakenUpload,
  formatFileSize,
  validatePatientFileUpload,
  type ArchivedPatientFileRecord,
  type PatientFileRecord,
  type PatientFileUploadErrorCode,
} from '@/domain/patientFiles';
import { useAuth } from '@/features/auth/AuthContext';
import { ArchivedPatientFileCard } from '@/features/patients/ArchivedPatientFileCard';
import { PatientFileCard } from '@/features/patients/PatientFileCard';
import { usePatientFileRepository } from '@/features/patients/PatientFileRepositoryContext';
import { useI18n, type TranslationKey } from '@/i18n';
import {
  createDefaultImageOptimizer,
  type IImageOptimizer,
  type ImageOptimizationOutcome,
} from '@/services/media/imageOptimizer';
import type { IPatientFileRepository } from '@/services/repositories/patientFileRepository';
import { EmptyState } from '@/ui/components/states/EmptyState';
import { ErrorState } from '@/ui/components/states/ErrorState';
import { LoadingState } from '@/ui/components/states/LoadingState';
import { Badge } from '@/ui/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/ui/components/ui/card';

export interface PatientFilesSectionProps {
  readonly clinicId: string;
  readonly patientId: string;
  readonly patientFileRepository?: IPatientFileRepository | null;
  readonly imageOptimizer?: IImageOptimizer;
}

interface SignedUrlEntry {
  readonly url: string | null;
  readonly isLoading: boolean;
  readonly hasError: boolean;
}

interface StatusBannerState {
  readonly title: string;
  readonly description: string;
  readonly detail?: string;
}

interface ErrorBannerState {
  readonly title: string;
  readonly description: string;
}

type FilesTab = 'active' | 'archived';

const FILE_ACCEPT_ATTRIBUTE = ALLOWED_PATIENT_FILE_MIME_TYPES.join(',');

function resolveUploadValidationMessage(
  errorCode: PatientFileUploadErrorCode | null,
  t: (key: TranslationKey) => string,
): string | null {
  switch (errorCode) {
    case 'unsupported_mime_type':
      return t('patients.files.validation.unsupportedMimeType');
    case 'file_empty':
      return t('patients.files.validation.fileEmpty');
    case 'file_too_large':
      return t('patients.files.validation.fileTooLarge');
    case 'file_name_invalid':
      return t('patients.files.validation.fileNameInvalid');
    default:
      return null;
  }
}

export function PatientFilesSection({
  clinicId,
  patientId,
  patientFileRepository,
  imageOptimizer,
}: PatientFilesSectionProps) {
  const { locale, t } = useI18n();
  const { user, profile } = useAuth();
  const repository = usePatientFileRepository(patientFileRepository);
  const optimizer = useMemo(
    () => imageOptimizer ?? createDefaultImageOptimizer(),
    [imageOptimizer],
  );

  const isAdmin = profile?.role === 'admin';

  const [activeTab, setActiveTab] = useState<FilesTab>('active');
  const [files, setFiles] = useState<readonly PatientFileRecord[]>([]);
  const [archivedFiles, setArchivedFiles] = useState<
    readonly ArchivedPatientFileRecord[]
  >([]);
  const [signedUrls, setSignedUrls] = useState<
    Readonly<Record<string, SignedUrlEntry>>
  >({});

  const [isLoading, setIsLoading] = useState(Boolean(repository));
  const [hasLoadError, setHasLoadError] = useState(false);

  const [isLoadingArchived, setIsLoadingArchived] = useState(false);
  const [hasArchivedLoadError, setHasArchivedLoadError] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [replacingFileId, setReplacingFileId] = useState<string | null>(null);
  const [preserveOriginalQuality, setPreserveOriginalQuality] = useState(false);

  const [validationError, setValidationError] =
    useState<PatientFileUploadErrorCode | null>(null);
  const [errorBanner, setErrorBanner] = useState<ErrorBannerState | null>(null);
  const [statusBanner, setStatusBanner] = useState<StatusBannerState | null>(
    null,
  );

  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const archivedRequestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveTab: FilesTab = isAdmin ? activeTab : 'active';

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const signFileUrl = useCallback(
    async (
      file: Pick<PatientFileRecord, 'id' | 'storagePath'>,
      guardCheck: () => boolean,
    ) => {
      if (!repository) {
        return;
      }

      setSignedUrls((prev) => ({
        ...prev,
        [file.id]: {
          url: prev[file.id]?.url ?? null,
          isLoading: true,
          hasError: false,
        },
      }));

      try {
        const signedUrl = await repository.createSignedFileUrl(
          file.storagePath,
          PATIENT_FILE_SIGNED_URL_TTL_SECONDS,
        );
        if (!isMountedRef.current || !guardCheck()) {
          return;
        }
        setSignedUrls((prev) => ({
          ...prev,
          [file.id]: {
            url: signedUrl,
            isLoading: false,
            hasError: false,
          },
        }));
      } catch {
        if (!isMountedRef.current || !guardCheck()) {
          return;
        }
        setSignedUrls((prev) => ({
          ...prev,
          [file.id]: {
            url: null,
            isLoading: false,
            hasError: true,
          },
        }));
      }
    },
    [repository],
  );

  const loadFiles = useCallback(async () => {
    if (!repository) {
      setFiles([]);
      setSignedUrls({});
      setIsLoading(false);
      setHasLoadError(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setHasLoadError(false);

    try {
      const loadedFiles = await repository.listPatientFiles(
        clinicId,
        patientId,
      );
      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      setFiles(loadedFiles);
      setIsLoading(false);

      for (const file of loadedFiles) {
        void signFileUrl(file, () => requestId === requestIdRef.current);
      }
    } catch {
      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
      setHasLoadError(true);
      setIsLoading(false);
    }
  }, [clinicId, patientId, repository, signFileUrl]);

  const loadArchivedFiles = useCallback(async () => {
    if (!repository || !isAdmin) {
      setArchivedFiles([]);
      setIsLoadingArchived(false);
      setHasArchivedLoadError(false);
      return;
    }

    const requestId = ++archivedRequestIdRef.current;
    setIsLoadingArchived(true);
    setHasArchivedLoadError(false);

    try {
      const loadedArchived = await repository.listArchivedPatientFiles(
        clinicId,
        patientId,
      );
      if (
        !isMountedRef.current ||
        requestId !== archivedRequestIdRef.current
      ) {
        return;
      }

      setArchivedFiles(loadedArchived);
      setIsLoadingArchived(false);

      for (const file of loadedArchived) {
        void signFileUrl(
          file,
          () => requestId === archivedRequestIdRef.current,
        );
      }
    } catch {
      if (
        !isMountedRef.current ||
        requestId !== archivedRequestIdRef.current
      ) {
        return;
      }
      setHasArchivedLoadError(true);
      setIsLoadingArchived(false);
    }
  }, [clinicId, isAdmin, patientId, repository, signFileUrl]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (effectiveTab === 'archived' && isAdmin) {
      void loadArchivedFiles();
    }
  }, [effectiveTab, isAdmin, loadArchivedFiles]);

  const formatOptimizationSavingsDetail = useCallback(
    (outcome: ImageOptimizationOutcome): string | undefined => {
      if (!outcome.wasOptimized) {
        return undefined;
      }
      return t('patients.files.optimization.savedSummary')
        .replace('{original}', formatFileSize(outcome.originalSizeBytes, locale))
        .replace('{final}', formatFileSize(outcome.finalSizeBytes, locale));
    },
    [locale, t],
  );

  const prepareValidatedFileForUpload = useCallback(
    async (
      rawFile: File,
    ): Promise<
      | { readonly ok: true; readonly outcome: ImageOptimizationOutcome }
      | { readonly ok: false; readonly errorCode: PatientFileUploadErrorCode }
    > => {
      // 1. Validate BEFORE decoding in Canvas (prevents mobile OOM on > 10 MB or forbidden files)
      const initialValidation = validatePatientFileUpload({
        fileName: rawFile.name,
        mimeType: rawFile.type,
        fileSizeBytes: rawFile.size,
      });

      if (!initialValidation.valid) {
        return { ok: false, errorCode: initialValidation.error };
      }

      // 2. Optimize large images client-side unless user opted to preserve original quality
      const outcome = await optimizer.optimizeIfNeeded(rawFile, {
        preserveOriginalQuality,
      });

      // 3. Re-validate final File before touching network
      const finalValidation = validatePatientFileUpload({
        fileName: outcome.file.name,
        mimeType: outcome.file.type,
        fileSizeBytes: outcome.file.size,
      });

      if (!finalValidation.valid) {
        return { ok: false, errorCode: finalValidation.error };
      }

      return { ok: true, outcome };
    },
    [optimizer, preserveOriginalQuality],
  );

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    // Reset input value so re-selecting the same file triggers onChange cleanly
    event.target.value = '';

    if (!selectedFile || !repository || !user || isUploading) {
      return;
    }

    setValidationError(null);
    setErrorBanner(null);
    setStatusBanner(null);
    setIsUploading(true);
    const activeRequestId = requestIdRef.current;

    try {
      const prepared = await prepareValidatedFileForUpload(selectedFile);
      if (!isMountedRef.current) {
        return;
      }

      if (!prepared.ok) {
        setValidationError(prepared.errorCode);
        return;
      }

      const uploaded = await repository.uploadPatientFile({
        clinicId,
        patientId,
        uploadedBy: user.id,
        file: prepared.outcome.file,
      });

      if (!isMountedRef.current || activeRequestId !== requestIdRef.current) {
        return;
      }

      setFiles((prev) => Object.freeze([uploaded, ...prev]));
      setStatusBanner({
        title: t('patients.files.uploadSuccessTitle'),
        description: t('patients.files.uploadSuccessDescription'),
        detail: formatOptimizationSavingsDetail(prepared.outcome),
      });
      void signFileUrl(uploaded, () => activeRequestId === requestIdRef.current);
    } catch {
      if (!isMountedRef.current) {
        return;
      }
      setErrorBanner({
        title: t('patients.files.errors.uploadFailedTitle'),
        description: t('patients.files.errors.uploadFailedDescription'),
      });
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false);
      }
    }
  };

  const handleReplaceFile = useCallback(
    async (previousFile: PatientFileRecord, replacementFile: File) => {
      if (!repository || !user || replacingFileId !== null || isUploading) {
        return;
      }

      setValidationError(null);
      setErrorBanner(null);
      setStatusBanner(null);
      setReplacingFileId(previousFile.id);
      const activeRequestId = requestIdRef.current;

      try {
        const prepared = await prepareValidatedFileForUpload(replacementFile);
        if (!isMountedRef.current) {
          return;
        }

        if (!prepared.ok) {
          setValidationError(prepared.errorCode);
          return;
        }

        // CRITICAL: Upload replacement FIRST; only archive the previous file if upload succeeds.
        const uploaded = await repository.uploadPatientFile({
          clinicId,
          patientId,
          uploadedBy: user.id,
          file: prepared.outcome.file,
        });

        if (!isMountedRef.current || activeRequestId !== requestIdRef.current) {
          return;
        }

        void signFileUrl(
          uploaded,
          () => activeRequestId === requestIdRef.current,
        );

        try {
          await repository.archivePatientFile(previousFile.id);
          if (!isMountedRef.current) {
            return;
          }

          setFiles((prev) =>
            Object.freeze([
              uploaded,
              ...prev.filter((item) => item.id !== previousFile.id),
            ]),
          );
          setSignedUrls((prev) => {
            const next = { ...prev };
            delete next[previousFile.id];
            return next;
          });
          setStatusBanner({
            title: t('patients.files.replace.successTitle'),
            description: t('patients.files.replace.successDescription'),
            detail: formatOptimizationSavingsDetail(prepared.outcome),
          });
        } catch {
          if (!isMountedRef.current) {
            return;
          }
          // New file is safely uploaded; keep both visible and warn the user
          setFiles((prev) => Object.freeze([uploaded, ...prev]));
          setErrorBanner({
            title: t('patients.files.replace.errorTitle'),
            description: t(
              'patients.files.replace.archivePreviousErrorDescription',
            ),
          });
        }
      } catch {
        if (!isMountedRef.current) {
          return;
        }
        // Upload failed: previous file remains 100% untouched
        setErrorBanner({
          title: t('patients.files.replace.errorTitle'),
          description: t('patients.files.replace.errorDescription'),
        });
      } finally {
        if (isMountedRef.current) {
          setReplacingFileId(null);
        }
      }
    },
    [
      clinicId,
      formatOptimizationSavingsDetail,
      isUploading,
      patientId,
      prepareValidatedFileForUpload,
      replacingFileId,
      repository,
      signFileUrl,
      t,
      user,
    ],
  );

  const handleRefreshLink = useCallback(
    (file: Pick<PatientFileRecord, 'id' | 'storagePath'>) => {
      const currentReq = requestIdRef.current;
      void signFileUrl(file, () => currentReq === requestIdRef.current);
    },
    [signFileUrl],
  );

  const handleRefreshArchivedLink = useCallback(
    (file: ArchivedPatientFileRecord) => {
      const currentReq = archivedRequestIdRef.current;
      void signFileUrl(file, () => currentReq === archivedRequestIdRef.current);
    },
    [signFileUrl],
  );

  const handleArchiveFile = useCallback(
    async (fileId: string) => {
      if (!repository) {
        return;
      }

      await repository.archivePatientFile(fileId);

      if (!isMountedRef.current) {
        return;
      }

      setFiles((prev) =>
        Object.freeze(prev.filter((item) => item.id !== fileId)),
      );
      setSignedUrls((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    },
    [repository],
  );

  const handleSelfPurgeFile = useCallback(
    async (file: PatientFileRecord) => {
      if (!repository) {
        return;
      }

      await repository.purgeMistakenUpload(file.id, file.storagePath);

      if (!isMountedRef.current) {
        return;
      }

      setFiles((prev) =>
        Object.freeze(prev.filter((item) => item.id !== file.id)),
      );
      setSignedUrls((prev) => {
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      setStatusBanner({
        title: t('patients.files.selfPurge.successTitle'),
        description: t('patients.files.selfPurge.successDescription'),
      });
    },
    [repository, t],
  );

  const handleRestoreArchivedFile = useCallback(
    async (archivedFile: ArchivedPatientFileRecord) => {
      if (!repository) {
        return;
      }

      await repository.restorePatientFile(archivedFile.id);

      if (!isMountedRef.current) {
        return;
      }

      const restored: PatientFileRecord = Object.freeze({
        id: archivedFile.id,
        clinicId: archivedFile.clinicId,
        patientId: archivedFile.patientId,
        appointmentId: archivedFile.appointmentId,
        storagePath: archivedFile.storagePath,
        fileName: archivedFile.fileName,
        mimeType: archivedFile.mimeType,
        fileSizeBytes: archivedFile.fileSizeBytes,
        uploadedBy: archivedFile.uploadedBy,
        createdAt: archivedFile.createdAt,
      });

      setArchivedFiles((prev) =>
        Object.freeze(prev.filter((item) => item.id !== archivedFile.id)),
      );
      setFiles((prev) =>
        Object.freeze(
          [restored, ...prev.filter((item) => item.id !== restored.id)].sort(
            (left, right) => right.createdAt.localeCompare(left.createdAt),
          ),
        ),
      );
      setStatusBanner({
        title: t('patients.files.archived.restoreSuccessTitle'),
        description: t('patients.files.archived.restoreSuccessDescription'),
      });
      const currentReq = requestIdRef.current;
      void signFileUrl(restored, () => currentReq === requestIdRef.current);
    },
    [repository, signFileUrl, t],
  );

  const handlePurgeArchivedFile = useCallback(
    async (archivedFile: ArchivedPatientFileRecord) => {
      if (!repository) {
        return;
      }

      await repository.purgeArchivedPatientFile(
        archivedFile.id,
        archivedFile.storagePath,
      );

      if (!isMountedRef.current) {
        return;
      }

      setArchivedFiles((prev) =>
        Object.freeze(prev.filter((item) => item.id !== archivedFile.id)),
      );
      setSignedUrls((prev) => {
        const next = { ...prev };
        delete next[archivedFile.id];
        return next;
      });
      setStatusBanner({
        title: t('patients.files.archived.purgeSuccessTitle'),
        description: t('patients.files.archived.purgeSuccessDescription'),
      });
    },
    [repository, t],
  );

  const translatedValidationError = resolveUploadValidationMessage(
    validationError,
    t,
  );

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ImageIcon
              className="h-4 w-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span>{t('patients.files.title')}</span>
          </CardTitle>

          <Badge variant="default" className="shrink-0">
            <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{t('patients.files.privateBadge')}</span>
          </Badge>
        </div>

        <CardDescription>{t('patients.files.description')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {!repository ? (
          <EmptyState
            title={t('patients.files.unconfiguredTitle')}
            description={t('patients.files.unconfiguredDescription')}
          />
        ) : (
          <>
            {/* MUST use role="note" (never role="alert") so MedicalAlertBanner remains the sole critical alert */}
            <div
              role="note"
              className="flex items-start gap-3 rounded-md border border-warning-border bg-warning-bg p-3.5 text-warning-foreground"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 space-y-0.5 text-xs">
                <p className="font-semibold break-words">
                  {t('patients.files.syntheticNoticeTitle')}
                </p>
                <p className="text-warning-foreground/90 break-words">
                  {t('patients.files.syntheticNoticeBody')}
                </p>
              </div>
            </div>

            {isAdmin ? (
              <div
                role="tablist"
                aria-label={t('patients.files.tabs.ariaLabel')}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-muted p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveTab === 'active'}
                  onClick={() => setActiveTab('active')}
                  className={
                    effectiveTab === 'active'
                      ? 'inline-flex h-8 items-center justify-center rounded-md bg-surface-card px-3 text-xs font-semibold text-text-primary shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      : 'inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  }
                >
                  {t('patients.files.tabs.active')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveTab === 'archived'}
                  onClick={() => setActiveTab('archived')}
                  className={
                    effectiveTab === 'archived'
                      ? 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-surface-card px-3 text-xs font-semibold text-text-primary shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      : 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  }
                >
                  <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{t('patients.files.tabs.archived')}</span>
                </button>
              </div>
            ) : null}

            {effectiveTab === 'active' ? (
              <div className="rounded-lg border border-dashed border-border bg-surface-muted/50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <label
                      htmlFor="patient-file-upload-input"
                      className="block text-sm font-semibold text-text-primary"
                    >
                      {t('patients.files.uploadLabel')}
                    </label>
                    <p className="text-xs text-text-muted break-words">
                      {t('patients.files.uploadHint')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      id="patient-file-upload-input"
                      type="file"
                      accept={FILE_ACCEPT_ATTRIBUTE}
                      disabled={isUploading || replacingFileId !== null || !user}
                      onChange={(event) => void handleFileChange(event)}
                      className="sr-only"
                    />
                    <button
                      type="button"
                      disabled={isUploading || replacingFileId !== null || !user}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    >
                      {isUploading ? (
                        <>
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                          <span>{t('patients.files.uploadingButton')}</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" aria-hidden="true" />
                          <span>{t('patients.files.uploadButton')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 border-t border-border/70 pt-3">
                  <input
                    id="patient-file-preserve-quality-checkbox"
                    type="checkbox"
                    checked={preserveOriginalQuality}
                    disabled={isUploading || replacingFileId !== null}
                    onChange={(event) =>
                      setPreserveOriginalQuality(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <label
                      htmlFor="patient-file-preserve-quality-checkbox"
                      className="block cursor-pointer text-xs font-medium text-text-primary break-words"
                    >
                      {t('patients.files.optimization.preserveOriginalLabel')}
                    </label>
                    <p className="text-xs text-text-muted break-words">
                      {t('patients.files.optimization.preserveOriginalHint')}
                    </p>
                  </div>
                </div>

                {translatedValidationError ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-md border border-danger-border bg-danger-bg p-3 text-xs text-danger-foreground"
                  >
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-danger"
                      aria-hidden="true"
                    />
                    <p className="min-w-0 flex-1 font-medium break-words">
                      {translatedValidationError}
                    </p>
                  </div>
                ) : null}

                {errorBanner ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-md border border-danger-border bg-danger-bg p-3 text-xs text-danger-foreground"
                  >
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-danger"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-semibold break-words">
                        {errorBanner.title}
                      </p>
                      <p className="break-words">{errorBanner.description}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {statusBanner ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start gap-2.5 rounded-md border border-success-border bg-success-bg p-3 text-xs text-success-foreground"
              >
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-semibold break-words">
                    {statusBanner.title}
                  </p>
                  <p className="break-words">{statusBanner.description}</p>
                  {statusBanner.detail ? (
                    <p className="font-medium break-words">
                      {statusBanner.detail}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {effectiveTab === 'archived' ? (
              isLoadingArchived ? (
                <LoadingState
                  title={t('patients.files.loadingTitle')}
                  description={t('patients.files.loadingDescription')}
                />
              ) : hasArchivedLoadError ? (
                <ErrorState
                  title={t('patients.files.archived.loadErrorTitle')}
                  description={t('patients.files.archived.loadErrorDescription')}
                  retryLabel={t('states.retry')}
                  onRetry={() => void loadArchivedFiles()}
                />
              ) : archivedFiles.length === 0 ? (
                <EmptyState
                  icon={<Archive className="h-5 w-5" aria-hidden="true" />}
                  title={t('patients.files.archived.emptyTitle')}
                  description={t('patients.files.archived.emptyDescription')}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {archivedFiles.map((file) => {
                    const urlState = signedUrls[file.id];
                    return (
                      <ArchivedPatientFileCard
                        key={file.id}
                        file={file}
                        signedUrl={urlState?.url ?? null}
                        isSigningUrl={urlState?.isLoading ?? false}
                        hasSignError={urlState?.hasError ?? false}
                        onRefreshLink={handleRefreshArchivedLink}
                        onRestore={handleRestoreArchivedFile}
                        onPurge={handlePurgeArchivedFile}
                      />
                    );
                  })}
                </div>
              )
            ) : isLoading ? (
              <LoadingState
                title={t('patients.files.loadingTitle')}
                description={t('patients.files.loadingDescription')}
              />
            ) : hasLoadError ? (
              <ErrorState
                title={t('patients.files.errors.listLoadTitle')}
                description={t('patients.files.errors.listLoadDescription')}
                retryLabel={t('states.retry')}
                onRetry={() => void loadFiles()}
              />
            ) : files.length === 0 ? (
              <EmptyState
                title={t('patients.files.emptyTitle')}
                description={t('patients.files.emptyDescription')}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {files.map((file) => {
                  const urlState = signedUrls[file.id];
                  return (
                    <PatientFileCard
                      key={file.id}
                      file={file}
                      signedUrl={urlState?.url ?? null}
                      isSigningUrl={urlState?.isLoading ?? false}
                      hasSignError={urlState?.hasError ?? false}
                      canSelfPurge={canSelfPurgeMistakenUpload(file, user?.id)}
                      isReplacing={replacingFileId === file.id}
                      onRefreshLink={handleRefreshLink}
                      onArchive={handleArchiveFile}
                      onReplace={handleReplaceFile}
                      onSelfPurge={handleSelfPurgeFile}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
