import { useState } from 'react';
import { Calendar, Clock, RotateCcw, UserRound } from 'lucide-react';
import {
  extractClinicDateAndTime,
  formatAppointmentTimeRange,
  formatScheduleDateLabel,
  type ArchivedAppointmentRecord,
  type ClinicProvider,
} from '@/domain/appointments';
import type { PatientRecord } from '@/domain/patients';
import { AppointmentActionConfirmPanel } from '@/features/schedule/AppointmentActionConfirmPanel';
import {
  getAppointmentStatusBadgeVariant,
  getAppointmentStatusLabelKey,
} from '@/features/schedule/scheduleI18n';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';

export interface ArchivedAppointmentCardProps {
  readonly appointment: ArchivedAppointmentRecord;
  readonly patient: PatientRecord | undefined;
  readonly provider: ClinicProvider | undefined;
  readonly timezone: string;
  readonly onRestore: (appointment: ArchivedAppointmentRecord) => Promise<void>;
}

export function ArchivedAppointmentCard({
  appointment,
  patient,
  provider,
  timezone,
  onRestore,
}: ArchivedAppointmentCardProps) {
  const { locale, t } = useI18n();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [hasError, setHasError] = useState(false);

  const dateInfo = extractClinicDateAndTime(appointment.startsAt, timezone);
  const archivedDateInfo = extractClinicDateAndTime(
    appointment.deletedAt,
    timezone,
  );
  const formattedDate = dateInfo
    ? formatScheduleDateLabel(dateInfo.dateKey, locale)
    : appointment.startsAt;
  const formattedArchivedDate = archivedDateInfo
    ? formatScheduleDateLabel(archivedDateInfo.dateKey, locale)
    : appointment.deletedAt;
  const timeRange = formatAppointmentTimeRange(
    appointment.startsAt,
    appointment.endsAt,
    timezone,
    locale,
  );

  const handleConfirmRestore = async () => {
    if (isRestoring) {
      return;
    }

    setIsRestoring(true);
    setHasError(false);
    try {
      await onRestore(appointment);
      setIsConfirming(false);
      setIsRestoring(false);
    } catch {
      setHasError(true);
      setIsRestoring(false);
    }
  };

  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="shrink-0">
              {t('schedule.archived.badge')}
            </Badge>
            <Badge
              variant={getAppointmentStatusBadgeVariant(appointment.status)}
              className="shrink-0"
            >
              {t(getAppointmentStatusLabelKey(appointment.status))}
            </Badge>
            <Badge variant="primary" className="shrink-0">
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{timeRange}</span>
            </Badge>
          </div>

          <p className="text-base font-semibold text-text-primary break-words [overflow-wrap:anywhere]">
            {patient?.fullName ?? t('schedule.card.unknownPatient')}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <Calendar
                className="h-3.5 w-3.5 shrink-0 text-text-muted"
                aria-hidden="true"
              />
              <span>{formattedDate}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 break-words [overflow-wrap:anywhere]">
              <UserRound
                className="h-3.5 w-3.5 shrink-0 text-text-muted"
                aria-hidden="true"
              />
              <span>
                {t('schedule.card.dentistPrefix').replace(
                  '{name}',
                  provider?.fullName ?? t('schedule.card.unknownDentist'),
                )}
              </span>
            </span>
          </div>

          {appointment.reason ? (
            <p className="text-sm text-text-secondary break-words [overflow-wrap:anywhere]">
              {appointment.reason}
            </p>
          ) : null}

          <p className="text-xs text-text-muted">
            {t('schedule.archived.archivedOn').replace(
              '{date}',
              formattedArchivedDate,
            )}
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start shrink-0"
          disabled={isRestoring}
          onClick={() => {
            setHasError(false);
            setIsConfirming((prev) => !prev);
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('schedule.archived.restoreButton')}</span>
        </Button>
      </div>

      {isConfirming ? (
        <AppointmentActionConfirmPanel
          mode="restore"
          isPending={isRestoring}
          hasError={hasError}
          onConfirm={() => void handleConfirmRestore()}
          onCancel={() => {
            setIsConfirming(false);
            setHasError(false);
          }}
        />
      ) : null}
    </article>
  );
}
