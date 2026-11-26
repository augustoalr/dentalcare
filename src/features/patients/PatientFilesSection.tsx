import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Lock,
  Upload,
} from 'lucide-react';
import {
  ALLOWED_PATIENT_FILE_MIME_TYPES,
  PATIENT_FILE_SIGNED_URL_TTL_SECONDS,
  validatePatientFileUpload,
  type PatientFileRecord,
  type PatientFileUploadErrorCode,
} from '@/domain/patientFiles';
import { useAuth } from '@/features/auth/AuthContext';
import { PatientFileCard } from '@/features/patients/PatientFileCard';
import { usePatientFileRepository } from '@/features/patients/PatientFileRepositoryContext';
import { useI18n, type TranslationKey } from '@/i18n';
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
}

interface SignedUrlEntry {
  readonly url: string | null;
  readonly isLoading: boolean;
  readonly hasError: boolean;
}

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
}: PatientFilesSectionProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const repository = usePatientFileRepository(patientFileRepository);

  const [files, setFiles] = useState<readonly PatientFileRecord[]>([]);
  const [signedUrls, setSignedUrls] = useState<
    Readonly<Record<string, SignedUrlEntry>>
  >({});
  const [isLoading, setIsLoading] = useState(Boolean(repository));
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [validationError, setValidationError] =
    useState<PatientFileUploadErrorCode | null>(null);
  const [hasUploadError, setHasUploadError] = useState(false);
  const [uploadSucceeded, setUploadSucceeded] = useState(false);

  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const signFileUrl = useCallback(
    async (file: PatientFileRecord, requestId: number) => {
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
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
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
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
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
        void signFileUrl(file, requestId);
      }
    } catch {
      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
      setHasLoadError(true);
      setIsLoading(false);
    }
  }, [clinicId, patientId, repository, signFileUrl]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    // Reset input value so re-selecting the same file triggers onChange cleanly
    event.target.value = '';

    if (!selectedFile || !repository || !user || isUploading) {
      return;
    }

    setValidationError(null);
    setHasUploadError(false);
    setUploadSucceeded(false);

    const validation = validatePatientFileUpload({
      fileName: selectedFile.name,
      mimeType: selectedFile.type,
      fileSizeBytes: selectedFile.size,
    });

    if (!validation.valid) {
      setValidationError(validation.error);
      return;
    }

    setIsUploading(true);
    const activeRequestId = requestIdRef.current;

    try {
      const uploaded = await repository.uploadPatientFile({
        clinicId,
        patientId,
        uploadedBy: user.id,
        file: selectedFile,
      });

      if (!isMountedRef.current || activeRequestId !== requestIdRef.current) {
        return;
      }

      setFiles((prev) => Object.freeze([uploaded, ...prev]));
      setUploadSucceeded(true);
      void signFileUrl(uploaded, activeRequestId);
    } catch {
      if (!isMountedRef.current) {
        return;
      }
      setHasUploadError(true);
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false);
      }
    }
  };

  const handleRefreshLink = useCallback(
    (file: PatientFileRecord) => {
      void signFileUrl(file, requestIdRef.current);
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

      setFiles((prev) => Object.freeze(prev.filter((item) => item.id !== fileId)));
      setSignedUrls((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    },
    [repository],
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
                    disabled={isUploading || !user}
                    onChange={(event) => void handleFileChange(event)}
                    className="sr-only"
                  />
                  <button
                    type="button"
                    disabled={isUploading || !user}
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

              {hasUploadError ? (
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
                      {t('patients.files.errors.uploadFailedTitle')}
                    </p>
                    <p className="break-words">
                      {t('patients.files.errors.uploadFailedDescription')}
                    </p>
                  </div>
                </div>
              ) : null}

              {uploadSucceeded ? (
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
                      {t('patients.files.uploadSuccessTitle')}
                    </p>
                    <p className="break-words">
                      {t('patients.files.uploadSuccessDescription')}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {isLoading ? (
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
                      onRefreshLink={handleRefreshLink}
                      onArchive={handleArchiveFile}
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
