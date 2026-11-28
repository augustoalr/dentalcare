import { describe, expect, it } from 'vitest';
import type { AppointmentRecord } from '@/domain/appointments';
import type { PatientRecord } from '@/domain/patients';
import {
  buildSafeAppointmentReminderPayload,
  buildWaMeReminderUrl,
  extractPatientFirstName,
  formatAppointmentReminderMessage,
  formatReminderSentTime,
  getAppointmentReminderEligibility,
  normalizePhoneForWhatsApp,
} from './whatsapp';

describe('T-09 pure WhatsApp reminder domain (zero clinical data)', () => {
  describe('normalizePhoneForWhatsApp', () => {
    it('normalizes international numbers with +, 00, spaces, hyphens, parentheses, and dots to strict E.164 digits', () => {
      expect(normalizePhoneForWhatsApp('+971 50 123 4567')).toBe(
        '971501234567',
      );
      expect(normalizePhoneForWhatsApp('+34 612-345-678')).toBe('34612345678');
      expect(normalizePhoneForWhatsApp('0058 (412) 123.45.67')).toBe(
        '584121234567',
      );
      expect(normalizePhoneForWhatsApp('  1234567  ')).toBe('1234567');
      expect(normalizePhoneForWhatsApp('+123456789012345')).toBe(
        '123456789012345',
      );
    });

    it('rejects empty, missing, too short, too long, leading-zero, or non-numeric phones', () => {
      expect(normalizePhoneForWhatsApp(null)).toBeNull();
      expect(normalizePhoneForWhatsApp(undefined)).toBeNull();
      expect(normalizePhoneForWhatsApp('')).toBeNull();
      expect(normalizePhoneForWhatsApp('   ')).toBeNull();
      expect(normalizePhoneForWhatsApp('+123456')).toBeNull(); // 6 digits
      expect(normalizePhoneForWhatsApp('+1234567890123456')).toBeNull(); // 16 digits
      expect(normalizePhoneForWhatsApp('0501234567')).toBeNull(); // local leading zero
      expect(normalizePhoneForWhatsApp('00001234567')).toBeNull(); // extra leading zero after 00
      expect(normalizePhoneForWhatsApp('+0034612345678')).toBeNull(); // + followed by 0
      expect(normalizePhoneForWhatsApp('+34 612 ABC 678')).toBeNull();
      expect(normalizePhoneForWhatsApp('++34 612 345 678')).toBeNull();
      expect(normalizePhoneForWhatsApp('+34 612 345 678 ext. 2')).toBeNull();
    });
  });

  describe('extractPatientFirstName', () => {
    it('returns only the first token and never surnames, bounded to 40 characters', () => {
      expect(extractPatientFirstName('  Layla Synthetic Al Mansoor  ')).toBe(
        'Layla',
      );
      expect(extractPatientFirstName('María   Rodríguez   Sintética')).toBe(
        'María',
      );
      expect(extractPatientFirstName('   ')).toBe('');

      const veryLongToken = 'A'.repeat(60) + ' LastName';
      expect(extractPatientFirstName(veryLongToken)).toBe('A'.repeat(40));
    });
  });

  describe('templates, wa.me URL builder, and strict anti-clinical-leak guarantee', () => {
    it('builds localized EN and ES messages and well-encoded https://wa.me URLs', () => {
      const esPayload = buildSafeAppointmentReminderPayload({
        patientFullName: 'Carlos Sintético Pérez',
        patientPhone: '+34 612-345-678',
        clinicName: 'Clínica Sintética Madrid',
        startsAtIso: '2026-11-28T09:30:00.000Z',
        timezone: 'Europe/Madrid',
        locale: 'es',
      });

      expect(esPayload).not.toBeNull();
      expect(Object.isFrozen(esPayload)).toBe(true);
      expect(esPayload?.recipientPhoneE164Digits).toBe('34612345678');
      expect(esPayload?.patientFirstName).toBe('Carlos');
      expect(esPayload?.appointmentTimeLabel).toBe('10:30');

      const esMessage = formatAppointmentReminderMessage(esPayload!);
      expect(esMessage).toContain('Hola Carlos, te recordamos tu cita en');
      expect(esMessage).toContain('Clínica Sintética Madrid');
      expect(esMessage).toContain('10:30');
      expect(esMessage).toContain('Por favor responde para confirmar.');

      const esUrl = buildWaMeReminderUrl(esPayload!);
      expect(esUrl.startsWith('https://wa.me/34612345678?text=')).toBe(true);
      expect(decodeURIComponent(esUrl.split('?text=')[1]!)).toBe(esMessage);

      const enPayload = buildSafeAppointmentReminderPayload({
        patientFullName: 'Layla Synthetic Al Mansoor',
        patientPhone: '+971 50 123 4567',
        clinicName: 'Al Noor Synthetic Clinic Dubai',
        startsAtIso: '2026-11-28T06:00:00.000Z',
        timezone: 'Asia/Dubai',
        locale: 'en',
      });

      expect(enPayload).not.toBeNull();
      expect(enPayload?.appointmentTimeLabel).toBe('10:00');
      const enMessage = formatAppointmentReminderMessage(enPayload!);
      expect(enMessage).toContain(
        'Hello Layla, this is a reminder for your appointment at Al Noor Synthetic Clinic Dubai on',
      );
      expect(enMessage).toContain('at 10:00. Please reply to confirm.');
    });

    it('returns null when phone, patient name, clinic name, or timestamp are invalid, and buildWaMeReminderUrl rejects invalid digits', () => {
      expect(
        buildSafeAppointmentReminderPayload({
          patientFullName: 'Layla Synthetic',
          patientPhone: 'invalid',
          clinicName: 'Al Noor Clinic',
          startsAtIso: '2026-11-28T06:00:00.000Z',
          timezone: 'Asia/Dubai',
          locale: 'en',
        }),
      ).toBeNull();

      expect(
        buildSafeAppointmentReminderPayload({
          patientFullName: '   ',
          patientPhone: '+971 50 123 4567',
          clinicName: 'Al Noor Clinic',
          startsAtIso: '2026-11-28T06:00:00.000Z',
          timezone: 'Asia/Dubai',
          locale: 'en',
        }),
      ).toBeNull();

      expect(
        buildSafeAppointmentReminderPayload({
          patientFullName: 'Layla Synthetic',
          patientPhone: '+971 50 123 4567',
          clinicName: '   ',
          startsAtIso: '2026-11-28T06:00:00.000Z',
          timezone: 'Asia/Dubai',
          locale: 'en',
        }),
      ).toBeNull();

      expect(
        buildSafeAppointmentReminderPayload({
          patientFullName: 'Layla Synthetic',
          patientPhone: '+971 50 123 4567',
          clinicName: 'Al Noor Clinic',
          startsAtIso: 'not-a-date',
          timezone: 'Asia/Dubai',
          locale: 'en',
        }),
      ).toBeNull();

      expect(() =>
        buildWaMeReminderUrl({
          recipientPhoneE164Digits: '+971-bad',
          patientFirstName: 'Layla',
          clinicName: 'Al Noor Clinic',
          appointmentDateLabel: 'Sat, Nov 28, 2026',
          appointmentTimeLabel: '10:00',
          locale: 'en',
        }),
      ).toThrow('Invalid recipient E.164 phone digits');
    });

    it('ANTI-LEAK: never includes surname, medicalAlerts, generalNotes, reason, clinicalNotes, email, or dateOfBirth in message or URL', () => {
      const patient: PatientRecord = Object.freeze({
        id: 'pat-leak-test',
        clinicId: 'clinic-1',
        fullName: 'Sofía Mendoza Valenzuela',
        phone: '+34 612-345-678',
        email: 'sofia.privada@example.test',
        dateOfBirth: '1988-07-19',
        medicalAlerts: 'Alergia penicilina severa',
        generalNotes: 'Diabetes tipo 2 controlada',
        createdAt: '2026-11-26T08:00:00.000Z',
        updatedAt: '2026-11-26T08:00:00.000Z',
      });

      const appointment: AppointmentRecord = Object.freeze({
        id: 'appt-leak-test',
        clinicId: 'clinic-1',
        patientId: patient.id,
        dentistId: 'dentist-1',
        startsAt: '2026-11-28T10:00:00.000Z',
        endsAt: '2026-11-28T10:45:00.000Z',
        status: 'confirmed',
        reason: 'Endodoncia molar superior',
        clinicalNotes: 'Articaína 4% con epinefrina, conducto mesial',
        reminderSentAt: null,
        createdAt: '2026-11-27T08:00:00.000Z',
        updatedAt: '2026-11-27T08:00:00.000Z',
      });

      const payload = buildSafeAppointmentReminderPayload({
        patientFullName: patient.fullName,
        patientPhone: patient.phone,
        clinicName: 'Clínica Dental Sintética Sol',
        startsAtIso: appointment.startsAt,
        timezone: 'Europe/Madrid',
        locale: 'es',
      });

      expect(payload).not.toBeNull();
      expect(Object.keys(payload!).sort()).toEqual([
        'appointmentDateLabel',
        'appointmentTimeLabel',
        'clinicName',
        'locale',
        'patientFirstName',
        'recipientPhoneE164Digits',
      ]);

      const message = formatAppointmentReminderMessage(payload!);
      const url = buildWaMeReminderUrl(payload!);
      const decodedUrl = decodeURIComponent(url);

      // Must contain ONLY allow-listed fields
      expect(message).toContain('Sofía');
      expect(message).toContain('Clínica Dental Sintética Sol');
      expect(message).toContain(payload!.appointmentDateLabel);
      expect(message).toContain('11:00');
      expect(decodedUrl).toContain('Sofía');
      expect(decodedUrl).toContain('Clínica Dental Sintética Sol');

      // Must NEVER contain any clinical field, surname, email, or date of birth
      const forbiddenFragments = [
        'mendoza',
        'valenzuela',
        'alergia',
        'penicilina',
        'diabetes',
        'endodoncia',
        'molar',
        'articaína',
        'epinefrina',
        'sofia.privada',
        '1988-07-19',
      ];

      const lowerMessage = message.toLowerCase();
      const lowerUrl = url.toLowerCase();
      const lowerDecodedUrl = decodedUrl.toLowerCase();

      for (const fragment of forbiddenFragments) {
        expect(lowerMessage).not.toContain(fragment);
        expect(lowerUrl).not.toContain(fragment);
        expect(lowerDecodedUrl).not.toContain(fragment);
      }
    });
  });

  describe('getAppointmentReminderEligibility', () => {
    it('allows only scheduled or confirmed appointments with a valid E.164 phone', () => {
      const validPatient = { phone: '+971 50 111 2222' };
      const missingPhonePatient = { phone: null };
      const invalidPhonePatient = { phone: '050-123' };

      expect(
        getAppointmentReminderEligibility({ status: 'scheduled' }, validPatient),
      ).toEqual({
        eligible: true,
        normalizedPhoneDigits: '971501112222',
      });
      expect(
        getAppointmentReminderEligibility({ status: 'confirmed' }, validPatient),
      ).toEqual({
        eligible: true,
        normalizedPhoneDigits: '971501112222',
      });

      expect(
        getAppointmentReminderEligibility(
          { status: 'scheduled' },
          missingPhonePatient,
        ),
      ).toEqual({
        eligible: false,
        reason: 'missing_or_invalid_phone',
      });
      expect(
        getAppointmentReminderEligibility(
          { status: 'confirmed' },
          invalidPhonePatient,
        ),
      ).toEqual({
        eligible: false,
        reason: 'missing_or_invalid_phone',
      });
      expect(
        getAppointmentReminderEligibility({ status: 'confirmed' }, undefined),
      ).toEqual({
        eligible: false,
        reason: 'missing_or_invalid_phone',
      });

      for (const ineligibleStatus of [
        'in_progress',
        'completed',
        'cancelled',
        'no_show',
      ] as const) {
        expect(
          getAppointmentReminderEligibility(
            { status: ineligibleStatus },
            validPatient,
          ),
        ).toEqual({
          eligible: false,
          reason: 'status_not_eligible',
        });
      }
    });
  });

  describe('formatReminderSentTime', () => {
    it('formats valid ISO timestamps in clinic timezone and returns empty string for invalid timestamps', () => {
      const formattedEn = formatReminderSentTime(
        '2026-11-28T06:15:00.000Z',
        'Asia/Dubai',
        'en',
      );
      expect(formattedEn).toContain('10:15');

      const formattedEs = formatReminderSentTime(
        '2026-11-28T09:45:00.000Z',
        'Europe/Madrid',
        'es',
      );
      expect(formattedEs).toContain('10:45');

      expect(formatReminderSentTime('invalid-iso', 'UTC', 'en')).toBe('');
    });
  });
});
