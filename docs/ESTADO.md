# ESTADO del proyecto — DentalCare

Última actualización: 2026-11-25 13:20 GST por Manager (Cierre T-01 + Prompt T-02 a Revisor)
Nivel de riesgo del proyecto: 3 (sube a 4 antes de pacientes reales) · Modo profesor: SÍ · Lecciones: `docs/APRENDIZAJE.md`

## Ahora mismo
- En curso: `T-02` — Esquema Base de BD (`clinics`, `profiles`, `audit_log`) + Auth + RLS (`[DELICADA]`, prompt en revisión por el Revisor antes del Coder, R-02)
- Bloqueado por el humano: Ninguno para revisar el prompt de `T-02`; antes de `T-03` (Login real) habrá que crear el proyecto `dentalcare` en Supabase (la cuenta tiene actualmente 2 proyectos activos en plan Free: `ViNapp` y `dubai-run-territory`)
- Próxima tarea propuesta: `T-02` (tras `APTO` del Revisor en `docs/prompts/T-02.md`)

## Tabla de tareas

| Tarea | Conversación | Rama | Worktree | PR | Estado | Inicio | Merge | Rondas | Errores atrapados | Nota |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 Esqueleto Frontend + i18n + CI | T-01 esqueleto | `t-01-esqueleto-frontend` | — (en serie) | #3 | ✅ Fusionada | 2026-11-25 | 2026-11-25 (`d3e9aaf`) | 2 | 1 (`vite` faltante en `devDependencies`) | Preview probado por Augusto: PASÓ |
| T-02 Esquema BD base + Auth + RLS | Revisor T-02 (prompt) | — | — (en serie) | — | 🔍 En revisión | 2026-11-25 | | | | `[DELICADA]` Prompt en `docs/prompts/T-02.md` pendiente de `APTO` del Revisor (R-02) |
| T-03 Login + Shell + Idioma | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-02 |
| T-04 Config clínica multi-país | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-03 |
| T-05 Pacientes + Alertas rojas | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-03 |
| T-06 Archivos clínicos privados | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-05 |
| T-07 Catálogo de tratamientos | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-04 |
| T-08 Agenda + Notas + Panel del día | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-05 |
| T-09 Recordatorios WhatsApp (`wa.me`) | — | — | — (en serie) | — | ⏳ Pendiente | | | | | Depende de T-08 |
| T-10 Presupuestos exactos | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-05, T-07 |
| T-11 Facturación y pagos básicos | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-10 |
| T-12 Deploy + Sentry + Rollback | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Crea `docs/DEPLOY.md` |
| T-13 Demo sintética + MVP v0.1.0 | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Crea `CHANGELOG.md` |
| T-14 Privacidad + Paso a Nivel 4 | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Obligatorio antes de pacientes reales |

Estados: ⏳ Pendiente · 🛠️ En curso · 🔍 En revisión · 🔁 Cambios pedidos · ✅ Fusionada · ⛔ Bloqueada

## Pendiente del humano
- [x] Crear repo GitHub, subir archivos base y activar protección de `main` con check `"verify"`
- [x] Abrir conversación nueva `"Manager"` en Fase E
- [x] Previews automáticos de Vercel conectados y verificados en PR #3 (`T-01`)
- [ ] Crear proyecto Supabase `dentalcare` y configurar secretos (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`) antes de `T-03` (la cuenta tiene actualmente 2 proyectos activos en plan Free: `ViNapp` y `dubai-run-territory`)
- [ ] Configurar cuenta gratuita de Sentry antes de `T-12`

## Problemas abiertos conocidos
- Ninguno por ahora.

## Documentos pendientes
- `docs/DEPLOY.md` → `T-12`, antes del primer deploy de pruebas con la Dra. Nur
- `CHANGELOG.md` → `T-13`, con la primera versión publicada (`v0.1.0`)
- Privacidad y términos → `T-14`, obligatorio antes de admitir usuarios/pacientes reales

## Métricas (actualizar al cerrar cada tarea)
- Lead time medio: < 1 h (1 tarea) · Bugs en producción este mes: 0 · CAMBIOS NECESARIOS del Revisor: 0
- CI verde al primer intento: 0 / 1 · Lecciones anotadas: 2
