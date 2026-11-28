import { useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  addMinutesToTimeHHmm,
  APPOINTMENT_CLINICAL_NOTES_MAX_LENGTH,
  APPOINTMENT_DEFAULT_DURATION_MIN,
  APPOINTMENT_DURATION_PRESETS_MIN,
  APPOINTMENT_REASON_MAX_LENGTH,
  APPOINTMENT_STATUSES,
  canEditClinicalNotes,
  combineClinicDateAndTimeToUtcIso,
  extractClinicDateAndTime,
  findOverlappingAppointments,
  formatAppointmentTimeRange,
  validateAppointmentFormInput,
  type AppointmentCreateInput,
  type AppointmentFormFieldErrors,
  type AppointmentRecord,
  type ClinicProvider,
} from '@/domain/appointments';
import type { UserRole } from '@/domain/auth';
import type { PatientRecord } from '@/domain/patients';
import { getAppointmentStatusLabelKey } from '@/features/schedule/scheduleI18n';
import { useI18n } from '@/i18n';
import { Button } from '@/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/ui/components/ui/card';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';
import { Select } from '@/ui/components/ui/select';
import { Textarea } from '@/ui/components/ui/textarea';

export interface AppointmentFormProps {
  readonly mode: 'create' | 'edit';
  readonly timezone: string;
  readonly role: UserRole;
  readonly defaultDateKey: string;
  readonly patients: readonly PatientRecord[];
  readonly providers: readonly ClinicProvider[];
  readonly existingAppointments: readonly AppointmentRecord[];
  readonly initialAppointment?: AppointmentRecord;
  readonly onDateKeyChange?: (dateKey: string) => void;
  readonly onSubmit: (input: AppointmentCreateInput) => Promise<void>;
  readonly onCancel: () => void;
}

const EMPTY_FIELD_ERRORS: AppointmentFormFieldErrors = Object.freeze({
  patientId: null,
  dentistId: null,
  dateKey: null,
  startTime: null,
  endTime: null,
  status: null,
  reason: null,
  clinicalNotes: null,
});

