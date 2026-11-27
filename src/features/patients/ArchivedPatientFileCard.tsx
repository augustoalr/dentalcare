import { useEffect, useState } from 'react';
import {
  Archive,
  ExternalLink,
  FileText,
  ImageOff,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  formatFileSize,
  formatPatientFileDate,
  getPatientFileTypeBadge,
  isImageMimeType,
  type ArchivedPatientFileRecord,
} from '@/domain/patientFiles';
import { PatientFileActionConfirmPanel } from '@/features/patients/PatientFileActionConfirmPanel';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';

export interface ArchivedPatientFileCardProps {
  readonly file: ArchivedPatientFileRecord;
  readonly signedUrl: string | null;
  readonly isSigningUrl: boolean;
  readonly hasSignError: boolean;
  readonly onRefreshLink: (file: ArchivedPatientFileRecord) => void;
  readonly onRestore: (file: ArchivedPatientFileRecord) => Promise<void>;
  readonly onPurge: (file: ArchivedPatientFileRecord) => Promise<void>;
}

type ConfirmActionMode = 'none' | 'restore' | 'purge';

export function ArchivedPatientFileCard({
  file,
  signedUrl,
  isSigningUrl,
  hasSignError,
  onRefreshLink,
  onRestore,
  onPurge,
}: ArchivedPatientFileCardProps) {
  const { locale, t } = useI18n();
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [confirmMode, setConfirmMode] = useState<ConfirmActionMode>('none');
  const [isBusy, setIsBusy] = useState(false);
  const [hasActionError, setHasActionError] = useState(false);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [signedUrl]);

  const isImage = isImageMimeType(file.mimeType);
  const typeBadge = getPatientFileTypeBadge(file.mimeType);
  const formattedSize = formatFileSize(file.fileSizeBytes, locale);
  const formattedArchivedDate = formatPatientFileDate(file.deletedAt, locale);

  const handleConfirmRestore = async () => {
    if (isBusy) {
      return;
    }
    setIsBusy(true);
    setHasActionError(false);
    try {
      await onRestore(file);
    } catch {
      setHasActionError(true);
      setIsBusy(false);
    }
  };

  const handleConfirmPurge = async () => {
    if (isBusy) {
      return;
    }
    setIsBusy(true);
    setHasActionError(false);
    try {
      await onPurge(file);
    } catch {
      setHasActionError(true);
      setIsBusy(false);
    }
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
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="default">
                <Archive className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{t('patients.files.archived.badge')}</span>
              </Badge>
              <Badge variant="primary">{typeBadge}</Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
            <span>{formattedSize}</span>
            <span aria-hidden="true">·</span>
            <span>
              {t('patients.files.archived.archivedOn').replace(
                '{date}',
                formattedArchivedDate,
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

      {confirmMode === 'restore' ? (
        <PatientFileActionConfirmPanel
          tone="primary"
          title={t('patients.files.archived.restoreConfirm.title')}
          description={t('patients.files.archived.restoreConfirm.description')}
          confirmLabel={t(
            'patients.files.archived.restoreConfirm.confirmButton',
          )}
          busyLabel={t(
            'patients.files.archived.restoreConfirm.restoringButton',
          )}
          cancelLabel={t('patients.files.archived.restoreConfirm.cancelButton')}
          errorTitle={t('patients.files.archived.restoreConfirm.errorTitle')}
          errorDescription={t(
            'patients.files.archived.restoreConfirm.errorDescription',
          )}
          confirmIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
          isBusy={isBusy}
          hasError={hasActionError}
          onConfirm={() => void handleConfirmRestore()}
          onCancel={() => {
            setConfirmMode('none');
            setHasActionError(false);
          }}
        />
      ) : confirmMode === 'purge' ? (
        <PatientFileActionConfirmPanel
          tone="danger"
          title={t('patients.files.archived.purgeConfirm.title')}
          description={t('patients.files.archived.purgeConfirm.description')}
          confirmLabel={t('patients.files.archived.purgeConfirm.confirmButton')}
          busyLabel={t('patients.files.archived.purgeConfirm.purgingButton')}
          cancelLabel={t('patients.files.archived.purgeConfirm.cancelButton')}
          errorTitle={t('patients.files.archived.purgeConfirm.errorTitle')}
          errorDescription={t(
            'patients.files.archived.purgeConfirm.errorDescription',
          )}
          confirmIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
          isBusy={isBusy}
          hasError={hasActionError}
          onConfirm={() => void handleConfirmPurge()}
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
              disabled={isSigningUrl}
              onClick={() => onRefreshLink(file)}
            >
              <RefreshCw
                className={
                  isSigningUrl ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'
                }
                aria-hidden="true"
              />
              <span>{t('patients.files.card.refreshLinkButton')}</span>
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setHasActionError(false);
              setConfirmMode('restore');
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('patients.files.archived.restoreButton')}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-danger hover:bg-danger-bg hover:text-danger-foreground"
            onClick={() => {
              setHasActionError(false);
              setConfirmMode('purge');
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('patients.files.archived.purgeButton')}</span>
          </Button>
        </div>
      )}
    </article>
  );
}
