# ESTADO del proyecto — DentalCare

Última actualización: 2026-11-28 15:17 GST por Manager (Inicio Coder T-09: WhatsApp `wa.me` + botón rápido Agendar cita)
Nivel de riesgo del proyecto: 3 (sube a 4 antes de pacientes reales) · Modo profesor: SÍ · Lecciones: `docs/APRENDIZAJE.md`

## Ahora mismo
- En curso: `T-09` — Recordatorios de Cita por WhatsApp (`IWhatsAppService` + `wa.me` sin datos clínicos) + botón rápido "Agendar cita" (aprobado por Augusto, entregado al Coder `T-09 whatsapp-y-cita-rapida`)
- Bloqueado por el humano: Ninguno (`dentalcare-dev` tiene migraciones `T-02`–`T-08` aplicadas + cuentas sintéticas listas)
- Próxima tarea propuesta: `T-09b` — Modo Bimoneda por Clínica (USD + Bs. + tasa del día congelada, `[DELICADA]`, tras fusionar `T-09`)

## Tabla de tareas

| Tarea | Conversación | Rama | Worktree | PR | Estado | Inicio | Merge | Rondas | Errores atrapados | Nota |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 Esqueleto Frontend + i18n + CI | T-01 esqueleto | `t-01-esqueleto-frontend` | — (en serie) | #3 | ✅ Fusionada | 2026-11-25 | 2026-11-25 (`d3e9aaf`) | 2 | 1 (`vite` faltante en `devDependencies`) | Preview probado por Augusto: PASÓ |
| T-02 Esquema BD base + Auth + RLS | T-02 esquema-rls | `t-02-esquema-base-rls` | — (en serie) | #7 | ✅ Fusionada | 2026-11-25 | 2026-11-25 (`5913905`) | 1 (PR) / 2 (prompt) | 3 (en prompt por Revisor; 0 en PR) | `[DELICADA]` Revisor `APROBADO` en `b1b97bd5`; CI `verify` verde al 1.er intento |
| T-03 Login + Shell + Idioma | T-03 login-shell | `t-03-login-shell` | — (en serie) | #10 | ✅ Fusionada | 2026-11-26 | 2026-11-26 (`64004d3`) | 2 (PR) / 1 (prompt) | 2 (en PR por Revisor: `signOut` local fallback y refs síncronos) | `[DELICADA]` Revisor `APROBADO` en `5f2e4942`; preview probado por Augusto: PASÓ |
| T-04 Config clínica multi-país | T-04 config-clinica | `t-04-config-clinica` | — (en serie) | #13 | ✅ Fusionada | 2026-11-26 | 2026-11-26 (`4f29b67`) | 2 (PR, ajuste VE) / 1 (prompt) | 0 | `[DELICADA]` Revisor `APROBADO` en `8351db87`; preview en vivo contra `dentalcare-dev` + `audit_log`: PASÓ |
| T-05 Pacientes + Alertas rojas | T-05 pacientes-alertas | `t-05-pacientes-alertas` | — (en serie) | #16 | ✅ Fusionada | 2026-11-26 | 2026-11-26 (`ad91f23`) | 1 (PR) / 1 (prompt) | 0 | `[DELICADA]` Revisor `APROBADO` en `d1bc7778`; preview en vivo + `patient.archived` sin PII en `dentalcare-dev`: PASÓ |
| T-06 Archivos clínicos privados | T-06 archivos-privados | `t-06-archivos-privados` | — (en serie) | #20 | ✅ Fusionada | 2026-11-26 | 2026-11-27 (`2e864a1`) | 1 (PR) / 2 (prompt) | 1 (bloqueante en prompt: `NULL` en `CHECK` de `storage_path`; 0 en PR) | `[DELICADA]` Revisor `APROBADO` en `0e2a5e23`; preview en vivo + bucket privado + `patient_file.archived` sin PII en `dentalcare-dev`: PASÓ |
| T-06b Archivados, purga espacio (admin + 15 min), optimización y móvil | T-06b archivados-purga-movil | `t-06b-archivados-purga-movil` | — (en serie) | #26 | ✅ Fusionada | 2026-11-27 | 2026-11-27 (`48e5051`) | 2 (PR) / 2 (prompt) | 4 (3 en prompt: B-01/B-02/B-03; 1 en PR: orden rollback `README`) | `[DELICADA]` Revisor `APROBADO` en `b9c0757a`; preview móvil/escritorio + `restored`/`purged` sin PII en `dentalcare-dev`: PASÓ |
| T-07 Catálogo de tratamientos | T-07 catalogo-tratamientos | `t-07-catalogo-tratamientos` | — (en serie) | #30 | ✅ Fusionada | 2026-11-27 | 2026-11-28 (`9d6dc99`) | 1 (PR) / 2 (prompt) | 1 (en prompt: B-01 archivado puro; 0 en PR) | `[DELICADA]` Revisor `APROBADO` en `4cdafb4d`; preview móvil/escritorio + 4 eventos `treatment.*` en `dentalcare-dev`: PASÓ |
| T-08 Agenda + Notas + Panel del día | T-08 agenda-citas-notas | `t-08-agenda-citas-notas` | — (en serie) | #35 | ✅ Fusionada | 2026-11-28 | 2026-11-28 (`c0a12d5`) | 1 (PR) / 3 (prompt) | 6 (en prompt: B-01..B-05 + B-02b; 0 en PR) | `[DELICADA]` Revisor `APROBADO` en `1232f2cc` al 1.er intento; preview + `appointment.*` sin PII en `dentalcare-dev`: PASÓ |
| T-09 Recordatorios WhatsApp (`wa.me`) + botón rápido Agendar cita | T-09 whatsapp-y-cita-rapida | `t-09-whatsapp-recordatorios` | — (en serie) | — | 🛠️ En curso | 2026-11-28 | | 0 | 0 | Prompt `docs/prompts/T-09.md` en manos del Coder (sin migración SQL; incluye botón rápido "Agendar cita" pedido por Augusto) |
| T-09b Modo bimoneda (USD + Bs. + tasa del día) | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Decisión Opción A de Augusto; antes de T-10 y T-11 |
| T-10 Presupuestos exactos | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-05, T-07, T-09b |
| T-11 Facturación y pagos básicos | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-10 |
| T-12 Deploy + Sentry + Rollback | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Crea `docs/DEPLOY.md` |
| T-13 Demo sintética + MVP v0.1.0 | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Crea `CHANGELOG.md` |
| T-14 Privacidad + Paso a Nivel 4 | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Obligatorio antes de pacientes reales |

