import type { UserRole } from '@/domain/auth';
import type { SupportedLocale } from '@/domain/locale';

export const APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;

export const APPOINTMENT_REASON_MAX_LENGTH = 300;
export const APPOINTMENT_CLINICAL_NOTES_MAX_LENGTH = 4000;
export const APPOINTMENT_MIN_DURATION_MIN = 5;
export const APPOINTMENT_MAX_DURATION_MIN = 720;
export const APPOINTMENT_DEFAULT_DURATION_MIN = 30;
export const APPOINTMENT_DURATION_PRESETS_MIN = [15, 30, 45, 60, 90] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export type AppointmentStatusFilter = 'all' | AppointmentStatus;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_HHMM_PATTERN = /^(\d{2}):(\d{2})$/;
const MS_PER_MINUTE = 60_000;

export interface ClinicProvider {
  readonly id: string;
  readonly fullName: string;
  readonly role: 'admin' | 'dentist';
}

export interface AppointmentRecord {
  readonly id: string;
  readonly clinicId: string;
  readonly patientId: string;
  readonly dentistId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: AppointmentStatus;
  readonly reason: string | null;
  readonly clinicalNotes: string | null;
  readonly reminderSentAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ArchivedAppointmentRecord extends AppointmentRecord {
  readonly deletedAt: string;
}

export interface AppointmentCreateInput {
  readonly patientId: string;
  readonly dentistId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: AppointmentStatus;
  readonly reason: string | null;
  readonly clinicalNotes?: string | null;
}

export interface AppointmentUpdateInput {
  readonly dentistId?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly status?: AppointmentStatus;
  readonly reason?: string | null;
  readonly clinicalNotes?: string | null;
}

export interface RawAppointmentFormInput {
  readonly patientId: string;
  readonly dentistId: string;
  readonly dateKey: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: string;
  readonly reason?: string | null;
  readonly clinicalNotes?: string | null;
}

export type AppointmentPatientErrorCode = 'patient_required';
export type AppointmentDentistErrorCode = 'dentist_required';
export type AppointmentDateErrorCode = 'date_invalid';
export type AppointmentStartTimeErrorCode = 'start_time_invalid';
export type AppointmentEndTimeErrorCode =
  | 'end_time_invalid'
  | 'end_before_start'
  | 'duration_too_short'
  | 'duration_too_long';
export type AppointmentStatusErrorCode = 'status_invalid';
export type AppointmentReasonErrorCode = 'reason_too_long';
export type AppointmentClinicalNotesErrorCode =
  | 'clinical_notes_too_long'
  | 'clinical_notes_forbidden';

export interface AppointmentFormFieldErrors {
  readonly patientId: AppointmentPatientErrorCode | null;
  readonly dentistId: AppointmentDentistErrorCode | null;
  readonly dateKey: AppointmentDateErrorCode | null;
  readonly startTime: AppointmentStartTimeErrorCode | null;
  readonly endTime: AppointmentEndTimeErrorCode | null;
  readonly status: AppointmentStatusErrorCode | null;
  readonly reason: AppointmentReasonErrorCode | null;
  readonly clinicalNotes: AppointmentClinicalNotesErrorCode | null;
}

export type AppointmentFormValidationResult =
  | {
      readonly valid: true;
      readonly value: AppointmentCreateInput;
      readonly errors: AppointmentFormFieldErrors;
    }
  | {
      readonly valid: false;
      readonly value: null;
      readonly errors: AppointmentFormFieldErrors;
    };

export interface AppointmentOverlapCandidate {
  readonly dentistId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly excludeAppointmentId?: string;
}

export interface AppointmentOverlapMatch {
  readonly appointmentId: string;
  readonly patientId: string;
  readonly dentistId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: AppointmentStatus;
}

export interface DailyAppointmentSummary {
  readonly totalToday: number;
  readonly activeCount: number;
  readonly confirmedCount: number;
  readonly pendingCount: number;
  readonly inProgressCount: number;
  readonly completedCount: number;
  readonly cancelledOrNoShowCount: number;
  readonly nextAppointment: AppointmentRecord | null;
}

interface ParsedDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

interface ParsedTimeParts {
  readonly hour: number;
  readonly minute: number;
}

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return (APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

/**
 * Only dentists and clinic administrators may view or edit clinical visit notes.
 */
export function canEditClinicalNotes(role: UserRole): boolean {
  return role === 'admin' || role === 'dentist';
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function parseDateKey(dateKey: string): ParsedDateParts | null {
  const match = DATE_KEY_PATTERN.exec(dateKey.trim());
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);

  if (month < 1 || month > 12) {
    return null;
  }

  if (day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  return { year, month, day };
}

function parseTimeHHmm(timeHHmm: string): ParsedTimeParts | null {
  const match = TIME_HHMM_PATTERN.exec(timeHHmm.trim());
  if (!match) {
    return null;
  }

  const hour = Number.parseInt(match[1]!, 10);
  const minute = Number.parseInt(match[2]!, 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function formatDatePartsToKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Resolves an IANA timezone string safely, falling back to `'UTC'` when invalid.
 */
export function resolveSafeTimezone(timezone: string): string {
  const trimmed = timezone.trim();
  if (trimmed.length === 0) {
    return 'UTC';
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return trimmed;
  } catch {
    return 'UTC';
  }
}

function getZonedDateTimeParts(
  date: Date,
  safeTimezone: string,
): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of parts) {
    switch (part.type) {
      case 'year':
        year = Number.parseInt(part.value, 10);
        break;
      case 'month':
        month = Number.parseInt(part.value, 10);
        break;
      case 'day':
        day = Number.parseInt(part.value, 10);
        break;
      case 'hour':
        hour = Number.parseInt(part.value, 10) % 24;
        break;
      case 'minute':
        minute = Number.parseInt(part.value, 10);
        break;
      case 'second':
        second = Number.parseInt(part.value, 10);
        break;
      default:
        break;
    }
  }

  return { year, month, day, hour, minute, second };
}

function getTimezoneOffsetMs(utcMs: number, safeTimezone: string): number {
  const parts = getZonedDateTimeParts(new Date(utcMs), safeTimezone);
  const zonedAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0,
  );
  return zonedAsUtcMs - utcMs;
}

/**
 * Returns the `YYYY-MM-DD` calendar date key for `date` in the clinic's IANA timezone.
 */
export function getDateKeyInTimezone(date: Date, timezone: string): string {
  const safeTimezone = resolveSafeTimezone(timezone);
  const parts = getZonedDateTimeParts(date, safeTimezone);
  return formatDatePartsToKey(parts.year, parts.month, parts.day);
}

/**
 * Shifts a `YYYY-MM-DD` date key by `deltaDays` using pure UTC calendar arithmetic
 * (immune to Daylight Saving Time drift).
 */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return dateKey;
  }

