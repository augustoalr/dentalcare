import { describe, expect, it } from 'vitest';
import {
  addMinutesToTimeHHmm,
  APPOINTMENT_CLINICAL_NOTES_MAX_LENGTH,
  APPOINTMENT_REASON_MAX_LENGTH,
  canEditClinicalNotes,
  combineClinicDateAndTimeToUtcIso,
  extractClinicDateAndTime,
  findOverlappingAppointments,
  formatAppointmentTimeRange,
  formatScheduleDateLabel,
  getDateKeyInTimezone,
  getDateRangeUtcBounds,
  getWeekDateKeys,
  isAppointmentStatus,
  resolveSafeTimezone,
  shiftDateKey,
  summarizeDailyAppointments,
  validateAppointmentFormInput,
  validateClinicalNotesInput,
  type AppointmentRecord,
} from '@/domain/appointments';

function makeAppointment(
  overrides: Partial<AppointmentRecord>,
): AppointmentRecord {
  return Object.freeze({
    id: 'appt-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    dentistId: 'dentist-1',
    startsAt: '2026-11-28T06:00:00.000Z', // 10:00 Asia/Dubai
    endsAt: '2026-11-28T06:30:00.000Z', // 10:30 Asia/Dubai
    status: 'scheduled',
    reason: 'Routine checkup',
    clinicalNotes: null,
    reminderSentAt: null,
    createdAt: '2026-11-27T08:00:00.000Z',
    updatedAt: '2026-11-27T08:00:00.000Z',
    ...overrides,
  });
}

