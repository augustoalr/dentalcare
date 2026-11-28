import {
  extractClinicDateAndTime,
  formatScheduleDateLabel,
  resolveSafeTimezone,
  type AppointmentRecord,
} from '@/domain/appointments';
import type { SupportedLocale } from '@/domain/locale';
import type { PatientRecord } from '@/domain/patients';

const E164_DIGITS_PATTERN = /^[1-9][0-9]{6,14}$/;
const FIRST_NAME_MAX_LENGTH = 40;

/**
 * Strictly allow-listed DTO for WhatsApp appointment reminders.
 * By design, NEVER holds medical alerts, visit reason, clinical notes,
 * general notes, date of birth, email, or full surname.
 */
export interface WhatsAppReminderPayload {
  readonly recipientPhoneE164Digits: string;
  readonly patientFirstName: string;
  readonly clinicName: string;
  readonly appointmentDateLabel: string;
  readonly appointmentTimeLabel: string;
  readonly locale: SupportedLocale;
}

/**
 * Narrow input accepted by `buildSafeAppointmentReminderPayload`.
 * Structurally prevents callers from passing clinical fields or sensitive PII.
 */
export interface BuildSafeAppointmentReminderInput {
  readonly patientFullName: string;
  readonly patientPhone: string | null | undefined;
  readonly clinicName: string;
  readonly startsAtIso: string;
  readonly timezone: string;
  readonly locale: SupportedLocale;
}

export type AppointmentReminderIneligibleReason =
  | 'status_not_eligible'
  | 'missing_or_invalid_phone';

export type AppointmentReminderEligibility =
  | {
      readonly eligible: true;
      readonly normalizedPhoneDigits: string;
    }
  | {
      readonly eligible: false;
      readonly reason: AppointmentReminderIneligibleReason;
    };

/**
 * Normalizes an international phone number to strict E.164 digits (7 to 15 digits,
 * no leading zero after stripping a single leading `+` or `00`).
 * Strips spaces, hyphens, parentheses, and dots. Returns `null` for any invalid input.
 */
export function normalizePhoneForWhatsApp(
  rawPhone: string | null | undefined,
): string | null {
  if (typeof rawPhone !== 'string') {
    return null;
  }

  const trimmed = rawPhone.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let cleaned = trimmed.replace(/[\s\-().]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  }

  if (!E164_DIGITS_PATTERN.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Extracts only the patient's first name token (never surnames or extra details),
 * bounded to 40 characters.
 */
export function extractPatientFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (trimmed.length === 0) {
    return '';
  }

  const firstToken = trimmed.split(/\s+/)[0] ?? '';
  return firstToken.slice(0, FIRST_NAME_MAX_LENGTH);
}

/**
 * Constructs an immutable, strictly allow-listed `WhatsAppReminderPayload`.
 * Returns `null` when phone, patient first name, clinic name, or appointment
 * timestamp are missing or invalid.
 */
export function buildSafeAppointmentReminderPayload(
  input: BuildSafeAppointmentReminderInput,
): WhatsAppReminderPayload | null {
  const recipientPhoneE164Digits = normalizePhoneForWhatsApp(
    input.patientPhone,
  );
  if (recipientPhoneE164Digits === null) {
    return null;
  }

  const patientFirstName = extractPatientFirstName(input.patientFullName);
  if (patientFirstName.length === 0) {
    return null;
  }

  const clinicName = input.clinicName.trim();
  if (clinicName.length === 0) {
    return null;
  }

  const parsedMs = Date.parse(input.startsAtIso);
  if (Number.isNaN(parsedMs)) {
    return null;
  }

  const safeTimezone = resolveSafeTimezone(input.timezone);
  const extracted = extractClinicDateAndTime(input.startsAtIso, safeTimezone);
  if (extracted === null) {
    return null;
  }

  const appointmentDateLabel = formatScheduleDateLabel(
    extracted.dateKey,
    input.locale,
  );
  const localeTag = input.locale === 'es' ? 'es-ES' : 'en-GB';
  const appointmentTimeLabel = new Intl.DateTimeFormat(localeTag, {
    timeZone: safeTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(parsedMs));

  return Object.freeze({
    recipientPhoneE164Digits,
    patientFirstName,
    clinicName,
    appointmentDateLabel,
    appointmentTimeLabel,
    locale: input.locale,
  });
}

/**
 * Formats the localized WhatsApp reminder text using ONLY the four allow-listed
 * non-clinical fields: first name, clinic name, appointment date, and time.
 */
export function formatAppointmentReminderMessage(
  payload: WhatsAppReminderPayload,
): string {
  if (payload.locale === 'es') {
    return `Hola ${payload.patientFirstName}, te recordamos tu cita en ${payload.clinicName} el ${payload.appointmentDateLabel} a las ${payload.appointmentTimeLabel}. Por favor responde para confirmar.`;
  }

  return `Hello ${payload.patientFirstName}, this is a reminder for your appointment at ${payload.clinicName} on ${payload.appointmentDateLabel} at ${payload.appointmentTimeLabel}. Please reply to confirm.`;
}

/**
 * Builds a validated `https://wa.me/<digits>?text=<encoded>` link strictly from
 * an allow-listed `WhatsAppReminderPayload`.
 */
export function buildWaMeReminderUrl(payload: WhatsAppReminderPayload): string {
  if (!E164_DIGITS_PATTERN.test(payload.recipientPhoneE164Digits)) {
    throw new Error(
      'Invalid recipient E.164 phone digits for WhatsApp reminder URL',
    );
  }

  const message = formatAppointmentReminderMessage(payload);
  return `https://wa.me/${payload.recipientPhoneE164Digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Checks whether an appointment can receive a WhatsApp reminder:
 * - Appointment status must be `'scheduled'` or `'confirmed'`.
 * - Patient must have a valid E.164 phone number.
 */
export function getAppointmentReminderEligibility(
  appointment: Pick<AppointmentRecord, 'status'>,
  patient: Pick<PatientRecord, 'phone'> | null | undefined,
): AppointmentReminderEligibility {
  if (
    appointment.status !== 'scheduled' &&
    appointment.status !== 'confirmed'
  ) {
    return Object.freeze({
      eligible: false,
      reason: 'status_not_eligible',
    });
  }

  const normalizedPhoneDigits = normalizePhoneForWhatsApp(patient?.phone);
  if (normalizedPhoneDigits === null) {
    return Object.freeze({
      eligible: false,
      reason: 'missing_or_invalid_phone',
    });
  }

  return Object.freeze({
    eligible: true,
    normalizedPhoneDigits,
  });
}

/**
 * Formats the timestamp when a WhatsApp reminder was last recorded, in the
 * clinic's IANA timezone and active locale.
 */
export function formatReminderSentTime(
  reminderSentAtIso: string,
  timezone: string,
  locale: SupportedLocale,
): string {
  const parsedMs = Date.parse(reminderSentAtIso);
  if (Number.isNaN(parsedMs)) {
    return '';
  }

  const safeTimezone = resolveSafeTimezone(timezone);
  const localeTag = locale === 'es' ? 'es-ES' : 'en-GB';
  return new Intl.DateTimeFormat(localeTag, {
    timeZone: safeTimezone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(parsedMs));
}
