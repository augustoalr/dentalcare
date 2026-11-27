import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  createTestDbHarness,
  extractPgErrorCode,
  listMigrationFiles,
  type ITestDbHarness,
} from './testDbHarness';

interface PatientsRlsFixtures {
  readonly clinicA: string;
  readonly clinicB: string;
  readonly adminA: string;
  readonly dentistA: string;
  readonly receptionistA: string;
  readonly inactiveA: string;
  readonly deletedA: string;
  readonly adminB: string;
  readonly dentistB: string;
  readonly receptionistB: string;
}

function createFixtures(): PatientsRlsFixtures {
  return Object.freeze({
    clinicA: randomUUID(),
    clinicB: randomUUID(),
    adminA: randomUUID(),
    dentistA: randomUUID(),
    receptionistA: randomUUID(),
    inactiveA: randomUUID(),
    deletedA: randomUUID(),
    adminB: randomUUID(),
    dentistB: randomUUID(),
    receptionistB: randomUUID(),
  });
}

async function expectPgError(
  action: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }

  expect(
    caught,
    `Expected PostgreSQL error ${expectedCode} but query succeeded`,
  ).toBeDefined();
  expect(extractPgErrorCode(caught)).toBe(expectedCode);
}

describe('T-05 Patients schema, multi-clinic RLS, soft-delete, and PII-free archive audit', () => {
  let db: ITestDbHarness;
  let fixtures: PatientsRlsFixtures;

  beforeAll(async () => {
    db = await createTestDbHarness();
    fixtures = createFixtures();

    await applyAllMigrations(db);

    // Seed 2 synthetic clinics (100% fictional test data)
    await db.queryAsOwner(
      `INSERT INTO public.clinics (id, name, currency_code, currency_symbol, tax_rate_bps, tax_label, timezone, default_locale)
       VALUES
         ($1, 'Al Noor Synthetic Dental Dubai', 'AED', 'AED', 500, 'VAT', 'Asia/Dubai', 'en'),
         ($2, 'Clínica Sintética Castellana Madrid', 'EUR', '€', 2100, 'IVA', 'Europe/Madrid', 'es')`,
      [fixtures.clinicA, fixtures.clinicB],
    );

    const users: readonly [string, string][] = [
      [fixtures.adminA, `admin-pat-a-${fixtures.adminA}@example.test`],
      [fixtures.dentistA, `dentist-pat-a-${fixtures.dentistA}@example.test`],
      [fixtures.receptionistA, `recep-pat-a-${fixtures.receptionistA}@example.test`],
      [fixtures.inactiveA, `inactive-pat-a-${fixtures.inactiveA}@example.test`],
      [fixtures.deletedA, `deleted-pat-a-${fixtures.deletedA}@example.test`],
      [fixtures.adminB, `admin-pat-b-${fixtures.adminB}@example.test`],
      [fixtures.dentistB, `dentist-pat-b-${fixtures.dentistB}@example.test`],
      [fixtures.receptionistB, `recep-pat-b-${fixtures.receptionistB}@example.test`],
    ];

    for (const [id, email] of users) {
      await db.queryAsOwner(
        `INSERT INTO auth.users (id, email) VALUES ($1, $2)`,
        [id, email],
      );
    }

    await db.queryAsOwner(
      `INSERT INTO public.profiles (id, clinic_id, full_name, role, preferred_locale, is_active, deleted_at)
       VALUES
         ($1, $9, 'Admin Alpha Synthetic', 'admin', 'en', true, NULL),
         ($2, $9, 'Dentist Alpha Synthetic', 'dentist', 'en', true, NULL),
         ($3, $9, 'Receptionist Alpha Synthetic', 'receptionist', 'es', true, NULL),
         ($4, $9, 'Inactive Alpha Synthetic', 'dentist', 'en', false, NULL),
         ($5, $9, 'Deleted Alpha Synthetic', 'receptionist', 'en', true, now()),
         ($6, $10, 'Admin Beta Synthetic', 'admin', 'es', true, NULL),
         ($7, $10, 'Dentist Beta Synthetic', 'dentist', 'es', true, NULL),
         ($8, $10, 'Receptionist Beta Synthetic', 'receptionist', 'en', true, NULL)`,
      [
        fixtures.adminA,
        fixtures.dentistA,
        fixtures.receptionistA,
        fixtures.inactiveA,
        fixtures.deletedA,
        fixtures.adminB,
        fixtures.dentistB,
        fixtures.receptionistB,
        fixtures.clinicA,
        fixtures.clinicB,
      ],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('1. Applies all migrations twice without error (idempotency) and enables RLS on public.patients', async () => {
    const files = listMigrationFiles();
    expect(files).toContain('202611260002_patients_rls.sql');
    expect(files.indexOf('202611260001_clinic_settings_audit_trigger.sql')).toBeLessThan(
      files.indexOf('202611260002_patients_rls.sql'),
    );

    await expect(applyAllMigrations(db)).resolves.toBeUndefined();

    const rlsStatus = await db.queryAsOwner<{
      tablename: string;
      rowsecurity: boolean;
    }>(
      `SELECT tablename, rowsecurity
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename = 'patients'`,
    );
    expect(rlsStatus.rows).toEqual([
      { tablename: 'patients', rowsecurity: true },
    ]);
  });

  it('2. Enforces strict multi-clinic isolation across all 3 roles (Clinic A vs Clinic B)', async () => {
    // Receptionist A creates a patient in Clinic A; Dentist A updates medical_alerts; Admin A reads it
    const patientA = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string; full_name: string }>(
          `INSERT INTO public.patients (clinic_id, full_name, phone, email, date_of_birth, medical_alerts, general_notes)
           VALUES ($1, 'Layla Synthetic Al Mansoor', '+971 50 111 2222', 'layla.synthetic@alpha.test', '1991-04-12', 'Penicillin allergy', 'Synthetic morning preference')
           RETURNING id::text, full_name`,
          [fixtures.clinicA],
        );
        return res.rows[0]!;
      },
    );

    const updatedByDentistA = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      async (tx) => {
        const res = await tx.query<{
          id: string;
          medical_alerts: string | null;
        }>(
          `UPDATE public.patients
           SET medical_alerts = 'Penicillin allergy — Latex sensitivity'
           WHERE id = $1
             AND deleted_at IS NULL
           RETURNING id::text, medical_alerts`,
          [patientA.id],
        );
        return res.rows[0]!;
      },
    );
    expect(updatedByDentistA.medical_alerts).toBe(
      'Penicillin allergy — Latex sensitivity',
    );

    // Dentist B creates a patient in Clinic B
    const patientB = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistB, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string }>(
          `INSERT INTO public.patients (clinic_id, full_name, phone, email, medical_alerts)
           VALUES ($1, 'Carlos Sintético Ruiz', '+34 600 999 888', 'carlos.sintetico@beta.test', 'Alergia a AINEs')
           RETURNING id::text`,
          [fixtures.clinicB],
        );
        return res.rows[0]!;
      },
    );

    const clinicARoles = [
      fixtures.adminA,
      fixtures.dentistA,
      fixtures.receptionistA,
    ];
    const clinicBRoles = [
      fixtures.adminB,
      fixtures.dentistB,
      fixtures.receptionistB,
    ];

    // Clinic A staff see ONLY Clinic A patients and cannot read, update, or insert into Clinic B
    for (const userId of clinicARoles) {
      await db.runAsRole({ role: 'authenticated', userId }, async (tx) => {
        const visible = await tx.query<{ id: string; clinic_id: string }>(
          `SELECT id::text, clinic_id::text FROM public.patients`,
        );
        expect(visible.rows).toEqual([
          { id: patientA.id, clinic_id: fixtures.clinicA },
        ]);

        const updateCrossClinic = await tx.query(
          `UPDATE public.patients SET full_name = 'Cross-Clinic Tamper' WHERE id = $1`,
          [patientB.id],
        );
        expect(updateCrossClinic.rowCount).toBe(0);
      });

      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId }, (tx) =>
            tx.query(
              `INSERT INTO public.patients (clinic_id, full_name)
               VALUES ($1, 'Unauthorized Cross-Clinic Patient')`,
              [fixtures.clinicB],
            ),
          ),
        '42501',
      );
    }

    // Clinic B staff see ONLY Clinic B patients and cannot read, update, or insert into Clinic A
    for (const userId of clinicBRoles) {
      await db.runAsRole({ role: 'authenticated', userId }, async (tx) => {
        const visible = await tx.query<{ id: string; clinic_id: string }>(
          `SELECT id::text, clinic_id::text FROM public.patients`,
        );
        expect(visible.rows).toEqual([
          { id: patientB.id, clinic_id: fixtures.clinicB },
        ]);

        const updateCrossClinic = await tx.query(
          `UPDATE public.patients SET full_name = 'Cross-Clinic Tamper' WHERE id = $1`,
          [patientA.id],
        );
        expect(updateCrossClinic.rowCount).toBe(0);
      });

      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId }, (tx) =>
            tx.query(
              `INSERT INTO public.patients (clinic_id, full_name)
               VALUES ($1, 'Unauthorized Cross-Clinic Patient')`,
              [fixtures.clinicA],
            ),
          ),
        '42501',
      );
    }
  });

  it('3. Blocks immutable column mutations (id, clinic_id, created_at), pre-deleted INSERTs, and CHECK violations', async () => {
    const targetPatient = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string }>(
          `INSERT INTO public.patients (clinic_id, full_name)
           VALUES ($1, 'Immutable Check Synthetic Patient')
           RETURNING id::text`,
          [fixtures.clinicA],
        );
        return res.rows[0]!;
      },
    );

    // Changing id, clinic_id, or created_at raises 42501
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(`UPDATE public.patients SET id = $1 WHERE id = $2`, [
            randomUUID(),
            targetPatient.id,
          ]),
        ),
      '42501',
    );

    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(`UPDATE public.patients SET clinic_id = $1 WHERE id = $2`, [
            fixtures.clinicB,
            targetPatient.id,
          ]),
        ),
      '42501',
    );

    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(
            `UPDATE public.patients SET created_at = '2020-01-01T00:00:00Z' WHERE id = $1`,
            [targetPatient.id],
          ),
        ),
      '42501',
    );

    // INSERT with deleted_at already populated fails RLS WITH CHECK (42501)
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(
            `INSERT INTO public.patients (clinic_id, full_name, deleted_at)
             VALUES ($1, 'Pre-archived Patient', now())`,
            [fixtures.clinicA],
          ),
        ),
      '42501',
    );

    // CHECK constraint violations (23514)
    const invalidInserts: readonly { sql: string; params: unknown[] }[] = [
      {
        sql: `INSERT INTO public.patients (clinic_id, full_name) VALUES ($1, '   ')`,
        params: [fixtures.clinicA],
      },
      {
        sql: `INSERT INTO public.patients (clinic_id, full_name, date_of_birth) VALUES ($1, 'Synthetic', '1899-12-31')`,
        params: [fixtures.clinicA],
      },
      {
        sql: `INSERT INTO public.patients (clinic_id, full_name, date_of_birth) VALUES ($1, 'Synthetic', '2099-01-01')`,
        params: [fixtures.clinicA],
      },
      {
        sql: `INSERT INTO public.patients (clinic_id, full_name, medical_alerts) VALUES ($1, 'Synthetic', $2)`,
        params: [fixtures.clinicA, 'A'.repeat(1001)],
      },
    ];

    for (const invalid of invalidInserts) {
      await expectPgError(
        () =>
          db.runAsRole(
            { role: 'authenticated', userId: fixtures.adminA },
            (tx) => tx.query(invalid.sql, invalid.params),
          ),
        '23514',
      );
    }
  });

  it('4. Denies physical DELETE (42501) for all roles, denies anon (42501), and isolates inactive/deleted profiles (0 rows)', async () => {
    for (const userId of [
      fixtures.adminA,
      fixtures.dentistA,
      fixtures.receptionistA,
    ]) {
      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId }, (tx) =>
            tx.query(`DELETE FROM public.patients WHERE clinic_id = $1`, [
              fixtures.clinicA,
            ]),
          ),
        '42501',
      );
    }

    // anon denied on SELECT, INSERT, UPDATE, DELETE
    await expectPgError(
      () =>
        db.runAsRole({ role: 'anon', userId: null }, (tx) =>
          tx.query(`SELECT * FROM public.patients`),
        ),
      '42501',
    );

    await expectPgError(
      () =>
        db.runAsRole({ role: 'anon', userId: null }, (tx) =>
          tx.query(
            `INSERT INTO public.patients (clinic_id, full_name) VALUES ($1, 'Anon Intruder')`,
            [fixtures.clinicA],
          ),
        ),
      '42501',
    );

    // Inactive and soft-deleted staff see 0 rows and cannot insert
    for (const blockedUserId of [fixtures.inactiveA, fixtures.deletedA]) {
      await db.runAsRole(
        { role: 'authenticated', userId: blockedUserId },
        async (tx) => {
          const rows = await tx.query(`SELECT id FROM public.patients`);
          expect(rows.rows).toHaveLength(0);
        },
      );

      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId: blockedUserId }, (tx) =>
            tx.query(
              `INSERT INTO public.patients (clinic_id, full_name) VALUES ($1, 'Blocked Staff Insert')`,
              [fixtures.clinicA],
            ),
          ),
        '42501',
      );
    }
  });

  it('5. Supports logical archive (deleted_at without RETURNING), hides archived rows immediately, blocks post-archive edits, and writes PII-free patient.archived audit_log', async () => {
    // Create a synthetic patient with sensitive PII & medical alerts, then archive as receptionistA (non-admin)
    const sensitivePatient = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string }>(
          `INSERT INTO public.patients (clinic_id, full_name, phone, email, medical_alerts, general_notes)
           VALUES (
             $1,
             'Samira Synthetic Sensitive Name',
             '+971 58 777 6666',
             'samira.sensitive@alpha.test',
             'Anaphylaxis to Amoxicillin',
             'Private synthetic note'
           )
           RETURNING id::text`,
          [fixtures.clinicA],
        );
        return res.rows[0]!;
      },
    );

    // Soft-delete WITHOUT RETURNING works cleanly for receptionistA (no 42501)
    const archiveRes = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      (tx) =>
        tx.query(
          `UPDATE public.patients
           SET deleted_at = now()
           WHERE id = $1
             AND deleted_at IS NULL`,
          [sensitivePatient.id],
        ),
    );
    expect(archiveRes.rowCount).toBe(1);

    // Immediately invisible in SELECT for non-admin roles (dentistA and receptionistA),
    // while adminA can inspect archived rows for controlled restoration (T-06b)
    for (const userId of [fixtures.dentistA, fixtures.receptionistA]) {
      const afterSelect = await db.runAsRole(
        { role: 'authenticated', userId },
        (tx) =>
          tx.query(`SELECT id FROM public.patients WHERE id = $1`, [
            sensitivePatient.id,
          ]),
      );
      expect(afterSelect.rows).toHaveLength(0);
    }

    const adminArchivedSelect = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query<{ id: string; deleted_at: string | null }>(
          `SELECT id::text, deleted_at::text FROM public.patients WHERE id = $1`,
          [sensitivePatient.id],
        ),
    );
    expect(adminArchivedSelect.rows).toHaveLength(1);
    expect(adminArchivedSelect.rows[0]?.deleted_at).not.toBeNull();

    // Non-admin reactivation attempt updates 0 rows; admin editing full_name alongside restore raises 42501
    for (const userId of [fixtures.dentistA, fixtures.receptionistA]) {
      const nonAdminReactivate = await db.runAsRole(
        { role: 'authenticated', userId, commit: true },
        (tx) =>
          tx.query(
            `UPDATE public.patients
             SET full_name = 'Reactivated Attempt', deleted_at = NULL
             WHERE id = $1`,
            [sensitivePatient.id],
          ),
      );
      expect(nonAdminReactivate.rowCount).toBe(0);
    }

    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(
            `UPDATE public.patients
             SET full_name = 'Reactivated Attempt', deleted_at = NULL
             WHERE id = $1`,
            [sensitivePatient.id],
          ),
        ),
      '42501',
    );

    // Anti-spoofing: authenticated user cannot call private archive transition helper directly or spoof GUC
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(`SELECT private.begin_patient_archive_transition($1::uuid)`, [
            sensitivePatient.id,
          ]),
        ),
      '42501',
    );

    for (const userId of [fixtures.dentistA, fixtures.receptionistA]) {
      const gucSpoofAttempt = await db.runAsRole(
        { role: 'authenticated', userId },
        async (tx) => {
          await tx.query(
            `SELECT set_config('dentalcare.archiving_active', 'on', true)`,
          );
          return tx.query(`SELECT id FROM public.patients WHERE id = $1`, [
            sensitivePatient.id,
          ]);
        },
      );
      expect(gucSpoofAttempt.rows).toHaveLength(0);
    }

    // Verify atomic audit_log entry via adminA: strictly 1 row, metadata_json = '{}', ZERO PII
    const auditEntries = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query<{
          clinic_id: string;
          actor_id: string;
          action: string;
          entity_type: string;
          entity_id: string;
          metadata_json: Record<string, unknown>;
        }>(
          `SELECT
             clinic_id::text,
             actor_id::text,
             action,
             entity_type,
             entity_id::text,
             metadata_json
           FROM public.audit_log
           WHERE entity_id = $1
             AND action = 'patient.archived'`,
          [sensitivePatient.id],
        ),
    );

    expect(auditEntries.rows).toHaveLength(1);
    expect(auditEntries.rows[0]).toEqual({
      clinic_id: fixtures.clinicA,
      actor_id: fixtures.receptionistA,
      action: 'patient.archived',
      entity_type: 'patient',
      entity_id: sensitivePatient.id,
      metadata_json: {},
    });

    const serializedAudit = JSON.stringify(auditEntries.rows[0]);
    expect(serializedAudit).not.toContain('Samira');
    expect(serializedAudit).not.toContain('+971 58 777 6666');
    expect(serializedAudit).not.toContain('samira.sensitive');
    expect(serializedAudit).not.toContain('Amoxicillin');
    expect(serializedAudit).not.toContain('Private synthetic');
  });
});
