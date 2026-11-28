import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  createTestDbHarness,
  extractPgErrorCode,
  listMigrationFiles,
  readMigrationSql,
  type ITestDbHarness,
} from './testDbHarness';

const fixtures = {
  clinicA: '11111111-1111-4111-8111-111111111181',
  clinicB: '22222222-2222-4222-8222-222222222282',
  adminA: '11111111-1111-4111-8111-111111111281',
  dentistA: '11111111-1111-4111-8111-111111111381',
  dentistA2: '11111111-1111-4111-8111-111111111382',
  receptionistA: '11111111-1111-4111-8111-111111111481',
  inactiveDentistA: '11111111-1111-4111-8111-111111111581',
  deletedDentistA: '11111111-1111-4111-8111-111111111681',
  adminB: '22222222-2222-4222-8222-222222222283',
  dentistB: '22222222-2222-4222-8222-222222222384',
  patientA1: '33333333-3333-4333-8333-333333333381',
  patientA2: '33333333-3333-4333-8333-333333333382',
  patientAArchived: '33333333-3333-4333-8333-333333333383',
  patientB1: '44444444-4444-4444-8444-444444444481',
} as const;

async function expectPgError(
  operation: () => Promise<unknown>,
  expectedCodes: string | readonly string[],
): Promise<void> {
  const allowed = Array.isArray(expectedCodes)
    ? expectedCodes
    : [expectedCodes];
  try {
    await operation();
    throw new Error(
      `Expected PostgreSQL error code ${allowed.join(' or ')}, but query succeeded`,
    );
  } catch (error) {
    const code = extractPgErrorCode(error);
    expect(code, `Unexpected error: ${String(error)}`).toBeDefined();
    expect(allowed).toContain(code);
  }
}

