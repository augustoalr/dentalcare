import { AlertCircle, Archive, RotateCcw } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/ui/components/ui/button';

export interface AppointmentActionConfirmPanelProps {
  readonly mode: 'archive' | 'restore';
  readonly isPending: boolean;
  readonly hasError: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function AppointmentActionConfirmPanel({
  mode,
  isPending,
  hasError,
  onConfirm,
  onCancel,
}: AppointmentActionConfirmPanelProps) {
  const { t } = useI18n();
  const isArchive = mode === 'archive';

  const containerClasses = isArchive
    ? 'space-y-3 rounded-lg border border-danger-border bg-danger-bg p-3.5 text-danger-foreground'
    : 'space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-text-primary';

  return (
    <div
      role="region"
      aria-label={
        isArchive
          ? t('schedule.confirm.archiveTitle')
          : t('schedule.confirm.restoreTitle')
      }
      className={containerClasses}
    >
      <div className="flex items-start gap-2.5">
        {isArchive ? (
          <Archive
            className="mt-0.5 h-4 w-4 shrink-0 text-danger"
            aria-hidden="true"
          />
        ) : (
          <RotateCcw
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold break-words">
            {isArchive
              ? t('schedule.confirm.archiveTitle')
              : t('schedule.confirm.restoreTitle')}
          </p>
          <p className="text-xs break-words opacity-90">
            {isArchive
              ? t('schedule.confirm.archiveDescription')
              : t('schedule.confirm.restoreDescription')}
          </p>
        </div>
      </div>

      {hasError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger-border bg-surface-card p-2.5 text-xs text-danger-foreground"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-danger"
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold break-words">
              {isArchive
                ? t('schedule.confirm.archiveErrorTitle')
                : t('schedule.confirm.restoreErrorTitle')}
            </p>
            <p className="break-words">
              {isArchive
                ? t('schedule.confirm.archiveErrorDescription')
                : t('schedule.confirm.restoreErrorDescription')}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={isArchive ? 'destructive' : 'default'}
          disabled={isPending}
          onClick={onConfirm}
        >
          {isPending
            ? isArchive
              ? t('schedule.confirm.archivingButton')
              : t('schedule.confirm.restoringButton')
            : isArchive
              ? t('schedule.confirm.archiveConfirmButton')
              : t('schedule.confirm.restoreConfirmButton')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={onCancel}
        >
          {isArchive
            ? t('schedule.confirm.archiveCancelButton')
            : t('schedule.confirm.restoreCancelButton')}
        </Button>
      </div>
    </div>
  );
}
