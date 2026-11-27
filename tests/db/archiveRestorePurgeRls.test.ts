import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  createTestDbHarness,
  extractPgErrorCode,
  listMigrationFiles,
  type ITestDbHarness,
} from './testDbHarness';

interface ArchiveRestorePurgeFixtures {
  readonly clinicA: string;
  readonly clinicB: string;
  readonly adminA: string;
  readonly dentistA: string;
  readonly receptionistA: string;
  readonly adminB: string;
  readonly dentistB: string;
  readonly patientA: string;
  readonly archivedPatientA: string;
  readonly patientB: string;
}

function createFixtures(): ArchiveRestorePurgeFixtures {
  return Object.freeze({
    clinicA: randomUUID().toLowerCase(),
    clinicB: randomUUID().toLowerCase(),
    adminA: randomUUID().toLowerCase(),
    dentistA: randomUUID().toLowerCase(),
    receptionistA: randomUUID().toLowerCase(),
    adminB: randomUUID().toLowerCase(),
    dentistB: randomUUID().toLowerCase(),
    patientA: randomUUID().toLowerCase(),
    archivedPatientA: randomUUID().toLowerCase(),
    patientB: randomUUID().toLowerCase(),
  });
}

function makeStoragePath(
  clinicId: string,
  patientId: string,
  ext: 'jpg' | 'png' | 'webp' | 'pdf' = 'jpg',
): string {
  return `${clinicId}/${patientId}/${randomUUID().toLowerCase()}.${ext}`;
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

describe('T-06b Archived review/restore (admin), Storage purge (admin + 15-min uploader window), B-01 & B-02', () => {
  let db: ITestDbHarness;
  let fixtures: ArchiveRestorePurgeFixtures;

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
      [fixtures.adminA, `admin-t06b-a-${fixtures.adminA}@example.test`],
      [fixtures.dentistA, `dentist-t06b-a-${fixtures.dentistA}@example.test`],
      [
        fixtures.receptionistA,
        `recep-t06b-a-${fixtures.receptionistA}@example.test`,
      ],
      [fixtures.adminB, `admin-t06b-b-${fixtures.adminB}@example.test`],
      [fixtures.dentistB, `dentist-t06b-b-${fixtures.dentistB}@example.test`],
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
         ($1, $6, 'Admin Alpha Synthetic', 'admin', 'en', true, NULL),
         ($2, $6, 'Dentist Alpha Synthetic', 'dentist', 'en', true, NULL),
         ($3, $6, 'Receptionist Alpha Synthetic', 'receptionist', 'es', true, NULL),
         ($4, $7, 'Admin Beta Synthetic', 'admin', 'es', true, NULL),
         ($5, $7, 'Dentist Beta Synthetic', 'dentist', 'es', true, NULL)`,
      [
        fixtures.adminA,
        fixtures.dentistA,
        fixtures.receptionistA,
        fixtures.adminB,
        fixtures.dentistB,
        fixtures.clinicA,
        fixtures.clinicB,
      ],
    );

    await db.queryAsOwner(
      `INSERT INTO public.patients (id, clinic_id, full_name, phone, email, medical_alerts, deleted_at)
       VALUES
         ($1, $4, 'Layla Synthetic Active', '+971 50 100 1000', 'layla.active@alpha.test', 'Penicillin allergy', NULL),
         ($2, $4, 'Omar Synthetic Archived', '+971 50 200 2000', 'omar.archived@alpha.test', 'Latex sensitivity', now() - interval '2 days'),
         ($3, $5, 'Sofía Sintética Beta', '+34 600 300 300', 'sofia.beta@beta.test', NULL, NULL)`,
      [
        fixtures.patientA,
        fixtures.archivedPatientA,
        fixtures.patientB,
        fixtures.clinicA,
        fixtures.clinicB,
      ],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('1. Applies all migrations twice without error (idempotency) and enforces patient_files_purged_requires_deleted_check', async () => {
    const files = listMigrationFiles();
    expect(files).toContain('202611270001_archive_restore_purge_rls.sql');
    expect(
      files.indexOf('202611260003_patient_files_storage_rls.sql'),
    ).toBeLessThan(files.indexOf('202611270001_archive_restore_purge_rls.sql'));

    await expect(applyAllMigrations(db)).resolves.toBeUndefined();

    // CHECK constraint rejects purged_at IS NOT NULL when deleted_at IS NULL
    await expectPgError(
      () =>
        db.queryAsOwner(
          `INSERT INTO public.patient_files
             (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by, deleted_at, purged_at)
           VALUES ($1, $2, $3, 'invalid-purged.jpg', 'image/jpeg', 1024, $4, NULL, now())`,
          [
            fixtures.clinicA,
            fixtures.patientA,
            makeStoragePath(fixtures.clinicA, fixtures.patientA, 'jpg'),
            fixtures.adminA,
          ],
        ),
      '23514',
    );
  });

  it('2. Patients: only adminA lists & restores archived patients (with atomic PII-free patient.restored); edits on restore raise 42501; non-admin and Clinic B blocked', async () => {
    const targetPatient = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string }>(
          `INSERT INTO public.patients (clinic_id, full_name, phone, email, medical_alerts)
           VALUES ($1, 'Tariq Synthetic Restore Test', '+971 55 888 9999', 'tariq.restore@alpha.test', 'Aspirin sensitivity')
           RETURNING id::text`,
          [fixtures.clinicA],
        );
        return res.rows[0]!;
      },
    );

    // Archive patient
    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      (tx) =>
        tx.query(
          `UPDATE public.patients SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
          [targetPatient.id],
        ),
    );

    // Non-admins in Clinic A and Admin B see 0 rows and cannot restore
    for (const userId of [
      fixtures.dentistA,
      fixtures.receptionistA,
      fixtures.adminB,
    ]) {
      const visible = await db.runAsRole(
        { role: 'authenticated', userId },
        (tx) =>
          tx.query(
            `SELECT id FROM public.patients WHERE id = $1 AND deleted_at IS NOT NULL`,
            [targetPatient.id],
          ),
      );
      expect(visible.rows).toHaveLength(0);

      const restoreAttempt = await db.runAsRole(
        { role: 'authenticated', userId, commit: true },
        (tx) =>
          tx.query(`UPDATE public.patients SET deleted_at = NULL WHERE id = $1`, [
            targetPatient.id,
          ]),
      );
      expect(restoreAttempt.rowCount).toBe(0);
    }

    // adminA lists archived patient
    const adminVisible = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query<{ id: string }>(
          `SELECT id::text FROM public.patients WHERE id = $1 AND deleted_at IS NOT NULL`,
          [targetPatient.id],
        ),
    );
    expect(adminVisible.rows).toEqual([{ id: targetPatient.id }]);

    // adminA cannot edit full_name while restoring (42501)
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(
            `UPDATE public.patients SET full_name = 'Tampered Name', deleted_at = NULL WHERE id = $1`,
            [targetPatient.id],
          ),
        ),
      '42501',
    );

    // adminA restores cleanly with deleted_at = NULL
    const restoreRes = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      (tx) =>
        tx.query(
          `UPDATE public.patients SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`,
          [targetPatient.id],
        ),
    );
    expect(restoreRes.rowCount).toBe(1);

    // Dentist now sees restored active patient again
    const visibleToDentist = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA },
      (tx) =>
        tx.query<{ id: string }>(
          `SELECT id::text FROM public.patients WHERE id = $1 AND deleted_at IS NULL`,
          [targetPatient.id],
        ),
    );
    expect(visibleToDentist.rows).toEqual([{ id: targetPatient.id }]);

    // Atomic audit_log entry: patient.restored with metadata_json = '{}' (zero PII)
    const auditRes = await db.runAsRole(
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
          `SELECT clinic_id::text, actor_id::text, action, entity_type, entity_id::text, metadata_json
           FROM public.audit_log
           WHERE entity_id = $1 AND action = 'patient.restored'`,
          [targetPatient.id],
        ),
    );
    expect(auditRes.rows).toEqual([
      {
        clinic_id: fixtures.clinicA,
        actor_id: fixtures.adminA,
        action: 'patient.restored',
        entity_type: 'patient',
        entity_id: targetPatient.id,
        metadata_json: {},
      },
    ]);
    const serialized = JSON.stringify(auditRes.rows[0]);
    expect(serialized).not.toContain('Tariq');
    expect(serialized).not.toContain('Aspirin');
    expect(serialized).not.toContain('tariq.restore');
  });

  it('3. Clinical files: adminA lists, restores (patient_file.restored), and purges archived files (storage DELETE + purged_at + patient_file.purged); uploader purges own recent file within 15 min', async () => {
    // 3a. Admin restore + admin purge of archived files
    const pathRestore = makeStoragePath(fixtures.clinicA, fixtures.patientA, 'png');
    const pathAdminPurge = makeStoragePath(fixtures.clinicA, fixtures.patientA, 'jpg');

    const [fileToRestore, fileToAdminPurge] = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      async (tx) => {
        await tx.query(
          `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('patient-files', $1, $3), ('patient-files', $2, $3)`,
          [pathRestore, pathAdminPurge, fixtures.dentistA],
        );
        const r1 = await tx.query<{ id: string }>(
          `INSERT INTO public.patient_files (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
           VALUES ($1, $2, $3, 'restore-me-synthetic.png', 'image/png', 102400, $4)
           RETURNING id::text`,
          [fixtures.clinicA, fixtures.patientA, pathRestore, fixtures.dentistA],
        );
        const r2 = await tx.query<{ id: string }>(
          `INSERT INTO public.patient_files (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
           VALUES ($1, $2, $3, 'purge-me-synthetic.jpg', 'image/jpeg', 204800, $4)
           RETURNING id::text`,
          [fixtures.clinicA, fixtures.patientA, pathAdminPurge, fixtures.dentistA],
        );
        return [r1.rows[0]!, r2.rows[0]!] as const;
      },
    );

    // Archive both files as dentistA
    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      async (tx) => {
        await tx.query(
          `UPDATE public.patient_files SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
          [fileToRestore.id],
        );
        await tx.query(
          `UPDATE public.patient_files SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
          [fileToAdminPurge.id],
        );
      },
    );

    // adminA lists both archived non-purged files and can SELECT their storage objects for preview
    const archivedList = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query<{ id: string }>(
          `SELECT id::text FROM public.patient_files
           WHERE clinic_id = $1 AND patient_id = $2 AND deleted_at IS NOT NULL AND purged_at IS NULL
           ORDER BY id`,
          [fixtures.clinicA, fixtures.patientA],
        ),
    );
    expect(archivedList.rows.map((r) => r.id).sort()).toEqual(
      [fileToRestore.id, fileToAdminPurge.id].sort(),
    );

    const adminStoragePreview = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query<{ name: string }>(
          `SELECT name FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [pathAdminPurge],
        ),
    );
    expect(adminStoragePreview.rows).toEqual([{ name: pathAdminPurge }]);

    // adminA restores fileToRestore -> patient_file.restored with '{}'
    const restoreFileRes = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      (tx) =>
        tx.query(
          `UPDATE public.patient_files SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL AND purged_at IS NULL`,
          [fileToRestore.id],
        ),
    );
    expect(restoreFileRes.rowCount).toBe(1);

    const restoreAudit = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query<{ action: string; actor_id: string; metadata_json: Record<string, unknown> }>(
          `SELECT action, actor_id::text, metadata_json FROM public.audit_log
           WHERE entity_id = $1 AND action = 'patient_file.restored'`,
          [fileToRestore.id],
        ),
    );
    expect(restoreAudit.rows).toEqual([
      { action: 'patient_file.restored', actor_id: fixtures.adminA, metadata_json: {} },
    ]);

    // adminA purges archived fileToAdminPurge: DELETE storage.objects (1 row) + UPDATE purged_at (1 row) -> patient_file.purged with '{}'
    const adminStorageDel = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      (tx) =>
        tx.query(
          `DELETE FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [pathAdminPurge],
        ),
    );
    expect(adminStorageDel.rowCount).toBe(1);

    const adminMarkPurged = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      (tx) =>
        tx.query(
          `UPDATE public.patient_files
           SET purged_at = now()
           WHERE id = $1 AND storage_path = $2 AND deleted_at IS NOT NULL AND purged_at IS NULL`,
          [fileToAdminPurge.id, pathAdminPurge],
        ),
    );
    expect(adminMarkPurged.rowCount).toBe(1);

    const adminPurgeAudit = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query<{ action: string; actor_id: string; metadata_json: Record<string, unknown> }>(
          `SELECT action, actor_id::text, metadata_json FROM public.audit_log
           WHERE entity_id = $1 AND action = 'patient_file.purged'`,
          [fileToAdminPurge.id],
        ),
    );
    expect(adminPurgeAudit.rows).toEqual([
      { action: 'patient_file.purged', actor_id: fixtures.adminA, metadata_json: {} },
    ]);

    // 3b. Non-admin uploader (receptionistA) purges own mistaken upload within 15 minutes directly
    const mistakenPath = makeStoragePath(fixtures.clinicA, fixtures.patientA, 'webp');
    const mistakenFile = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      async (tx) => {
        await tx.query(
          `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('patient-files', $1, $2)`,
          [mistakenPath, fixtures.receptionistA],
        );
        const res = await tx.query<{ id: string }>(
          `INSERT INTO public.patient_files (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
           VALUES ($1, $2, $3, 'mistaken-upload-synthetic.webp', 'image/webp', 81920, $4)
           RETURNING id::text`,
          [fixtures.clinicA, fixtures.patientA, mistakenPath, fixtures.receptionistA],
        );
        return res.rows[0]!;
      },
    );

    const selfStorageDel = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      (tx) =>
        tx.query(
          `DELETE FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [mistakenPath],
        ),
    );
    expect(selfStorageDel.rowCount).toBe(1);

    const selfMarkPurged = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      (tx) =>
        tx.query(
          `UPDATE public.patient_files
           SET deleted_at = now(), purged_at = now()
           WHERE id = $1 AND storage_path = $2 AND deleted_at IS NULL AND purged_at IS NULL`,
          [mistakenFile.id, mistakenPath],
        ),
    );
    expect(selfMarkPurged.rowCount).toBe(1);

    // Immediately invisible in SELECT to receptionistA
    const afterSelfPurgeSelect = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA },
      (tx) =>
        tx.query(`SELECT id FROM public.patient_files WHERE id = $1`, [
          mistakenFile.id,
        ]),
    );
    expect(afterSelfPurgeSelect.rows).toHaveLength(0);

    // Exactly 1 audit_log entry ('patient_file.purged', metadata_json = '{}'), NOT duplicated with 'patient_file.archived'
    const selfPurgeAudit = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query<{ action: string; actor_id: string; metadata_json: Record<string, unknown> }>(
          `SELECT action, actor_id::text, metadata_json FROM public.audit_log
           WHERE entity_id = $1`,
          [mistakenFile.id],
        ),
    );
    expect(selfPurgeAudit.rows).toEqual([
      {
        action: 'patient_file.purged',
        actor_id: fixtures.receptionistA,
        metadata_json: {},
      },
    ]);
  });

  it('4. Blocks created_at spoofing (B-01), enforces 15-min & ownership bounds, blocks cross-clinic/anon/active-other-user purge, and enforces permanent post-purge immutability (B-02)', async () => {
    // B-01: INSERT attempting to forge future created_at = '2099-01-01T00:00:00Z' is overwritten to now()
    const spoofedPath = makeStoragePath(fixtures.clinicA, fixtures.patientA, 'jpg');
    const insertedWithFutureDate = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string; created_at: string }>(
          `INSERT INTO public.patient_files
             (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by, created_at)
           VALUES ($1, $2, $3, 'spoof-date.jpg', 'image/jpeg', 4096, $4, '2099-01-01T00:00:00Z')
           RETURNING id::text, created_at::text`,
          [fixtures.clinicA, fixtures.patientA, spoofedPath, fixtures.receptionistA],
        );
        return res.rows[0]!;
      },
    );
    const createdYear = new Date(insertedWithFutureDate.created_at).getUTCFullYear();
    expect(createdYear).toBeLessThan(2090);

    // Seed two active files:
    // (a) uploaded by dentistA just now (< 15 min)
    // (b) uploaded by receptionistA 16 minutes ago (> 15 min, inserted as owner to test aged row)
    const recentDentistPath = makeStoragePath(fixtures.clinicA, fixtures.patientA, 'png');
    const oldRecepPath = makeStoragePath(fixtures.clinicA, fixtures.patientA, 'pdf');

    const recentDentistFile = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      async (tx) => {
        await tx.query(
          `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('patient-files', $1, $2)`,
          [recentDentistPath, fixtures.dentistA],
        );
        const res = await tx.query<{ id: string }>(
          `INSERT INTO public.patient_files
             (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
           VALUES ($1, $2, $3, 'dentist-recent.png', 'image/png', 16384, $4)
           RETURNING id::text`,
          [fixtures.clinicA, fixtures.patientA, recentDentistPath, fixtures.dentistA],
        );
        return res.rows[0]!;
      },
    );

    const oldRecepFileId = randomUUID().toLowerCase();
    await db.queryAsOwner(
      `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('patient-files', $1, $2)`,
      [oldRecepPath, fixtures.receptionistA],
    );
    await db.queryAsOwner(
      `INSERT INTO public.patient_files
         (id, clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by, created_at)
       VALUES ($1, $2, $3, $4, 'old-recep-file.pdf', 'application/pdf', 32768, $5, now() - interval '16 minutes')`,
      [
        oldRecepFileId,
        fixtures.clinicA,
        fixtures.patientA,
        oldRecepPath,
        fixtures.receptionistA,
      ],
    );

    // 4a. receptionistA CANNOT delete in storage or purge an active file uploaded by ANOTHER colleague (dentistA, even < 15 min)
    const otherUserStorageDel = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      (tx) =>
        tx.query(
          `DELETE FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [recentDentistPath],
        ),
    );
    expect(otherUserStorageDel.rowCount).toBe(0);

    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.receptionistA },
          (tx) =>
            tx.query(
              `UPDATE public.patient_files SET deleted_at = now(), purged_at = now() WHERE id = $1`,
              [recentDentistFile.id],
            ),
        ),
      '42501',
    );

    // 4b. receptionistA CANNOT delete in storage or purge OWN file older than 15 minutes (16 min ago)
    const expiredStorageDel = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistA, commit: true },
      (tx) =>
        tx.query(
          `DELETE FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [oldRecepPath],
        ),
    );
    expect(expiredStorageDel.rowCount).toBe(0);

    await expectPgError(
      () =>
        db.runAsRole(
          { role: 'authenticated', userId: fixtures.receptionistA },
          (tx) =>
            tx.query(
              `UPDATE public.patient_files SET deleted_at = now(), purged_at = now() WHERE id = $1`,
              [oldRecepFileId],
            ),
        ),
      '42501',
    );

    // 4c. Even adminA CANNOT delete in storage or purge directly an ACTIVE file uploaded by another colleague (must archive first)
    const adminActiveOtherDel = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      (tx) =>
        tx.query(
          `DELETE FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [recentDentistPath],
        ),
    );
    expect(adminActiveOtherDel.rowCount).toBe(0);

    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(
            `UPDATE public.patient_files SET deleted_at = now(), purged_at = now() WHERE id = $1`,
            [recentDentistFile.id],
          ),
        ),
      '42501',
    );

    // 4d. anon and Clinic B blocked (0 rows / 42501)
    const anonStorageDel = await db.runAsRole(
      { role: 'anon', userId: null },
      (tx) =>
        tx.query(
          `DELETE FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [recentDentistPath],
        ),
    );
    expect(anonStorageDel.rowCount).toBe(0);

    await expectPgError(
      () =>
        db.runAsRole({ role: 'anon', userId: null }, (tx) =>
          tx.query(
            `UPDATE public.patient_files SET deleted_at = now(), purged_at = now() WHERE id = $1`,
            [recentDentistFile.id],
          ),
        ),
      '42501',
    );

    const clinicBStorageDel = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminB },
      (tx) =>
        tx.query(
          `DELETE FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [recentDentistPath],
        ),
    );
    expect(clinicBStorageDel.rowCount).toBe(0);

    const clinicBUpdate = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminB },
      (tx) =>
        tx.query(
          `UPDATE public.patient_files SET purged_at = now() WHERE id = $1`,
          [recentDentistFile.id],
        ),
    );
    expect(clinicBUpdate.rowCount).toBe(0);

    // 4e. Storage SELECT blocked for purged file and for file of an archived patient even for adminA
    const purgedStoragePath = makeStoragePath(fixtures.clinicA, fixtures.patientA, 'jpg');
    const purgedFileId = randomUUID().toLowerCase();
    await db.queryAsOwner(
      `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('patient-files', $1, $2)`,
      [purgedStoragePath, fixtures.adminA],
    );
    await db.queryAsOwner(
      `INSERT INTO public.patient_files
         (id, clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by, deleted_at, purged_at)
       VALUES ($1, $2, $3, $4, 'already-purged.jpg', 'image/jpeg', 2048, $5, now() - interval '1 hour', now() - interval '30 minutes')`,
      [purgedFileId, fixtures.clinicA, fixtures.patientA, purgedStoragePath, fixtures.adminA],
    );

    const adminSelectPurgedStorage = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query(
          `SELECT name FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [purgedStoragePath],
        ),
    );
    expect(adminSelectPurgedStorage.rows).toHaveLength(0);

    const archivedPatStoragePath = makeStoragePath(
      fixtures.clinicA,
      fixtures.archivedPatientA,
      'jpg',
    );
    await db.queryAsOwner(
      `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('patient-files', $1, $2)`,
      [archivedPatStoragePath, fixtures.adminA],
    );
    await db.queryAsOwner(
      `INSERT INTO public.patient_files
         (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by, deleted_at)
       VALUES ($1, $2, $3, 'archived-patient-file.jpg', 'image/jpeg', 2048, $4, now())`,
      [fixtures.clinicA, fixtures.archivedPatientA, archivedPatStoragePath, fixtures.adminA],
    );

    const adminSelectArchivedPatientStorage = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query(
          `SELECT name FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [archivedPatStoragePath],
        ),
    );
    expect(adminSelectArchivedPatientStorage.rows).toHaveLength(0);

    // 4f. B-02: Permanent post-purge immutability
    // - adminA (authenticated) gets rowCount === 0 from RLS USING (purged_at IS NULL)
    const adminMutatePurged = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      (tx) =>
        tx.query(
          `UPDATE public.patient_files SET deleted_at = NULL, purged_at = NULL WHERE id = $1`,
          [purgedFileId],
        ),
    );
    expect(adminMutatePurged.rowCount).toBe(0);

    // - Direct owner / service_role attempt raises 42501 from guard_patient_file_update() (defense in depth)
    await expectPgError(
      () =>
        db.queryAsOwner(
          `UPDATE public.patient_files SET deleted_at = NULL, purged_at = NULL WHERE id = $1`,
          [purgedFileId],
        ),
      '42501',
    );
  });
});
