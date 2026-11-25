import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDbHarness,
  extractPgErrorCode,
  readMigrationSql,
  type ITestDbHarness,
} from './testDbHarness';

const BASE_MIGRATION_FILE = '202611250001_base_schema_rls.sql';

interface SyntheticFixtures {
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
  readonly extraUserA: string;
  readonly extraUserB: string;
}

function createSyntheticFixtures(): SyntheticFixtures {
  return {
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
    extraUserA: randomUUID(),
    extraUserB: randomUUID(),
  };
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

  expect(caught, `Expected PostgreSQL error ${expectedCode} but query succeeded`).toBeDefined();
  expect(extractPgErrorCode(caught)).toBe(expectedCode);
}

describe('T-02 Base schema, multi-clinic RLS, anti-escalation and immutable audit_log', () => {
  let db: ITestDbHarness;
  let fixtures: SyntheticFixtures;
  let migrationSql: string;

  beforeAll(async () => {
    db = await createTestDbHarness();
    fixtures = createSyntheticFixtures();
    migrationSql = readMigrationSql(BASE_MIGRATION_FILE);

    // First application of the migration
    await db.execSql(migrationSql);

    // Seed 2 synthetic clinics (100% fictional data)
    await db.queryAsOwner(
      `INSERT INTO public.clinics (id, name, currency_code, currency_symbol, tax_rate_bps, tax_label, timezone, default_locale)
       VALUES
         ($1, 'Synthetic Clinic Alpha', 'AED', 'AED', 500, 'VAT', 'Asia/Dubai', 'en'),
         ($2, 'Synthetic Clinic Beta', 'EUR', 'EUR', 2100, 'IVA', 'Europe/Madrid', 'es')`,
      [fixtures.clinicA, fixtures.clinicB],
    );

    const syntheticUsers: readonly [string, string][] = [
      [fixtures.adminA, `admin-a-${fixtures.adminA}@example.test`],
      [fixtures.dentistA, `dentist-a-${fixtures.dentistA}@example.test`],
      [fixtures.receptionistA, `receptionist-a-${fixtures.receptionistA}@example.test`],
      [fixtures.inactiveA, `inactive-a-${fixtures.inactiveA}@example.test`],
      [fixtures.deletedA, `deleted-a-${fixtures.deletedA}@example.test`],
      [fixtures.adminB, `admin-b-${fixtures.adminB}@example.test`],
      [fixtures.dentistB, `dentist-b-${fixtures.dentistB}@example.test`],
      [fixtures.receptionistB, `receptionist-b-${fixtures.receptionistB}@example.test`],
      [fixtures.extraUserA, `extra-a-${fixtures.extraUserA}@example.test`],
      [fixtures.extraUserB, `extra-b-${fixtures.extraUserB}@example.test`],
    ];

    for (const [id, email] of syntheticUsers) {
      await db.queryAsOwner(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, email]);
    }

    await db.queryAsOwner(
      `INSERT INTO public.profiles (id, clinic_id, full_name, role, preferred_locale, is_active, deleted_at)
       VALUES
         ($1, $9, 'Admin Alpha', 'admin', 'en', true, NULL),
         ($2, $9, 'Dentist Alpha', 'dentist', 'en', true, NULL),
         ($3, $9, 'Receptionist Alpha', 'receptionist', 'es', true, NULL),
         ($4, $9, 'Inactive Alpha', 'dentist', 'en', false, NULL),
         ($5, $9, 'Deleted Alpha', 'receptionist', 'en', true, now()),
         ($6, $10, 'Admin Beta', 'admin', 'es', true, NULL),
         ($7, $10, 'Dentist Beta', 'dentist', 'es', true, NULL),
         ($8, $10, 'Receptionist Beta', 'receptionist', 'en', true, NULL)`,
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

    // Seed baseline audit entries in both clinics
    await db.queryAsOwner(
      `INSERT INTO public.audit_log (clinic_id, actor_id, action, entity_type, entity_id, metadata_json)
       VALUES
         ($1, $3, 'clinic.seeded', 'clinic', $1, '{"env":"test"}'::jsonb),
         ($2, $4, 'clinic.seeded', 'clinic', $2, '{"env":"test"}'::jsonb)`,
      [fixtures.clinicA, fixtures.clinicB, fixtures.adminA, fixtures.adminB],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('1. Migration is idempotent when applied twice and activates real RLS under authenticated role', async () => {
    // Re-apply full migration on already-populated database
    await expect(db.execSql(migrationSql)).resolves.toBeUndefined();

    // Confirm RLS is enabled on all 3 tables
    const rlsStatus = await db.queryAsOwner<{ tablename: string; rowsecurity: boolean }>(
      `SELECT tablename, rowsecurity
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN ('clinics', 'profiles', 'audit_log')
       ORDER BY tablename`,
    );
    expect(rlsStatus.rows).toEqual([
      { tablename: 'audit_log', rowsecurity: true },
      { tablename: 'clinics', rowsecurity: true },
      { tablename: 'profiles', rowsecurity: true },
    ]);

    // Explicitly verify SET LOCAL ROLE authenticated switches current_user and enforces RLS
    const roleCheck = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      async (tx) => {
        const whoami = await tx.query<{ current_user: string; uid: string | null }>(
          `SELECT current_user::text AS current_user, auth.uid()::text AS uid`,
        );
        const visibleClinics = await tx.query<{ id: string }>(
          `SELECT id::text FROM public.clinics`,
        );
        return { whoami: whoami.rows[0], visibleClinics: visibleClinics.rows };
      },
    );

    expect(roleCheck.whoami).toEqual({
      current_user: 'authenticated',
      uid: fixtures.adminA,
    });
    expect(roleCheck.visibleClinics).toEqual([{ id: fixtures.clinicA }]);
  });

  it('2. Strict multi-clinic isolation: Clinic A never reads or modifies Clinic B (and vice versa)', async () => {
    const clinicAUsers = [fixtures.adminA, fixtures.dentistA, fixtures.receptionistA];
    const clinicBUsers = [fixtures.adminB, fixtures.dentistB, fixtures.receptionistB];

    for (const userId of clinicAUsers) {
      await db.runAsRole({ role: 'authenticated', userId }, async (tx) => {
        const clinics = await tx.query<{ id: string }>(`SELECT id::text FROM public.clinics`);
        expect(clinics.rows.map((r) => r.id)).toEqual([fixtures.clinicA]);

        const profiles = await tx.query<{ clinic_id: string }>(
          `SELECT clinic_id::text FROM public.profiles`,
        );
        expect(profiles.rows.length).toBeGreaterThan(0);
        expect(profiles.rows.every((r) => r.clinic_id === fixtures.clinicA)).toBe(true);

        const logs = await tx.query<{ clinic_id: string }>(
          `SELECT clinic_id::text FROM public.audit_log`,
        );
        expect(logs.rows.every((r) => r.clinic_id === fixtures.clinicA)).toBe(true);

        // Attempt cross-clinic updates -> 0 rows affected
        const updateClinicB = await tx.query(
          `UPDATE public.clinics SET name = 'Hijacked' WHERE id = $1`,
          [fixtures.clinicB],
        );
        expect(updateClinicB.rowCount).toBe(0);

        const updateProfileB = await tx.query(
          `UPDATE public.profiles SET preferred_locale = 'en' WHERE id = $1`,
          [fixtures.dentistB],
        );
        expect(updateProfileB.rowCount).toBe(0);
      });
    }

    for (const userId of clinicBUsers) {
      await db.runAsRole({ role: 'authenticated', userId }, async (tx) => {
        const clinics = await tx.query<{ id: string }>(`SELECT id::text FROM public.clinics`);
        expect(clinics.rows.map((r) => r.id)).toEqual([fixtures.clinicB]);

        const profiles = await tx.query<{ clinic_id: string }>(
          `SELECT clinic_id::text FROM public.profiles`,
        );
        expect(profiles.rows.length).toBeGreaterThan(0);
        expect(profiles.rows.every((r) => r.clinic_id === fixtures.clinicB)).toBe(true);

        const logs = await tx.query<{ clinic_id: string }>(
          `SELECT clinic_id::text FROM public.audit_log`,
        );
        expect(logs.rows.every((r) => r.clinic_id === fixtures.clinicB)).toBe(true);
      });
    }

    // Admin A cannot insert a profile or audit_log into Clinic B
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(
            `INSERT INTO public.profiles (id, clinic_id, full_name, role)
             VALUES ($1, $2, 'Intruder', 'dentist')`,
            [fixtures.extraUserB, fixtures.clinicB],
          ),
        ),
      '42501',
    );
  });

  it('3. Clinics permissions and immutability: admin updates config, blocks id/created_at/deleted_at; non-admin read-only', async () => {
    // Admin updates name, currency and tax rate on own clinic
    const updated = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      async (tx) => {
        const res = await tx.query<{
          name: string;
          currency_code: string;
          tax_rate_bps: number;
          tax_label: string;
        }>(
          `UPDATE public.clinics
           SET name = 'Synthetic Clinic Alpha Updated',
               currency_code = 'USD',
               currency_symbol = '$',
               tax_rate_bps = 0,
               tax_label = 'Tax'
           WHERE id = $1
           RETURNING name, currency_code, tax_rate_bps, tax_label`,
          [fixtures.clinicA],
        );
        return res.rows[0];
      },
    );

    expect(updated).toEqual({
      name: 'Synthetic Clinic Alpha Updated',
      currency_code: 'USD',
      tax_rate_bps: 0,
      tax_label: 'Tax',
    });

    // Admin fails (42501) changing id, created_at, or setting deleted_at
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(`UPDATE public.clinics SET id = $1 WHERE id = $2`, [
            randomUUID(),
            fixtures.clinicA,
          ]),
        ),
      '42501',
    );

    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(
            `UPDATE public.clinics SET created_at = '2020-01-01T00:00:00Z' WHERE id = $1`,
            [fixtures.clinicA],
          ),
        ),
      '42501',
    );

    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(`UPDATE public.clinics SET deleted_at = now() WHERE id = $1`, [
            fixtures.clinicA,
          ]),
        ),
      '42501',
    );

    // Physical DELETE denied for admin and non-admin
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(`DELETE FROM public.clinics WHERE id = $1`, [fixtures.clinicA]),
        ),
      '42501',
    );

    // Dentist and receptionist can read own clinic, cannot update (0 rows) or delete (42501)
    for (const nonAdminId of [fixtures.dentistA, fixtures.receptionistA]) {
      await db.runAsRole({ role: 'authenticated', userId: nonAdminId }, async (tx) => {
        const readRes = await tx.query<{ id: string }>(`SELECT id::text FROM public.clinics`);
        expect(readRes.rows).toEqual([{ id: fixtures.clinicA }]);

        const updateRes = await tx.query(
          `UPDATE public.clinics SET name = 'Unauthorized Edit' WHERE id = $1`,
          [fixtures.clinicA],
        );
        expect(updateRes.rowCount).toBe(0);
      });

      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId: nonAdminId }, (tx) =>
            tx.query(`DELETE FROM public.clinics WHERE id = $1`, [fixtures.clinicA]),
          ),
        '42501',
      );
    }
  });

  it('4. Profiles anti-escalation and soft-delete with RETURNING for admin', async () => {
    // Dentist can update own preferred_locale
    const localeUpdated = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA },
      async (tx) => {
        const res = await tx.query<{ preferred_locale: string }>(
          `UPDATE public.profiles
           SET preferred_locale = 'es'
           WHERE id = $1
           RETURNING preferred_locale`,
          [fixtures.dentistA],
        );
        return res.rows[0];
      },
    );
    expect(localeUpdated).toEqual({ preferred_locale: 'es' });

    // Dentist fails (42501) attempting privilege escalation or unauthorized column changes
    const forbiddenDentistUpdates: readonly { label: string; sql: string; params: unknown[] }[] = [
      {
        label: 'role escalation to admin',
        sql: `UPDATE public.profiles SET role = 'admin' WHERE id = $1`,
        params: [fixtures.dentistA],
      },
      {
        label: 'clinic_id move',
        sql: `UPDATE public.profiles SET clinic_id = $2 WHERE id = $1`,
        params: [fixtures.dentistA, fixtures.clinicB],
      },
      {
        label: 'full_name change',
        sql: `UPDATE public.profiles SET full_name = 'Fake Name' WHERE id = $1`,
        params: [fixtures.dentistA],
      },
      {
        label: 'is_active change',
        sql: `UPDATE public.profiles SET is_active = false WHERE id = $1`,
        params: [fixtures.dentistA],
      },
      {
        label: 'deleted_at change',
        sql: `UPDATE public.profiles SET deleted_at = now() WHERE id = $1`,
        params: [fixtures.dentistA],
      },
      {
        label: 'created_at change',
        sql: `UPDATE public.profiles SET created_at = '2020-01-01T00:00:00Z' WHERE id = $1`,
        params: [fixtures.dentistA],
      },
      {
        label: 'id change',
        sql: `UPDATE public.profiles SET id = $2 WHERE id = $1`,
        params: [fixtures.dentistA, fixtures.extraUserA],
      },
    ];

    for (const attempt of forbiddenDentistUpdates) {
      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId: fixtures.dentistA }, (tx) =>
            tx.query(attempt.sql, attempt.params),
          ),
        '42501',
      );
    }

    // Dentist cannot edit a teammate's profile (0 rows affected)
    const editTeammate = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA },
      (tx) =>
        tx.query(
          `UPDATE public.profiles SET preferred_locale = 'en' WHERE id = $1`,
          [fixtures.receptionistA],
        ),
    );
    expect(editTeammate.rowCount).toBe(0);

    // Admin can insert a new profile in own clinic, edit it, and soft-delete it with RETURNING *
    const archivedRow = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        await tx.query(
          `INSERT INTO public.profiles (id, clinic_id, full_name, role, preferred_locale)
           VALUES ($1, $2, 'Temp Dentist Alpha', 'dentist', 'en')`,
          [fixtures.extraUserA, fixtures.clinicA],
        );

        const res = await tx.query<{ id: string; deleted_at: string | null }>(
          `UPDATE public.profiles
           SET full_name = 'Archived Dentist Alpha', deleted_at = now()
           WHERE id = $1
           RETURNING id::text, deleted_at::text`,
          [fixtures.extraUserA],
        );
        return res.rows[0];
      },
    );

    expect(archivedRow?.id).toBe(fixtures.extraUserA);
    expect(archivedRow?.deleted_at).not.toBeNull();

    // Receptionist cannot see the soft-deleted profile, while admin still can
    const receptionistVisible = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA },
      (tx) =>
        tx.query<{ id: string }>(`SELECT id::text FROM public.profiles WHERE id = $1`, [
          fixtures.extraUserA,
        ]),
    );
    expect(receptionistVisible.rows).toHaveLength(0);

    const adminVisible = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query<{ id: string }>(`SELECT id::text FROM public.profiles WHERE id = $1`, [
          fixtures.extraUserA,
        ]),
    );
    expect(adminVisible.rows).toHaveLength(1);

    // Admin cannot self-deactivate, self-delete, change own role, move clinic, or physically DELETE
    const forbiddenAdminOps: readonly { sql: string; params: unknown[] }[] = [
      {
        sql: `UPDATE public.profiles SET is_active = false WHERE id = $1`,
        params: [fixtures.adminA],
      },
      {
        sql: `UPDATE public.profiles SET deleted_at = now() WHERE id = $1`,
        params: [fixtures.adminA],
      },
      {
        sql: `UPDATE public.profiles SET role = 'dentist' WHERE id = $1`,
        params: [fixtures.adminA],
      },
      {
        sql: `UPDATE public.profiles SET clinic_id = $2 WHERE id = $1`,
        params: [fixtures.dentistA, fixtures.clinicB],
      },
      {
        sql: `DELETE FROM public.profiles WHERE id = $1`,
        params: [fixtures.dentistA],
      },
    ];

    for (const op of forbiddenAdminOps) {
      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
            tx.query(op.sql, op.params),
          ),
        '42501',
      );
    }
  });

  it('5. Inactive or soft-deleted users see 0 rows and cannot insert into audit_log', async () => {
    for (const blockedUserId of [fixtures.inactiveA, fixtures.deletedA]) {
      await db.runAsRole({ role: 'authenticated', userId: blockedUserId }, async (tx) => {
        const clinics = await tx.query(`SELECT id FROM public.clinics`);
        const profiles = await tx.query(`SELECT id FROM public.profiles`);
        const logs = await tx.query(`SELECT id FROM public.audit_log`);

        expect(clinics.rows).toHaveLength(0);
        expect(profiles.rows).toHaveLength(0);
        expect(logs.rows).toHaveLength(0);
      });

      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId: blockedUserId }, (tx) =>
            tx.query(
              `INSERT INTO public.audit_log (clinic_id, actor_id, action, entity_type)
               VALUES ($1, $2, 'blocked.attempt', 'profile')`,
              [fixtures.clinicA, blockedUserId],
            ),
          ),
        '42501',
      );
    }
  });

  it('6. Role anon receives permission error (42501) on clinics, profiles, and audit_log', async () => {
    for (const table of ['public.clinics', 'public.profiles', 'public.audit_log']) {
      await expectPgError(
        () =>
          db.runAsRole({ role: 'anon', userId: null }, (tx) =>
            tx.query(`SELECT * FROM ${table}`),
          ),
        '42501',
      );
    }
  });

  it('7. audit_log permissions, server-enforced timestamp, and strict immutability (UPDATE/DELETE/TRUNCATE)', async () => {
    // Active non-admin member inserts into own clinic with own actor_id; spoofed created_at is overridden
    const fakeTimestamp = '2020-01-01T00:00:00.000Z';
    const beforeInsertMs = Date.now() - 10_000;

    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      async (tx) => {
        await tx.query(
          `INSERT INTO public.audit_log (clinic_id, actor_id, action, entity_type, entity_id, metadata_json, created_at)
           VALUES ($1, $2, 'dentist.check', 'clinic', $1, '{"source":"test"}'::jsonb, $3::timestamptz)`,
          [fixtures.clinicA, fixtures.dentistA, fakeTimestamp],
        );

        // Non-admin reads 0 rows from audit_log
        const dentistRead = await tx.query(`SELECT id FROM public.audit_log`);
        expect(dentistRead.rows).toHaveLength(0);
      },
    );

    // Receptionist also reads 0 rows from audit_log
    await db.runAsRole({ role: 'authenticated', userId: fixtures.receptionistA }, async (tx) => {
      const receptionistRead = await tx.query(`SELECT id FROM public.audit_log`);
      expect(receptionistRead.rows).toHaveLength(0);
    });

    // Admin reads the audit log entry for own clinic and confirms created_at was forced to server now()
    const adminRead = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query<{ action: string; actor_id: string; created_at: string }>(
          `SELECT action, actor_id::text, created_at::text
           FROM public.audit_log
           WHERE action = 'dentist.check'`,
        ),
    );
    expect(adminRead.rows).toHaveLength(1);
    const createdAtMs = new Date(adminRead.rows[0]!.created_at).getTime();
    expect(createdAtMs).toBeGreaterThan(beforeInsertMs);
    expect(new Date(adminRead.rows[0]!.created_at).getUTCFullYear()).toBeGreaterThan(2020);

    // Insert fails (42501) when actor_id != auth.uid() or clinic_id belongs to another clinic
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.dentistA }, (tx) =>
          tx.query(
            `INSERT INTO public.audit_log (clinic_id, actor_id, action, entity_type)
             VALUES ($1, $2, 'spoof.actor', 'clinic')`,
            [fixtures.clinicA, fixtures.adminA],
          ),
        ),
      '42501',
    );

    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.dentistA }, (tx) =>
          tx.query(
            `INSERT INTO public.audit_log (clinic_id, actor_id, action, entity_type)
             VALUES ($1, $2, 'spoof.clinic', 'clinic')`,
            [fixtures.clinicB, fixtures.dentistA],
          ),
        ),
      '42501',
    );

    // UPDATE, DELETE, and TRUNCATE fail (42501) as authenticated
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(`UPDATE public.audit_log SET action = 'tampered'`),
        ),
      '42501',
    );

    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(`DELETE FROM public.audit_log`),
        ),
      '42501',
    );

    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(`TRUNCATE TABLE public.audit_log`),
        ),
      '42501',
    );

    // UPDATE, DELETE, and TRUNCATE ALSO fail (42501) as table owner / superuser
    await expectPgError(
      () => db.queryAsOwner(`UPDATE public.audit_log SET action = 'owner_tampered'`),
      '42501',
    );

    await expectPgError(
      () => db.queryAsOwner(`DELETE FROM public.audit_log`),
      '42501',
    );

    await expectPgError(
      () => db.queryAsOwner(`TRUNCATE TABLE public.audit_log`),
      '42501',
    );
  });
});
