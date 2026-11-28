import { useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Stethoscope,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  formatAppointmentTimeRange,
  formatScheduleDateLabel,
  type AppointmentRecord,
  type ClinicProvider,
  type DailyAppointmentSummary,
} from '@/domain/appointments';
import {
  hasCriticalMedicalAlerts,
  type PatientRecord,
} from '@/domain/patients';
import {
  AppointmentReminderButton,
  AppointmentReminderNotices,
  ReminderSentBadge,
  type SendReminderOutcome,
} from '@/features/schedule/AppointmentReminderControls';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/ui/components/ui/card';

export interface TodaySummaryPanelProps {
  readonly todayDateKey: string;
  readonly timezone: string;
  readonly summary: DailyAppointmentSummary;
  readonly patientsById: ReadonlyMap<string, PatientRecord>;
  readonly providersById: ReadonlyMap<string, ClinicProvider>;
  readonly onSendReminder?: (
    appointment: AppointmentRecord,
  ) => Promise<SendReminderOutcome>;
  readonly onConfirmManualReminder?: (
    appointment: AppointmentRecord,
  ) => Promise<void>;
}

interface NextAppointmentRowProps {
  readonly appointment: AppointmentRecord;
  readonly patient: PatientRecord | undefined;
  readonly provider: ClinicProvider | undefined;
  readonly timezone: string;
  readonly onSendReminder?: (
    appointment: AppointmentRecord,
  ) => Promise<SendReminderOutcome>;
  readonly onConfirmManualReminder?: (
    appointment: AppointmentRecord,
  ) => Promise<void>;
}

function NextAppointmentRow({
  appointment,
  patient,
  provider,
  timezone,
  onSendReminder,
  onConfirmManualReminder,
}: NextAppointmentRowProps) {
  const { locale, t } = useI18n();
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [blockedReminderUrl, setBlockedReminderUrl] = useState<string | null>(
    null,
  );
  const [hasReminderError, setHasReminderError] = useState(false);

  const missingPhoneHintId = `today-next-missing-phone-${appointment.id}`;

  const handleSendReminder = async () => {
    if (!onSendReminder || isSendingReminder) {
      return;
    }

    setIsSendingReminder(true);
    setHasReminderError(false);
    setBlockedReminderUrl(null);
    try {
      const outcome = await onSendReminder(appointment);
      if (outcome.status === 'popup_blocked') {
        setBlockedReminderUrl(outcome.launchedUrl);
      }
    } catch {
      setHasReminderError(true);
    } finally {
      setIsSendingReminder(false);
    }
  };

  const handleManualReminderOpen = async () => {
    if (!onConfirmManualReminder || isSendingReminder) {
      return;
    }

    setIsSendingReminder(true);
    setHasReminderError(false);
    try {
      await onConfirmManualReminder(appointment);
      setBlockedReminderUrl(null);
    } catch {
      setHasReminderError(true);
    } finally {
      setIsSendingReminder(false);
    }
  };

  return (
    <div className="mt-1.5 space-y-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex flex-wrap items-center gap-2">
          <Badge variant="primary" className="shrink-0">
            {formatAppointmentTimeRange(
              appointment.startsAt,
              appointment.endsAt,
              timezone,
              locale,
            )}
          </Badge>
          <Link
            to={`/patients/${appointment.patientId}`}
            className="min-w-0 text-sm font-semibold text-text-primary underline-offset-2 hover:text-primary hover:underline break-words [overflow-wrap:anywhere]"
          >
            {patient?.fullName ?? t('schedule.card.unknownPatient')}
          </Link>
          {patient && hasCriticalMedicalAlerts(patient.medicalAlerts) ? (
            <Badge variant="medical" className="shrink-0">
              <AlertTriangle
                className="h-3 w-3 shrink-0"
                aria-hidden="true"
              />
              <span>{t('schedule.card.medicalAlertBadge')}</span>
            </Badge>
          ) : null}
          <ReminderSentBadge
            reminderSentAt={appointment.reminderSentAt}
            timezone={timezone}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <p className="text-xs text-text-secondary break-words [overflow-wrap:anywhere]">
            {t('schedule.card.dentistPrefix').replace(
              '{name}',
              provider?.fullName ?? t('schedule.card.unknownDentist'),
            )}
          </p>
          {onSendReminder ? (
            <AppointmentReminderButton
              appointment={appointment}
              patient={patient}
              isSending={isSendingReminder}
              missingPhoneHintId={missingPhoneHintId}
              onSend={() => void handleSendReminder()}
            />
          ) : null}
        </div>
      </div>

      {onSendReminder ? (
        <AppointmentReminderNotices
          appointment={appointment}
          patient={patient}
          missingPhoneHintId={missingPhoneHintId}
          blockedUrl={blockedReminderUrl}
          hasError={hasReminderError}
          onManualOpenClick={() => void handleManualReminderOpen()}
        />
      ) : null}
    </div>
  );
}

