import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Clock,
  FileText,
  Pencil,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  APPOINTMENT_STATUSES,
  canEditClinicalNotes,
  formatAppointmentTimeRange,
  isAppointmentStatus,
  type AppointmentRecord,
  type AppointmentStatus,
  type ClinicProvider,
} from '@/domain/appointments';
import type { UserRole } from '@/domain/auth';
import {
  hasCriticalMedicalAlerts,
  type PatientRecord,
} from '@/domain/patients';
import { AppointmentActionConfirmPanel } from '@/features/schedule/AppointmentActionConfirmPanel';
import { AppointmentClinicalNotesPanel } from '@/features/schedule/AppointmentClinicalNotesPanel';
import {
  getAppointmentStatusBadgeVariant,
  getAppointmentStatusLabelKey,
} from '@/features/schedule/scheduleI18n';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';
import { Select } from '@/ui/components/ui/select';

export interface AppointmentCardProps {
  readonly appointment: AppointmentRecord;
  readonly patient: PatientRecord | undefined;
  readonly provider: ClinicProvider | undefined;
  readonly timezone: string;
  readonly role: UserRole;
  readonly hasOverlap: boolean;
  readonly compact?: boolean;
  readonly onStatusChange: (
    appointmentId: string,
    status: AppointmentStatus,
  ) => Promise<void>;
  readonly onSaveClinicalNotes?: (
    appointmentId: string,
    notes: string | null,
  ) => Promise<void>;
  readonly onEdit: (appointment: AppointmentRecord) => void;
  readonly onArchive: (appointment: AppointmentRecord) => Promise<void>;
}