describe('T-08 Appointments Schema, Multi-Clinic RLS, Clinical Notes Security & PII-Free Audit', () => {
  let db: ITestDbHarness;

  beforeAll(async () => {
    db = await createTestDbHarness();

    // 1. Idempotency: apply every migration twice in a row without error
    await applyAllMigrations(db);
    await applyAllMigrations(db);

    // Seed two synthetic clinics, staff profiles, and synthetic patients
    await db.queryAsOwner(
      `INSERT INTO public.clinics (id, name, currency_code, currency_symbol, tax_rate_bps, tax_label, timezone, default_locale)
       VALUES
         ($1, 'Al Noor Synthetic Clinic A', 'AED', 'AED', 500, 'VAT', 'Asia/Dubai', 'en'),
         ($2, 'Marbella Synthetic Clinic B', 'EUR', '€', 2100, 'IVA', 'Europe/Madrid', 'es')
       ON CONFLICT (id) DO NOTHING`,
      [fixtures.clinicA, fixtures.clinicB],
    );

    await db.queryAsOwner(
      `INSERT INTO auth.users (id, email)
       VALUES
         ($1, 'admin.a.t08@synthetic.test'),
         ($2, 'dentist.a.t08@synthetic.test'),
         ($3, 'dentist.a2.t08@synthetic.test'),
         ($4, 'receptionist.a.t08@synthetic.test'),
         ($5, 'inactive.a.t08@synthetic.test'),
         ($6, 'deleted.a.t08@synthetic.test'),
         ($7, 'admin.b.t08@synthetic.test'),
         ($8, 'dentist.b.t08@synthetic.test')
       ON CONFLICT (id) DO NOTHING`,
      [
        fixtures.adminA,
        fixtures.dentistA,
        fixtures.dentistA2,
        fixtures.receptionistA,
        fixtures.inactiveDentistA,
        fixtures.deletedDentistA,
        fixtures.adminB,
        fixtures.dentistB,
      ],
    );

    await db.queryAsOwner(
      `INSERT INTO public.profiles (id, clinic_id, full_name, role, preferred_locale, is_active, deleted_at)
       VALUES
         ($1, $9,  'Admin Synthetic A', 'admin', 'en', true, NULL),
         ($2, $9,  'Dr. Nur Synthetic A', 'dentist', 'en', true, NULL),
         ($3, $9,  'Dr. Tariq Synthetic A2', 'dentist', 'es', true, NULL),
         ($4, $9,  'Sara Receptionist Synthetic A', 'receptionist', 'en', true, NULL),
         ($5, $9,  'Dr. Inactive Synthetic A', 'dentist', 'en', false, NULL),
         ($6, $9,  'Dr. Deleted Synthetic A', 'dentist', 'en', true, now()),
         ($7, $10, 'Admin Synthetic B', 'admin', 'es', true, NULL),
         ($8, $10, 'Dr. Elena Synthetic B', 'dentist', 'es', true, NULL)
       ON CONFLICT (id) DO NOTHING`,
      [
        fixtures.adminA,
        fixtures.dentistA,
        fixtures.dentistA2,
        fixtures.receptionistA,
        fixtures.inactiveDentistA,
        fixtures.deletedDentistA,
        fixtures.adminB,
        fixtures.dentistB,
        fixtures.clinicA,
        fixtures.clinicB,
      ],
    );

    await db.queryAsOwner(
      `INSERT INTO public.patients (id, clinic_id, full_name, medical_alerts, deleted_at)
       VALUES
         ($1, $5, 'Layla Synthetic Patient A1', 'Penicillin allergy', NULL),
         ($2, $5, 'Omar Synthetic Patient A2', NULL, NULL),
         ($3, $5, 'Archived Synthetic Patient A3', NULL, now()),
         ($4, $6, 'Carlos Synthetic Patient B1', NULL, NULL)
       ON CONFLICT (id) DO NOTHING`,
      [
        fixtures.patientA1,
        fixtures.patientA2,
        fixtures.patientAArchived,
        fixtures.patientB1,
        fixtures.clinicA,
        fixtures.clinicB,
      ],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('1 & 2. Enforces multi-clinic RLS isolation, composite FK integrity (including patient_files.appointment_id), and blocks anon/inactive/deleted users', async () => {
    // adminA, dentistA, and receptionistA create active appointments in Clinic A
    const apptByDentist = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string }>(
          `INSERT INTO public.appointments (
             clinic_id, patient_id, dentist_id, starts_at, ends_at, status, reason, clinical_notes
           )
           VALUES (
             $1, $2, $3,
             '2026-11-28T06:00:00Z', '2026-11-28T06:30:00Z',
             'confirmed', 'Synthetic cleaning visit', 'Secret clinical note alpha'
           )
           RETURNING id`,
          [fixtures.clinicA, fixtures.patientA1, fixtures.dentistA],
        );
        return res.rows[0]!.id;
      },
    );

    const apptByReceptionist = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string }>(
          `INSERT INTO public.appointments (
             clinic_id, patient_id, dentist_id, starts_at, ends_at, status, reason
           )
           VALUES (
             $1, $2, $3,
             '2026-11-28T07:00:00Z', '2026-11-28T07:30:00Z',
             'scheduled', 'Synthetic checkup'
           )
           RETURNING id`,
          [fixtures.clinicA, fixtures.patientA2, fixtures.dentistA],
        );
        return res.rows[0]!.id;
      },
    );

    // Clinic A staff see both active appointments
    const clinicACount = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      async (tx) => {
        const res = await tx.query<{ id: string }>(
          `SELECT id FROM public.appointments WHERE id IN ($1, $2)`,
          [apptByDentist, apptByReceptionist],
        );
        return res.rows.length;
      },
    );
    expect(clinicACount).toBe(2);

    // Clinic B (even adminB) sees 0 rows and cannot UPDATE or INSERT into Clinic A
    const clinicBVisible = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminB },
      async (tx) => {
        const sel = await tx.query<{ id: string }>(
          `SELECT id FROM public.appointments`,
        );
        const upd = await tx.query(
          `UPDATE public.appointments SET status = 'cancelled' WHERE id = $1`,
          [apptByDentist],
        );
        return { selected: sel.rows.length, updated: upd.rowCount };
      },
    );
    expect(clinicBVisible).toEqual({ selected: 0, updated: 0 });

    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminB },
          async (tx) => {
            await tx.query(
              `INSERT INTO public.appointments (clinic_id, patient_id, dentist_id, starts_at, ends_at)
               VALUES ($1, $2, $3, '2026-11-28T08:00:00Z', '2026-11-28T08:30:00Z')`,
              [fixtures.clinicA, fixtures.patientA1, fixtures.dentistA],
            );
          },
        ),
      '42501',
    );

    // Cross-clinic composite FK rejections (Clinic A + Patient B or Dentist B)
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(
              `INSERT INTO public.appointments (clinic_id, patient_id, dentist_id, starts_at, ends_at)
               VALUES ($1, $2, $3, '2026-11-28T08:00:00Z', '2026-11-28T08:30:00Z')`,
              [fixtures.clinicA, fixtures.patientB1, fixtures.dentistA],
            );
          },
        ),
      ['42501', '23503'],
    );

    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(
              `INSERT INTO public.appointments (clinic_id, patient_id, dentist_id, starts_at, ends_at)
               VALUES ($1, $2, $3, '2026-11-28T08:00:00Z', '2026-11-28T08:30:00Z')`,
              [fixtures.clinicA, fixtures.patientA1, fixtures.dentistB],
            );
          },
        ),
      ['42501', '23503'],
    );

    // Owner-level composite FK enforcement directly verifies relational constraints
    await expectPgError(
      () =>
        db.queryAsOwner(
          `INSERT INTO public.appointments (clinic_id, patient_id, dentist_id, starts_at, ends_at)
           VALUES ($1, $2, $3, '2026-11-28T08:00:00Z', '2026-11-28T08:30:00Z')`,
          [fixtures.clinicA, fixtures.patientA1, fixtures.dentistB],
        ),
      '23503',
    );

    // Cannot assign receptionistA as dentist_id
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(
              `INSERT INTO public.appointments (clinic_id, patient_id, dentist_id, starts_at, ends_at)
               VALUES ($1, $2, $3, '2026-11-28T08:00:00Z', '2026-11-28T08:30:00Z')`,
              [fixtures.clinicA, fixtures.patientA1, fixtures.receptionistA],
            );
          },
        ),
      '42501',
    );

    // patient_files.appointment_id composite FK: same clinic + same patient succeeds;
    // linking another patient's appointment fails with 23503
    const validFileUuid = '55555555-5555-4555-8555-555555555501';
    const validPath = `${fixtures.clinicA}/${fixtures.patientA1}/${validFileUuid}.png`;
    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA },
      async (tx) => {
        const res = await tx.query<{ appointment_id: string }>(
          `INSERT INTO public.patient_files (
             clinic_id, patient_id, appointment_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by
           )
           VALUES ($1, $2, $3, $4, 'synthetic.png', 'image/png', 1024, $5)
           RETURNING appointment_id`,
          [
            fixtures.clinicA,
            fixtures.patientA1,
            apptByDentist,
            validPath,
            fixtures.dentistA,
          ],
        );
        expect(res.rows[0]?.appointment_id).toBe(apptByDentist);
      },
    );

    const mismatchFileUuid = '55555555-5555-4555-8555-555555555502';
    const mismatchPath = `${fixtures.clinicA}/${fixtures.patientA2}/${mismatchFileUuid}.png`;
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.dentistA },
          async (tx) => {
            await tx.query(
              `INSERT INTO public.patient_files (
                 clinic_id, patient_id, appointment_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by
               )
               VALUES ($1, $2, $3, $4, 'mismatch.png', 'image/png', 1024, $5)`,
              [
                fixtures.clinicA,
                fixtures.patientA2,
                apptByDentist, // belongs to patientA1!
                mismatchPath,
                fixtures.dentistA,
              ],
            );
          },
        ),
      '23503',
    );

    // anon, inactive, and soft-deleted users are completely blocked
    await expectPgError(
      () =>
        db.runAsRole({ role: 'anon' }, async (tx) => {
          await tx.query(`SELECT id FROM public.appointments`);
        }),
      '42501',
    );

    const inactiveRows = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.inactiveDentistA },
      async (tx) => {
        const res = await tx.query(`SELECT id FROM public.appointments`);
        return res.rows.length;
      },
    );
    expect(inactiveRows).toBe(0);

    const deletedRows = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.deletedDentistA },
      async (tx) => {
        const res = await tx.query(`SELECT id FROM public.appointments`);
        return res.rows.length;
      },
    );
    expect(deletedRows).toBe(0);
  });

  it('3. Enforces DB-level clinical_notes role protection (B-02) while allowing receptionist operational edits and zero clinical text in audit_log', async () => {
    // receptionistA CANNOT INSERT with non-null clinical_notes (42501)
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.receptionistA },
          async (tx) => {
            await tx.query(
              `INSERT INTO public.appointments (
                 clinic_id, patient_id, dentist_id, starts_at, ends_at, clinical_notes
               )
               VALUES ($1, $2, $3, '2026-11-28T09:00:00Z', '2026-11-28T09:30:00Z', 'Unauthorized note')`,
              [fixtures.clinicA, fixtures.patientA1, fixtures.dentistA],
            );
          },
        ),
      '42501',
    );

    // dentistA creates an appointment and updates clinical_notes; adminA updates clinical_notes
    const apptId = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      async (tx) => {
        const created = await tx.query<{ id: string }>(
          `INSERT INTO public.appointments (
             clinic_id, patient_id, dentist_id, starts_at, ends_at, status, reason, clinical_notes
           )
           VALUES (
             $1, $2, $3,
             '2026-11-28T10:00:00Z', '2026-11-28T10:30:00Z',
             'scheduled', 'Synthetic root canal review', 'Initial sensitive diagnosis XYZ-987'
           )
           RETURNING id`,
          [fixtures.clinicA, fixtures.patientA1, fixtures.dentistA],
        );
        const id = created.rows[0]!.id;

        await tx.query(
          `UPDATE public.appointments
           SET clinical_notes = 'Updated sensitive diagnosis XYZ-987 by dentist'
           WHERE id = $1`,
          [id],
        );
        return id;
      },
    );

    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        await tx.query(
          `UPDATE public.appointments
           SET clinical_notes = 'Admin clinical addendum XYZ-987'
           WHERE id = $1`,
          [apptId],
        );
      },
    );

    // receptionistA CANNOT modify or clear clinical_notes (42501)
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.receptionistA },
          async (tx) => {
            await tx.query(
              `UPDATE public.appointments SET clinical_notes = 'Tampered' WHERE id = $1`,
              [apptId],
            );
          },
        ),
      '42501',
    );

    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.receptionistA },
          async (tx) => {
            await tx.query(
              `UPDATE public.appointments SET clinical_notes = NULL WHERE id = $1`,
              [apptId],
            );
          },
        ),
      '42501',
    );

    // receptionistA CAN update status and reschedule while leaving clinical_notes untouched
    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      async (tx) => {
        await tx.query(
          `UPDATE public.appointments
           SET status = 'confirmed',
               starts_at = '2026-11-28T11:00:00Z',
               ends_at = '2026-11-28T11:45:00Z'
           WHERE id = $1`,
          [apptId],
        );
      },
    );

    const afterRecUpdate = await db.queryAsOwner<{
      status: string;
      clinical_notes: string | null;
    }>(`SELECT status, clinical_notes FROM public.appointments WHERE id = $1`, [
      apptId,
    ]);
    expect(afterRecUpdate.rows[0]).toEqual({
      status: 'confirmed',
      clinical_notes: 'Admin clinical addendum XYZ-987',
    });

    // Verify audit_log captured clinical_notes_updated, status_changed, rescheduled with ZERO clinical text or reason
    const auditRows = await db.queryAsOwner<{
      action: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT action, metadata_json
       FROM public.audit_log
       WHERE entity_type = 'appointment' AND entity_id = $1
       ORDER BY created_at ASC`,
      [apptId],
    );
    const actions = auditRows.rows.map((r) => r.action);
    expect(actions).toContain('appointment.created');
    expect(actions).toContain('appointment.clinical_notes_updated');
    expect(actions).toContain('appointment.status_changed');
    expect(actions).toContain('appointment.rescheduled');

    const serializedAudit = JSON.stringify(auditRows.rows);
    expect(serializedAudit).not.toContain('XYZ-987');
    expect(serializedAudit).not.toContain('diagnosis');
    expect(serializedAudit).not.toContain('root canal');
    expect(serializedAudit).not.toContain('Layla');

    const notesAudit = auditRows.rows.filter(
      (r) => r.action === 'appointment.clinical_notes_updated',
    );
    expect(notesAudit.length).toBeGreaterThanOrEqual(2);
    for (const entry of notesAudit) {
      expect(entry.metadata_json).toEqual({});
    }
  });

  it('4. Enforces anti-spoofing, authoritative reminder_sent_at (B-01), PG 17 archive transition, pure archive/restore (B-03), duration checks, no DELETE, and zero-PII audit', async () => {
    // Anti-spoofing: spoofed created_at overwritten to now()
    const createdRow = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string; created_at: string }>(
          `INSERT INTO public.appointments (
             clinic_id, patient_id, dentist_id, starts_at, ends_at, created_at
           )
           VALUES (
             $1, $2, $3,
             '2026-11-29T06:00:00Z', '2026-11-29T06:30:00Z',
             '2000-01-01T00:00:00Z'
           )
           RETURNING id, created_at::text`,
          [fixtures.clinicA, fixtures.patientA1, fixtures.dentistA],
        );
        return res.rows[0]!;
      },
    );
    expect(new Date(createdRow.created_at).getUTCFullYear()).toBeGreaterThanOrEqual(
      2026,
    );

    // Non-null reminder_sent_at on INSERT rejected (42501)
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.receptionistA },
          async (tx) => {
            await tx.query(
              `INSERT INTO public.appointments (
                 clinic_id, patient_id, dentist_id, starts_at, ends_at, reminder_sent_at
               )
               VALUES ($1, $2, $3, '2026-11-29T07:00:00Z', '2026-11-29T07:30:00Z', now())`,
              [fixtures.clinicA, fixtures.patientA1, fixtures.dentistA],
            );
          },
        ),
      '42501',
    );

    // Duration < 5 min and > 12 hours rejected with 23514
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.dentistA },
          async (tx) => {
            await tx.query(
              `INSERT INTO public.appointments (clinic_id, patient_id, dentist_id, starts_at, ends_at)
               VALUES ($1, $2, $3, '2026-11-29T08:00:00Z', '2026-11-29T08:04:00Z')`,
              [fixtures.clinicA, fixtures.patientA1, fixtures.dentistA],
            );
          },
        ),
      '23514',
    );

    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.dentistA },
          async (tx) => {
            await tx.query(
              `INSERT INTO public.appointments (clinic_id, patient_id, dentist_id, starts_at, ends_at)
               VALUES ($1, $2, $3, '2026-11-29T08:00:00Z', '2026-11-29T20:01:00Z')`,
              [fixtures.clinicA, fixtures.patientA1, fixtures.dentistA],
            );
          },
        ),
      '23514',
    );

    // B-01: receptionistA marks reminder_sent_at -> normalized to server now(), ignores spoofed future date, audits appointment.reminder_sent {}
    const reminderAfter = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      async (tx) => {
        const res = await tx.query<{ reminder_sent_at: string }>(
          `UPDATE public.appointments
           SET reminder_sent_at = '2099-12-31T23:59:59Z'
           WHERE id = $1
           RETURNING reminder_sent_at::text`,
          [createdRow.id],
        );
        return res.rows[0]!.reminder_sent_at;
      },
    );
    expect(new Date(reminderAfter).getUTCFullYear()).toBeLessThan(2099);

    const reminderAudit = await db.queryAsOwner<{
      action: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT action, metadata_json
       FROM public.audit_log
       WHERE entity_id = $1 AND action = 'appointment.reminder_sent'`,
      [createdRow.id],
    );
    expect(reminderAudit.rows).toHaveLength(1);
    expect(reminderAudit.rows[0]?.metadata_json).toEqual({});

    // Clearing reminder_sent_at back to NULL rejected (42501)
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.receptionistA },
          async (tx) => {
            await tx.query(
              `UPDATE public.appointments SET reminder_sent_at = NULL WHERE id = $1`,
              [createdRow.id],
            );
          },
        ),
      '42501',
    );

    // Immutable columns (patient_id, clinic_id, created_at) rejected (42501)
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(
              `UPDATE public.appointments SET patient_id = $1 WHERE id = $2`,
              [fixtures.patientA2, createdRow.id],
            );
          },
        ),
      '42501',
    );

    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(
              `UPDATE public.appointments SET created_at = '2020-01-01T00:00:00Z' WHERE id = $1`,
              [createdRow.id],
            );
          },
        ),
      '42501',
    );

    // No-op UPDATE emits 0 new audit rows
    const auditCountBeforeNoOp = await db.queryAsOwner<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.audit_log WHERE entity_id = $1`,
      [createdRow.id],
    );
    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      async (tx) => {
        await tx.query(
          `UPDATE public.appointments SET status = status WHERE id = $1`,
          [createdRow.id],
        );
      },
    );
    const auditCountAfterNoOp = await db.queryAsOwner<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.audit_log WHERE entity_id = $1`,
      [createdRow.id],
    );
    expect(auditCountAfterNoOp.rows[0]?.count).toBe(
      auditCountBeforeNoOp.rows[0]?.count,
    );

    // Simultaneous mutation while archiving rejected (42501)
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.dentistA },
          async (tx) => {
            await tx.query(
              `UPDATE public.appointments
               SET deleted_at = now(), status = 'cancelled'
               WHERE id = $1`,
              [createdRow.id],
            );
          },
        ),
      '42501',
    );

    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.dentistA },
          async (tx) => {
            await tx.query(
              `UPDATE public.appointments
               SET deleted_at = now(), clinical_notes = 'sneaky'
               WHERE id = $1`,
              [createdRow.id],
            );
          },
        ),
      '42501',
    );

    // Direct call to begin_appointment_archive_transition outside trigger rejected (42501)
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.receptionistA },
          async (tx) => {
            await tx.query(
              `SELECT private.begin_appointment_archive_transition($1)`,
              [createdRow.id],
            );
          },
        ),
      '42501',
    );

    // Pure archive by receptionistA succeeds (passes PG 17 WCO_RLS_CONFLICT_CHECK) and immediately becomes invisible
    const visibleAfterArchive = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      async (tx) => {
        const upd = await tx.query(
          `UPDATE public.appointments SET deleted_at = now() WHERE id = $1`,
          [createdRow.id],
        );
        expect(upd.rowCount).toBe(1);

        // Spoofing GUC alone cannot reveal archived rows
        await tx.query(
          `SELECT set_config('dentalcare.archiving_appointment_active', 'on', true)`,
        );
        const sel = await tx.query(
          `SELECT id FROM public.appointments WHERE id = $1`,
          [createdRow.id],
        );
        return sel.rows.length;
      },
    );
    expect(visibleAfterArchive).toBe(0);

    // Also verify dentistA cannot see the archived row
    const dentistSeesArchived = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA },
      async (tx) => {
        const sel = await tx.query(
          `SELECT id FROM public.appointments WHERE id = $1`,
          [createdRow.id],
        );
        return sel.rows.length;
      },
    );
    expect(dentistSeesArchived).toBe(0);

    // B-03: adminA sees archived appointment; mutating another column on restore fails with 42501
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(
              `UPDATE public.appointments
               SET deleted_at = NULL, status = 'completed'
               WHERE id = $1`,
              [createdRow.id],
            );
          },
        ),
      '42501',
    );

    // Pure restore by adminA succeeds and audits appointment.restored {}
    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        const res = await tx.query(
          `UPDATE public.appointments SET deleted_at = NULL WHERE id = $1`,
          [createdRow.id],
        );
        expect(res.rowCount).toBe(1);
      },
    );

    const archiveAndRestoreAudits = await db.queryAsOwner<{
      action: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT action, metadata_json
       FROM public.audit_log
       WHERE entity_id = $1 AND action IN ('appointment.archived', 'appointment.restored')
       ORDER BY created_at ASC`,
      [createdRow.id],
    );
    expect(archiveAndRestoreAudits.rows).toEqual([
      { action: 'appointment.archived', metadata_json: {} },
      { action: 'appointment.restored', metadata_json: {} },
    ]);

    // B-03: Attempting to restore an archived appointment whose parent patient is archived
    // is filtered out by RLS USING -> rowCount === 0 and 0 new audit rows
    const archivedPatientAppt = await db.queryAsOwner<{ id: string }>(
      `INSERT INTO public.appointments (
         clinic_id, patient_id, dentist_id, starts_at, ends_at, deleted_at
       )
       VALUES (
         $1, $2, $3,
         '2026-11-29T12:00:00Z', '2026-11-29T12:30:00Z', now()
       )
       RETURNING id`,
      [fixtures.clinicA, fixtures.patientAArchived, fixtures.dentistA],
    );
    const archivedPatientApptId = archivedPatientAppt.rows[0]!.id;

    const restoreWithArchivedParent = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        const res = await tx.query(
          `UPDATE public.appointments SET deleted_at = NULL WHERE id = $1`,
          [archivedPatientApptId],
        );
        return res.rowCount;
      },
    );
    expect(restoreWithArchivedParent).toBe(0);

    const auditsForArchivedParentAppt = await db.queryAsOwner<{ id: string }>(
      `SELECT id FROM public.audit_log WHERE entity_id = $1`,
      [archivedPatientApptId],
    );
    expect(auditsForArchivedParentAppt.rows).toHaveLength(0);

    // Physical DELETE forbidden with 42501 even for adminA
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(`DELETE FROM public.appointments WHERE id = $1`, [
              createdRow.id,
            ]);
          },
        ),
      '42501',
    );
  });

  it('5. Executes the documented T-08 individual rollback in supabase/README.md cleanly in an isolated PGlite (PG 17) instance and re-applies cleanly (B-04)', async () => {
    const isolatedDb = new PGlite();
    try {
      await isolatedDb.exec(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
        END $$;
        GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text UNIQUE NOT NULL);
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
        CREATE SCHEMA IF NOT EXISTS storage;
        CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
        CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE (bucket_id, name));
        CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql AS $$ DECLARE _parts text[]; BEGIN SELECT string_to_array(name, '/') INTO _parts; RETURN _parts[1:array_length(_parts, 1) - 1]; END $$;
      `);

      for (const filename of listMigrationFiles()) {
        await isolatedDb.exec(readMigrationSql(filename));
      }

      // Extract rollback SQL block by migration filename without relying on section letters
      const readmePath = path.resolve(process.cwd(), 'supabase', 'README.md');
      const readme = readFileSync(readmePath, 'utf8');
      const sectionHeaderRegex =
        /### [A-Z]\) Revertir únicamente `202611280001_appointments_rls\.sql`[^\r\n]*/;
      const headerMatch = sectionHeaderRegex.exec(readme);
      expect(headerMatch).not.toBeNull();
      const afterHeader = readme.slice(
        headerMatch!.index + headerMatch![0].length,
      );
      const nextSectionIdx = afterHeader.search(/\r?\n### /);
      const sectionBody =
        nextSectionIdx === -1
          ? afterHeader
          : afterHeader.slice(0, nextSectionIdx);
      const sqlMatch = /```sql\r?\n([\s\S]*?)```/.exec(sectionBody);
      expect(sqlMatch?.[1]).toBeTruthy();

      await isolatedDb.exec(sqlMatch![1]!);

      const tblCheck = await isolatedDb.query<{
        appointments_tbl: string | null;
        transitions_tbl: string | null;
        patients_tbl: string | null;
        files_tbl: string | null;
        treatments_tbl: string | null;
      }>(
        `SELECT
           to_regclass('public.appointments')::text AS appointments_tbl,
           to_regclass('private.appointment_archive_transitions')::text AS transitions_tbl,
           to_regclass('public.patients')::text AS patients_tbl,
           to_regclass('public.patient_files')::text AS files_tbl,
           to_regclass('public.treatments_catalog')::text AS treatments_tbl`,
      );
      expect(tblCheck.rows[0]).toEqual({
        appointments_tbl: null,
        transitions_tbl: null,
        patients_tbl: 'patients',
        files_tbl: 'patient_files',
        treatments_tbl: 'treatments_catalog',
      });

      const constraintCheck = await isolatedDb.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
         WHERE conname IN (
           'patient_files_clinic_patient_appointment_fkey',
           'profiles_clinic_id_id_unique'
         )`,
      );
      expect(constraintCheck.rows).toHaveLength(0);

      const fnCheck = await isolatedDb.query<{ proname: string }>(
        `SELECT p.proname
         FROM pg_proc AS p
         JOIN pg_namespace AS n ON n.oid = p.pronamespace
         WHERE n.nspname = 'private'
           AND p.proname LIKE '%appointment%'`,
      );
      expect(fnCheck.rows).toHaveLength(0);

      // Re-apply T-08 migration cleanly to confirm forward recovery
      await isolatedDb.exec(
        readMigrationSql('202611280001_appointments_rls.sql'),
      );
      const afterReapply = await isolatedDb.query<{ tbl: string | null }>(
        `SELECT to_regclass('public.appointments')::text AS tbl`,
      );
      expect(afterReapply.rows[0]?.tbl).toBe('appointments');
    } finally {
      await isolatedDb.close();
    }
  });
});
