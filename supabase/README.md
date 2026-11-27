# Base de datos y migraciones — DentalCare (`supabase/`)

Este directorio es la **única fuente de verdad** del esquema SQL de DentalCare (PostgreSQL 17 / Supabase).

## Estructura
- `migrations/` — Migraciones SQL ordenadas cronológicamente e **idempotentes** (se pueden aplicar 2 veces seguidas sin error).
  - `202611250001_base_schema_rls.sql`: crea `public.clinics`, `public.profiles`, `public.audit_log`, índices RLS, el esquema interno `private` (`current_clinic_id()`, `current_user_role()`, `is_clinic_admin()`), triggers `SECURITY INVOKER` de integridad/anti-escalada/inmutabilidad, y las políticas RLS + `GRANT` mínimos explícitos.
  - `202611260001_clinic_settings_audit_trigger.sql`: crea la función `private.log_clinic_settings_change()` (`SECURITY INVOKER`, `SET search_path = ''`) y el trigger `trg_clinics_30_audit_settings` (`AFTER UPDATE ON public.clinics`) para registrar de forma atómica en `public.audit_log` (`action = 'clinic.settings_updated'`) cualquier cambio real en las 7 columnas configurables de la clínica (`name`, `currency_code`, `currency_symbol`, `tax_rate_bps`, `tax_label`, `timezone`, `default_locale`).
  - `202611260002_patients_rls.sql`: crea `public.patients` con `CHECK` de integridad, índices (`idx_patients_clinic_id`, `idx_patients_clinic_active_name`), triggers `SECURITY INVOKER` (`private.guard_patient_update()`, `private.set_updated_at()`, `private.log_patient_archive()`), RLS multi-clínica estricto (`SELECT`, `INSERT`, `UPDATE`, **nunca `GRANT DELETE`**) y auditoría atómica sin PII (`action = 'patient.archived'`, `metadata_json = '{}'`) al archivar con `deleted_at`.
  - `202611260003_patient_files_storage_rls.sql`: añade `UNIQUE (clinic_id, id)` en `public.patients`, crea `public.patient_files` con FK compuesta `(clinic_id, patient_id)`, validaciones estrictas de ruta `<clinic_id>/<patient_id>/<uuid>.<ext>`, MIME permitido (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`) y límite 10 MB, borrado lógico auditado sin PII (`action = 'patient_file.archived'`, `metadata_json = '{}'`), y configura el bucket privado `patient-files` (`public = false`) junto con políticas append-only en `storage.objects` (`INSERT` y `SELECT`, sin `UPDATE`/`DELETE`).
  - `202611270001_archive_restore_purge_rls.sql`: añade `purged_at` + restricción `patient_files_purged_requires_deleted_check` e índices parciales de archivados, trigger `BEFORE INSERT` anti-falsificación de `created_at` (`trg_patient_files_05_enforce_defaults` / `private.enforce_patient_file_defaults()`, B-01), inmutabilidad permanente tras `purged_at` incluso frente a propietario/`service_role` (B-02), lectura y restauración exclusiva de `admin` sobre pacientes y archivos archivados (`patient.restored` / `patient_file.restored` sin PII), y política `FOR DELETE` en `storage.objects` (`patient_files_storage_delete_authorized`) que habilita la liberación de espacio vía Storage API exclusivamente para `admin` sobre archivados o el propio autor dentro de los primeros 15 minutos (`patient_file.purged` sin PII).

## Cómo ejecutar la verificación de BD (`pnpm db:verify`)
```bash
pnpm db:verify
```
- **En local (sin Docker ni credenciales cloud):** cuando `SUPABASE_DB_URL` no está definida, el harness (`tests/db/testDbHarness.ts`) levanta automáticamente un PostgreSQL 17 embebido (`@electric-sql/pglite`), crea los stubs mínimos de `auth` y `storage` solo dentro del test, aplica las migraciones dos veces (idempotencia) y ejecuta la batería completa de pruebas RLS (BD + Storage) con 2 clínicas sintéticas.
- **En CI (GitHub Actions) o contra un PostgreSQL 17 local/remoto de pruebas:** define `SUPABASE_DB_URL` (ejemplo: `postgres://postgres:postgres@127.0.0.1:5432/dentalcare_test`) y ejecuta `pnpm db:verify`. Las pruebas correrán contra ese PostgreSQL 17 real usando `pg`.
- `pnpm verify` ejecuta automáticamente `pnpm lint && pnpm typecheck && pnpm test && pnpm db:verify && pnpm build`.

> **Seguridad (R-11):** nunca pongas `SUPABASE_DB_URL` ni `SUPABASE_SERVICE_ROLE_KEY` en variables `VITE_*` ni en archivos subidos a git.

## Plan de vuelta atrás (Rollback — R-18)

> **Ámbito:** Este procedimiento aplica exclusivamente a entornos de **desarrollo y pruebas con datos 100% sintéticos** (Nivel de riesgo 3). Antes de admitir datos reales de pacientes (Nivel de riesgo 4), cualquier rollback en producción deberá restaurar un backup/PITR de Supabase Pro y requerirá autorización explícita del dueño del producto.

### A) Revertir únicamente `202611270001_archive_restore_purge_rls.sql` (`T-06b`)

Si necesitas revertir únicamente los permisos de archivados/restauración/purga de espacio en desarrollo/pruebas manteniendo intactas todas las tablas y reglas de `T-02`–`T-06`:

> **Nota:** Antes de eliminar la columna `purged_at`, recuerda que cualquier objeto binario ya eliminado mediante Storage API no se puede regenerar sin backup; las filas históricas en `public.patient_files` y `public.audit_log` siguen existiendo.

```sql
BEGIN;

-- 1. Eliminar política DELETE de Storage y restaurar SELECT append-only previo (T-06)
DROP POLICY IF EXISTS patient_files_storage_delete_authorized ON storage.objects;

DROP POLICY IF EXISTS patient_files_storage_select_same_clinic ON storage.objects;
CREATE POLICY patient_files_storage_select_same_clinic
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'patient-files'
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = (SELECT private.current_clinic_id())::text
    AND EXISTS (
      SELECT 1
      FROM public.patient_files AS pf
      JOIN public.patients AS p
        ON p.id = pf.patient_id
      WHERE pf.storage_path = storage.objects.name
        AND pf.clinic_id = (SELECT private.current_clinic_id())
        AND pf.deleted_at IS NULL
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
  );

-- 2. Restaurar funciones y políticas RLS previas de public.patients (T-05)
CREATE OR REPLACE FUNCTION private.guard_patient_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable columns (id, clinic_id, created_at) cannot be modified on patients'
      USING ERRCODE = '42501';
  END IF;

  IF current_user IN ('authenticated', 'anon') THEN
    IF OLD.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Archived patient records cannot be modified or reactivated'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      PERFORM private.begin_patient_archive_transition(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.log_patient_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM private.end_patient_archive_transition(NEW.id);

    v_actor_id := (SELECT auth.uid());
    IF v_actor_id IS NOT NULL THEN
      INSERT INTO public.audit_log (
        clinic_id, actor_id, action, entity_type, entity_id, metadata_json
      )
      VALUES (
        NEW.clinic_id, v_actor_id, 'patient.archived', 'patient', NEW.id, '{}'::jsonb
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  private.guard_patient_update(),
  private.log_patient_archive()
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS patients_select_same_clinic ON public.patients;
CREATE POLICY patients_select_same_clinic
  ON public.patients
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND (deleted_at IS NULL OR private.is_patient_being_archived(id))
  );

DROP POLICY IF EXISTS patients_update_same_clinic ON public.patients;
CREATE POLICY patients_update_same_clinic
  ON public.patients
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND deleted_at IS NULL
  )
  WITH CHECK (clinic_id = (SELECT private.current_clinic_id()));

-- 3. Restaurar funciones y políticas RLS previas de public.patient_files (T-06)
--    (antes de eliminar purged_at para evitar error de dependencia 2BP01 en políticas RLS)
CREATE OR REPLACE FUNCTION private.begin_patient_file_archive_transition(p_patient_file_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.pg_trigger_depth() < 1 THEN
    RAISE EXCEPTION 'Archive transition helper can only be invoked from an active trigger'
      USING ERRCODE = '42501';
  END IF;

  IF p_patient_file_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.patient_files AS pf
    JOIN public.patients AS p
      ON p.id = pf.patient_id AND p.clinic_id = pf.clinic_id
    WHERE pf.id = p_patient_file_id
      AND pf.clinic_id = private.current_clinic_id()
      AND pf.deleted_at IS NULL
      AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Archive transition denied for patient file record'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config('dentalcare.archiving_patient_file_active', 'on', true);

  INSERT INTO private.patient_file_archive_transitions (txid, patient_file_id)
  VALUES (pg_catalog.pg_current_xact_id(), p_patient_file_id)
  ON CONFLICT (txid, patient_file_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION private.begin_patient_file_archive_transition(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.begin_patient_file_archive_transition(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_patient_file_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
    OR NEW.file_name IS DISTINCT FROM OLD.file_name
    OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
    OR NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes
    OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable columns cannot be modified on patient_files'
      USING ERRCODE = '42501';
  END IF;

  IF current_user IN ('authenticated', 'anon') THEN
    IF OLD.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Archived patient file records cannot be modified or reactivated'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      PERFORM private.begin_patient_file_archive_transition(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.log_patient_file_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM private.end_patient_file_archive_transition(NEW.id);

    v_actor_id := (SELECT auth.uid());
    IF v_actor_id IS NOT NULL THEN
      INSERT INTO public.audit_log (
        clinic_id, actor_id, action, entity_type, entity_id, metadata_json
      )
      VALUES (
        NEW.clinic_id, v_actor_id, 'patient_file.archived', 'patient_file', NEW.id, '{}'::jsonb
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  private.guard_patient_file_update(),
  private.log_patient_file_archive()
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS patient_files_select_same_clinic ON public.patient_files;
CREATE POLICY patient_files_select_same_clinic
  ON public.patient_files
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND (deleted_at IS NULL OR private.is_patient_file_being_archived(id))
    AND EXISTS (
      SELECT 1
      FROM public.patients AS p
      WHERE p.id = patient_files.patient_id
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS patient_files_insert_same_clinic ON public.patient_files;
CREATE POLICY patient_files_insert_same_clinic
  ON public.patient_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
    AND uploaded_by = (SELECT auth.uid())
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.patients AS p
      WHERE p.id = patient_files.patient_id
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS patient_files_update_same_clinic ON public.patient_files;
CREATE POLICY patient_files_update_same_clinic
  ON public.patient_files
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.patients AS p
      WHERE p.id = patient_files.patient_id
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (clinic_id = (SELECT private.current_clinic_id()));

-- 4. Eliminar trigger anti-spoofing de INSERT, índices parciales, CHECK y columna purged_at
DROP TRIGGER IF EXISTS trg_patient_files_05_enforce_defaults ON public.patient_files;
DROP FUNCTION IF EXISTS private.enforce_patient_file_defaults();

DROP INDEX IF EXISTS public.idx_patient_files_patient_archived;
DROP INDEX IF EXISTS public.idx_patients_clinic_archived;

ALTER TABLE public.patient_files
  DROP CONSTRAINT IF EXISTS patient_files_purged_requires_deleted_check;
ALTER TABLE public.patient_files
  DROP COLUMN IF EXISTS purged_at;

COMMIT;
```

### B) Revertir únicamente `202611260003_patient_files_storage_rls.sql` (`T-06`)

> Requiere haber revertido antes `202611270001_archive_restore_purge_rls.sql` (`T-06b`) para retirar primero la política `DELETE` de Storage y el trigger `trg_patient_files_05_enforce_defaults`.

Si necesitas revertir únicamente los archivos clínicos y el bucket privado `patient-files` en desarrollo/pruebas manteniendo intactos `patients`, `clinics`, `profiles` y `audit_log`:

1. **Vacía primero el bucket `patient-files`** desde el Supabase Dashboard (Storage → `patient-files` → Empty bucket) o mediante la Storage API. **Nunca** ejecutes `DELETE FROM storage.objects` directamente por SQL en Supabase Cloud.
2. Ejecuta la limpieza en una transacción desde un rol propietario (`postgres` / SQL Editor):

```sql
BEGIN;

-- 1. Eliminar políticas de Storage y el bucket vacío
DROP POLICY IF EXISTS patient_files_storage_select_same_clinic ON storage.objects;
DROP POLICY IF EXISTS patient_files_storage_insert_same_clinic ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'patient-files';

-- 2. Eliminar triggers, políticas y tabla public.patient_files ANTES de tocar public.patients
DROP TRIGGER IF EXISTS trg_patient_files_30_audit_archive ON public.patient_files;
DROP TRIGGER IF EXISTS trg_patient_files_20_set_updated_at ON public.patient_files;
DROP TRIGGER IF EXISTS trg_patient_files_10_guard_update ON public.patient_files;

DROP POLICY IF EXISTS patient_files_update_same_clinic ON public.patient_files;
DROP POLICY IF EXISTS patient_files_insert_same_clinic ON public.patient_files;
DROP POLICY IF EXISTS patient_files_select_same_clinic ON public.patient_files;

DROP TABLE IF EXISTS public.patient_files;
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_clinic_id_id_unique;

-- 3. Eliminar tabla privada de transición y funciones de T-06
DROP TABLE IF EXISTS private.patient_file_archive_transitions;
DROP FUNCTION IF EXISTS private.log_patient_file_archive();
DROP FUNCTION IF EXISTS private.guard_patient_file_update();
DROP FUNCTION IF EXISTS private.is_patient_file_being_archived(uuid);
DROP FUNCTION IF EXISTS private.end_patient_file_archive_transition(uuid);
DROP FUNCTION IF EXISTS private.begin_patient_file_archive_transition(uuid);

COMMIT;
```

### C) Revertir únicamente `202611260002_patients_rls.sql` (`T-05`)

> Requiere haber revertido antes `202611260003_patient_files_storage_rls.sql` (`T-06`) debido a la FK compuesta desde `public.patient_files`.

Si necesitas revertir únicamente el módulo de pacientes en desarrollo/pruebas manteniendo intactos `clinics`, `profiles` y `audit_log` (recuerda que `audit_log` es inmutable y conserva su historial sin PII):

```sql
BEGIN;

DROP TRIGGER IF EXISTS trg_patients_30_audit_archive ON public.patients;
DROP TRIGGER IF EXISTS trg_patients_20_set_updated_at ON public.patients;
DROP TRIGGER IF EXISTS trg_patients_10_guard_update ON public.patients;

DROP POLICY IF EXISTS patients_update_same_clinic ON public.patients;
DROP POLICY IF EXISTS patients_insert_same_clinic ON public.patients;
DROP POLICY IF EXISTS patients_select_same_clinic ON public.patients;

DROP TABLE IF EXISTS public.patients;
DROP TABLE IF EXISTS private.patient_archive_transitions;

DROP FUNCTION IF EXISTS private.log_patient_archive();
DROP FUNCTION IF EXISTS private.guard_patient_update();
DROP FUNCTION IF EXISTS private.is_patient_being_archived(uuid);
DROP FUNCTION IF EXISTS private.end_patient_archive_transition(uuid);
DROP FUNCTION IF EXISTS private.begin_patient_archive_transition(uuid);

COMMIT;
```

### D) Revertir únicamente `202611260001_clinic_settings_audit_trigger.sql` (`T-04`)

Si necesitas desactivar o revertir únicamente el trigger de auditoría de configuración de clínica manteniendo intactas las tablas y datos sintéticos:

```sql
BEGIN;

DROP TRIGGER IF EXISTS trg_clinics_30_audit_settings ON public.clinics;
DROP FUNCTION IF EXISTS private.log_clinic_settings_change();

COMMIT;
```

### E) Revertir el esquema completo (`202611270001` + `202611260003` + `202611260002` + `202611260001` + `202611250001`) en desarrollo/pruebas

Si necesitas revertir todo el esquema en una base de datos de desarrollo/pruebas **sin datos reales**:

1. Realiza un snapshot/backup previo si quieres conservar datos sintéticos de prueba y **vacía primero el bucket `patient-files`** desde el Supabase Dashboard o Storage API (nunca mediante `DELETE FROM storage.objects` en SQL).
2. Ejecuta el siguiente script de limpieza controlada en una transacción desde un rol propietario (`postgres` / SQL Editor):

```sql
BEGIN;

-- 1. Eliminar políticas de Storage y el bucket vacío
DROP POLICY IF EXISTS patient_files_storage_delete_authorized ON storage.objects;
DROP POLICY IF EXISTS patient_files_storage_select_same_clinic ON storage.objects;
DROP POLICY IF EXISTS patient_files_storage_insert_same_clinic ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'patient-files';

-- 2. Eliminar triggers (archivos clínicos, pacientes, clínicas, perfiles y audit_log)
DROP TRIGGER IF EXISTS trg_patient_files_30_audit_archive ON public.patient_files;
DROP TRIGGER IF EXISTS trg_patient_files_20_set_updated_at ON public.patient_files;
DROP TRIGGER IF EXISTS trg_patient_files_10_guard_update ON public.patient_files;
DROP TRIGGER IF EXISTS trg_patient_files_05_enforce_defaults ON public.patient_files;
DROP TRIGGER IF EXISTS trg_patients_30_audit_archive ON public.patients;
DROP TRIGGER IF EXISTS trg_patients_20_set_updated_at ON public.patients;
DROP TRIGGER IF EXISTS trg_patients_10_guard_update ON public.patients;
DROP TRIGGER IF EXISTS trg_clinics_30_audit_settings ON public.clinics;
DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON public.audit_log;
DROP TRIGGER IF EXISTS trg_audit_log_no_mutation ON public.audit_log;
DROP TRIGGER IF EXISTS trg_audit_log_enforce_defaults ON public.audit_log;
DROP TRIGGER IF EXISTS trg_profiles_20_set_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_10_guard_update ON public.profiles;
DROP TRIGGER IF EXISTS trg_clinics_20_set_updated_at ON public.clinics;
DROP TRIGGER IF EXISTS trg_clinics_10_guard_update ON public.clinics;

-- 3. Eliminar tablas públicas y privadas en orden de dependencias FK
DROP TABLE IF EXISTS public.patient_files;
DROP TABLE IF EXISTS public.patients;
DROP TABLE IF EXISTS public.audit_log;
DROP TABLE IF EXISTS public.profiles;
DROP TABLE IF EXISTS public.clinics;
DROP TABLE IF EXISTS private.patient_file_archive_transitions;
DROP TABLE IF EXISTS private.patient_archive_transitions;

-- 4. Eliminar todas las funciones auxiliares y el esquema privado
DROP FUNCTION IF EXISTS private.enforce_patient_file_defaults();
DROP FUNCTION IF EXISTS private.log_patient_file_archive();
DROP FUNCTION IF EXISTS private.guard_patient_file_update();
DROP FUNCTION IF EXISTS private.is_patient_file_being_archived(uuid);
DROP FUNCTION IF EXISTS private.end_patient_file_archive_transition(uuid);
DROP FUNCTION IF EXISTS private.begin_patient_file_archive_transition(uuid);
DROP FUNCTION IF EXISTS private.log_patient_archive();
DROP FUNCTION IF EXISTS private.guard_patient_update();
DROP FUNCTION IF EXISTS private.is_patient_being_archived(uuid);
DROP FUNCTION IF EXISTS private.end_patient_archive_transition(uuid);
DROP FUNCTION IF EXISTS private.begin_patient_archive_transition(uuid);
DROP FUNCTION IF EXISTS private.log_clinic_settings_change();
DROP FUNCTION IF EXISTS private.prevent_audit_log_mutation();
DROP FUNCTION IF EXISTS private.enforce_audit_log_defaults();
DROP FUNCTION IF EXISTS private.guard_profile_update();
DROP FUNCTION IF EXISTS private.guard_clinic_update();
DROP FUNCTION IF EXISTS private.set_updated_at();
DROP FUNCTION IF EXISTS private.is_clinic_admin();
DROP FUNCTION IF EXISTS private.current_user_role();
DROP FUNCTION IF EXISTS private.current_clinic_id();
DROP SCHEMA IF EXISTS private;

COMMIT;
```

3. Verifica con `pnpm db:verify` tras aplicar de nuevo las migraciones corregidas.