export function AppointmentCard({
  appointment,
  patient,
  provider,
  timezone,
  role,
  hasOverlap,
  compact = false,
  onStatusChange,
  onSaveClinicalNotes,
  onEdit,
  onArchive,
}: AppointmentCardProps) {
  const { locale, t } = useI18n();
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [hasArchiveError, setHasArchiveError] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [hasStatusError, setHasStatusError] = useState(false);

  const canManageNotes = canEditClinicalNotes(role);
  const patientName = patient?.fullName ?? t('schedule.card.unknownPatient');
  const dentistName = provider?.fullName ?? t('schedule.card.unknownDentist');
  const hasMedicalAlert =
    patient !== undefined && hasCriticalMedicalAlerts(patient.medicalAlerts);
  const timeRange = formatAppointmentTimeRange(
    appointment.startsAt,
    appointment.endsAt,
    timezone,
    locale,
  );

  const handleStatusChange = async (nextRaw: string) => {
    if (!isAppointmentStatus(nextRaw) || nextRaw === appointment.status) {
      return;
    }

    setIsUpdatingStatus(true);
    setHasStatusError(false);
    try {
      await onStatusChange(appointment.id, nextRaw);
    } catch {
      setHasStatusError(true);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleConfirmArchive = async () => {
    if (isArchiving) {
      return;
    }

    setIsArchiving(true);
    setHasArchiveError(false);
    try {
      await onArchive(appointment);
      setIsConfirmingArchive(false);
      setIsArchiving(false);
    } catch {
      setHasArchiveError(true);
      setIsArchiving(false);
    }
  };

  const handleSaveNotes = async (notes: string | null) => {
    if (!onSaveClinicalNotes || !canManageNotes) {
      return;
    }
    await onSaveClinicalNotes(appointment.id, notes);
    setIsNotesOpen(false);
  };

  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface-card p-3.5 shadow-2xs">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary" className="shrink-0">
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{timeRange}</span>
            </Badge>
            <Badge
              variant={getAppointmentStatusBadgeVariant(appointment.status)}
              className="shrink-0"
            >
              {t(getAppointmentStatusLabelKey(appointment.status))}
            </Badge>
            {hasMedicalAlert ? (
              <Badge variant="medical" className="shrink-0">
                <AlertTriangle
                  className="h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
                <span>{t('schedule.card.medicalAlertBadge')}</span>
              </Badge>
            ) : null}
            {hasOverlap ? (
              <Badge variant="warning" className="shrink-0">
                <AlertTriangle
                  className="h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
                <span>{t('schedule.card.overlapBadge')}</span>
              </Badge>
            ) : null}
            {canManageNotes && appointment.clinicalNotes ? (
              <Badge variant="default" className="shrink-0">
                <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{t('schedule.card.clinicalNotesSavedBadge')}</span>
              </Badge>
            ) : null}
          </div>

          <div className="min-w-0">
            <Link
              to={`/patients/${appointment.patientId}`}
              className="text-base font-semibold text-text-primary underline-offset-2 hover:text-primary hover:underline break-words [overflow-wrap:anywhere]"
            >
              {patientName}
            </Link>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-text-secondary break-words [overflow-wrap:anywhere]">
            <UserRound
              className="h-3.5 w-3.5 shrink-0 text-text-muted"
              aria-hidden="true"
            />
            <span>
              {t('schedule.card.dentistPrefix').replace('{name}', dentistName)}
            </span>
          </p>

          {appointment.reason ? (
            <p className="text-sm text-text-secondary break-words [overflow-wrap:anywhere]">
              {appointment.reason}
            </p>
          ) : !compact ? (
            <p className="text-xs text-text-muted break-words">
              {t('schedule.card.noReason')}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:items-end shrink-0">
          <Select
            aria-label={t('schedule.card.statusSelectLabel').replace(
              '{patient}',
              patientName,
            )}
            value={appointment.status}
            disabled={isUpdatingStatus || isArchiving}
            className="h-9 min-w-[10.5rem] text-xs"
            onChange={(e) => void handleStatusChange(e.target.value)}
          >
            {APPOINTMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(getAppointmentStatusLabelKey(status))}
              </option>
            ))}
          </Select>

          <div className="flex flex-wrap items-center gap-1.5">
            {canManageNotes ? (
              <Button
                type="button"
                size="sm"
                variant={isNotesOpen ? 'default' : 'outline'}
                disabled={isArchiving}
                onClick={() => {
                  setIsConfirmingArchive(false);
                  setIsNotesOpen((prev) => !prev);
                }}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('schedule.card.clinicalNotesButton')}</span>
              </Button>
            ) : null}

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isArchiving}
              onClick={() => onEdit(appointment)}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('schedule.card.editButton')}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-danger-border text-danger hover:bg-danger-bg hover:text-danger-foreground"
              disabled={isArchiving}
              onClick={() => {
                setIsNotesOpen(false);
                setHasArchiveError(false);
                setIsConfirmingArchive((prev) => !prev);
              }}
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('schedule.card.archiveButton')}</span>
            </Button>
          </div>
        </div>
      </div>

      {hasOverlap ? (
        <div
          role="note"
          className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-foreground"
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <p className="break-words">{t('schedule.card.overlapWarning')}</p>
        </div>
      ) : null}

      {hasStatusError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger-foreground"
        >
          <AlertCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger"
            aria-hidden="true"
          />
          <p className="break-words">{t('schedule.errors.statusUpdateError')}</p>
        </div>
      ) : null}

      {canManageNotes && isNotesOpen ? (
        <AppointmentClinicalNotesPanel
          key={`${appointment.id}-${appointment.updatedAt}`}
          appointmentId={appointment.id}
          role={role}
          initialNotes={appointment.clinicalNotes}
          onSave={handleSaveNotes}
          onClose={() => setIsNotesOpen(false)}
        />
      ) : null}

      {isConfirmingArchive ? (
        <AppointmentActionConfirmPanel
          mode="archive"
          isPending={isArchiving}
          hasError={hasArchiveError}
          onConfirm={() => void handleConfirmArchive()}
          onCancel={() => {
            setIsConfirmingArchive(false);
            setHasArchiveError(false);
          }}
        />
      ) : null}
    </article>
  );
}
