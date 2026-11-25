# ESTADO del proyecto — DentalCare

Última actualización: 2026-11-25 15:48 GST por Manager (Cierre T-02 + Prompt T-03 a Revisor)
Nivel de riesgo del proyecto: 3 (sube a 4 antes de pacientes reales) · Modo profesor: SÍ · Lecciones: `docs/APRENDIZAJE.md`

## Ahora mismo
- En curso: `T-03` — Pantalla de Login, Protección de Rutas y Shell de la Clínica (`[DELICADA]`, prompt en revisión por el Revisor antes del Coder, R-02)
- Bloqueado por el humano: Ninguno para revisar el prompt de `T-03`; **antes de probar el Login real de `T-03` en preview** habrá que crear el proyecto `dentalcare` en Supabase y cargar `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` en Vercel (tu cuenta Free tiene actualmente 2 proyectos activos: `ViNapp` y `dubai-run-territory`)
- Próxima tarea propuesta: `T-03` (tras `APTO` del Revisor en `docs/prompts/T-03.md`)

## Tabla de tareas

| Tarea | Conversación | Rama | Worktree | PR | Estado | Inicio | Merge | Rondas | Errores atrapados | Nota |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 Esqueleto Frontend + i18n + CI | T-01 esqueleto | `t-01-esqueleto-frontend` | — (en serie) | #3 | ✅ Fusionada | 2026-11-25 | 2026-11-25 (`d3e9aaf`) | 2 | 1 (`vite` faltante en `devDependencies`) | Preview probado por Augusto: PASÓ |
| T-02 Esquema BD base + Auth + RLS | T-02 esquema-rls | `t-02-esquema-base-rls` | — (en serie) | #7 | ✅ Fusionada | 2026-11-25 | 2026-11-25 (`5913905`) | 1 (PR) / 2 (prompt) | 3 (en prompt por Revisor; 0 en PR) | `[DELICADA]` Revisor `APROBADO` en `b1b97bd5`; CI `verify` verde al 1.er intento |
| T-03 Login + Shell + Idioma | Revisor T-03 (prompt) | — | — (en serie) | — | 🔍 En revisión | 2026-11-25 | | 1 (prompt) | | `[DELICADA]` Prompt en `docs/prompts/T-03.md` pendiente de `APTO` del Revisor (R-02) |
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
- Lead time medio: ~1,5 h (2 tareas) · Bugs en producción este mes: 0 · CAMBIOS NECESARIOS del Revisor: 1
- CI verde al primer intento: 1 / 2 · Lecciones anotadas: 3
