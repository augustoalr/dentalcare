import { randomUUID } from 'node:crypto';
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

interface TreatmentsRlsFixtures {
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

function createFixtures(): TreatmentsRlsFixtures {
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

describe('T-07 Treatments catalog schema, multi-clinic RLS, admin-only mutations, B-01 pure archive/restore, and atomic audit', () => {
  let db: ITestDbHarness;
  let fixtures: TreatmentsRlsFixtures;

  beforeAll(async () => {
    db = await createTestDbHarness();
    fixtures = createFixtures();

    await applyAllMigrations(db);

    await db.queryAsOwner(
      `INSERT INTO public.clinics (id, name, currency_code, currency_symbol, tax_rate_bps, tax_label, timezone, default_locale)
       VALUES
         ($1, 'Al Noor Synthetic Dental Dubai', 'AED', 'AED', 500, 'VAT', 'Asia/Dubai', 'en'),
         ($2, 'Clínica Sintética Castellana Madrid', 'EUR', '€', 2100, 'IVA', 'Europe/Madrid', 'es')`,
      [fixtures.clinicA, fixtures.clinicB],
    );

    const users: readonly [string, string][] = [
      [fixtures.adminA, `admin-tr-a-${fixtures.adminA}@example.test`],
      [fixtures.dentistA, `dentist-tr-a-${fixtures.dentistA}@example.test`],
      [fixtures.receptionistA, `recep-tr-a-${fixtures.receptionistA}@example.test`],
      [fixtures.inactiveA, `inactive-tr-a-${fixtures.inactiveA}@example.test`],
      [fixtures.deletedA, `deleted-tr-a-${fixtures.deletedA}@example.test`],
      [fixtures.adminB, `admin-tr-b-${fixtures.adminB}@example.test`],
      [fixtures.dentistB, `dentist-tr-b-${fixtures.dentistB}@example.test`],
      [fixtures.receptionistB, `recep-tr-b-${fixtures.receptionistB}@example.test`],
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
         ($4, $9, 'Inactive Alpha Synthetic', 'admin', 'en', false, NULL),
         ($5, $9, 'Deleted Alpha Synthetic', 'admin', 'en', true, now()),
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

  it('1. Applies all migrations twice without error (idempotency) and enables RLS on public.treatments_catalog', async () => {
    const files = listMigrationFiles();
    expect(files).toContain('202611270002_treatments_catalog_rls.sql');
    expect(files.indexOf('202611270001_archive_restore_purge_rls.sql')).toBeLessThan(
      files.indexOf('202611270002_treatments_catalog_rls.sql'),
    );

    await expect(applyAllMigrations(db)).resolves.toBeUndefined();

    const rlsStatus = await db.queryAsOwner<{
      tablename: string;
      rowsecurity: boolean;
    }>(
      `SELECT tablename, rowsecurity
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename = 'treatments_catalog'`,
    );
    expect(rlsStatus.rows).toEqual([
      { tablename: 'treatments_catalog', rowsecurity: true },
    ]);
  });

  it('2. Allows adminA full lifecycle with atomic audit_log (create, update, no-op skip, pause, archive, restore) and blocks dentist/receptionist/Clinic B/anon/inactive', async () => {
    // adminA creates a treatment in Clinic A
    const created = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        const res = await tx.query<{
          id: string;
          code: string;
          default_price_cents: string | number;
          default_duration_min: number;
          is_active: boolean;
        }>(
          `INSERT INTO public.treatments_catalog (
             clinic_id, code, name_en, name_es, category, default_price_cents, default_duration_min, is_active
           )
           VALUES ($1, 'CLEAN-01', 'Dental prophylaxis', 'Limpieza dental', 'preventive', 15050, 45, true)
           RETURNING id::text, code, default_price_cents, default_duration_min, is_active`,
          [fixtures.clinicA],
        );
        return res.rows[0]!;
      },
    );

    expect(created.code).toBe('CLEAN-01');
    expect(Number(created.default_price_cents)).toBe(15050);
    expect(created.default_duration_min).toBe(45);
    expect(created.is_active).toBe(true);

    // adminA updates price & pauses treatment
    const updated = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        const res = await tx.query<{
          id: string;
          default_price_cents: string | number;
          is_active: boolean;
        }>(
          `UPDATE public.treatments_catalog
           SET default_price_cents = 17500, is_active = false
           WHERE id = $1 AND deleted_at IS NULL
           RETURNING id::text, default_price_cents, is_active`,
          [created.id],
        );
        return res.rows[0]!;
      },
    );
    expect(Number(updated.default_price_cents)).toBe(17500);
    expect(updated.is_active).toBe(false);

    // No-op UPDATE by adminA must NOT insert a duplicate audit_log row
    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        await tx.query(
          `UPDATE public.treatments_catalog
           SET default_price_cents = 17500, is_active = false
           WHERE id = $1 AND deleted_at IS NULL`,
          [created.id],
        );
      },
    );

    // dentistA and receptionistA can read active (non-archived) treatments of Clinic A
    for (const readerId of [fixtures.dentistA, fixtures.receptionistA]) {
      const visible = await db.runAsRole(
        { role: 'authenticated', userId: readerId },
        async (tx) => {
          const res = await tx.query<{ id: string }>(
            `SELECT id::text FROM public.treatments_catalog WHERE id = $1`,
            [created.id],
          );
          return res.rows;
        },
      );
      expect(visible).toHaveLength(1);

      // Non-admin INSERT blocked with 42501
      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId: readerId }, async (tx) => {
            await tx.query(
              `INSERT INTO public.treatments_catalog (
                 clinic_id, code, name_en, name_es, category, default_price_cents
               )
               VALUES ($1, 'UNAUTH-01', 'Blocked', 'Bloqueado', 'other', 1000)`,
              [fixtures.clinicA],
            );
          }),
        '42501',
      );