Estados: ⏳ Pendiente · 🛠️ En curso · 🔍 En revisión · 🔁 Cambios pedidos · ✅ Fusionada · ⛔ Bloqueada

## Pendiente del humano
- [x] Crear repo GitHub, subir archivos base y activar protección de `main` con check `"verify"`
- [x] Abrir conversación nueva `"Manager"` en Fase E
- [x] Previews automáticos de Vercel conectados y verificados en PR #3 (`T-01`), PR #10 (`T-03`) y PR #13 (`T-04`)
- [x] Variables públicas de Supabase configuradas en Vercel + migraciones `T-02`–`T-08` (bucket privado `patient-files`, purga controlada, catálogo de tratamientos y agenda de citas) y cuentas sintéticas (`admin`/`dentist`) aplicadas en `dentalcare-dev`
- [x] Preview unificado en Vercel (`tico17`) verificado en PR #26, PR #30 y PR #35
- [ ] Configurar cuenta gratuita de Sentry antes de `T-12`

## Problemas abiertos conocidos
- Ninguno por ahora.

## Documentos pendientes
- `docs/DEPLOY.md` → `T-12`, antes del primer deploy de pruebas con la Dra. Nur
- `CHANGELOG.md` → `T-13`, con la primera versión publicada (`v0.1.0`)
- Privacidad y términos → `T-14`, obligatorio antes de admitir usuarios/pacientes reales

## Métricas (actualizar al cerrar cada tarea)
- Lead time medio: ~2 h (9 tareas) · Bugs en producción este mes: 0 · CAMBIOS NECESARIOS del Revisor: 8
- CI verde al primer intento: 8 / 9 · Lecciones anotadas: 10
