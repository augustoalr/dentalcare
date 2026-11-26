# DentalCare — SaaS de Gestión Odontológica

Sistema web/PWA unificado para clínicas dentales que sustituye el caos de Excel y papel con agenda inteligente, ficha clínica básica, presupuestos, recordatorios por WhatsApp sin datos clínicos y facturación multi-país configurable.

> **Aviso de seguridad (Nivel de riesgo 3 → 4):** Este proyecto maneja flujos de salud y facturación. Durante el desarrollo y las pruebas piloto se usan **exclusivamente datos sintéticos/falsos**. Nunca introduzcas datos reales de pacientes hasta completar la auditoría profesional de Nivel 4.

## Stack principal
- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS + shadcn/ui + React Router + i18n (EN/ES) + PWA
- **Backend y BD:** Supabase (PostgreSQL + Auth + RLS estricto por `clinic_id` + Storage privado + Edge Functions)
- **Hosting y CI:** Vercel (`vercel.json` con rewrite SPA) + GitHub Actions (check obligatorio `verify`) + Sentry + dominio en Hostinger

## Primeros pasos
1. Copia `.env.example` a `.env.local` y rellena únicamente tus claves públicas de prueba (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; nunca subas `.env.local` a git ni expongas `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_DB_URL` en el frontend). Sin esas variables, `/login` muestra un aviso seguro de entorno sin configurar sin fingir sesión.
2. Instala dependencias:
   ```bash
   pnpm install
   ```
3. Arranca el entorno local:
   ```bash
   pnpm dev
   ```
4. Ejecuta la verificación completa (la misma que corre el CI `verify`: lint, typecheck, tests unitarios y de flujo, verificación real de BD `pnpm db:verify` y build):
   ```bash
   pnpm verify
   ```

## Estructura principal (actualizada en `T-04`)
- `supabase/migrations/` — Migraciones SQL idempotentes (`202611250001_base_schema_rls.sql`, `202611260001_clinic_settings_audit_trigger.sql`) y guía de rollback en [supabase/README.md](supabase/README.md)
- `tests/db/` — Harness PostgreSQL 17 (`pg` en CI / `@electric-sql/pglite` en local) y tests de integración multi-clínica RLS y auditoría atómica (`pnpm db:verify`)
- `src/domain/` — Lógica pura sin dependencias de React ni Supabase (`locale.ts`, `auth.ts`, `money.ts`: formateo de moneda en céntimos enteros, cálculo de impuestos en puntos básicos `_bps` con `BigInt` y validación multi-país)
- `src/services/` — Wrappers/adaptadores intercambiables (`auth/authService.ts` con `IAuthService`, `repositories/clinicAccessRepository.ts` con `IClinicAccessRepository`, `storage/storageAdapter.ts` y `supabase/`)
- `src/features/auth/` — `AuthContext`, `LoginPage`, `ProtectedRoute`, manejo de sesión expirada, perfil ausente y modo sin configurar
- `src/features/settings/` — `ClinicSettingsPage` en `/settings` (edición multi-país solo para `admin`, modo de solo lectura para `dentist`/`receptionist`, plantillas rápidas EAU/España/EE. UU. y vista previa de cálculo en vivo)
- `src/features/shell/` — `ClinicShell` responsive móvil-primero (barra lateral en escritorio + drawer accesible en móvil) con las 6 secciones de la clínica (`/schedule`, `/patients`, `/treatments`, `/quotes`, `/billing`, `/settings`)
- `src/i18n/` — Traducciones 100% paritarias `locales/en.json` y `locales/es.json` + sincronización local y en `profiles.preferred_locale`
- `src/ui/` — Tokens semánticos (`src/index.css`), utilidades (`cn`), primitivos `shadcn/ui` (`Button`, `Card`, `Badge`, `Input`, `Label`, `Select`) y estados base (`LoadingState`, `ErrorState`, `EmptyState`, `MedicalAlertBanner`)
- `vercel.json` y `public/manifest.webmanifest` — Rewrite SPA para previews/producción en Vercel y configuración PWA base

## Documentación del proyecto
- [AGENTS.md](AGENTS.md) — Reglas permanentes (R-01 a R-19) para todos los agentes
- [docs/PRD.md](docs/PRD.md) — Requisitos de producto, MVP y fuera de alcance
- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — Diagrama, componentes y modelo de datos canónico
- [docs/adr/0001-stack.md](docs/adr/0001-stack.md) — Decisión técnica del stack
- [docs/TAREAS.md](docs/TAREAS.md) — Backlog de tareas (`T-01` en adelante)
- [docs/ESTADO.md](docs/ESTADO.md) — Estado actual del proyecto (vive en `main`)
- [docs/MANAGER.md](docs/MANAGER.md) — Guía operativa del Manager
- [docs/APRENDIZAJE.md](docs/APRENDIZAJE.md) — Cuaderno de aprendizaje guiado (Modo profesor)
- [docs/PRUEBAS.md](docs/PRUEBAS.md) — Plan de pruebas, rendimiento y accesibilidad
- [SECURITY.md](SECURITY.md) — Inventario de secretos (solo nombres) y política de seguridad
- [CONTRIBUTING.md](CONTRIBUTING.md) — Reglas de ramas, commits y Pull Requests