  const shifted = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day + deltaDays),
  );
  return formatDatePartsToKey(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/**
 * Returns the 7 immutable `YYYY-MM-DD` keys (Monday through Sunday) containing `anchorDateKey`.
 */
export function getWeekDateKeys(anchorDateKey: string): readonly string[] {
  const parsed = parseDateKey(anchorDateKey);
  if (!parsed) {
    return Object.freeze([]);
  }

  const anchorUtc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  // JS getUTCDay(): Sun=0, Mon=1, ..., Sat=6 -> offset from Monday: Mon=0, ..., Sun=6
  const offsetFromMonday = (anchorUtc.getUTCDay() + 6) % 7;
  const mondayKey = shiftDateKey(anchorDateKey, -offsetFromMonday);

  const keys: string[] = [];
  for (let index = 0; index < 7; index += 1) {
    keys.push(shiftDateKey(mondayKey, index));
  }

  return Object.freeze(keys);
}

/**
 * Converts a clinic-local `(YYYY-MM-DD, HH:mm)` pair in `timezone` into a UTC ISO-8601 string.
 * Performs two-pass offset resolution so Daylight Saving Time boundaries resolve accurately.
 */
export function combineClinicDateAndTimeToUtcIso(
  dateKey: string,
  timeHHmm: string,
  timezone: string,
): string | null {
  const parsedDate = parseDateKey(dateKey);
  const parsedTime = parseTimeHHmm(timeHHmm);
  if (!parsedDate || !parsedTime) {
    return null;
  }

  const safeTimezone = resolveSafeTimezone(timezone);
  const wallClockAsUtcMs = Date.UTC(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    parsedTime.hour,
    parsedTime.minute,
    0,
    0,
  );

  const initialOffsetMs = getTimezoneOffsetMs(wallClockAsUtcMs, safeTimezone);
  const firstCandidateMs = wallClockAsUtcMs - initialOffsetMs;
  const refinedOffsetMs = getTimezoneOffsetMs(firstCandidateMs, safeTimezone);
  const resolvedMs = wallClockAsUtcMs - refinedOffsetMs;

  return new Date(resolvedMs).toISOString();
}

/**
 * Extracts `{ dateKey, timeHHmm }` in the clinic's timezone from an ISO timestamp.
 */
export function extractClinicDateAndTime(
  isoTimestamp: string,
  timezone: string,
): { readonly dateKey: string; readonly timeHHmm: string } | null {
  const parsedMs = Date.parse(isoTimestamp);
  if (Number.isNaN(parsedMs)) {
    return null;
  }

  const safeTimezone = resolveSafeTimezone(timezone);
  const parts = getZonedDateTimeParts(new Date(parsedMs), safeTimezone);
  return Object.freeze({
    dateKey: formatDatePartsToKey(parts.year, parts.month, parts.day),
    timeHHmm: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
  });
}

/**
 * Computes `[startIso, endIso)` UTC bounds spanning `startDateKey` 00:00 through
 * the end of `endDateKeyInclusive` (next day 00:00) in the clinic's timezone.
 */
export function getDateRangeUtcBounds(
  startDateKey: string,
  endDateKeyInclusive: string,
  timezone: string,
): { readonly startIso: string; readonly endIso: string } {
  const safeTimezone = resolveSafeTimezone(timezone);
  const startIso =
    combineClinicDateAndTimeToUtcIso(startDateKey, '00:00', safeTimezone) ??
    new Date(0).toISOString();
  const nextDayKey = shiftDateKey(endDateKeyInclusive, 1);
  const endIso =
    combineClinicDateAndTimeToUtcIso(nextDayKey, '00:00', safeTimezone) ??
    startIso;

  return Object.freeze({ startIso, endIso });
}

/**
 * Computes an `HH:mm` end time by adding `durationMin` to `startTimeHHmm` on the same day.
 * Clamps cleanly at `23:59` if the addition would cross midnight.
 */
export function addMinutesToTimeHHmm(
  startTimeHHmm: string,
  durationMin: number,
): string | null {
  const parsed = parseTimeHHmm(startTimeHHmm);
  if (!parsed || !Number.isFinite(durationMin) || durationMin <= 0) {
    return null;
  }

  const totalMinutes = Math.min(
    parsed.hour * 60 + parsed.minute + Math.round(durationMin),
    23 * 60 + 59,
  );
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Formats an appointment's start–end time window in `clinic.timezone` (24-hour `HH:mm – HH:mm`).
 */
export function formatAppointmentTimeRange(
  startsAtIso: string,
  endsAtIso: string,
  timezone: string,
  locale: SupportedLocale,
): string {
  const startMs = Date.parse(startsAtIso);
  const endMs = Date.parse(endsAtIso);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return '';
  }

  const safeTimezone = resolveSafeTimezone(timezone);
  const localeTag = locale === 'es' ? 'es-ES' : 'en-GB';
  const formatter = new Intl.DateTimeFormat(localeTag, {
    timeZone: safeTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  return `${formatter.format(new Date(startMs))} – ${formatter.format(new Date(endMs))}`;
}

/**
 * Formats a `YYYY-MM-DD` date key into a human-friendly localized label without timezone drift.
 */
export function formatScheduleDateLabel(
  dateKey: string,
  locale: SupportedLocale,
): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return dateKey;
  }

  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';
  const utcDate = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  return new Intl.DateTimeFormat(localeTag, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcDate);
}

/**
 * Formats a compact weekday + day label for weekly schedule columns.
 */
export function formatScheduleColumnHeader(
  dateKey: string,
  locale: SupportedLocale,
): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return dateKey;
  }

  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';
  const utcDate = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  return new Intl.DateTimeFormat(localeTag, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(utcDate);
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Pure validation aligned 1:1 with `public.appointments` CHECK constraints and RLS rules.
 * Returns typed error codes only (zero hardcoded UI strings).
 */
export function validateAppointmentFormInput(
  raw: RawAppointmentFormInput,
  options: { readonly timezone: string; readonly role: UserRole },
): AppointmentFormValidationResult {
  const normalizedPatientId = raw.patientId.trim();
  const normalizedDentistId = raw.dentistId.trim();
  const normalizedDateKey = raw.dateKey.trim();
  const normalizedStartTime = raw.startTime.trim();
  const normalizedEndTime = raw.endTime.trim();
  const normalizedStatus = raw.status.trim();
  const normalizedReason = normalizeOptionalText(raw.reason);
  const normalizedClinicalNotes = normalizeOptionalText(raw.clinicalNotes);

  const patientError: AppointmentPatientErrorCode | null =
    normalizedPatientId.length === 0 ? 'patient_required' : null;
  const dentistError: AppointmentDentistErrorCode | null =
    normalizedDentistId.length === 0 ? 'dentist_required' : null;
  const dateError: AppointmentDateErrorCode | null =
    parseDateKey(normalizedDateKey) === null ? 'date_invalid' : null;
  const startTimeError: AppointmentStartTimeErrorCode | null =
    parseTimeHHmm(normalizedStartTime) === null ? 'start_time_invalid' : null;

  let endTimeError: AppointmentEndTimeErrorCode | null =
    parseTimeHHmm(normalizedEndTime) === null ? 'end_time_invalid' : null;

  let startsAtIso: string | null = null;
  let endsAtIso: string | null = null;

  if (dateError === null && startTimeError === null && endTimeError === null) {
    startsAtIso = combineClinicDateAndTimeToUtcIso(
      normalizedDateKey,
      normalizedStartTime,
      options.timezone,
    );
    endsAtIso = combineClinicDateAndTimeToUtcIso(
      normalizedDateKey,
      normalizedEndTime,
      options.timezone,
    );

    if (startsAtIso === null || endsAtIso === null) {
      endTimeError = 'end_time_invalid';
    } else {
      const durationMs = Date.parse(endsAtIso) - Date.parse(startsAtIso);
      if (durationMs <= 0) {
        endTimeError = 'end_before_start';
      } else if (durationMs < APPOINTMENT_MIN_DURATION_MIN * MS_PER_MINUTE) {
        endTimeError = 'duration_too_short';
      } else if (durationMs > APPOINTMENT_MAX_DURATION_MIN * MS_PER_MINUTE) {
        endTimeError = 'duration_too_long';
      }
    }
  }

  const statusError: AppointmentStatusErrorCode | null = isAppointmentStatus(
    normalizedStatus,
  )
    ? null
    : 'status_invalid';

  const reasonError: AppointmentReasonErrorCode | null =
    normalizedReason !== null &&
    normalizedReason.length > APPOINTMENT_REASON_MAX_LENGTH
      ? 'reason_too_long'
      : null;

  const canEditNotes = canEditClinicalNotes(options.role);
  let clinicalNotesError: AppointmentClinicalNotesErrorCode | null = null;
  if (!canEditNotes) {
    if (normalizedClinicalNotes !== null) {
      clinicalNotesError = 'clinical_notes_forbidden';
    }
  } else if (
    normalizedClinicalNotes !== null &&
    normalizedClinicalNotes.length > APPOINTMENT_CLINICAL_NOTES_MAX_LENGTH
  ) {
    clinicalNotesError = 'clinical_notes_too_long';
  }

  const errors: AppointmentFormFieldErrors = Object.freeze({
    patientId: patientError,
    dentistId: dentistError,
    dateKey: dateError,
    startTime: startTimeError,
    endTime: endTimeError,
    status: statusError,
    reason: reasonError,
    clinicalNotes: clinicalNotesError,
  });

  if (
    patientError !== null ||
    dentistError !== null ||
    dateError !== null ||
    startTimeError !== null ||
    endTimeError !== null ||
    statusError !== null ||
    reasonError !== null ||
    clinicalNotesError !== null ||
    startsAtIso === null ||
    endsAtIso === null ||
    !isAppointmentStatus(normalizedStatus)
  ) {
    return Object.freeze({
      valid: false,
      value: null,
      errors,
    });
  }

  const value: AppointmentCreateInput = canEditNotes
    ? Object.freeze({
        patientId: normalizedPatientId,
        dentistId: normalizedDentistId,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        status: normalizedStatus,
        reason: normalizedReason,
        clinicalNotes: normalizedClinicalNotes,
      })
    : Object.freeze({
        patientId: normalizedPatientId,
        dentistId: normalizedDentistId,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        status: normalizedStatus,
        reason: normalizedReason,
      });

  return Object.freeze({
    valid: true,
    value,
    errors,
  });
}

/**
 * Pure clinical notes text validation for the dedicated visit notes editor.
 */
export function validateClinicalNotesInput(
  rawNotes: string | null | undefined,
  role: UserRole,
):
  | { readonly valid: true; readonly value: string | null; readonly error: null }
  | {
      readonly valid: false;
      readonly value: null;
      readonly error: AppointmentClinicalNotesErrorCode;
    } {
  if (!canEditClinicalNotes(role)) {
    return Object.freeze({
      valid: false,
      value: null,
      error: 'clinical_notes_forbidden',
    });
  }

  const normalized = normalizeOptionalText(rawNotes);
  if (
    normalized !== null &&
    normalized.length > APPOINTMENT_CLINICAL_NOTES_MAX_LENGTH
  ) {
    return Object.freeze({
      valid: false,
      value: null,
      error: 'clinical_notes_too_long',
    });
  }

  return Object.freeze({
    valid: true,
    value: normalized,
    error: null,
  });
}

/**
 * Detects strict time overlaps for the same dentist among active, non-cancelled,
 * non-no-show appointments. Back-to-back appointments (e.g. 10:00–10:30 and
 * 10:30–11:00) do NOT overlap.
 */
export function findOverlappingAppointments(
  candidate: AppointmentOverlapCandidate,
  existingAppointments: readonly AppointmentRecord[],
): readonly AppointmentOverlapMatch[] {
  const candidateStartMs = Date.parse(candidate.startsAt);
  const candidateEndMs = Date.parse(candidate.endsAt);

  if (
    candidate.dentistId.trim().length === 0 ||
    Number.isNaN(candidateStartMs) ||
    Number.isNaN(candidateEndMs) ||
    candidateEndMs <= candidateStartMs
  ) {
    return Object.freeze([]);
  }

  const matches: AppointmentOverlapMatch[] = [];

  for (const existing of existingAppointments) {
    if (
      candidate.excludeAppointmentId &&
      existing.id === candidate.excludeAppointmentId
    ) {
      continue;
    }

    if (existing.dentistId !== candidate.dentistId) {
      continue;
    }

    if (existing.status === 'cancelled' || existing.status === 'no_show') {
      continue;
    }

    const existingStartMs = Date.parse(existing.startsAt);
    const existingEndMs = Date.parse(existing.endsAt);
    if (Number.isNaN(existingStartMs) || Number.isNaN(existingEndMs)) {
      continue;
    }

    if (candidateStartMs < existingEndMs && existingStartMs < candidateEndMs) {
      matches.push(
        Object.freeze({
          appointmentId: existing.id,
          patientId: existing.patientId,
          dentistId: existing.dentistId,
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
          status: existing.status,
        }),
      );
    }
  }

  matches.sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  return Object.freeze(matches);
}

/**
 * Pure KPI summary for the "Today in the clinic" panel.
 */
export function summarizeDailyAppointments(
  appointments: readonly AppointmentRecord[],
  nowIso: string,
): DailyAppointmentSummary {
  let confirmedCount = 0;
  let pendingCount = 0;
  let inProgressCount = 0;
  let completedCount = 0;
  let cancelledOrNoShowCount = 0;

  const nowMs = Date.parse(nowIso);
  const upcomingCandidates: AppointmentRecord[] = [];

  for (const appointment of appointments) {
    switch (appointment.status) {
      case 'confirmed':
        confirmedCount += 1;
        break;
      case 'scheduled':
        pendingCount += 1;
        break;
      case 'in_progress':
        inProgressCount += 1;
        break;
      case 'completed':
        completedCount += 1;
        break;
      case 'cancelled':
      case 'no_show':
        cancelledOrNoShowCount += 1;
        break;
    }

    if (
      (appointment.status === 'scheduled' ||
        appointment.status === 'confirmed') &&
      !Number.isNaN(nowMs) &&
      Date.parse(appointment.endsAt) > nowMs
    ) {
      upcomingCandidates.push(appointment);
    }
  }

  upcomingCandidates.sort((left, right) => {
    const startDiff = Date.parse(left.startsAt) - Date.parse(right.startsAt);
    if (startDiff !== 0) {
      return startDiff;
    }
    return left.id.localeCompare(right.id);
  });

  const activeCount = appointments.length - cancelledOrNoShowCount;

  return Object.freeze({
    totalToday: activeCount,
    activeCount,
    confirmedCount,
    pendingCount,
    inProgressCount,
    completedCount,
    cancelledOrNoShowCount,
    nextAppointment: upcomingCandidates[0] ?? null,
  });
}
