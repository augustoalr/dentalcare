import { AlertCircle, Archive, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/ui/components/ui/button';

export interface PatientArchiveConfirmPanelProps {
  readonly isArchiving: boolean;
  readonly hasError: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function PatientArchiveConfirmPanel({
  isArchiving,
  hasError,
  onConfirm,
  onCancel,
}: PatientArchiveConfirmPanelProps) {
  const { t } = useI18n();

  return (
    <div
      role="region"
      aria-label={t('patients.detail.archiveConfirmTitle')}
      className="space-y-3 rounded-lg border border-danger-border bg-danger-bg p-4 text-danger-foreground"
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold break-words">
          {t('patients.detail.archiveConfirmTitle')}
        </p>
        <p className="text-xs text-danger-foreground/90 break-words">
          {t('patients.detail.archiveConfirmDescription')}
        </p>
      </div>

      {hasError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger-border bg-surface-card p-3 text-xs text-danger-foreground"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-danger"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="font-semibold break-words">
              {t('patients.detail.archiveErrorTitle')}
            </p>
            <p className="break-words">
              {t('patients.detail.archiveErrorDescription')}
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
          {t('patients.detail.archiveCancelButton')}
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
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>{t('patients.detail.archivingButton')}</span>
            </>
          ) : (
            <>
              <Archive className="h-4 w-4" aria-hidden="true" />
              <span>{t('patients.detail.archiveConfirmButton')}</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
