import type { SupportedLocale } from '@/domain/locale';

export const PATIENT_FULL_NAME_MAX_LENGTH = 120;
export const PATIENT_PHONE_MAX_LENGTH = 32;
export const PATIENT_EMAIL_MAX_LENGTH = 254;
export const PATIENT_MEDICAL_ALERTS_MAX_LENGTH = 1000;
export const PATIENT_GENERAL_NOTES_MAX_LENGTH = 2000;
export const PATIENT_MIN_BIRTH_DATE = '1900-01-01';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DIACRITICS_PATTERN = /[\u0300-\u036f]/g;
const PHONE_SEPARATORS_PATTERN = /[\s().-]+/g;

export interface PatientRecord {
  readonly id: string;
  readonly clinicId: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly dateOfBirth: string | null;
  readonly medicalAlerts: string | null;
  readonly generalNotes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ArchivedPatientRecord extends PatientRecord {
  readonly deletedAt: string;
}

export interface PatientInput {
  readonly fullName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly dateOfBirth: string | null;
  readonly medicalAlerts: string | null;
  readonly generalNotes: string | null;
}

export interface RawPatientInput {
  readonly fullName: string;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly dateOfBirth?: string | null;
  readonly medicalAlerts?: string | null;
  readonly generalNotes?: string | null;
}

export type PatientFullNameErrorCode =
  | 'full_name_required'
  | 'full_name_too_long';
export type PatientPhoneErrorCode = 'phone_too_long';
export type PatientEmailErrorCode = 'email_invalid' | 'email_too_long';
export type PatientDateOfBirthErrorCode =
  | 'date_of_birth_invalid'
  | 'date_of_birth_too_early'
  | 'date_of_birth_in_future';
export type PatientMedicalAlertsErrorCode = 'medical_alerts_too_long';
export type PatientGeneralNotesErrorCode = 'general_notes_too_long';

export interface PatientFieldErrors {
  readonly fullName: PatientFullNameErrorCode | null;
  readonly phone: PatientPhoneErrorCode | null;
  readonly email: PatientEmailErrorCode | null;
  readonly dateOfBirth: PatientDateOfBirthErrorCode | null;
  readonly medicalAlerts: PatientMedicalAlertsErrorCode | null;
  readonly generalNotes: PatientGeneralNotesErrorCode | null;
}

export type PatientValidationResult =
  | {
      readonly valid: true;
      readonly value: PatientInput;
      readonly errors: PatientFieldErrors;
    }
  | {
      readonly valid: false;
      readonly value: null;
      readonly errors: PatientFieldErrors;
    };

interface ParsedCalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly iso: string;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInCalendarMonth(year: number, month: number): number {
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

function parseIsoCalendarDate(raw: string): ParsedCalendarDate | null {
  const match = ISO_DATE_PATTERN.exec(raw);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);

  if (month < 1 || month > 12) {
    return null;
  }

  const maxDay = daysInCalendarMonth(year, month);
  if (day < 1 || day > maxDay) {
    return null;
  }

  return {
    year,
    month,
    day,
    iso: `${match[1]}-${match[2]}-${match[3]}`,
  };
}

function toLocalIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeOptionalField(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSearchToken(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS_PATTERN, '').toLowerCase();
}

/**
 * Returns `true` when `medicalAlerts` contains non-empty clinical allergy or
 * medical warning text after trimming whitespace.
 */
export function hasCriticalMedicalAlerts(
  medicalAlerts: string | null | undefined,
): boolean {
  return typeof medicalAlerts === 'string' && medicalAlerts.trim().length > 0;
}

/**
 * Pure validation aligned 1:1 with PostgreSQL `public.patients` CHECK constraints.
 * Normalizes blank optional inputs to `null` and returns typed error codes only
 * (zero hardcoded UI messages).
 */
export function validatePatientInput(
  raw: RawPatientInput,
  referenceDate: Date = new Date(),
): PatientValidationResult {
  const normalizedFullName = raw.fullName.trim();
  const normalizedPhone = normalizeOptionalField(raw.phone);
  const rawEmail = normalizeOptionalField(raw.email);
  const normalizedEmail = rawEmail ? rawEmail.toLowerCase() : null;
  const rawDateOfBirth = normalizeOptionalField(raw.dateOfBirth);
  const normalizedMedicalAlerts = normalizeOptionalField(raw.medicalAlerts);
  const normalizedGeneralNotes = normalizeOptionalField(raw.generalNotes);

  let fullNameError: PatientFullNameErrorCode | null = null;
  if (normalizedFullName.length === 0) {
    fullNameError = 'full_name_required';
  } else if (normalizedFullName.length > PATIENT_FULL_NAME_MAX_LENGTH) {
    fullNameError = 'full_name_too_long';
  }

  const phoneError: PatientPhoneErrorCode | null =
    normalizedPhone !== null && normalizedPhone.length > PATIENT_PHONE_MAX_LENGTH
      ? 'phone_too_long'
      : null;

  let emailError: PatientEmailErrorCode | null = null;
  if (normalizedEmail !== null) {
    if (normalizedEmail.length > PATIENT_EMAIL_MAX_LENGTH) {
      emailError = 'email_too_long';
    } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
      emailError = 'email_invalid';
    }
  }

