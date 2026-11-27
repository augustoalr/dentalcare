import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Archive,
  ExternalLink,
  FileText,
  ImageOff,
  Loader2,
  RefreshCw,
  Replace,
  Trash2,
} from 'lucide-react';
import {
  ALLOWED_PATIENT_FILE_MIME_TYPES,
  formatFileSize,
  formatPatientFileDate,
  getPatientFileTypeBadge,
  isImageMimeType,
  type PatientFileRecord,
} from '@/domain/patientFiles';
import { PatientFileActionConfirmPanel } from '@/features/patients/PatientFileActionConfirmPanel';
import { PatientFileArchiveConfirmPanel } from '@/features/patients/PatientFileArchiveConfirmPanel';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';

export interface PatientFileCardProps {
  readonly file: PatientFileRecord;
  readonly signedUrl: string | null;
  readonly isSigningUrl: boolean;
  readonly hasSignError: boolean;
  readonly canSelfPurge?: boolean;
  readonly isReplacing?: boolean;
  readonly onRefreshLink: (file: PatientFileRecord) => void;
  readonly onArchive: (fileId: string) => Promise<void>;
  readonly onReplace?: (
    file: PatientFileRecord,
    replacementFile: File,
  ) => Promise<void>;
  readonly onSelfPurge?: (file: PatientFileRecord) => Promise<void>;
}

type ActiveConfirmMode = 'none' | 'archive' | 'self_purge';

const FILE_ACCEPT_ATTRIBUTE = ALLOWED_PATIENT_FILE_MIME_TYPES.join(',');

