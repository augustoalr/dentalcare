import { AlertCircle, Archive, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/ui/components/ui/button';

export interface PatientFileArchiveConfirmPanelProps {
  readonly isArchiving: boolean;
  readonly hasError: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function PatientFileArchiveConfirmPanel({
  isArchiving,
  hasError,
  onConfirm,
  onCancel,
}: PatientFileArchiveConfirmPanelProps) {
  const { t } = useI18n();

  return (
    <div
      role="region"
      aria-label={t('patients.files.archiveConfirm.title')}
      className="space-y-3 rounded-md border border-danger-border bg-danger-bg p-3 text-danger-foreground"
    >
      <div className="space-y-1">
        <p className="text-xs font-semibold break-words">
          {t('patients.files.archiveConfirm.title')}
        </p>
        <p className="text-xs text-danger-foreground/90 break-words">
          {t('patients.files.archiveConfirm.description')}
        </p>
      </div>

      {hasError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger-border bg-surface-card p-2.5 text-xs text-danger-foreground"
        >
          <AlertCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="font-semibold break-words">
              {t('patients.files.errors.archiveFailedTitle')}
            </p>
            <p className="break-words">
              {t('patients.files.errors.archiveFailedDescription')}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isArchiving}
          onClick={onCancel}
        >
          {t('patients.files.archiveConfirm.cancelButton')}
        </Button>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isArchiving}
          onClick={onConfirm}
        >
          {isArchiving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span>{t('patients.files.archiveConfirm.archivingButton')}</span>
            </>
          ) : (
            <>
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('patients.files.archiveConfirm.confirmButton')}</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