  let dateOfBirthError: PatientDateOfBirthErrorCode | null = null;
  let validatedBirthIso: string | null = null;
  if (rawDateOfBirth !== null) {
    const parsedBirth = parseIsoCalendarDate(rawDateOfBirth);
    if (!parsedBirth) {
      dateOfBirthError = 'date_of_birth_invalid';
    } else if (parsedBirth.iso < PATIENT_MIN_BIRTH_DATE) {
      dateOfBirthError = 'date_of_birth_too_early';
    } else if (parsedBirth.iso > toLocalIsoDate(referenceDate)) {
      dateOfBirthError = 'date_of_birth_in_future';
    } else {
      validatedBirthIso = parsedBirth.iso;
    }
  }

  const medicalAlertsError: PatientMedicalAlertsErrorCode | null =
    normalizedMedicalAlerts !== null &&
    normalizedMedicalAlerts.length > PATIENT_MEDICAL_ALERTS_MAX_LENGTH
      ? 'medical_alerts_too_long'
      : null;

  const generalNotesError: PatientGeneralNotesErrorCode | null =
    normalizedGeneralNotes !== null &&
    normalizedGeneralNotes.length > PATIENT_GENERAL_NOTES_MAX_LENGTH
      ? 'general_notes_too_long'
      : null;

  const errors: PatientFieldErrors = Object.freeze({
    fullName: fullNameError,
    phone: phoneError,
    email: emailError,
    dateOfBirth: dateOfBirthError,
    medicalAlerts: medicalAlertsError,
    generalNotes: generalNotesError,
  });

  if (
    fullNameError !== null ||
    phoneError !== null ||
    emailError !== null ||
    dateOfBirthError !== null ||
    medicalAlertsError !== null ||
    generalNotesError !== null
  ) {
    return Object.freeze({
      valid: false,
      value: null,
      errors,
    });
  }

  const value: PatientInput = Object.freeze({
    fullName: normalizedFullName,
    phone: normalizedPhone,
    email: normalizedEmail,
    dateOfBirth: validatedBirthIso,
    medicalAlerts: normalizedMedicalAlerts,
    generalNotes: normalizedGeneralNotes,
  });

  return Object.freeze({
    valid: true,
    value,
    errors,
  });
}

/**
 * Pure accent- and case-insensitive filter across `fullName`, `phone`, and `email`.
 * Never mutates the original `patients` array and avoids PostgREST `.or()` injection.
 */
export function filterPatientsByQuery(
  patients: readonly PatientRecord[],
  rawQuery: string,
): readonly PatientRecord[] {
  const trimmedQuery = rawQuery.trim();
  if (trimmedQuery.length === 0) {
    return Object.freeze([...patients]);
  }

  const normalizedQuery = normalizeSearchToken(trimmedQuery);
  const compactPhoneQuery = normalizedQuery.replace(PHONE_SEPARATORS_PATTERN, '');

  const filtered = patients.filter((patient) => {
    if (normalizeSearchToken(patient.fullName).includes(normalizedQuery)) {
      return true;
    }

    if (patient.email !== null) {
      if (normalizeSearchToken(patient.email).includes(normalizedQuery)) {
        return true;
      }
    }

    if (patient.phone !== null) {
      const normalizedPhone = normalizeSearchToken(patient.phone);
      if (normalizedPhone.includes(normalizedQuery)) {
        return true;
      }
      if (
        compactPhoneQuery.length >= 3 &&
        normalizedPhone
          .replace(PHONE_SEPARATORS_PATTERN, '')
          .includes(compactPhoneQuery)
      ) {
        return true;
      }
    }

    return false;
  });

  return Object.freeze(filtered);
}

/**
 * Calculates completed years of age from a `YYYY-MM-DD` string without `Date.parse`
 * timezone drift by parsing integer calendar components directly.
 */
export function calculatePatientAge(
  dateOfBirth: string | null,
  referenceDate: Date = new Date(),
): number | null {
  if (typeof dateOfBirth !== 'string') {
    return null;
  }

  const parsedBirth = parseIsoCalendarDate(dateOfBirth.trim());
  if (!parsedBirth || parsedBirth.iso < PATIENT_MIN_BIRTH_DATE) {
    return null;
  }

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  const refDay = referenceDate.getDate();

  if (
    parsedBirth.year > refYear ||
    (parsedBirth.year === refYear && parsedBirth.month > refMonth) ||
    (parsedBirth.year === refYear &&
      parsedBirth.month === refMonth &&
      parsedBirth.day > refDay)
  ) {
    return null;
  }

  const hasHadBirthdayThisYear =
    refMonth > parsedBirth.month ||
    (refMonth === parsedBirth.month && refDay >= parsedBirth.day);

  return refYear - parsedBirth.year - (hasHadBirthdayThisYear ? 0 : 1);
}

/**
 * Formats a `YYYY-MM-DD` date string cleanly for display (`DD/MM/YYYY` in Spanish,
 * `YYYY-MM-DD` in English) without constructing timezone-sensitive `Date` objects.
 */
export function formatCalendarDateForLocale(
  dateOfBirth: string | null,
  locale: SupportedLocale,
): string | null {
  if (typeof dateOfBirth !== 'string') {
    return null;
  }

  const parsed = parseIsoCalendarDate(dateOfBirth.trim());
  if (!parsed) {
    return null;
  }

  const year = String(parsed.year).padStart(4, '0');
  const month = String(parsed.month).padStart(2, '0');
  const day = String(parsed.day).padStart(2, '0');

  return locale === 'es' ? `${day}/${month}/${year}` : `${year}-${month}-${day}`;
}