export function PatientFileCard({
  file,
  signedUrl,
  isSigningUrl,
  hasSignError,
  canSelfPurge = false,
  isReplacing = false,
  onRefreshLink,
  onArchive,
  onReplace,
  onSelfPurge,
}: PatientFileCardProps) {
  const { locale, t } = useI18n();
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [confirmMode, setConfirmMode] = useState<ActiveConfirmMode>('none');
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [hasActionError, setHasActionError] = useState(false);

  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [signedUrl]);

  const isImage = isImageMimeType(file.mimeType);
  const typeBadge = getPatientFileTypeBadge(file.mimeType);
  const formattedSize = formatFileSize(file.fileSizeBytes, locale);
  const formattedDate = formatPatientFileDate(file.createdAt, locale);

  const handleConfirmArchive = async () => {
    if (isActionBusy) {
      return;
    }

    setIsActionBusy(true);
    setHasActionError(false);

    try {
      await onArchive(file.id);
    } catch {
      setHasActionError(true);
      setIsActionBusy(false);
    }
  };

  const handleConfirmSelfPurge = async () => {
    if (isActionBusy || !onSelfPurge) {
      return;
    }

    setIsActionBusy(true);
    setHasActionError(false);

    try {
      await onSelfPurge(file);
    } catch {
      setHasActionError(true);
      setIsActionBusy(false);
    }
  };

  const handleReplaceInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile || !onReplace || isReplacing || isActionBusy) {
      return;
    }

    void onReplace(file, selectedFile);
  };

  return (
    <article className="flex min-w-0 flex-col justify-between gap-3 rounded-lg border border-border bg-surface-card p-3.5 shadow-xs">
      <div className="space-y-3 min-w-0">
        {isImage ? (
          <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted">
            {signedUrl && !imageLoadFailed ? (
              <img
                src={signedUrl}
                alt={t('patients.files.card.imagePreviewAlt').replace(
                  '{name}',
                  file.fileName,
                )}
                className="h-full w-full object-cover"
                onError={() => setImageLoadFailed(true)}
              />
            ) : isSigningUrl ? (
              <div className="flex flex-col items-center gap-1.5 px-3 text-center text-xs text-text-muted">
                <Loader2
                  className="h-5 w-5 animate-spin text-primary"
                  aria-hidden="true"
                />
                <span>{t('patients.files.card.previewLoading')}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 px-3 text-center text-xs text-text-muted">
                <ImageOff className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="break-words">
                  {t('patients.files.errors.signedUrlFailed')}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-surface-muted px-3 text-center">
            <FileText
              className="h-9 w-9 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="text-xs font-medium text-text-secondary break-words">
              {t('patients.files.card.pdfPreviewLabel')}
            </span>
          </div>
        )}

        <div className="min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <p
              title={file.fileName}
              className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary break-words"
            >
              {file.fileName}
            </p>
            <Badge variant="primary" className="shrink-0">
              {typeBadge}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
            <span>{formattedSize}</span>
            <span aria-hidden="true">·</span>
            <span>
              {t('patients.files.card.uploadedOn').replace(
                '{date}',
                formattedDate,
              )}
            </span>
          </div>

          {hasSignError && !isImage ? (
            <p className="text-xs text-danger break-words">
              {t('patients.files.errors.signedUrlFailed')}
            </p>
          ) : null}
        </div>
      </div>

      {confirmMode === 'archive' ? (
        <PatientFileArchiveConfirmPanel
          isArchiving={isActionBusy}
          hasError={hasActionError}
          onConfirm={() => void handleConfirmArchive()}
          onCancel={() => {
            setConfirmMode('none');
            setHasActionError(false);
          }}
        />
      ) : confirmMode === 'self_purge' ? (
        <PatientFileActionConfirmPanel
          tone="danger"
          title={t('patients.files.selfPurge.confirmTitle')}
          description={t('patients.files.selfPurge.confirmDescription')}
          confirmLabel={t('patients.files.selfPurge.confirmButton')}
          busyLabel={t('patients.files.selfPurge.deletingButton')}
          cancelLabel={t('patients.files.selfPurge.cancelButton')}
          errorTitle={t('patients.files.selfPurge.errorTitle')}
          errorDescription={t('patients.files.selfPurge.errorDescription')}
          confirmIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
          isBusy={isActionBusy}
          hasError={hasActionError}
          onConfirm={() => void handleConfirmSelfPurge()}
          onCancel={() => {
            setConfirmMode('none');
            setHasActionError(false);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {signedUrl ? (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface-card px-2.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>{t('patients.files.card.openButton')}</span>
            </a>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSigningUrl || isReplacing}
              onClick={() => onRefreshLink(file)}
            >
              {isSigningUrl ? (
                <>
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  <span>{t('patients.files.card.openingButton')}</span>
                </>
              ) : (
                <>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t('patients.files.card.openButton')}</span>
                </>
              )}
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSigningUrl || isReplacing}
            onClick={() => onRefreshLink(file)}
          >
            <RefreshCw
              className={
                isSigningUrl ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'
              }
              aria-hidden="true"
            />
            <span>
              {isSigningUrl
                ? t('patients.files.card.refreshingLinkButton')
                : t('patients.files.card.refreshLinkButton')}
            </span>
          </Button>

          {onReplace ? (
            <>
              <input
                ref={replaceInputRef}
                type="file"
                accept={FILE_ACCEPT_ATTRIBUTE}
                aria-label={t('patients.files.replace.inputAria').replace(
                  '{name}',
                  file.fileName,
                )}
                disabled={isReplacing || isActionBusy}
                onChange={handleReplaceInputChange}
                className="sr-only"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isReplacing || isActionBusy}
                onClick={() => replaceInputRef.current?.click()}
              >
                {isReplacing ? (
                  <>
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    <span>{t('patients.files.replace.replacingButton')}</span>
                  </>
                ) : (
                  <>
                    <Replace className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('patients.files.replace.button')}</span>
                  </>
                )}
              </Button>
            </>
          ) : null}

          {canSelfPurge && onSelfPurge ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isReplacing}
              className="text-danger hover:bg-danger-bg hover:text-danger-foreground"
              onClick={() => {
                setHasActionError(false);
                setConfirmMode('self_purge');
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('patients.files.selfPurge.button')}</span>
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isReplacing}
            className="ml-auto text-danger hover:bg-danger-bg hover:text-danger-foreground"
            onClick={() => {
              setHasActionError(false);
              setConfirmMode('archive');
            }}
          >
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('patients.files.card.archiveButton')}</span>
          </Button>
        </div>
      )}
    </article>
  );
}
