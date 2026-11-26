import { describe, expect, it } from 'vitest';
import {
  calculatePatientAge,
  filterPatientsByQuery,
  formatCalendarDateForLocale,
  hasCriticalMedicalAlerts,
  PATIENT_EMAIL_MAX_LENGTH,
  PATIENT_FULL_NAME_MAX_LENGTH,
  PATIENT_GENERAL_NOTES_MAX_LENGTH,
  PATIENT_MEDICAL_ALERTS_MAX_LENGTH,
  PATIENT_PHONE_MAX_LENGTH,
  validatePatientInput,
  type PatientRecord,
} from './patients';

function makePatient(overrides: Partial<PatientRecord> = {}): PatientRecord {
  return Object.freeze({
    id: '00000000-0000-0000-0000-000000000501',
    clinicId: '00000000-0000-0000-0000-000000000010',
    fullName: 'Lucía Sintética Gómez',
    phone: '+971 50 123 4567',
    email: 'lucia.sintetica@dentalcare.test',
    dateOfBirth: '1990-05-14',
    medicalAlerts: null,
    generalNotes: null,
    createdAt: '2026-11-26T08:00:00Z',
    updatedAt: '2026-11-26T08:00:00Z',
    ...overrides,
  });
}

describe('T-05 Pure patient domain logic', () => {
  describe('hasCriticalMedicalAlerts', () => {
    it('returns false for null, undefined, empty string, or whitespace-only strings', () => {
      expect(hasCriticalMedicalAlerts(null)).toBe(false);
      expect(hasCriticalMedicalAlerts(undefined)).toBe(false);
      expect(hasCriticalMedicalAlerts('')).toBe(false);
      expect(hasCriticalMedicalAlerts('    \n\t  ')).toBe(false);
    });

    it('returns true when trimmed medical alert text is present', () => {
      expect(hasCriticalMedicalAlerts('Penicillin allergy')).toBe(true);
      expect(hasCriticalMedicalAlerts('  Latex sensitivity  ')).toBe(true);
    });
  });

  describe('validatePatientInput', () => {
    const referenceDate = new Date(2026, 10, 26); // 2026-11-26 local calendar

    it('normalizes valid synthetic input and converts blank optional fields to null', () => {
      const result = validatePatientInput(
        {
          fullName: '  Layla Synthetic Al Mansoor  ',
          phone: '   ',
          email: '  LAYLA.SYNTHETIC@DENTALCARE.TEST ',
          dateOfBirth: ' 1988-02-29 ',
          medicalAlerts: '  Severe Penicillin Allergy  ',
          generalNotes: '',
        },
        referenceDate,
      );

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(Object.isFrozen(result.value)).toBe(true);
        expect(result.value).toEqual({
          fullName: 'Layla Synthetic Al Mansoor',
          phone: null,
          email: 'layla.synthetic@dentalcare.test',
          dateOfBirth: '1988-02-29',
          medicalAlerts: 'Severe Penicillin Allergy',
          generalNotes: null,
        });
      }
    });

    it('enforces fullName required and max length (1..120 chars)', () => {
      const emptyRes = validatePatientInput(
        { fullName: '   ' },
        referenceDate,
      );
      expect(emptyRes.valid).toBe(false);
      expect(emptyRes.errors.fullName).toBe('full_name_required');

      const exactMaxRes = validatePatientInput(
        { fullName: 'A'.repeat(PATIENT_FULL_NAME_MAX_LENGTH) },
        referenceDate,
      );
      expect(exactMaxRes.valid).toBe(true);

      const tooLongRes = validatePatientInput(
        { fullName: 'A'.repeat(PATIENT_FULL_NAME_MAX_LENGTH + 1) },
        referenceDate,
      );
      expect(tooLongRes.valid).toBe(false);
      expect(tooLongRes.errors.fullName).toBe('full_name_too_long');
    });

    it('enforces phone, email, medicalAlerts, and generalNotes bounds and formats', () => {
      const invalidPhoneAndNotes = validatePatientInput(
        {
          fullName: 'Mateo Sintético',
          phone: '1'.repeat(PATIENT_PHONE_MAX_LENGTH + 1),
          email: 'not-an-email',
          medicalAlerts: 'M'.repeat(PATIENT_MEDICAL_ALERTS_MAX_LENGTH + 1),
          generalNotes: 'N'.repeat(PATIENT_GENERAL_NOTES_MAX_LENGTH + 1),
        },
        referenceDate,
      );

      expect(invalidPhoneAndNotes.valid).toBe(false);
      expect(invalidPhoneAndNotes.errors).toEqual({
        fullName: null,
        phone: 'phone_too_long',
        email: 'email_invalid',
        dateOfBirth: null,
        medicalAlerts: 'medical_alerts_too_long',
        generalNotes: 'general_notes_too_long',
      });

      const overMaxEmail = `${'a'.repeat(PATIENT_EMAIL_MAX_LENGTH - 8)}@test.co.uk`;
      const emailTooLongRes = validatePatientInput(
        {
          fullName: 'Mateo Sintético',
          email: overMaxEmail,
        },
        referenceDate,
      );
      expect(emailTooLongRes.valid).toBe(false);
      expect(emailTooLongRes.errors.email).toBe('email_too_long');
    });

    it('validates real calendar dateOfBirth including leap years, min 1900-01-01, and today upper bound', () => {
      // Non-leap year Feb 29 -> invalid
      const badLeap = validatePatientInput(
        { fullName: 'Test Synthetic', dateOfBirth: '2025-02-29' },
        referenceDate,
      );
      expect(badLeap.valid).toBe(false);
      expect(badLeap.errors.dateOfBirth).toBe('date_of_birth_invalid');

      // Century non-leap year 1900-02-29 -> invalid
      const centuryNonLeap = validatePatientInput(
        { fullName: 'Test Synthetic', dateOfBirth: '1900-02-29' },
        referenceDate,
      );
      expect(centuryNonLeap.valid).toBe(false);
      expect(centuryNonLeap.errors.dateOfBirth).toBe('date_of_birth_invalid');

      // Leap year 2000-02-29 -> valid
      const centuryLeap = validatePatientInput(
        { fullName: 'Test Synthetic', dateOfBirth: '2000-02-29' },
        referenceDate,
      );
      expect(centuryLeap.valid).toBe(true);

      // Before 1900-01-01 -> too early
      const tooEarly = validatePatientInput(
        { fullName: 'Test Synthetic', dateOfBirth: '1899-12-31' },
        referenceDate,
      );
      expect(tooEarly.valid).toBe(false);
      expect(tooEarly.errors.dateOfBirth).toBe('date_of_birth_too_early');

      // Exact min 1900-01-01 and exact today 2026-11-26 -> valid
      expect(
        validatePatientInput(
          { fullName: 'Test Synthetic', dateOfBirth: '1900-01-01' },
          referenceDate,
        ).valid,
      ).toBe(true);
      expect(
        validatePatientInput(
          { fullName: 'Test Synthetic', dateOfBirth: '2026-11-26' },
          referenceDate,
        ).valid,
      ).toBe(true);

      // Tomorrow -> in future
      const futureDate = validatePatientInput(
        { fullName: 'Test Synthetic', dateOfBirth: '2026-11-27' },
        referenceDate,
      );
      expect(futureDate.valid).toBe(false);
      expect(futureDate.errors.dateOfBirth).toBe('date_of_birth_in_future');
    });
  });

  describe('filterPatientsByQuery', () => {
    const patients: readonly PatientRecord[] = Object.freeze([
      makePatient({
        id: 'p-1',
        fullName: 'Ángela Núñez Sintética',
        phone: '+34 600 111 222',
        email: 'angela.nunez@clinica.test',
      }),
      makePatient({
        id: 'p-2',
        fullName: 'Tariq Synthetic Haddad',
        phone: '+971 55 987 6543',
        email: 'tariq.haddad@dubai.test',
      }),
      makePatient({
        id: 'p-3',
        fullName: 'Elena Ficticia',
        phone: null,
        email: null,
      }),
    ]);

    it('matches case- and accent-insensitively by name, phone, or email without mutating the source list', () => {
      const snapshotBefore = [...patients];

      expect(filterPatientsByQuery(patients, '   ').map((p) => p.id)).toEqual([
        'p-1',
        'p-2',
        'p-3',
      ]);

      // Diacritic-insensitive + uppercase query
      expect(
        filterPatientsByQuery(patients, 'ANGELA NUNEZ').map((p) => p.id),
      ).toEqual(['p-1']);

      // Compact phone digits query matches formatted phone number
      expect(
        filterPatientsByQuery(patients, '+97155987').map((p) => p.id),
      ).toEqual(['p-2']);

      // Email substring query
      expect(
        filterPatientsByQuery(patients, 'DUBAI.TEST').map((p) => p.id),
      ).toEqual(['p-2']);

      // No match returns empty frozen array
      const noMatches = filterPatientsByQuery(patients, 'nonexistent-query');
      expect(noMatches).toEqual([]);
      expect(Object.isFrozen(noMatches)).toBe(true);

      // Original array was never mutated
      expect(patients).toEqual(snapshotBefore);
    });
  });

  describe('calculatePatientAge and formatCalendarDateForLocale', () => {
    it('calculates exact completed years for past birthday, birthday today, upcoming birthday, and leap years without timezone drift', () => {
      const refNov26 = new Date(2026, 10, 26); // 2026-11-26

      // Birthday already passed this year
      expect(calculatePatientAge('1990-05-14', refNov26)).toBe(36);

      // Birthday is today
      expect(calculatePatientAge('1990-11-26', refNov26)).toBe(36);

      // Birthday is tomorrow (not yet turned 36)
      expect(calculatePatientAge('1990-11-27', refNov26)).toBe(35);

      // Born on Jan 1 (classic UTC-offset bug case) -> exact year
      expect(calculatePatientAge('1990-01-01', new Date(2026, 0, 1))).toBe(36);

      // Leap-year birth 2000-02-29 evaluated on Feb 28 vs Mar 1 of non-leap year 2025, and Feb 29 of leap year 2024
      expect(calculatePatientAge('2000-02-29', new Date(2025, 1, 28))).toBe(24);
      expect(calculatePatientAge('2000-02-29', new Date(2025, 2, 1))).toBe(25);
      expect(calculatePatientAge('2000-02-29', new Date(2024, 1, 29))).toBe(24);

      // Null, invalid, or future dates return null
      expect(calculatePatientAge(null, refNov26)).toBeNull();
      expect(calculatePatientAge('invalid', refNov26)).toBeNull();
      expect(calculatePatientAge('2026-11-27', refNov26)).toBeNull();
    });

    it('formats YYYY-MM-DD cleanly per locale without Date parsing', () => {
      expect(formatCalendarDateForLocale('1990-05-14', 'en')).toBe('1990-05-14');
      expect(formatCalendarDateForLocale('1990-05-14', 'es')).toBe('14/05/1990');
      expect(formatCalendarDateForLocale(null, 'es')).toBeNull();
    });
  });
});
