import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Clock, FileText, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  canEditClinicalNotes,
  extractClinicDateAndTime,
  formatAppointmentTimeRange,
  formatScheduleDateLabel,
  resolveSafeTimezone,
  type AppointmentRecord,
  type ClinicProvider,
} from '@/domain/appointments';
import { useAuth } from '@/features/auth/AuthContext';
import { useAppointmentRepository } from '@/features/schedule/AppointmentRepositoryContext';
import {
  getAppointmentStatusBadgeVariant,
  getAppointmentStatusLabelKey,
} from '@/features/schedule/scheduleI18n';
import { useI18n } from '@/i18n';
import type { IAppointmentRepository } from '@/services/repositories/appointmentRepository';
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

export interface PatientAppointmentsSectionProps {
  readonly clinicId: string;
  readonly patientId: string;
  readonly appointmentRepository?: IAppointmentRepository | null;
}

export function PatientAppointmentsSection({
  clinicId,
  patientId,
  appointmentRepository,
}: PatientAppointmentsSectionProps) {
  const { clinic, profile } = useAuth();
  const { locale, t } = useI18n();
  const repository = useAppointmentRepository(appointmentRepository);

  const [appointments, setAppointments] = useState<
    readonly AppointmentRecord[]
  >([]);
  const [providers, setProviders] = useState<readonly ClinicProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const requestIdRef = useRef(0);
  const includeClinicalNotes = profile
    ? canEditClinicalNotes(profile.role)
    : false;
  const safeTimezone = resolveSafeTimezone(clinic?.timezone ?? 'UTC');

  const loadPatientAppointments = useCallback(async () => {
    if (!repository || !profile) {
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setHasError(false);

    try {
      const [loadedAppointments, loadedProviders] = await Promise.all([
        repository.listAppointmentsByPatient(clinicId, patientId, {
          includeClinicalNotes,
        }),
        repository.listClinicProviders(clinicId),
      ]);

      if (requestId === requestIdRef.current) {
        setAppointments(loadedAppointments);
        setProviders(loadedProviders);
        setIsLoading(false);
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setHasError(true);
        setIsLoading(false);
      }
    }
  }, [clinicId, includeClinicalNotes, patientId, profile, repository]);

  useEffect(() => {
    void loadPatientAppointments();
  }, [loadPatientAppointments]);

  const providersById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );

  // Degrade silently when appointment repository is absent (e.g. isolated patient tests)
  if (!repository || !profile) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Calendar
              className="h-4 w-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="break-words">
              {t('schedule.patientSection.title')}
            </span>
          </CardTitle>
          <CardDescription className="break-words">
            {t('schedule.patientSection.description')}
          </CardDescription>
        </div>

        <Link
          to="/schedule"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-card px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring self-start shrink-0"
        >
          <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{t('schedule.patientSection.openScheduleLink')}</span>
        </Link>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <LoadingState
            title={t('schedule.patientSection.loadingTitle')}
            description={t('schedule.patientSection.loadingDescription')}
          />
        ) : hasError ? (
          <ErrorState
            title={t('schedule.patientSection.errorTitle')}
            description={t('schedule.patientSection.errorDescription')}
            retryLabel={t('states.retry')}
            onRetry={() => void loadPatientAppointments()}
          />
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-5 w-5" aria-hidden="true" />}
            title={t('schedule.patientSection.emptyTitle')}
            description={t('schedule.patientSection.emptyDescription')}
          />
        ) : (
          <div className="space-y-3">
            {appointments.map((appointment) => {
              const extracted = extractClinicDateAndTime(
                appointment.startsAt,
                safeTimezone,
              );
              const dateLabel = extracted
                ? formatScheduleDateLabel(extracted.dateKey, locale)
                : appointment.startsAt;
              const timeRange = formatAppointmentTimeRange(
                appointment.startsAt,
                appointment.endsAt,
                safeTimezone,
                locale,
              );
              const provider = providersById.get(appointment.dentistId);

              return (
                <div
                  key={appointment.id}
                  className="space-y-2 rounded-lg border border-border bg-surface-muted/40 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default" className="shrink-0">
                      <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>{dateLabel}</span>
                    </Badge>
                    <Badge variant="primary" className="shrink-0">
                      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>{timeRange}</span>
                    </Badge>
                    <Badge
                      variant={getAppointmentStatusBadgeVariant(
                        appointment.status,
                      )}
                      className="shrink-0"
                    >
                      {t(getAppointmentStatusLabelKey(appointment.status))}
                    </Badge>
                  </div>

                  <p className="flex items-center gap-1.5 text-xs text-text-secondary break-words [overflow-wrap:anywhere]">
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
                  </p>

                  {appointment.reason ? (
                    <p className="text-sm text-text-primary break-words [overflow-wrap:anywhere]">
                      {appointment.reason}
                    </p>
                  ) : null}

                  {includeClinicalNotes && appointment.clinicalNotes ? (
                    <div className="rounded-md border border-border bg-surface-card p-2.5 text-xs space-y-1">
                      <p className="flex items-center gap-1.5 font-semibold text-text-secondary">
                        <FileText
                          className="h-3.5 w-3.5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span>
                          {t('schedule.patientSection.clinicalNotesLabel')}
                        </span>
                      </p>
                      <p className="whitespace-pre-line text-text-primary break-words [overflow-wrap:anywhere]">
                        {appointment.clinicalNotes}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
