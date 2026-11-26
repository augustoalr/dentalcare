import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  createTestDbHarness,
  extractPgErrorCode,
  listMigrationFiles,
  type ITestDbHarness,
} from './testDbHarness';

interface ClinicSettingsFixtures {
  readonly clinicA: string;
  readonly clinicB: string;
  readonly adminA: string;
  readonly dentistA: string;
  readonly receptionistA: string;
  readonly adminB: string;
}

function createFixtures(): ClinicSettingsFixtures {
  return Object.freeze({
    clinicA: randomUUID(),
    clinicB: randomUUID(),
    adminA: randomUUID(),
    dentistA: randomUUID(),
    receptionistA: randomUUID(),
    adminB: randomUUID(),
  });
}

describe('T-04 Clinic multi-country settings RLS and atomic audit_log trigger', () => {
  let db: ITestDbHarness;
  let fixtures: ClinicSettingsFixtures;

  beforeAll(async () => {
    db = await createTestDbHarness();
    fixtures = createFixtures();

    await applyAllMigrations(db);

    await db.queryAsOwner(
      `INSERT INTO public.clinics (id, name, currency_code, currency_symbol, tax_rate_bps, tax_label, timezone, default_locale)
       VALUES
         ($1, 'Al Noor Synthetic Clinic Dubai', 'AED', 'AED', 500, 'VAT', 'Asia/Dubai', 'en'),
         ($2, 'Clínica Sintética Retiro Madrid', 'EUR', '€', 2100, 'IVA', 'Europe/Madrid', 'es')`,
      [fixtures.clinicA, fixtures.clinicB],
    );

    const users: readonly [string, string][] = [
      [fixtures.adminA, `admin-settings-a-${fixtures.adminA}@example.test`],
      [fixtures.dentistA, `dentist-settings-a-${fixtures.dentistA}@example.test`],
      [fixtures.receptionistA, `receptionist-settings-a-${fixtures.receptionistA}@example.test`],
      [fixtures.adminB, `admin-settings-b-${fixtures.adminB}@example.test`],
    ];

    for (const [id, email] of users) {
      await db.queryAsOwner(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, email]);
    }

    await db.queryAsOwner(
      `INSERT INTO public.profiles (id, clinic_id, full_name, role, preferred_locale, is_active, deleted_at)
       VALUES
         ($1, $5, 'Admin Alpha Synthetic', 'admin', 'en', true, NULL),
         ($2, $5, 'Dentist Alpha Synthetic', 'dentist', 'en', true, NULL),
         ($3, $5, 'Receptionist Alpha Synthetic', 'receptionist', 'es', true, NULL),
         ($4, $6, 'Admin Beta Synthetic', 'admin', 'es', true, NULL)`,
      [
        fixtures.adminA,
        fixtures.dentistA,
        fixtures.receptionistA,
        fixtures.adminB,
        fixtures.clinicA,
        fixtures.clinicB,
      ],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('1. Applies all migrations (202611250001 + 202611260001) twice in order without errors (idempotency)', async () => {
    const files = listMigrationFiles();
    expect(files).toContain('202611250001_base_schema_rls.sql');
    expect(files).toContain('202611260001_clinic_settings_audit_trigger.sql');
    expect(files.indexOf('202611250001_base_schema_rls.sql')).toBeLessThan(
      files.indexOf('202611260001_clinic_settings_audit_trigger.sql'),
    );

    await expect(applyAllMigrations(db)).resolves.toBeUndefined();
  });

  it('2. Atomically inserts an immutable audit_log entry with before/after metadata when Clinic A admin updates settings; Clinic B admin cannot read it', async () => {
    const updatedClinic = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        const res = await tx.query<{
          id: string;
          name: string;
          currency_code: string;
          currency_symbol: string;
          tax_rate_bps: number;
          tax_label: string;
          timezone: string;
          default_locale: string;
        }>(
          `UPDATE public.clinics
           SET name = 'Al Noor Synthetic Clinic Iberia',
               currency_code = 'EUR',
               currency_symbol = '€',
               tax_rate_bps = 2100,
               tax_label = 'IVA',
               timezone = 'Europe/Madrid',
               default_locale = 'es'
           WHERE id = $1
             AND deleted_at IS NULL
           RETURNING id::text, name, currency_code, currency_symbol, tax_rate_bps, tax_label, timezone, default_locale`,
          [fixtures.clinicA],
        );
        return res.rows[0];
      },
    );

    expect(updatedClinic).toEqual({
      id: fixtures.clinicA,
      name: 'Al Noor Synthetic Clinic Iberia',
      currency_code: 'EUR',
      currency_symbol: '€',
      tax_rate_bps: 2100,
      tax_label: 'IVA',
      timezone: 'Europe/Madrid',
      default_locale: 'es',
    });

    const auditRowsA = await db.runAsRole(
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
           WHERE clinic_id = $1
             AND action = 'clinic.settings_updated'`,
          [fixtures.clinicA],
        ),
    );

    expect(auditRowsA.rows).toHaveLength(1);
    expect(auditRowsA.rows[0]).toEqual({
      clinic_id: fixtures.clinicA,
      actor_id: fixtures.adminA,
      action: 'clinic.settings_updated',
      entity_type: 'clinic',
      entity_id: fixtures.clinicA,
      metadata_json: {
        before: {
          name: 'Al Noor Synthetic Clinic Dubai',
          currency_code: 'AED',
          currency_symbol: 'AED',
          tax_rate_bps: 500,
          tax_label: 'VAT',
          timezone: 'Asia/Dubai',
          default_locale: 'en',
        },
        after: {
          name: 'Al Noor Synthetic Clinic Iberia',
          currency_code: 'EUR',
          currency_symbol: '€',
          tax_rate_bps: 2100,
          tax_label: 'IVA',
          timezone: 'Europe/Madrid',
          default_locale: 'es',
        },
      },
    });

    // Cross-clinic isolation: Admin B cannot read Clinic A's audit entry
    const auditRowsVisibleToB = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminB },
      (tx) =>
        tx.query(
          `SELECT id FROM public.audit_log WHERE entity_id = $1 OR clinic_id = $1`,
          [fixtures.clinicA],
        ),
    );
    expect(auditRowsVisibleToB.rows).toHaveLength(0);
  });

  it('3. Does NOT insert duplicate audit_log rows when UPDATE submits identical values across all 7 configurable columns', async () => {
    const beforeCount = await db.queryAsOwner<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM public.audit_log
       WHERE clinic_id = $1
         AND action = 'clinic.settings_updated'`,
      [fixtures.clinicA],
    );

    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      (tx) =>
        tx.query(
          `UPDATE public.clinics
           SET name = 'Al Noor Synthetic Clinic Iberia',
               currency_code = 'EUR',
               currency_symbol = '€',
               tax_rate_bps = 2100,
               tax_label = 'IVA',
               timezone = 'Europe/Madrid',
               default_locale = 'es'
           WHERE id = $1`,
          [fixtures.clinicA],
        ),
    );

    const afterCount = await db.queryAsOwner<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM public.audit_log
       WHERE clinic_id = $1
         AND action = 'clinic.settings_updated'`,
      [fixtures.clinicA],
    );

    expect(afterCount.rows[0]?.count).toBe(beforeCount.rows[0]?.count);
  });

  it('4. Blocks dentist and receptionist from updating public.clinics (0 rows affected, 0 audit_log entries created)', async () => {
    const beforeCount = await db.queryAsOwner<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM public.audit_log
       WHERE clinic_id = $1`,
      [fixtures.clinicA],
    );

    for (const nonAdminId of [fixtures.dentistA, fixtures.receptionistA]) {
      const result = await db.runAsRole(
        { role: 'authenticated', userId: nonAdminId, commit: true },
        (tx) =>
          tx.query(
            `UPDATE public.clinics
             SET name = 'Unauthorized Clinic Rename',
                 currency_code = 'USD',
                 currency_symbol = '$',
                 tax_rate_bps = 0,
                 tax_label = 'Tax'
             WHERE id = $1`,
            [fixtures.clinicA],
          ),
      );

      expect(result.rowCount).toBe(0);
    }

    const afterCount = await db.queryAsOwner<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM public.audit_log
       WHERE clinic_id = $1`,
      [fixtures.clinicA],
    );
    expect(afterCount.rows[0]?.count).toBe(beforeCount.rows[0]?.count);

    const clinicRow = await db.queryAsOwner<{ name: string; currency_code: string }>(
      `SELECT name, currency_code FROM public.clinics WHERE id = $1`,
      [fixtures.clinicA],
    );
    expect(clinicRow.rows[0]).toEqual({
      name: 'Al Noor Synthetic Clinic Iberia',
      currency_code: 'EUR',
    });
  });

  it('5. Enforces CHECK constraints atomically (invalid update leaves clinics and audit_log untouched) and allows owner seed updates without auth.uid()', async () => {
    const beforeCount = await db.queryAsOwner<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM public.audit_log
       WHERE clinic_id = $1`,
      [fixtures.clinicA],
    );

    let caughtError: unknown;
    try {
      await db.runAsRole(
        { role: 'authenticated', userId: fixtures.adminA, commit: true },
        (tx) =>
          tx.query(
            `UPDATE public.clinics SET tax_rate_bps = 15000 WHERE id = $1`,
            [fixtures.clinicA],
          ),
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeDefined();
    expect(extractPgErrorCode(caughtError)).toBe('23514');

    // Owner/seed update without auth.uid() succeeds without FK failure and without noisy audit row
    await db.queryAsOwner(
      `UPDATE public.clinics SET timezone = 'Asia/Dubai' WHERE id = $1`,
      [fixtures.clinicA],
    );

    const afterCount = await db.queryAsOwner<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM public.audit_log
       WHERE clinic_id = $1`,
      [fixtures.clinicA],
    );
    expect(afterCount.rows[0]?.count).toBe(beforeCount.rows[0]?.count);
  });
});