describe('T-08 Pure Appointments Domain Logic', () => {
  it('validates status guards and clinical notes role permissions', () => {
    expect(isAppointmentStatus('scheduled')).toBe(true);
    expect(isAppointmentStatus('confirmed')).toBe(true);
    expect(isAppointmentStatus('in_progress')).toBe(true);
    expect(isAppointmentStatus('completed')).toBe(true);
    expect(isAppointmentStatus('cancelled')).toBe(true);
    expect(isAppointmentStatus('no_show')).toBe(true);
    expect(isAppointmentStatus('unknown')).toBe(false);

    expect(canEditClinicalNotes('admin')).toBe(true);
    expect(canEditClinicalNotes('dentist')).toBe(true);
    expect(canEditClinicalNotes('receptionist')).toBe(false);
  });

  it('handles IANA timezones accurately across Asia/Dubai, Europe/Madrid (winter & summer DST), America/Caracas, and invalid fallback', () => {
    expect(resolveSafeTimezone('Asia/Dubai')).toBe('Asia/Dubai');
    expect(resolveSafeTimezone('Invalid/Zone')).toBe('UTC');
    expect(resolveSafeTimezone('   ')).toBe('UTC');

    // Asia/Dubai (UTC+4, no DST): 2026-11-28 09:30 -> 05:30Z
    const dubaiIso = combineClinicDateAndTimeToUtcIso(
      '2026-11-28',
      '09:30',
      'Asia/Dubai',
    );
    expect(dubaiIso).toBe('2026-11-28T05:30:00.000Z');
    expect(extractClinicDateAndTime(dubaiIso!, 'Asia/Dubai')).toEqual({
      dateKey: '2026-11-28',
      timeHHmm: '09:30',
    });

    // Europe/Madrid winter (UTC+1): 2026-11-28 09:30 -> 08:30Z
    const madridWinter = combineClinicDateAndTimeToUtcIso(
      '2026-11-28',
      '09:30',
      'Europe/Madrid',
    );
    expect(madridWinter).toBe('2026-11-28T08:30:00.000Z');
    expect(extractClinicDateAndTime(madridWinter!, 'Europe/Madrid')).toEqual({
      dateKey: '2026-11-28',
      timeHHmm: '09:30',
    });

    // Europe/Madrid summer DST (UTC+2): 2026-07-15 09:30 -> 07:30Z
    const madridSummer = combineClinicDateAndTimeToUtcIso(
      '2026-07-15',
      '09:30',
      'Europe/Madrid',
    );
    expect(madridSummer).toBe('2026-07-15T07:30:00.000Z');
    expect(extractClinicDateAndTime(madridSummer!, 'Europe/Madrid')).toEqual({
      dateKey: '2026-07-15',
      timeHHmm: '09:30',
    });

    // America/Caracas (UTC-4): 2026-11-28 14:00 -> 18:00Z
    const caracasIso = combineClinicDateAndTimeToUtcIso(
      '2026-11-28',
      '14:00',
      'America/Caracas',
    );
    expect(caracasIso).toBe('2026-11-28T18:00:00.000Z');
    expect(extractClinicDateAndTime(caracasIso!, 'America/Caracas')).toEqual({
      dateKey: '2026-11-28',
      timeHHmm: '14:00',
    });

    // Date key rollover across timezones for the same instant (2026-11-28T22:30:00Z)
    const lateUtc = new Date('2026-11-28T22:30:00.000Z');
    expect(getDateKeyInTimezone(lateUtc, 'Asia/Dubai')).toBe('2026-11-29');
    expect(getDateKeyInTimezone(lateUtc, 'America/Caracas')).toBe('2026-11-28');

    // Day range UTC bounds in Asia/Dubai
    expect(
      getDateRangeUtcBounds('2026-11-28', '2026-11-28', 'Asia/Dubai'),
    ).toEqual({
      startIso: '2026-11-27T20:00:00.000Z',
      endIso: '2026-11-28T20:00:00.000Z',
    });
  });

  it('computes Monday-Sunday week keys and shifts calendar dates without DST drift', () => {
    // 2026-11-28 is a Saturday
    expect(getWeekDateKeys('2026-11-28')).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ]);
    // 2026-11-29 is a Sunday -> belongs to the same week ending Sunday
    expect(getWeekDateKeys('2026-11-29')[0]).toBe('2026-11-23');
    // 2026-11-30 is Monday -> starts the next week
    expect(getWeekDateKeys('2026-11-30')[0]).toBe('2026-11-30');

    expect(shiftDateKey('2026-02-28', 1)).toBe('2026-03-01');
    expect(shiftDateKey('2024-02-28', 1)).toBe('2024-02-29'); // leap year
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31');

    expect(addMinutesToTimeHHmm('09:15', 45)).toBe('10:00');
    expect(addMinutesToTimeHHmm('23:30', 60)).toBe('23:59');
    expect(addMinutesToTimeHHmm('invalid', 30)).toBeNull();
  });

  it('formats appointment time ranges and localized date labels', () => {
    const formatted = formatAppointmentTimeRange(
      '2026-11-28T06:00:00.000Z',
      '2026-11-28T06:45:00.000Z',
      'Asia/Dubai',
      'en',
    );
    expect(formatted).toBe('10:00 – 10:45');

    const enLabel = formatScheduleDateLabel('2026-11-28', 'en');
    const esLabel = formatScheduleDateLabel('2026-11-28', 'es');
    expect(enLabel).toContain('2026');
    expect(esLabel).toContain('2026');
    expect(enLabel).not.toBe(esLabel);
  });

  it('validates appointment form inputs including duration bounds (5..720 min) and clinical notes role enforcement', () => {
    // Valid dentist submission
    const ok = validateAppointmentFormInput(
      {
        patientId: 'patient-1',
        dentistId: 'dentist-1',
        dateKey: '2026-11-28',
        startTime: '10:00',
        endTime: '10:30',
        status: 'confirmed',
        reason: '  Composite filling  ',
        clinicalNotes: '  Synthetic occlusal restoration note  ',
      },
      { timezone: 'Asia/Dubai', role: 'dentist' },
    );
    expect(ok.valid).toBe(true);
    if (ok.valid) {
      expect(ok.value).toEqual({
        patientId: 'patient-1',
        dentistId: 'dentist-1',
        startsAt: '2026-11-28T06:00:00.000Z',
        endsAt: '2026-11-28T06:30:00.000Z',
        status: 'confirmed',
        reason: 'Composite filling',
        clinicalNotes: 'Synthetic occlusal restoration note',
      });
    }

    // Receptionist without notes succeeds and omits clinicalNotes property
    const recOk = validateAppointmentFormInput(
      {
        patientId: 'patient-1',
        dentistId: 'dentist-1',
        dateKey: '2026-11-28',
        startTime: '10:00',
        endTime: '10:30',
        status: 'scheduled',
        reason: 'Checkup',
        clinicalNotes: '   ',
      },
      { timezone: 'Asia/Dubai', role: 'receptionist' },
    );
    expect(recOk.valid).toBe(true);
    if (recOk.valid) {
      expect('clinicalNotes' in recOk.value).toBe(false);
    }

    // Receptionist trying to pass clinicalNotes is rejected
    const recDenied = validateAppointmentFormInput(
      {
        patientId: 'patient-1',
        dentistId: 'dentist-1',
        dateKey: '2026-11-28',
        startTime: '10:00',
        endTime: '10:30',
        status: 'scheduled',
        clinicalNotes: 'Unauthorized note',
      },
      { timezone: 'Asia/Dubai', role: 'receptionist' },
    );
    expect(recDenied.valid).toBe(false);
    expect(recDenied.errors.clinicalNotes).toBe('clinical_notes_forbidden');

    // ends_at <= starts_at
    const reversed = validateAppointmentFormInput(
      {
        patientId: 'p1',
        dentistId: 'd1',
        dateKey: '2026-11-28',
        startTime: '10:30',
        endTime: '10:00',
        status: 'scheduled',
      },
      { timezone: 'Asia/Dubai', role: 'admin' },
    );
    expect(reversed.valid).toBe(false);
    expect(reversed.errors.endTime).toBe('end_before_start');

    // Duration < 5 min
    const tooShort = validateAppointmentFormInput(
      {
        patientId: 'p1',
        dentistId: 'd1',
        dateKey: '2026-11-28',
        startTime: '10:00',
        endTime: '10:04',
        status: 'scheduled',
      },
      { timezone: 'Asia/Dubai', role: 'admin' },
    );
    expect(tooShort.valid).toBe(false);
    expect(tooShort.errors.endTime).toBe('duration_too_short');

    // Duration > 12 h (720 min)
    const tooLong = validateAppointmentFormInput(
      {
        patientId: 'p1',
        dentistId: 'd1',
        dateKey: '2026-11-28',
        startTime: '08:00',
        endTime: '20:01',
        status: 'scheduled',
      },
      { timezone: 'Asia/Dubai', role: 'admin' },
    );
    expect(tooLong.valid).toBe(false);
    expect(tooLong.errors.endTime).toBe('duration_too_long');

    // Exact boundary 5 min and 720 min pass
    expect(
      validateAppointmentFormInput(
        {
          patientId: 'p1',
          dentistId: 'd1',
          dateKey: '2026-11-28',
          startTime: '10:00',
          endTime: '10:05',
          status: 'scheduled',
        },
        { timezone: 'Asia/Dubai', role: 'admin' },
      ).valid,
    ).toBe(true);
    expect(
      validateAppointmentFormInput(
        {
          patientId: 'p1',
          dentistId: 'd1',
          dateKey: '2026-11-28',
          startTime: '08:00',
          endTime: '20:00',
          status: 'scheduled',
        },
        { timezone: 'Asia/Dubai', role: 'admin' },
      ).valid,
    ).toBe(true);

    // Reason and notes length limits
    const overLimit = validateAppointmentFormInput(
      {
        patientId: '',
        dentistId: '',
        dateKey: '2026-02-30',
        startTime: '25:00',
        endTime: '99:99',
        status: 'invalid_status',
        reason: 'a'.repeat(APPOINTMENT_REASON_MAX_LENGTH + 1),
        clinicalNotes: 'b'.repeat(APPOINTMENT_CLINICAL_NOTES_MAX_LENGTH + 1),
      },
      { timezone: 'Asia/Dubai', role: 'dentist' },
    );
    expect(overLimit.valid).toBe(false);
    expect(overLimit.errors).toEqual({
      patientId: 'patient_required',
      dentistId: 'dentist_required',
      dateKey: 'date_invalid',
      startTime: 'start_time_invalid',
      endTime: 'end_time_invalid',
      status: 'status_invalid',
      reason: 'reason_too_long',
      clinicalNotes: 'clinical_notes_too_long',
    });

    // Dedicated clinical notes validator
    expect(validateClinicalNotesInput('ok', 'receptionist').valid).toBe(false);
    expect(validateClinicalNotesInput('  clean note  ', 'dentist')).toEqual({
      valid: true,
      value: 'clean note',
      error: null,
    });
    expect(validateClinicalNotesInput('   ', 'admin')).toEqual({
      valid: true,
      value: null,
      error: null,
    });
  });

  it('detects dentist schedule overlaps accurately while ignoring contiguous, cancelled, no_show, other dentist, and self', () => {
    const existing: readonly AppointmentRecord[] = [
      makeAppointment({
        id: 'appt-active',
        dentistId: 'dentist-1',
        startsAt: '2026-11-28T06:00:00.000Z', // 10:00–10:30
        endsAt: '2026-11-28T06:30:00.000Z',
        status: 'confirmed',
      }),
      makeAppointment({
        id: 'appt-cancelled',
        dentistId: 'dentist-1',
        startsAt: '2026-11-28T06:00:00.000Z',
        endsAt: '2026-11-28T07:00:00.000Z',
        status: 'cancelled',
      }),
      makeAppointment({
        id: 'appt-noshow',
        dentistId: 'dentist-1',
        startsAt: '2026-11-28T06:00:00.000Z',
        endsAt: '2026-11-28T07:00:00.000Z',
        status: 'no_show',
      }),
      makeAppointment({
        id: 'appt-other-dentist',
        dentistId: 'dentist-2',
        startsAt: '2026-11-28T06:00:00.000Z',
        endsAt: '2026-11-28T07:00:00.000Z',
        status: 'scheduled',
      }),
    ];

    // Partial overlap (10:15–10:45)
    expect(
      findOverlappingAppointments(
        {
          dentistId: 'dentist-1',
          startsAt: '2026-11-28T06:15:00.000Z',
          endsAt: '2026-11-28T06:45:00.000Z',
        },
        existing,
      ).map((m) => m.appointmentId),
    ).toEqual(['appt-active']);

    // Full containment (09:30–11:00)
    expect(
      findOverlappingAppointments(
        {
          dentistId: 'dentist-1',
          startsAt: '2026-11-28T05:30:00.000Z',
          endsAt: '2026-11-28T07:00:00.000Z',
        },
        existing,
      ).map((m) => m.appointmentId),
    ).toEqual(['appt-active']);

    // Contiguous back-to-back (10:30–11:00 and 09:30–10:00) MUST NOT overlap
    expect(
      findOverlappingAppointments(
        {
          dentistId: 'dentist-1',
          startsAt: '2026-11-28T06:30:00.000Z',
          endsAt: '2026-11-28T07:00:00.000Z',
        },
        existing,
      ),
    ).toEqual([]);
    expect(
      findOverlappingAppointments(
        {
          dentistId: 'dentist-1',
          startsAt: '2026-11-28T05:30:00.000Z',
          endsAt: '2026-11-28T06:00:00.000Z',
        },
        existing,
      ),
    ).toEqual([]);

    // Excluding self when editing
    expect(
      findOverlappingAppointments(
        {
          dentistId: 'dentist-1',
          startsAt: '2026-11-28T06:00:00.000Z',
          endsAt: '2026-11-28T06:30:00.000Z',
          excludeAppointmentId: 'appt-active',
        },
        existing,
      ),
    ).toEqual([]);
  });

  it('summarizes daily KPIs and selects the next upcoming scheduled/confirmed appointment', () => {
    const dayAppointments: readonly AppointmentRecord[] = [
      makeAppointment({
        id: 'a-completed',
        startsAt: '2026-11-28T05:00:00.000Z',
        endsAt: '2026-11-28T05:30:00.000Z',
        status: 'completed',
      }),
      makeAppointment({
        id: 'a-in-progress',
        startsAt: '2026-11-28T05:45:00.000Z',
        endsAt: '2026-11-28T06:15:00.000Z',
        status: 'in_progress',
      }),
      makeAppointment({
        id: 'a-later-confirmed',
        startsAt: '2026-11-28T08:00:00.000Z',
        endsAt: '2026-11-28T08:30:00.000Z',
        status: 'confirmed',
      }),
      makeAppointment({
        id: 'a-next-pending',
        startsAt: '2026-11-28T06:30:00.000Z',
        endsAt: '2026-11-28T07:00:00.000Z',
        status: 'scheduled',
      }),
      makeAppointment({
        id: 'a-cancelled',
        startsAt: '2026-11-28T06:15:00.000Z',
        endsAt: '2026-11-28T06:45:00.000Z',
        status: 'cancelled',
      }),
      makeAppointment({
        id: 'a-noshow',
        startsAt: '2026-11-28T05:30:00.000Z',
        endsAt: '2026-11-28T06:00:00.000Z',
        status: 'no_show',
      }),
    ];

    const summary = summarizeDailyAppointments(
      dayAppointments,
      '2026-11-28T06:00:00.000Z',
    );

    expect(summary.totalToday).toBe(4);
    expect(summary.activeCount).toBe(4);
    expect(summary.confirmedCount).toBe(1);
    expect(summary.pendingCount).toBe(1);
    expect(summary.inProgressCount).toBe(1);
    expect(summary.completedCount).toBe(1);
    expect(summary.cancelledOrNoShowCount).toBe(2);
    expect(summary.nextAppointment?.id).toBe('a-next-pending');
  });
});
