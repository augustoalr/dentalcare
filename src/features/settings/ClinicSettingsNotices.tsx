import { CheckCircle2, Lock } from 'lucide-react';
import { useI18n } from '@/i18n';
import { ErrorState } from '@/ui/components/states/ErrorState';

export function ReadOnlySettingsBanner() {
  const { t } = useI18n();

  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-bg p-4 text-warning-foreground"
    >
      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold break-words">
          {t('settings.readOnlyTitle')}
        </p>
        <p className="text-sm break-words">
          {t('settings.readOnlyDescription')}
        </p>
      </div>
    </div>
  );
}

export function SettingsSavedBanner() {
  const { t } = useI18n();

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-success-border bg-success-bg p-4 text-success-foreground"
    >
      <CheckCircle2
        className="mt-0.5 h-5 w-5 shrink-0 text-success"
        aria-hidden="true"
      />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold break-words">
          {t('settings.feedback.savedTitle')}
        </p>
        <p className="text-sm break-words">
          {t('settings.feedback.savedDescription')}
        </p>
      </div>
    </div>
  );
}

export interface SettingsSaveErrorBannerProps {
  readonly onRetry?: () => void;
}

export function SettingsSaveErrorBanner({
  onRetry,
}: SettingsSaveErrorBannerProps) {
  const { t } = useI18n();

  return (
    <ErrorState
      title={t('settings.feedback.saveErrorTitle')}
      description={t('settings.feedback.saveErrorDescription')}
      retryLabel={onRetry ? t('states.retry') : undefined}
      onRetry={onRetry}
    />
  );
}
