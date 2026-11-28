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

## Estructura principal (actualizada en `T-09`)
- `supabase/migrations/` — Migraciones SQL idempotentes (`202611250001_base_schema_rls.sql`, `202611260001_clinic_settings_audit_trigger.sql`, `202611260002_patients_rls.sql`, `202611260003_patient_files_storage_rls.sql`, `202611270001_archive_restore_purge_rls.sql`, `202611270002_treatments_catalog_rls.sql`, `202611280001_appointments_rls.sql`) y guía de rollback en [supabase/README.md](supabase/README.md)
- `tests/db/` — Harness PostgreSQL 17 (`pg` en CI / `@electric-sql/pglite` en local con stubs `auth` y `storage`) y tests de integración multi-clínica RLS, agenda/citas con protección en BD de notas clínicas, catálogo de tratamientos, Storage privado, restauración, purga de espacio y auditoría atómica (`pnpm db:verify`)
- `src/domain/` — Lógica pura sin dependencias de React ni Supabase (`locale.ts`, `auth.ts`, `money.ts` con conversión exacta `BigInt` importe ↔ céntimos, `appointments.ts` con zona horaria IANA de clínica, detección de solapamientos y resumen KPI diario, `whatsapp.ts` con lista blanca estricta libre de datos clínicos y normalización E.164, `treatments.ts`, `patients.ts`, `patientFiles.ts` con ventana de corrección de 15 min `canSelfPurgeMistakenUpload`, e `imageOptimization.ts` para cálculo de dimensiones y criterios de optimización de imágenes)
- `src/services/` — Wrappers/adaptadores intercambiables (`auth/authService.ts` con `IAuthService`, `whatsapp/whatsappService.ts` con `IWhatsAppService` / `WaMeWhatsAppAdapter` a coste 0 USD preparado para Meta Cloud API, `media/imageOptimizer.ts` con `IImageOptimizer` / `BrowserCanvasImageOptimizer` sin nuevas dependencias, `repositories/clinicAccessRepository.ts`, `repositories/patientRepository.ts`, `repositories/patientFileRepository.ts`, `repositories/treatmentRepository.ts`, `repositories/appointmentRepository.ts` con `IAppointmentRepository`, `markReminderSent` y proyección consciente de privacidad para recepción, `storage/storageAdapter.ts` y `supabase/`)
- `src/features/schedule/` — `SchedulePage` (`/schedule` con panel **"Hoy en la clínica"** anclado a la zona horaria de la clínica, conmutador Día/Semana, filtros por dentista y estado, detección en vivo de solapamientos para el mismo dentista, notas clínicas reservadas a `dentist`/`admin`, recordatorios seguros por WhatsApp con respaldo anti-popup y registro de `reminder_sent_at`, preapertura desde `/schedule?newAppointment=1&patientId=<id>`, archivado lógico y pestaña Archivadas con restauración para `admin`), `TodaySummaryPanel`, `AppointmentForm`, `AppointmentCard`, `AppointmentReminderControls`, `AppointmentClinicalNotesPanel`, `ArchivedAppointmentCard` y `WhatsAppServiceContext`
- `src/features/auth/` — `AuthContext`, `LoginPage`, `ProtectedRoute`, manejo de sesión expirada, perfil ausente y modo sin configurar
- `src/features/patients/` — `PatientsPage` (`/patients` con buscador accesible, badge rojo de alerta médica, banner tras alta con botón rápido **Agendar cita** / **Ver ficha** y pestañas Activos/Archivados + restauración para `admin`), `PatientDetailPage` (`/patients/:patientId` con cabecera responsive móvil, botón rápido **Agendar cita**, `MedicalAlertBanner` en la parte superior, galería privada `PatientFilesSection` y sección compacta `PatientAppointmentsSection` con botón rápido **Agendar cita**, citas del paciente y notas clínicas solo para `dentist`/`admin`) y `PatientForm` reutilizable (datos 100% sintéticos)
- `src/features/treatments/` — `TreatmentsPage` (`/treatments` con precios en céntimos formateados según la moneda de la clínica, nombres EN/ES, categorías traducidas, buscador y filtro; CRUD completo + pestañas Activos/Archivados solo para `admin`, vista de solo lectura para `dentist`/`receptionist`), `TreatmentForm` con vista previa de precio/impuesto en vivo, `TreatmentCard` y `ArchivedTreatmentCard`
- `src/features/settings/` — `ClinicSettingsPage` en `/settings` (edición multi-país solo para `admin`, modo de solo lectura para `dentist`/`receptionist`, plantillas rápidas EAU/España/EE. UU./Venezuela `USD` y `VES` y vista previa de cálculo en vivo)
- `src/features/shell/` — `ClinicShell` responsive móvil-primero (barra lateral en escritorio + drawer accesible en móvil) con las 6 secciones de la clínica (`/schedule`, `/patients`, `/treatments`, `/quotes`, `/billing`, `/settings`)
- `src/i18n/` — Traducciones 100% paritarias `locales/en.json` y `locales/es.json` + sincronización local y en `profiles.preferred_locale`
- `src/ui/` — Tokens semánticos (`src/index.css`), utilidades (`cn`), primitivos `shadcn/ui` (`Button`, `Card`, `Badge`, `Input`, `Label`, `Select`, `Textarea`) y estados base (`LoadingState`, `ErrorState`, `EmptyState`, `MedicalAlertBanner`)
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
