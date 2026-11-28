import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import type { AppointmentRecord } from '@/domain/appointments';
import type { PatientRecord } from '@/domain/patients';
import {
  formatReminderSentTime,
  getAppointmentReminderEligibility,
} from '@/domain/whatsapp';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';

export type SendReminderOutcome =
  | { readonly status: 'sent' }
  | { readonly status: 'popup_blocked'; readonly launchedUrl: string }
  | { readonly status: 'invalid' };

export interface ReminderSentBadgeProps {
  readonly reminderSentAt: string | null;
  readonly timezone: string;
}

export function ReminderSentBadge({
  reminderSentAt,
  timezone,
}: ReminderSentBadgeProps) {
  const { locale, t } = useI18n();

  if (!reminderSentAt) {
    return null;
  }

  const formattedTime = formatReminderSentTime(
    reminderSentAt,
    timezone,
    locale,
  );
  const label =
    formattedTime.length > 0
      ? t('schedule.reminder.sentBadge').replace('{time}', formattedTime)
      : t('schedule.reminder.sentBadgeNoTime');

  return (
    <Badge variant="success" className="shrink-0">
      <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}

export interface AppointmentReminderButtonProps {
  readonly appointment: AppointmentRecord;
  readonly patient: PatientRecord | undefined;
  readonly isSending: boolean;
  readonly disabled?: boolean;
  readonly missingPhoneHintId: string;
  readonly onSend: () => void;
}

export function AppointmentReminderButton({
  appointment,
  patient,
  isSending,
  disabled = false,
  missingPhoneHintId,
  onSend,
}: AppointmentReminderButtonProps) {
  const { t } = useI18n();
  const eligibility = getAppointmentReminderEligibility(appointment, patient);

  if (!eligibility.eligible && eligibility.reason === 'status_not_eligible') {
    return null;
  }

  if (
    !eligibility.eligible &&
    eligibility.reason === 'missing_or_invalid_phone'
  ) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled
        aria-describedby={missingPhoneHintId}
        title={t('schedule.reminder.missingPhoneHint')}
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('schedule.reminder.sendButton')}</span>
      </Button>
    );
  }

  const buttonLabel = isSending
    ? t('schedule.reminder.sendingButton')
    : appointment.reminderSentAt
      ? t('schedule.reminder.resendButton')
      : t('schedule.reminder.sendButton');

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled || isSending}
      onClick={onSend}
    >
      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{buttonLabel}</span>
    </Button>
  );
}

export interface AppointmentReminderNoticesProps {
  readonly appointment: AppointmentRecord;
  readonly patient: PatientRecord | undefined;
  readonly missingPhoneHintId: string;
  readonly blockedUrl: string | null;
  readonly hasError: boolean;
  readonly onManualOpenClick: () => void;
}

export function AppointmentReminderNotices({
  appointment,
  patient,
  missingPhoneHintId,
  blockedUrl,
  hasError,
  onManualOpenClick,
}: AppointmentReminderNoticesProps) {
  const { t } = useI18n();
  const eligibility = getAppointmentReminderEligibility(appointment, patient);
  const showMissingPhoneHint =
    !eligibility.eligible && eligibility.reason === 'missing_or_invalid_phone';

  if (!showMissingPhoneHint && !blockedUrl && !hasError) {
    return null;
  }

  return (
    <div className="space-y-2">
      {showMissingPhoneHint ? (
        <p
          id={missingPhoneHintId}
          className="text-xs text-text-muted break-words"
        >
          {t('schedule.reminder.missingPhoneHint')}
        </p>
      ) : null}

      {blockedUrl ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-2 rounded-md border border-warning-border bg-warning-bg px-3 py-2.5 text-xs text-warning-foreground sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-0.5">
              <p className="font-semibold break-words">
                {t('schedule.reminder.popupBlockedTitle')}
              </p>
              <p className="break-words">
                {t('schedule.reminder.popupBlockedDescription')}
              </p>
            </div>
          </div>

          <a
            href={blockedUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onManualOpenClick}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 self-start rounded-md border border-warning-border bg-surface-card px-2.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-center"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t('schedule.reminder.openWhatsAppLink')}</span>
          </a>
        </div>
      ) : null}

      {hasError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger-foreground"
        >
          <AlertCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger"
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold break-words">
              {t('schedule.reminder.saveErrorTitle')}
            </p>
            <p className="break-words">
              {t('schedule.reminder.saveErrorDescription')}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
