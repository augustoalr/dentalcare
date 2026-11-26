# Base de datos y migraciones — DentalCare (`supabase/`)

Este directorio es la **única fuente de verdad** del esquema SQL de DentalCare (PostgreSQL 17 / Supabase).

## Estructura
- `migrations/` — Migraciones SQL ordenadas cronológicamente e **idempotentes** (se pueden aplicar 2 veces seguidas sin error).
  - `202611250001_base_schema_rls.sql`: crea `public.clinics`, `public.profiles`, `public.audit_log`, índices RLS, el esquema interno `private` (`current_clinic_id()`, `current_user_role()`, `is_clinic_admin()`), triggers `SECURITY INVOKER` de integridad/anti-escalada/inmutabilidad, y las políticas RLS + `GRANT` mínimos explícitos.
  - `202611260001_clinic_settings_audit_trigger.sql`: crea la función `private.log_clinic_settings_change()` (`SECURITY INVOKER`, `SET search_path = ''`) y el trigger `trg_clinics_30_audit_settings` (`AFTER UPDATE ON public.clinics`) para registrar de forma atómica en `public.audit_log` (`action = 'clinic.settings_updated'`) cualquier cambio real en las 7 columnas configurables de la clínica (`name`, `currency_code`, `currency_symbol`, `tax_rate_bps`, `tax_label`, `timezone`, `default_locale`).

## Cómo ejecutar la verificación de BD (`pnpm db:verify`)
```bash
pnpm db:verify
```
- **En local (sin Docker ni credenciales cloud):** cuando `SUPABASE_DB_URL` no está definida, el harness (`tests/db/testDbHarness.ts`) levanta automáticamente un PostgreSQL 17 embebido (`@electric-sql/pglite`), crea los stubs mínimos de `auth` solo dentro del test, aplica la migración dos veces (idempotencia) y ejecuta la batería completa de pruebas RLS con 2 clínicas sintéticas.
- **En CI (GitHub Actions) o contra un PostgreSQL 17 local/remoto de pruebas:** define `SUPABASE_DB_URL` (ejemplo: `postgres://postgres:postgres@127.0.0.1:5432/dentalcare_test`) y ejecuta `pnpm db:verify`. Las pruebas correrán contra ese PostgreSQL 17 real usando `pg`.
- `pnpm verify` ejecuta automáticamente `pnpm lint && pnpm typecheck && pnpm test && pnpm db:verify && pnpm build`.

> **Seguridad (R-11):** nunca pongas `SUPABASE_DB_URL` ni `SUPABASE_SERVICE_ROLE_KEY` en variables `VITE_*` ni en archivos subidos a git.

## Plan de vuelta atrás (Rollback — R-18)

> **Ámbito:** Este procedimiento aplica exclusivamente a entornos de **desarrollo y pruebas con datos 100% sintéticos** (Nivel de riesgo 3). Antes de admitir datos reales de pacientes (Nivel de riesgo 4), cualquier rollback en producción deberá restaurar un backup/PITR de Supabase Pro y requerirá autorización explícita del dueño del producto.

### A) Revertir únicamente `202611260001_clinic_settings_audit_trigger.sql` (`T-04`)

Si necesitas desactivar o revertir únicamente el trigger de auditoría de configuración de clínica manteniendo intactas las tablas y datos sintéticos:

```sql
BEGIN;

DROP TRIGGER IF EXISTS trg_clinics_30_audit_settings ON public.clinics;
DROP FUNCTION IF EXISTS private.log_clinic_settings_change();

COMMIT;
```

### B) Revertir el esquema base completo (`202611260001` + `202611250001`) en desarrollo/pruebas

Si necesitas revertir todo el esquema en una base de datos de desarrollo/pruebas **sin datos reales**:

1. Realiza un snapshot/backup previo si quieres conservar datos sintéticos de prueba.
2. Ejecuta el siguiente script de limpieza controlada en una transacción desde un rol propietario (`postgres` / SQL Editor):

```sql
BEGIN;

-- 1. Eliminar triggers (incluyendo auditoría de clínicas y bloqueo de inmutabilidad en audit_log)
DROP TRIGGER IF EXISTS trg_clinics_30_audit_settings ON public.clinics;
DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON public.audit_log;
DROP TRIGGER IF EXISTS trg_audit_log_no_mutation ON public.audit_log;
DROP TRIGGER IF EXISTS trg_audit_log_enforce_defaults ON public.audit_log;
DROP TRIGGER IF EXISTS trg_profiles_20_set_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_10_guard_update ON public.profiles;
DROP TRIGGER IF EXISTS trg_clinics_20_set_updated_at ON public.clinics;
DROP TRIGGER IF EXISTS trg_clinics_10_guard_update ON public.clinics;

-- 2. Eliminar tablas en orden de dependencias FK
DROP TABLE IF EXISTS public.audit_log;
DROP TABLE IF EXISTS public.profiles;
DROP TABLE IF EXISTS public.clinics;

-- 3. Eliminar funciones auxiliares y esquema privado
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
