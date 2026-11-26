# ESTADO del proyecto — DentalCare

Última actualización: 2026-11-26 12:40 GST por Manager (Inicio Coder T-05 tras APTO del Revisor)
Nivel de riesgo del proyecto: 3 (sube a 4 antes de pacientes reales) · Modo profesor: SÍ · Lecciones: `docs/APRENDIZAJE.md`

## Ahora mismo
- En curso: `T-05` — Esquema y Ficha de Pacientes + Alertas Médicas Críticas en Rojo (`[DELICADA]`, prompt `APTO` por el Revisor al 1.er intento en `2a60526`, entregado al Coder)
- Bloqueado por el humano: Ninguno (`dentalcare-dev` ya tiene migraciones previas y cuentas sintéticas `admin`/`dentist` listas)
- Próxima tarea propuesta: `T-06` — Fotos Intraorales y Radiografías Sintéticas en Supabase Storage Privado (`[DELICADA]`, tras fusionar `T-05`)

## Tabla de tareas

| Tarea | Conversación | Rama | Worktree | PR | Estado | Inicio | Merge | Rondas | Errores atrapados | Nota |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 Esqueleto Frontend + i18n + CI | T-01 esqueleto | `t-01-esqueleto-frontend` | — (en serie) | #3 | ✅ Fusionada | 2026-11-25 | 2026-11-25 (`d3e9aaf`) | 2 | 1 (`vite` faltante en `devDependencies`) | Preview probado por Augusto: PASÓ |
| T-02 Esquema BD base + Auth + RLS | T-02 esquema-rls | `t-02-esquema-base-rls` | — (en serie) | #7 | ✅ Fusionada | 2026-11-25 | 2026-11-25 (`5913905`) | 1 (PR) / 2 (prompt) | 3 (en prompt por Revisor; 0 en PR) | `[DELICADA]` Revisor `APROBADO` en `b1b97bd5`; CI `verify` verde al 1.er intento |
| T-03 Login + Shell + Idioma | T-03 login-shell | `t-03-login-shell` | — (en serie) | #10 | ✅ Fusionada | 2026-11-26 | 2026-11-26 (`64004d3`) | 2 (PR) / 1 (prompt) | 2 (en PR por Revisor: `signOut` local fallback y refs síncronos) | `[DELICADA]` Revisor `APROBADO` en `5f2e4942`; preview probado por Augusto: PASÓ |
| T-04 Config clínica multi-país | T-04 config-clinica | `t-04-config-clinica` | — (en serie) | #13 | ✅ Fusionada | 2026-11-26 | 2026-11-26 (`4f29b67`) | 2 (PR, ajuste VE) / 1 (prompt) | 0 | `[DELICADA]` Revisor `APROBADO` en `8351db87`; preview en vivo contra `dentalcare-dev` + `audit_log`: PASÓ |
| T-05 Pacientes + Alertas rojas | T-05 pacientes-alertas | `t-05-pacientes-alertas` | — (en serie) | — | 🛠️ En curso | 2026-11-26 | | 1 (prompt) | 0 | `[DELICADA]` Prompt `APTO` por Revisor (`2a60526`), en manos del Coder |
| T-06 Archivos clínicos privados | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-05 |
| T-07 Catálogo de tratamientos | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-04 |
| T-08 Agenda + Notas + Panel del día | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-05 |
| T-09 Recordatorios WhatsApp (`wa.me`) | — | — | — (en serie) | — | ⏳ Pendiente | | | | | Depende de T-08 |
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
- [x] Variables públicas de Supabase configuradas en Vercel + migraciones `T-02`/`T-04` y cuentas sintéticas (`admin`/`dentist`) aplicadas en `dentalcare-dev`
- [ ] *(Opcional, higiene)* Eliminar el proyecto duplicado en una de las dos cuentas de Vercel (`tico17` vs `augustoalrs-projects`) para tener un único enlace de preview por PR
- [ ] Configurar cuenta gratuita de Sentry antes de `T-12`

## Problemas abiertos conocidos
- Ninguno por ahora.

## Documentos pendientes
- `docs/DEPLOY.md` → `T-12`, antes del primer deploy de pruebas con la Dra. Nur
- `CHANGELOG.md` → `T-13`, con la primera versión publicada (`v0.1.0`)
- Privacidad y términos → `T-14`, obligatorio antes de admitir usuarios/pacientes reales

## Métricas (actualizar al cerrar cada tarea)
- Lead time medio: ~2,5 h (4 tareas) · Bugs en producción este mes: 0 · CAMBIOS NECESARIOS del Revisor: 2
- CI verde al primer intento: 3 / 4 · Lecciones anotadas: 5