export function TodaySummaryPanel({
  todayDateKey,
  timezone,
  summary,
  patientsById,
  providersById,
  onSendReminder,
  onConfirmManualReminder,
}: TodaySummaryPanelProps) {
  const { locale, t } = useI18n();
  const formattedToday = formatScheduleDateLabel(todayDateKey, locale);
  const nextAppointment = summary.nextAppointment;
  const nextPatient = nextAppointment
    ? patientsById.get(nextAppointment.patientId)
    : undefined;
  const nextProvider = nextAppointment
    ? providersById.get(nextAppointment.dentistId)
    : undefined;

  return (
    <Card aria-label={t('schedule.today.title')}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock
                className="h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="break-words">{t('schedule.today.title')}</span>
            </CardTitle>
            <CardDescription className="break-words">
              {t('schedule.today.subtitle').replace('{date}', formattedToday)}
            </CardDescription>
          </div>
          {summary.cancelledOrNoShowCount > 0 ? (
            <Badge variant="default" className="self-start shrink-0">
              {t('schedule.today.cancelledHint').replace(
                '{count}',
                String(summary.cancelledOrNoShowCount),
              )}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface-muted/60 p-3">
            <p className="text-xs font-medium text-text-muted break-words">
              {t('schedule.today.totalLabel')}
            </p>
            <p className="mt-1 text-2xl font-bold text-text-primary">
              {summary.totalToday}
            </p>
          </div>

          <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-primary break-words">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t('schedule.today.confirmedLabel')}</span>
            </p>
            <p className="mt-1 text-2xl font-bold text-text-primary">
              {summary.confirmedCount}
            </p>
          </div>

          <div className="rounded-lg border border-warning-border bg-warning-bg p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground break-words">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t('schedule.today.pendingLabel')}</span>
            </p>
            <p className="mt-1 text-2xl font-bold text-warning-foreground">
              {summary.pendingCount}
            </p>
          </div>

          <div className="rounded-lg border border-success-border bg-success-bg p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-success-foreground break-words">
              <Stethoscope className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t('schedule.today.inProgressCompletedLabel')}</span>
            </p>
            <p className="mt-1 text-2xl font-bold text-success-foreground">
              {summary.inProgressCount + summary.completedCount}
            </p>
            <p className="mt-0.5 text-[11px] text-success-foreground/90 break-words">
              {t('schedule.today.inProgressCompletedHint')
                .replace('{inProgress}', String(summary.inProgressCount))
                .replace('{completed}', String(summary.completedCount))}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-card p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t('schedule.today.nextAppointmentLabel')}
          </p>
          {nextAppointment ? (
            <NextAppointmentRow
              key={nextAppointment.id}
              appointment={nextAppointment}
              patient={nextPatient}
              provider={nextProvider}
              timezone={timezone}
              onSendReminder={onSendReminder}
              onConfirmManualReminder={onConfirmManualReminder}
            />
          ) : (
            <p className="mt-1 text-sm text-text-secondary break-words">
              {t('schedule.today.noNextAppointment')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