export function AppointmentForm({
  mode,
  timezone,
  role,
  defaultDateKey,
  patients,
  providers,
  existingAppointments,
  initialAppointment,
  onDateKeyChange,
  onSubmit,
  onCancel,
}: AppointmentFormProps) {
  const { locale, t } = useI18n();
  const canManageNotes = canEditClinicalNotes(role);

  const initialStart = initialAppointment
    ? extractClinicDateAndTime(initialAppointment.startsAt, timezone)
    : null;
  const initialEnd = initialAppointment
    ? extractClinicDateAndTime(initialAppointment.endsAt, timezone)
    : null;

  const sortedPatients = useMemo(
    () =>
      [...patients].sort((a, b) =>
        a.fullName.localeCompare(b.fullName, undefined, {
          sensitivity: 'base',
        }),
      ),
    [patients],
  );

  const patientsById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const [patientId, setPatientId] = useState(
    initialAppointment?.patientId ?? sortedPatients[0]?.id ?? '',
  );
  const [dentistId, setDentistId] = useState(
    initialAppointment?.dentistId ?? providers[0]?.id ?? '',
  );
  const [dateKey, setDateKey] = useState(
    initialStart?.dateKey ?? defaultDateKey,
  );
  const [startTime, setStartTime] = useState(initialStart?.timeHHmm ?? '09:00');
  const [endTime, setEndTime] = useState(
    initialEnd?.timeHHmm ??
      addMinutesToTimeHHmm('09:00', APPOINTMENT_DEFAULT_DURATION_MIN) ??
      '09:30',
  );
  const [status, setStatus] = useState<string>(
    initialAppointment?.status ?? 'scheduled',
  );
  const [reason, setReason] = useState(initialAppointment?.reason ?? '');
  const [clinicalNotes, setClinicalNotes] = useState(
    canManageNotes ? (initialAppointment?.clinicalNotes ?? '') : '',
  );
  const [overlapConfirmed, setOverlapConfirmed] = useState(false);
  const [overlapConfirmError, setOverlapConfirmError] = useState(false);
  const [fieldErrors, setFieldErrors] =
    useState<AppointmentFormFieldErrors>(EMPTY_FIELD_ERRORS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);

  const overlappingMatches = useMemo(() => {
    if (!dentistId || !dateKey || !startTime || !endTime) {
      return [];
    }

    const startsAtIso = combineClinicDateAndTimeToUtcIso(
      dateKey,
      startTime,
      timezone,
    );
    const endsAtIso = combineClinicDateAndTimeToUtcIso(
      dateKey,
      endTime,
      timezone,
    );
    if (!startsAtIso || !endsAtIso) {
      return [];
    }

    return findOverlappingAppointments(
      {
        dentistId,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        excludeAppointmentId: initialAppointment?.id,
      },
      existingAppointments,
    );
  }, [
    dateKey,
    dentistId,
    endTime,
    existingAppointments,
    initialAppointment?.id,
    startTime,
    timezone,
  ]);

  const hasOverlap = overlappingMatches.length > 0;

  const getEndTimeErrorText = () => {
    switch (fieldErrors.endTime) {
      case 'end_time_invalid':
        return t('schedule.validation.endTimeInvalid');
      case 'end_before_start':
        return t('schedule.validation.endBeforeStart');
      case 'duration_too_short':
        return t('schedule.validation.durationTooShort');
      case 'duration_too_long':
        return t('schedule.validation.durationTooLong');
      default:
        return null;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const validation = validateAppointmentFormInput(
      {
        patientId,
        dentistId,
        dateKey,
        startTime,
        endTime,
        status,
        reason,
        clinicalNotes: canManageNotes ? clinicalNotes : undefined,
      },
      { timezone, role },
    );

    setFieldErrors(validation.errors);

    if (!validation.valid) {
      return;
    }

    if (hasOverlap && !overlapConfirmed) {
      setOverlapConfirmError(true);
      return;
    }

    setOverlapConfirmError(false);
    setHasSaveError(false);
    setIsSubmitting(true);

    try {
      await onSubmit(validation.value);
      setIsSubmitting(false);
    } catch {
      setHasSaveError(true);
      setIsSubmitting(false);
    }
  };

  const endTimeErrorText = getEndTimeErrorText();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode === 'create'
            ? t('schedule.form.createCardTitle')
            : t('schedule.form.editCardTitle')}
        </CardTitle>
        <CardDescription>
          {mode === 'create'
            ? t('schedule.form.createCardDescription')
            : t('schedule.form.editCardDescription')}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="appointment-patient-select">
                {t('schedule.form.patientLabel')}
              </Label>
              {sortedPatients.length === 0 && mode === 'create' ? (
                <div className="rounded-md border border-warning-border bg-warning-bg p-3 text-xs text-warning-foreground space-y-1.5">
                  <p>{t('schedule.form.noPatientsHint')}</p>
                  <Link
                    to="/patients"
                    className="inline-flex font-semibold text-primary underline underline-offset-2"
                  >
                    {t('schedule.form.goToPatientsLink')}
                  </Link>
                </div>
              ) : (
                <Select
                  id="appointment-patient-select"
                  value={patientId}
                  disabled={mode === 'edit' || isSubmitting}
                  aria-invalid={fieldErrors.patientId !== null}
                  onChange={(e) => setPatientId(e.target.value)}
                >
                  <option value="">{t('schedule.form.patientPlaceholder')}</option>
                  {sortedPatients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.fullName}
                    </option>
                  ))}
                </Select>
              )}
              {fieldErrors.patientId ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {t('schedule.validation.patientRequired')}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appointment-dentist-select">
                {t('schedule.form.dentistLabel')}
              </Label>
              {providers.length === 0 ? (
                <p className="rounded-md border border-warning-border bg-warning-bg p-3 text-xs text-warning-foreground">
                  {t('schedule.form.noDentistsHint')}
                </p>
              ) : (
                <Select
                  id="appointment-dentist-select"
                  value={dentistId}
                  disabled={isSubmitting}
                  aria-invalid={fieldErrors.dentistId !== null}
                  onChange={(e) => {
                    setDentistId(e.target.value);
                    setOverlapConfirmed(false);
                    setOverlapConfirmError(false);
                  }}
                >
                  <option value="">{t('schedule.form.dentistPlaceholder')}</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.fullName}
                    </option>
                  ))}
                </Select>
              )}
              {fieldErrors.dentistId ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {t('schedule.validation.dentistRequired')}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="appointment-date-input">
                {t('schedule.form.dateLabel')}
              </Label>
              <Input
                id="appointment-date-input"
                type="date"
                value={dateKey}
                disabled={isSubmitting}
                aria-invalid={fieldErrors.dateKey !== null}
                onChange={(e) => {
                  const nextDateKey = e.target.value;
                  setDateKey(nextDateKey);
                  setOverlapConfirmed(false);
                  setOverlapConfirmError(false);
                  onDateKeyChange?.(nextDateKey);
                }}
              />
              {fieldErrors.dateKey ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {t('schedule.validation.dateInvalid')}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appointment-start-time">
                {t('schedule.form.startTimeLabel')}
              </Label>
              <Input
                id="appointment-start-time"
                type="time"
                value={startTime}
                disabled={isSubmitting}
                aria-invalid={fieldErrors.startTime !== null}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setOverlapConfirmed(false);
                  setOverlapConfirmError(false);
                }}
              />
              {fieldErrors.startTime ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {t('schedule.validation.startTimeInvalid')}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appointment-end-time">
                {t('schedule.form.endTimeLabel')}
              </Label>
              <Input
                id="appointment-end-time"
                type="time"
                value={endTime}
                disabled={isSubmitting}
                aria-invalid={fieldErrors.endTime !== null}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setOverlapConfirmed(false);
                  setOverlapConfirmError(false);
                }}
              />
              {endTimeErrorText ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {endTimeErrorText}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-text-secondary">
              {t('schedule.form.durationPresetsLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              {APPOINTMENT_DURATION_PRESETS_MIN.map((presetMin) => (
                <Button
                  key={presetMin}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => {
                    const computed = addMinutesToTimeHHmm(startTime, presetMin);
                    if (computed) {
                      setEndTime(computed);
                      setOverlapConfirmed(false);
                      setOverlapConfirmError(false);
                    }
                  }}
                >
                  {t('schedule.form.durationPresetOption').replace(
                    '{minutes}',
                    String(presetMin),
                  )}
                </Button>
              ))}
            </div>
          </div>

          {hasOverlap ? (
            <div
              role="alert"
              className="space-y-2.5 rounded-lg border border-warning-border bg-warning-bg p-3.5 text-warning-foreground"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold break-words">
                    {t('schedule.form.overlapAlertTitle')}
                  </p>
                  <p className="text-xs break-words">
                    {t('schedule.form.overlapAlertDescription')}
                  </p>
                  <ul className="list-disc pl-4 text-xs space-y-0.5">
                    {overlappingMatches.map((match) => {
                      const conflictPatient =
                        patientsById.get(match.patientId)?.fullName ??
                        t('schedule.card.unknownPatient');
                      const conflictTime = formatAppointmentTimeRange(
                        match.startsAt,
                        match.endsAt,
                        timezone,
                        locale,
                      );
                      return (
                        <li
                          key={match.appointmentId}
                          className="break-words [overflow-wrap:anywhere]"
                        >
                          {t('schedule.form.overlapItemFormat')
                            .replace('{time}', conflictTime)
                            .replace('{patient}', conflictPatient)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              <label
                htmlFor="appointment-overlap-confirm"
                className="flex items-start gap-2 pt-1 text-xs font-medium cursor-pointer"
              >
                <input
                  id="appointment-overlap-confirm"
                  type="checkbox"
                  checked={overlapConfirmed}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setOverlapConfirmed(e.target.checked);
                    if (e.target.checked) {
                      setOverlapConfirmError(false);
                    }
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-warning-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span className="break-words">
                  {t('schedule.form.overlapAcknowledgeLabel')}
                </span>
              </label>

              {overlapConfirmError ? (
                <p className="text-xs font-semibold text-danger break-words">
                  {t('schedule.validation.overlapConfirmationRequired')}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="appointment-status-select">
                {t('schedule.form.statusLabel')}
              </Label>
              <Select
                id="appointment-status-select"
                value={status}
                disabled={isSubmitting}
                aria-invalid={fieldErrors.status !== null}
                onChange={(e) => setStatus(e.target.value)}
              >
                {APPOINTMENT_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {t(getAppointmentStatusLabelKey(item))}
                  </option>
                ))}
              </Select>
              {fieldErrors.status ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {t('schedule.validation.statusInvalid')}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appointment-reason-input">
                {t('schedule.form.reasonLabel')}
              </Label>
              <Input
                id="appointment-reason-input"
                type="text"
                maxLength={APPOINTMENT_REASON_MAX_LENGTH}
                value={reason}
                placeholder={t('schedule.form.reasonPlaceholder')}
                disabled={isSubmitting}
                aria-invalid={fieldErrors.reason !== null}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="text-xs text-text-muted break-words">
                {t('schedule.form.reasonHint')}
              </p>
              {fieldErrors.reason ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {t('schedule.validation.reasonTooLong')}
                </p>
              ) : null}
            </div>
          </div>

          {canManageNotes ? (
            <div className="space-y-1.5">
              <Label htmlFor="appointment-clinical-notes-input">
                {t('schedule.form.clinicalNotesLabel')}
              </Label>
              <Textarea
                id="appointment-clinical-notes-input"
                rows={3}
                maxLength={APPOINTMENT_CLINICAL_NOTES_MAX_LENGTH}
                value={clinicalNotes}
                placeholder={t('schedule.form.clinicalNotesPlaceholder')}
                disabled={isSubmitting}
                aria-invalid={fieldErrors.clinicalNotes !== null}
                onChange={(e) => setClinicalNotes(e.target.value)}
              />
              <p className="text-xs text-text-muted break-words">
                {t('schedule.form.clinicalNotesHint')}
              </p>
              {fieldErrors.clinicalNotes ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {fieldErrors.clinicalNotes === 'clinical_notes_too_long'
                    ? t('schedule.validation.clinicalNotesTooLong')
                    : t('schedule.validation.clinicalNotesForbidden')}
                </p>
              ) : null}
            </div>
          ) : null}

          {hasSaveError ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-danger-border bg-danger-bg p-3 text-xs text-danger-foreground"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-danger"
                aria-hidden="true"
              />
              <div className="min-w-0 space-y-0.5">
                <p className="font-semibold break-words">
                  {t('schedule.form.saveErrorTitle')}
                </p>
                <p className="break-words">
                  {t('schedule.form.saveErrorDescription')}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                (mode === 'create' && sortedPatients.length === 0) ||
                providers.length === 0
              }
            >
              {isSubmitting
                ? t('schedule.form.savingButton')
                : mode === 'create'
                  ? t('schedule.form.createSubmitButton')
                  : t('schedule.form.editSubmitButton')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onCancel}
            >
              {t('schedule.form.cancelButton')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
