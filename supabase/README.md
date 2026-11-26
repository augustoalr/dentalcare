# Base de datos y migraciones — DentalCare (`supabase/`)

Este directorio es la **única fuente de verdad** del esquema SQL de DentalCare (PostgreSQL 17 / Supabase).

## Estructura
- `migrations/` — Migraciones SQL ordenadas cronológicamente e **idempotentes** (se pueden aplicar 2 veces seguidas sin error).
  - `202611250001_base_schema_rls.sql`: crea `public.clinics`, `public.profiles`, `public.audit_log`, índices RLS, el esquema interno `private` (`current_clinic_id()`, `current_user_role()`, `is_clinic_admin()`), triggers `SECURITY INVOKER` de integridad/anti-escalada/inmutabilidad, y las políticas RLS + `GRANT` mínimos explícitos.
  - `202611260001_clinic_settings_audit_trigger.sql`: crea la función `private.log_clinic_settings_change()` (`SECURITY INVOKER`, `SET search_path = ''`) y el trigger `trg_clinics_30_audit_settings` (`AFTER UPDATE ON public.clinics`) para registrar de forma atómica en `public.audit_log` (`action = 'clinic.settings_updated'`) cualquier cambio real en las 7 columnas configurables de la clínica (`name`, `currency_code`, `currency_symbol`, `tax_rate_bps`, `tax_label`, `timezone`, `default_locale`).
  - `202611260002_patients_rls.sql`: crea `public.patients` con `CHECK` de integridad, índices (`idx_patients_clinic_id`, `idx_patients_clinic_active_name`), triggers `SECURITY INVOKER` (`private.guard_patient_update()`, `private.set_updated_at()`, `private.log_patient_archive()`), RLS multi-clínica estricto (`SELECT`, `INSERT`, `UPDATE`, **nunca `GRANT DELETE`**) y auditoría atómica sin PII (`action = 'patient.archived'`, `metadata_json = '{}'`) al archivar con `deleted_at`.
  - `202611260003_patient_files_storage_rls.sql`: añade `UNIQUE (clinic_id, id)` en `public.patients`, crea `public.patient_files` con FK compuesta `(clinic_id, patient_id)`, validaciones estrictas de ruta `<clinic_id>/<patient_id>/<uuid>.<ext>`, MIME permitido (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`) y límite 10 MB, borrado lógico auditado sin PII (`action = 'patient_file.archived'`, `metadata_json = '{}'`), y configura el bucket privado `patient-files` (`public = false`) junto con políticas append-only en `storage.objects` (`INSERT` y `SELECT`, sin `UPDATE`/`DELETE`).

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

### A) Revertir únicamente `202611260003_patient_files_storage_rls.sql` (`T-06`)

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

### B) Revertir únicamente `202611260002_patients_rls.sql` (`T-05`)

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

### C) Revertir únicamente `202611260001_clinic_settings_audit_trigger.sql` (`T-04`)

Si necesitas desactivar o revertir únicamente el trigger de auditoría de configuración de clínica manteniendo intactas las tablas y datos sintéticos:

```sql
BEGIN;

DROP TRIGGER IF EXISTS trg_clinics_30_audit_settings ON public.clinics;
DROP FUNCTION IF EXISTS private.log_clinic_settings_change();

COMMIT;
```

### D) Revertir el esquema completo (`202611260003` + `202611260002` + `202611260001` + `202611250001`) en desarrollo/pruebas

Si necesitas revertir todo el esquema en una base de datos de desarrollo/pruebas **sin datos reales**:

1. Realiza un snapshot/backup previo si quieres conservar datos sintéticos de prueba y **vacía primero el bucket `patient-files`** desde el Supabase Dashboard o Storage API (nunca mediante `DELETE FROM storage.objects` en SQL).
2. Ejecuta el siguiente script de limpieza controlada en una transacción desde un rol propietario (`postgres` / SQL Editor):

```sql
BEGIN;

-- 1. Eliminar políticas de Storage y el bucket vacío
DROP POLICY IF EXISTS patient_files_storage_select_same_clinic ON storage.objects;
DROP POLICY IF EXISTS patient_files_storage_insert_same_clinic ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'patient-files';

-- 2. Eliminar triggers (archivos clínicos, pacientes, clínicas, perfiles y audit_log)
DROP TRIGGER IF EXISTS trg_patient_files_30_audit_archive ON public.patient_files;
DROP TRIGGER IF EXISTS trg_patient_files_20_set_updated_at ON public.patient_files;
DROP TRIGGER IF EXISTS trg_patient_files_10_guard_update ON public.patient_files;
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
