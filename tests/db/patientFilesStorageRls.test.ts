import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  createTestDbHarness,
  extractPgErrorCode,
  listMigrationFiles,
  type ITestDbHarness,
} from './testDbHarness';

interface PatientFilesRlsFixtures {
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
  readonly patientA: string;
  readonly patientB: string;
  readonly archivedPatientA: string;
}

function createFixtures(): PatientFilesRlsFixtures {
  return Object.freeze({
    clinicA: randomUUID().toLowerCase(),
    clinicB: randomUUID().toLowerCase(),
    adminA: randomUUID().toLowerCase(),
    dentistA: randomUUID().toLowerCase(),
    receptionistA: randomUUID().toLowerCase(),
    inactiveA: randomUUID().toLowerCase(),
    deletedA: randomUUID().toLowerCase(),
    adminB: randomUUID().toLowerCase(),
    dentistB: randomUUID().toLowerCase(),
    receptionistB: randomUUID().toLowerCase(),
    patientA: randomUUID().toLowerCase(),
    patientB: randomUUID().toLowerCase(),
    archivedPatientA: randomUUID().toLowerCase(),
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

describe('T-06 Patient clinical files, private Storage bucket, multi-clinic RLS, and PII-free archive audit', () => {
  let db: ITestDbHarness;
  let fixtures: PatientFilesRlsFixtures;

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
      [fixtures.adminA, `admin-pf-a-${fixtures.adminA}@example.test`],
      [fixtures.dentistA, `dentist-pf-a-${fixtures.dentistA}@example.test`],
      [fixtures.receptionistA, `recep-pf-a-${fixtures.receptionistA}@example.test`],
      [fixtures.inactiveA, `inactive-pf-a-${fixtures.inactiveA}@example.test`],
      [fixtures.deletedA, `deleted-pf-a-${fixtures.deletedA}@example.test`],
      [fixtures.adminB, `admin-pf-b-${fixtures.adminB}@example.test`],
      [fixtures.dentistB, `dentist-pf-b-${fixtures.dentistB}@example.test`],
      [fixtures.receptionistB, `recep-pf-b-${fixtures.receptionistB}@example.test`],
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

    await db.queryAsOwner(
      `INSERT INTO public.patients (id, clinic_id, full_name, deleted_at)
       VALUES
         ($1, $4, 'Layla Synthetic Al Mansoor', NULL),
         ($2, $5, 'Carlos Sintético Ruiz', NULL),
         ($3, $4, 'Archived Synthetic Patient', now())`,
      [
        fixtures.patientA,
        fixtures.patientB,
        fixtures.archivedPatientA,
        fixtures.clinicA,
        fixtures.clinicB,
      ],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('1. Applies all migrations twice (idempotency) and configures private bucket patient-files with exact limits', async () => {
    const files = listMigrationFiles();
    expect(files).toContain('202611260003_patient_files_storage_rls.sql');
    expect(files.indexOf('202611260002_patients_rls.sql')).toBeLessThan(
      files.indexOf('202611260003_patient_files_storage_rls.sql'),
    );

    await expect(applyAllMigrations(db)).resolves.toBeUndefined();

    const rlsStatus = await db.queryAsOwner<{
      tablename: string;
      rowsecurity: boolean;
    }>(
      `SELECT tablename, rowsecurity
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename = 'patient_files'`,
    );
    expect(rlsStatus.rows).toEqual([
      { tablename: 'patient_files', rowsecurity: true },
    ]);

    const bucketRes = await db.queryAsOwner<{
      id: string;
      name: string;
      public: boolean;
      file_size_limit: string | number;
      allowed_mime_types: string[];
    }>(
      `SELECT id, name, public, file_size_limit, allowed_mime_types
       FROM storage.buckets
       WHERE id = 'patient-files'`,
    );

    expect(bucketRes.rows).toHaveLength(1);
    const bucket = bucketRes.rows[0]!;
    expect(bucket.id).toBe('patient-files');
    expect(bucket.name).toBe('patient-files');
    expect(bucket.public).toBe(false);
    expect(Number(bucket.file_size_limit)).toBe(10_485_760);
    expect(bucket.allowed_mime_types).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]);
  });

  it('2. Enforces strict multi-clinic isolation on public.patient_files, rejects cross-clinic FK, and blocks spoofed uploaded_by', async () => {
    const pathA = makeStoragePath(fixtures.clinicA, fixtures.patientA, 'jpg');
    const pathB = makeStoragePath(fixtures.clinicB, fixtures.patientB, 'pdf');

    const fileA = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string; storage_path: string }>(
          `INSERT INTO public.patient_files
             (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
           VALUES ($1, $2, $3, 'synthetic-panoramic-alpha.jpg', 'image/jpeg', 245760, $4)
           RETURNING id::text, storage_path`,
          [fixtures.clinicA, fixtures.patientA, pathA, fixtures.dentistA],
        );
        return res.rows[0]!;
      },
    );

    const fileB = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.receptionistB, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string; storage_path: string }>(
          `INSERT INTO public.patient_files
             (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
           VALUES ($1, $2, $3, 'radiografia-sintetica-beta.pdf', 'application/pdf', 512000, $4)
           RETURNING id::text, storage_path`,
          [fixtures.clinicB, fixtures.patientB, pathB, fixtures.receptionistB],
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

    for (const userId of clinicARoles) {
      await db.runAsRole({ role: 'authenticated', userId }, async (tx) => {
        const visible = await tx.query<{ id: string; clinic_id: string }>(
          `SELECT id::text, clinic_id::text
           FROM public.patient_files
           WHERE clinic_id IN ($1, $2)`,
          [fixtures.clinicA, fixtures.clinicB],
        );
        expect(visible.rows).toEqual([
          { id: fileA.id, clinic_id: fixtures.clinicA },
        ]);
      });

      // Cannot insert into Clinic B
      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId }, (tx) =>
            tx.query(
              `INSERT INTO public.patient_files
                 (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
               VALUES ($1, $2, $3, 'cross-clinic.jpg', 'image/jpeg', 1024, $4)`,
              [
                fixtures.clinicB,
                fixtures.patientB,
                makeStoragePath(fixtures.clinicB, fixtures.patientB, 'jpg'),
                userId,
              ],
            ),
          ),
        '42501',
      );
    }

    for (const userId of clinicBRoles) {
      await db.runAsRole({ role: 'authenticated', userId }, async (tx) => {
        const visible = await tx.query<{ id: string; clinic_id: string }>(
          `SELECT id::text, clinic_id::text
           FROM public.patient_files
           WHERE clinic_id IN ($1, $2)`,
          [fixtures.clinicA, fixtures.clinicB],
        );
        expect(visible.rows).toEqual([
          { id: fileB.id, clinic_id: fixtures.clinicB },
        ]);
      });
    }

    // Cross-clinic FK rejected at relational level (even as table owner): clinicA + patientB
    await expectPgError(
      () =>
        db.queryAsOwner(
          `INSERT INTO public.patient_files
             (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
           VALUES ($1, $2, $3, 'cross-fk.jpg', 'image/jpeg', 1024, $4)`,
          [
            fixtures.clinicA,
            fixtures.patientB,
            makeStoragePath(fixtures.clinicA, fixtures.patientB, 'jpg'),
            fixtures.adminA,
          ],
        ),
      '23503',
    );

    // Spoofed uploaded_by (!= auth.uid()) rejected by RLS WITH CHECK (42501)
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.dentistA }, (tx) =>
          tx.query(
            `INSERT INTO public.patient_files
               (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
             VALUES ($1, $2, $3, 'spoofed-uploader.jpg', 'image/jpeg', 1024, $4)`,
            [
              fixtures.clinicA,
              fixtures.patientA,
              makeStoragePath(fixtures.clinicA, fixtures.patientA, 'jpg'),
              fixtures.adminA,
            ],
          ),
        ),
      '42501',
    );

    // Inserting file for an archived patient is blocked by RLS (42501)
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.dentistA }, (tx) =>
          tx.query(
            `INSERT INTO public.patient_files
               (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
             VALUES ($1, $2, $3, 'archived-patient.jpg', 'image/jpeg', 1024, $4)`,
            [
              fixtures.clinicA,
              fixtures.archivedPatientA,
              makeStoragePath(fixtures.clinicA, fixtures.archivedPatientA, 'jpg'),
              fixtures.dentistA,
            ],
          ),
        ),
      '42501',
    );
  });

  it('3. Enforces CHECK constraints on MIME, extension alignment, size limits, file_name, and storage_path format/prefix', async () => {
    const validPathJpg = makeStoragePath(fixtures.clinicA, fixtures.patientA, 'jpg');
    const validPathPdf = makeStoragePath(fixtures.clinicA, fixtures.patientA, 'pdf');

    const invalidCases: readonly {
      label: string;
      storagePath: string;
      fileName: string;
      mimeType: string;
      fileSizeBytes: number;
    }[] = [
      {
        label: 'forbidden SVG mime type',
        storagePath: validPathJpg,
        fileName: 'diagram.svg',
        mimeType: 'image/svg+xml',
        fileSizeBytes: 1024,
      },
      {
        label: 'forbidden HTML mime type',
        storagePath: validPathPdf,
        fileName: 'payload.html',
        mimeType: 'text/html',
        fileSizeBytes: 1024,
      },
      {
        label: 'mime_type / extension mismatch (jpeg with .pdf)',
        storagePath: validPathPdf,
        fileName: 'mismatch.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
      },
      {
        label: 'mime_type / extension mismatch (pdf with .jpg)',
        storagePath: validPathJpg,
        fileName: 'mismatch.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
      },
      {
        label: 'zero bytes',
        storagePath: validPathJpg,
        fileName: 'empty.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 0,
      },
      {
        label: 'negative bytes',
        storagePath: validPathJpg,
        fileName: 'negative.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: -10,
      },
      {
        label: 'exceeds 10 MB limit',
        storagePath: validPathJpg,
        fileName: 'huge.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 10_485_761,
      },
      {
        label: 'blank file_name',
        storagePath: validPathJpg,
        fileName: '   ',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
      },
      {
        label: 'file_name > 255 raw characters (with trailing spaces)',
        storagePath: validPathJpg,
        fileName: `${'a'.repeat(250)}      `,
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
      },
      {
        label: 'path traversal with ..',
        storagePath: `${fixtures.clinicA}/${fixtures.patientA}/../${randomUUID().toLowerCase()}.jpg`,
        fileName: 'traversal.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
      },
      {
        label: 'storage_path prefixed with other clinic',
        storagePath: makeStoragePath(fixtures.clinicB, fixtures.patientA, 'jpg'),
        fileName: 'wrong-clinic.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
      },
      {
        label: 'malformed storage_path (uppercase UUID)',
        storagePath: `${fixtures.clinicA.toUpperCase()}/${fixtures.patientA}/${randomUUID().toLowerCase()}.jpg`,
        fileName: 'uppercase.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
      },
    ];

    for (const testCase of invalidCases) {
      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId: fixtures.dentistA }, (tx) =>
            tx.query(
              `INSERT INTO public.patient_files
                 (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                fixtures.clinicA,
                fixtures.patientA,
                testCase.storagePath,
                testCase.fileName,
                testCase.mimeType,
                testCase.fileSizeBytes,
                fixtures.dentistA,
              ],
            ),
          ),
        '23514',
      );
    }
  });

  it('4. Denies physical DELETE (42501), blocks immutable column updates, archives logically without RETURNING, and logs PII-free patient_file.archived', async () => {
    const sensitiveFileName = 'Layla_Synthetic_Panoramica_Confidencial_2026.png';
    const pathToArchive = makeStoragePath(fixtures.clinicA, fixtures.patientA, 'png');

    const createdFile = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string }>(
          `INSERT INTO public.patient_files
             (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
           VALUES ($1, $2, $3, $4, 'image/png', 128000, $5)
           RETURNING id::text`,
          [
            fixtures.clinicA,
            fixtures.patientA,
            pathToArchive,
            sensitiveFileName,
            fixtures.dentistA,
          ],
        );
        return res.rows[0]!;
      },
    );

    // Physical DELETE denied (42501) for all roles
    for (const userId of [
      fixtures.adminA,
      fixtures.dentistA,
      fixtures.receptionistA,
    ]) {
      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId }, (tx) =>
            tx.query(`DELETE FROM public.patient_files WHERE id = $1`, [
              createdFile.id,
            ]),
          ),
        '42501',
      );
    }

    // Mutating immutable columns (e.g., file_name or storage_path) raises 42501
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(
            `UPDATE public.patient_files SET file_name = 'renamed.png' WHERE id = $1`,
            [createdFile.id],
          ),
        ),
      '42501',
    );

    // Soft-delete without RETURNING works cleanly for dentistA (non-admin)
    const archiveRes = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      (tx) =>
        tx.query(
          `UPDATE public.patient_files
           SET deleted_at = now()
           WHERE id = $1
             AND deleted_at IS NULL`,
          [createdFile.id],
        ),
    );
    expect(archiveRes.rowCount).toBe(1);

    // Immediately invisible in SELECT for non-admin roles (dentistA and receptionistA),
    // while adminA can inspect archived rows for controlled restore/purge (T-06b)
    for (const userId of [fixtures.dentistA, fixtures.receptionistA]) {
      const selectAfter = await db.runAsRole(
        { role: 'authenticated', userId },
        (tx) =>
          tx.query(`SELECT id FROM public.patient_files WHERE id = $1`, [
            createdFile.id,
          ]),
      );
      expect(selectAfter.rows).toHaveLength(0);
    }

    const adminArchivedSelect = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query<{ id: string; deleted_at: string | null }>(
          `SELECT id::text, deleted_at::text FROM public.patient_files WHERE id = $1`,
          [createdFile.id],
        ),
    );
    expect(adminArchivedSelect.rows).toHaveLength(1);
    expect(adminArchivedSelect.rows[0]?.deleted_at).not.toBeNull();

    // Non-admin reactivation attempt affects 0 rows
    for (const userId of [fixtures.dentistA, fixtures.receptionistA]) {
      const reactivateAttempt = await db.runAsRole(
        { role: 'authenticated', userId, commit: true },
        (tx) =>
          tx.query(
            `UPDATE public.patient_files SET deleted_at = NULL WHERE id = $1`,
            [createdFile.id],
          ),
      );
      expect(reactivateAttempt.rowCount).toBe(0);
    }

    // Anti-spoofing: direct transition call fails with 42501 & GUC spoof exposes 0 rows to non-admins
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.adminA }, (tx) =>
          tx.query(
            `SELECT private.begin_patient_file_archive_transition($1::uuid)`,
            [createdFile.id],
          ),
        ),
      '42501',
    );

    for (const userId of [fixtures.dentistA, fixtures.receptionistA]) {
      const gucSpoof = await db.runAsRole(
        { role: 'authenticated', userId },
        async (tx) => {
          await tx.query(
            `SELECT set_config('dentalcare.archiving_patient_file_active', 'on', true)`,
          );
          return tx.query(`SELECT id FROM public.patient_files WHERE id = $1`, [
            createdFile.id,
          ]);
        },
      );
      expect(gucSpoof.rows).toHaveLength(0);
    }

    // Atomic audit_log entry verified as adminA: metadata_json = '{}', ZERO PII / file_name
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
          `SELECT
             clinic_id::text,
             actor_id::text,
             action,
             entity_type,
             entity_id::text,
             metadata_json
           FROM public.audit_log
           WHERE entity_id = $1
             AND action = 'patient_file.archived'`,
          [createdFile.id],
        ),
    );

    expect(auditRes.rows).toHaveLength(1);
    expect(auditRes.rows[0]).toEqual({
      clinic_id: fixtures.clinicA,
      actor_id: fixtures.dentistA,
      action: 'patient_file.archived',
      entity_type: 'patient_file',
      entity_id: createdFile.id,
      metadata_json: {},
    });

    const serializedAudit = JSON.stringify(auditRes.rows[0]);
    expect(serializedAudit).not.toContain('Layla');
    expect(serializedAudit).not.toContain('Panoramica');
    expect(serializedAudit).not.toContain('Confidencial');
    expect(serializedAudit).not.toContain(pathToArchive);
  });

  it('5. Enforces strict append-only multi-clinic RLS on storage.objects and revokes SELECT on archive of file or patient', async () => {
    const objectNameA = makeStoragePath(fixtures.clinicA, fixtures.patientA, 'jpg');

    // 5a. Clinic A user inserts into storage.objects WITHOUT RETURNING (matches upsert: false)
    const insertStorageRes = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      (tx) =>
        tx.query(
          `INSERT INTO storage.objects (bucket_id, name, owner, metadata)
           VALUES ('patient-files', $1, $2, '{"mimetype":"image/jpeg"}'::jsonb)`,
          [objectNameA, fixtures.dentistA],
        ),
    );
    expect(insertStorageRes.rowCount).toBe(1);

    // Before inserting the matching public.patient_files row, SELECT returns 0 rows
    const beforeMetadataSelect = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA },
      (tx) =>
        tx.query(
          `SELECT id, name FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [objectNameA],
        ),
    );
    expect(beforeMetadataSelect.rows).toHaveLength(0);

    // Register matching active row in public.patient_files
    const fileRecordA = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      async (tx) => {
        const res = await tx.query<{ id: string }>(
          `INSERT INTO public.patient_files
             (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
           VALUES ($1, $2, $3, 'intraoral-synthetic.jpg', 'image/jpeg', 64000, $4)
           RETURNING id::text`,
          [fixtures.clinicA, fixtures.patientA, objectNameA, fixtures.dentistA],
        );
        return res.rows[0]!;
      },
    );

    // Now SELECT on storage.objects returns 1 row for Clinic A staff
    for (const userId of [
      fixtures.adminA,
      fixtures.dentistA,
      fixtures.receptionistA,
    ]) {
      const visible = await db.runAsRole(
        { role: 'authenticated', userId },
        (tx) =>
          tx.query<{ name: string }>(
            `SELECT name FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
            [objectNameA],
          ),
      );
      expect(visible.rows).toEqual([{ name: objectNameA }]);
    }

    // 5b. Clinic B user CANNOT SELECT, list, or INSERT under Clinic A prefix
    for (const userId of [
      fixtures.adminB,
      fixtures.dentistB,
      fixtures.receptionistB,
    ]) {
      const clinicBSelect = await db.runAsRole(
        { role: 'authenticated', userId },
        (tx) =>
          tx.query(
            `SELECT name FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
            [objectNameA],
          ),
      );
      expect(clinicBSelect.rows).toHaveLength(0);

      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId }, (tx) =>
            tx.query(
              `INSERT INTO storage.objects (bucket_id, name, owner)
               VALUES ('patient-files', $1, $2)`,
              [makeStoragePath(fixtures.clinicA, fixtures.patientA, 'png'), userId],
            ),
          ),
        '42501',
      );
    }

    // 5c. anon and inactive/deleted users cannot read or upload; archived patient upload rejected
    const anonSelect = await db.runAsRole(
      { role: 'anon', userId: null },
      (tx) =>
        tx.query(
          `SELECT name FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [objectNameA],
        ),
    );
    expect(anonSelect.rows).toHaveLength(0);

    await expectPgError(
      () =>
        db.runAsRole({ role: 'anon', userId: null }, (tx) =>
          tx.query(
            `INSERT INTO storage.objects (bucket_id, name)
             VALUES ('patient-files', $1)`,
            [makeStoragePath(fixtures.clinicA, fixtures.patientA, 'jpg')],
          ),
        ),
      '42501',
    );

    for (const blockedUserId of [fixtures.inactiveA, fixtures.deletedA]) {
      const blockedSelect = await db.runAsRole(
        { role: 'authenticated', userId: blockedUserId },
        (tx) =>
          tx.query(
            `SELECT name FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
            [objectNameA],
          ),
      );
      expect(blockedSelect.rows).toHaveLength(0);

      await expectPgError(
        () =>
          db.runAsRole({ role: 'authenticated', userId: blockedUserId }, (tx) =>
            tx.query(
              `INSERT INTO storage.objects (bucket_id, name, owner)
               VALUES ('patient-files', $1, $2)`,
              [
                makeStoragePath(fixtures.clinicA, fixtures.patientA, 'webp'),
                blockedUserId,
              ],
            ),
          ),
        '42501',
      );
    }

    // Uploading to an archived patient's folder is blocked by storage INSERT RLS
    await expectPgError(
      () =>
        db.runAsRole({ role: 'authenticated', userId: fixtures.dentistA }, (tx) =>
          tx.query(
            `INSERT INTO storage.objects (bucket_id, name, owner)
             VALUES ('patient-files', $1, $2)`,
            [
              makeStoragePath(fixtures.clinicA, fixtures.archivedPatientA, 'jpg'),
              fixtures.dentistA,
            ],
          ),
        ),
      '42501',
    );

    // 5d. UPDATE and DELETE on storage.objects are denied by RLS (append-only, 0 rows affected)
    const updateStorageRes = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      (tx) =>
        tx.query(
          `UPDATE storage.objects SET metadata = '{"tampered":true}'::jsonb WHERE bucket_id = 'patient-files' AND name = $1`,
          [objectNameA],
        ),
    );
    expect(updateStorageRes.rowCount).toBe(0);

    const deleteStorageRes = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      (tx) =>
        tx.query(
          `DELETE FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [objectNameA],
        ),
    );
    expect(deleteStorageRes.rowCount).toBe(0);

    // 5e. Archiving the patient_files row immediately revokes SELECT on storage.objects for non-admin roles
    // (adminA retains SELECT on non-purged archived objects to preview or purge via Storage API — T-06b)
    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      (tx) =>
        tx.query(
          `UPDATE public.patient_files SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
          [fileRecordA.id],
        ),
    );

    for (const userId of [fixtures.dentistA, fixtures.receptionistA]) {
      const afterFileArchiveSelect = await db.runAsRole(
        { role: 'authenticated', userId },
        (tx) =>
          tx.query(
            `SELECT name FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
            [objectNameA],
          ),
      );
      expect(afterFileArchiveSelect.rows).toHaveLength(0);
    }

    // 5f. Archiving the parent patient also immediately revokes SELECT on storage.objects
    const tempPatientId = randomUUID().toLowerCase();
    await db.queryAsOwner(
      `INSERT INTO public.patients (id, clinic_id, full_name)
       VALUES ($1, $2, 'Temporary Patient For Archive Cascade Test')`,
      [tempPatientId, fixtures.clinicA],
    );

    const tempObjectName = makeStoragePath(fixtures.clinicA, tempPatientId, 'webp');
    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA, commit: true },
      async (tx) => {
        await tx.query(
          `INSERT INTO storage.objects (bucket_id, name, owner)
           VALUES ('patient-files', $1, $2)`,
          [tempObjectName, fixtures.dentistA],
        );
        await tx.query(
          `INSERT INTO public.patient_files
             (clinic_id, patient_id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by)
           VALUES ($1, $2, $3, 'temp-patient-photo.webp', 'image/webp', 32000, $4)`,
          [fixtures.clinicA, tempPatientId, tempObjectName, fixtures.dentistA],
        );
      },
    );

    const beforePatientArchive = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.dentistA },
      (tx) =>
        tx.query(
          `SELECT name FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [tempObjectName],
        ),
    );
    expect(beforePatientArchive.rows).toHaveLength(1);

    await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA, commit: true },
      (tx) =>
        tx.query(
          `UPDATE public.patients SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
          [tempPatientId],
        ),
    );

    const afterPatientArchive = await db.runAsRole(
      { role: 'authenticated', userId: fixtures.adminA },
      (tx) =>
        tx.query(
          `SELECT name FROM storage.objects WHERE bucket_id = 'patient-files' AND name = $1`,
          [tempObjectName],
        ),
    );
    expect(afterPatientArchive.rows).toHaveLength(0);
  });
});