      // Non-admin UPDATE returns 0 rows (RLS USING filters it out)
      const updateResult = await db.runAsRole(
        { role: 'authenticated', userId: readerId },
        async (tx) =>
          tx.query(
            `UPDATE public.treatments_catalog
             SET default_price_cents = 1
             WHERE id = $1`,
            [created.id],
          ),
      );
      expect(updateResult.rowCount).toBe(0);

      // Non-admin archive returns 0 rows
      const archiveResult = await db.runAsRole(
        { role: 'authenticated', userId: readerId },
        async (tx) =>
          tx.query(
            `UPDATE public.treatments_catalog
             SET deleted_at = now()
             WHERE id = $1`,
            [created.id],
          ),
      );
      expect(archiveResult.rowCount).toBe(0);
    }

    // Clinic B roles (including adminB) cannot see, insert into Clinic A, or modify Clinic A
    for (const clinicBUser of [
      fixtures.adminB,
      fixtures.dentistB,
      fixtures.receptionistB,
    ]) {
      const crossRead = await db.runAsRole(
        { role: 'authenticated', userId: clinicBUser },
        async (tx) =>
          tx.query(
            `SELECT id::text FROM public.treatments_catalog WHERE id = $1`,
            [created.id],
          ),
      );
      expect(crossRead.rows).toHaveLength(0);

      const crossUpdate = await db.runAsRole(
        { role: 'authenticated', userId: clinicBUser },
        async (tx) =>
          tx.query(
            `UPDATE public.treatments_catalog SET default_price_cents = 50 WHERE id = $1`,
            [created.id],
          ),
      );
      expect(crossUpdate.rowCount).toBe(0);
    }

    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminB },
          async (tx) => {
            await tx.query(
              `INSERT INTO public.treatments_catalog (
                 clinic_id, code, name_en, name_es, category, default_price_cents
               )
               VALUES ($1, 'CROSS-01', 'Cross clinic', 'Otra clínica', 'other', 1000)`,
              [fixtures.clinicA],
            );
          },
        ),
      '42501',
    );

    // anon, inactiveA, and deletedA are blocked
    await expectPgError(
      () =>
        db.runAsRole({ role: 'anon' }, async (tx) => {
          await tx.query(`SELECT id FROM public.treatments_catalog`);
        }),
      '42501',
    );

    for (const disabledUser of [fixtures.inactiveA, fixtures.deletedA]) {
      const readRes = await db.runAsRole(
        { role: 'authenticated', userId: disabledUser },
        async (tx) =>
          tx.query(`SELECT id::text FROM public.treatments_catalog`),
      );
      expect(readRes.rows).toHaveLength(0);

      await expectPgError(
        () =>
          db.runAsRole(
            { role: 'authenticated', userId: disabledUser },
            async (tx) => {
              await tx.query(
                `INSERT INTO public.treatments_catalog (
                   clinic_id, code, name_en, name_es, category, default_price_cents
                 )
                 VALUES ($1, 'DIS-01', 'Disabled', 'Desactivado', 'other', 1000)`,
                [fixtures.clinicA],
              );
            },
          ),
        '42501',
      );
    }

    // adminA archives treatment (pure archive)
    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        const res = await tx.query(
          `UPDATE public.treatments_catalog
           SET deleted_at = now()
           WHERE id = $1 AND deleted_at IS NULL`,
          [created.id],
        );
        expect(res.rowCount).toBe(1);
      },
    );

    // Archived treatment is hidden from dentistA/receptionistA, visible to adminA, and non-admins cannot restore
    for (const readerId of [fixtures.dentistA, fixtures.receptionistA]) {
      const archivedHidden = await db.runAsRole(
        { role: 'authenticated', userId: readerId },
        async (tx) =>
          tx.query(
            `SELECT id::text FROM public.treatments_catalog WHERE id = $1`,
            [created.id],
          ),
      );
      expect(archivedHidden.rows).toHaveLength(0);

      const nonAdminRestore = await db.runAsRole(
        { role: 'authenticated', userId: readerId },
        async (tx) =>
          tx.query(
            `UPDATE public.treatments_catalog SET deleted_at = NULL WHERE id = $1`,
            [created.id],
          ),
      );
      expect(nonAdminRestore.rowCount).toBe(0);
    }

    const adminSeesArchived = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      async (tx) =>
        tx.query<{ id: string; deleted_at: string | null }>(
          `SELECT id::text, deleted_at::text FROM public.treatments_catalog WHERE id = $1`,
          [created.id],
        ),
    );
    expect(adminSeesArchived.rows).toHaveLength(1);
    expect(adminSeesArchived.rows[0]?.deleted_at).not.toBeNull();

    // adminA restores archived treatment (pure restore)
    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        const res = await tx.query(
          `UPDATE public.treatments_catalog
           SET deleted_at = NULL
           WHERE id = $1 AND deleted_at IS NOT NULL`,
          [created.id],
        );
        expect(res.rowCount).toBe(1);
      },
    );

    // Verify atomic audit_log trail (exactly 4 events, no duplicate from no-op UPDATE)
    const auditEvents = await db.queryAsOwner<{
      action: string;
      entity_type: string;
      entity_id: string;
      actor_id: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT action, entity_type, entity_id::text, actor_id::text, metadata_json
       FROM public.audit_log
       WHERE clinic_id = $1
         AND entity_type = 'treatment'
         AND entity_id = $2
       ORDER BY created_at ASC, id ASC`,
      [fixtures.clinicA, created.id],
    );

    expect(auditEvents.rows.map((r) => r.action)).toEqual([
      'treatment.created',
      'treatment.updated',
      'treatment.archived',
      'treatment.restored',
    ]);
    expect(auditEvents.rows.every((r) => r.actor_id === fixtures.adminA)).toBe(
      true,
    );
    expect(auditEvents.rows[0]?.metadata_json).toEqual({
      code: 'CLEAN-01',
      name_en: 'Dental prophylaxis',
      name_es: 'Limpieza dental',
      category: 'preventive',
      default_price_cents: 15050,
      default_duration_min: 45,
      is_active: true,
    });
    expect(auditEvents.rows[1]?.metadata_json).toMatchObject({
      before: { default_price_cents: 15050, is_active: true },
      after: { default_price_cents: 17500, is_active: false },
    });
    expect(auditEvents.rows[2]?.metadata_json).toEqual({ code: 'CLEAN-01' });
    expect(auditEvents.rows[3]?.metadata_json).toEqual({ code: 'CLEAN-01' });
  });

  it('3. Enforces anti-spoofing, per-clinic active code uniqueness (including reuse after archive), CHECK constraints, B-01 pure archive/restore guards, and forbids physical DELETE', async () => {
    // Anti-spoofing: future created_at on INSERT is overwritten to now()
    const inserted = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        const res = await tx.query<{
          id: string;
          created_year: number;
          created_at: string;
        }>(
          `INSERT INTO public.treatments_catalog (
             clinic_id, code, name_en, name_es, category, default_price_cents, default_duration_min, created_at
           )
           VALUES (
             $1, 'ENDO-01', 'Root canal therapy', 'Endodoncia molar', 'endodontics', 99999999999, 90, '2099-01-01T00:00:00Z'
           )
           RETURNING id::text, EXTRACT(YEAR FROM created_at)::int AS created_year, created_at::text`,
          [fixtures.clinicA],
        );
        return res.rows[0]!;
      },
    );
    expect(inserted.created_year).toBeLessThan(2099);

    // Duplicate active code in same clinic fails with 23505
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(
              `INSERT INTO public.treatments_catalog (
                 clinic_id, code, name_en, name_es, category, default_price_cents
               )
               VALUES ($1, 'ENDO-01', 'Duplicate', 'Duplicado', 'endodontics', 5000)`,
              [fixtures.clinicA],
            );
          },
        ),
      '23505',
    );

    // Same code in Clinic B IS allowed
    const clinicBItem = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminB, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string }>(
          `INSERT INTO public.treatments_catalog (
             clinic_id, code, name_en, name_es, category, default_price_cents
           )
           VALUES ($1, 'ENDO-01', 'Root canal', 'Endodoncia', 'endodontics', 25000)
           RETURNING id::text`,
          [fixtures.clinicB],
        );
        return res.rows[0]!;
      },
    );
    expect(clinicBItem.id).toBeTruthy();

    // B-01: Archiving while simultaneously mutating default_price_cents or code MUST fail with 42501
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(
              `UPDATE public.treatments_catalog
               SET deleted_at = now(), default_price_cents = 1
               WHERE id = $1`,
              [inserted.id],
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
              `UPDATE public.treatments_catalog
               SET deleted_at = now(), code = 'TAMPER-01'
               WHERE id = $1`,
              [inserted.id],
            );
          },
        ),
      '42501',
    );

    // Archive ENDO-01 cleanly in Clinic A, then reuse ENDO-01, then restoring old ENDO-01 returns 23505
    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        await tx.query(
          `UPDATE public.treatments_catalog SET deleted_at = now() WHERE id = $1`,
          [inserted.id],
        );
      },
    );

    // Editing another column while restoring archived treatment fails with 42501
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(
              `UPDATE public.treatments_catalog
               SET deleted_at = NULL, default_price_cents = 12345
               WHERE id = $1`,
              [inserted.id],
            );
          },
        ),
      '42501',
    );

    // Reuse code ENDO-01 in Clinic A while original is archived
    const reused = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string }>(
          `INSERT INTO public.treatments_catalog (
             clinic_id, code, name_en, name_es, category, default_price_cents
           )
           VALUES ($1, 'ENDO-01', 'Root canal v2', 'Endodoncia v2', 'endodontics', 40000)
           RETURNING id::text`,
          [fixtures.clinicA],
        );
        return res.rows[0]!;
      },
    );
    expect(reused.id).not.toBe(inserted.id);

    // Restoring the archived ENDO-01 now hits unique active code constraint (23505)
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(
              `UPDATE public.treatments_catalog
               SET deleted_at = NULL
               WHERE id = $1`,
              [inserted.id],
            );
          },
        ),
      '23505',
    );

    // CHECK constraint rejections (23514)
    const invalidInserts: readonly [string, unknown[]][] = [
      // Negative price
      [
        `INSERT INTO public.treatments_catalog (clinic_id, code, name_en, name_es, category, default_price_cents)
         VALUES ($1, 'NEG-01', 'Test', 'Prueba', 'other', -1)`,
        [fixtures.clinicA],
      ],
      // Price > 99999999999
      [
        `INSERT INTO public.treatments_catalog (clinic_id, code, name_en, name_es, category, default_price_cents)
         VALUES ($1, 'BIG-01', 'Test', 'Prueba', 'other', 100000000000)`,
        [fixtures.clinicA],
      ],
      // Duration < 5
      [
        `INSERT INTO public.treatments_catalog (clinic_id, code, name_en, name_es, category, default_price_cents, default_duration_min)
         VALUES ($1, 'DUR-LOW', 'Test', 'Prueba', 'other', 1000, 4)`,
        [fixtures.clinicA],
      ],
      // Duration > 480
      [
        `INSERT INTO public.treatments_catalog (clinic_id, code, name_en, name_es, category, default_price_cents, default_duration_min)
         VALUES ($1, 'DUR-HI', 'Test', 'Prueba', 'other', 1000, 481)`,
        [fixtures.clinicA],
      ],
      // Invalid category
      [
        `INSERT INTO public.treatments_catalog (clinic_id, code, name_en, name_es, category, default_price_cents)
         VALUES ($1, 'CAT-01', 'Test', 'Prueba', 'cosmetic_invalid', 1000)`,
        [fixtures.clinicA],
      ],
      // Lowercase / spaces in code
      [
        `INSERT INTO public.treatments_catalog (clinic_id, code, name_en, name_es, category, default_price_cents)
         VALUES ($1, 'clean 01', 'Test', 'Prueba', 'other', 1000)`,
        [fixtures.clinicA],
      ],
    ];

    for (const [sql, params] of invalidInserts) {
      await expectPgError(
        () =>
          db.runAsRole(
            { role: 'authenticated', userId: fixtures.adminA },
            async (tx) => {
              await tx.query(sql, params);
            },
          ),
        '23514',
      );
    }

    // Immutable columns (id, clinic_id, created_at) blocked with 42501
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(
              `UPDATE public.treatments_catalog SET id = $1 WHERE id = $2`,
              [randomUUID(), reused.id],
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
              `UPDATE public.treatments_catalog SET clinic_id = $1 WHERE id = $2`,
              [fixtures.clinicB, reused.id],
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
              `UPDATE public.treatments_catalog SET created_at = '2020-01-01T00:00:00Z' WHERE id = $1`,
              [reused.id],
            );
          },
        ),
      '42501',
    );

    // Physical DELETE forbidden with 42501 even for adminA
    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.adminA },
          async (tx) => {
            await tx.query(
              `DELETE FROM public.treatments_catalog WHERE id = $1`,
              [reused.id],
            );
          },
        ),
      '42501',
    );
  });

  it('4. Executes the documented individual rollback in supabase/README.md cleanly in an isolated PGlite (PG 17) instance and re-applies cleanly', async () => {
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

      const readmePath = path.resolve(process.cwd(), 'supabase', 'README.md');
      const readme = readFileSync(readmePath, 'utf8');
      const sectionHeaderRegex =
        /### [A-Z]\) Revertir únicamente `202611270002_treatments_catalog_rls\.sql`[^\r\n]*/;
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

      const tblCheck = await isolatedDb.query<{ tbl: string | null }>(
        `SELECT to_regclass('public.treatments_catalog')::text AS tbl`,
      );
      expect(tblCheck.rows[0]?.tbl).toBeNull();

      const fnCheck = await isolatedDb.query<{ proname: string }>(
        `SELECT p.proname
         FROM pg_proc AS p
         JOIN pg_namespace AS n ON n.oid = p.pronamespace
         WHERE n.nspname = 'private'
           AND p.proname LIKE '%treatment_catalog%'`,
      );
      expect(fnCheck.rows).toHaveLength(0);

      // Re-apply T-07 migration to confirm clean forward recovery
      await isolatedDb.exec(
        readMigrationSql('202611270002_treatments_catalog_rls.sql'),
      );
      const tblAfter = await isolatedDb.query<{ tbl: string | null }>(
        `SELECT to_regclass('public.treatments_catalog')::text AS tbl`,
      );
      expect(tblAfter.rows[0]?.tbl).toBe('treatments_catalog');
    } finally {
      await isolatedDb.close();
    }
  });
});
