# ESTADO del proyecto — DentalCare

Última actualización: 2026-11-26 08:16 GST por Manager (Cierre T-03 + Prompt T-04 a Revisor)
Nivel de riesgo del proyecto: 3 (sube a 4 antes de pacientes reales) · Modo profesor: SÍ · Lecciones: `docs/APRENDIZAJE.md`

## Ahora mismo
- En curso: `T-04` — Configuración de la Clínica Multi-País (Moneda, Símbolo e Impuesto) (`[DELICADA]`, prompt en revisión por el Revisor antes del Coder, R-02)
- Bloqueado por el humano: Ninguno para revisar el prompt de `T-04` (confirmar que la migración SQL de `supabase/migrations/` y un usuario sintético de prueba estén aplicados en el Supabase conectado a Vercel para probar pantallas autenticadas en preview)
- Próxima tarea propuesta: `T-04` (tras `APTO` del Revisor en `docs/prompts/T-04.md`)

## Tabla de tareas

| Tarea | Conversación | Rama | Worktree | PR | Estado | Inicio | Merge | Rondas | Errores atrapados | Nota |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 Esqueleto Frontend + i18n + CI | T-01 esqueleto | `t-01-esqueleto-frontend` | — (en serie) | #3 | ✅ Fusionada | 2026-11-25 | 2026-11-25 (`d3e9aaf`) | 2 | 1 (`vite` faltante en `devDependencies`) | Preview probado por Augusto: PASÓ |
| T-02 Esquema BD base + Auth + RLS | T-02 esquema-rls | `t-02-esquema-base-rls` | — (en serie) | #7 | ✅ Fusionada | 2026-11-25 | 2026-11-25 (`5913905`) | 1 (PR) / 2 (prompt) | 3 (en prompt por Revisor; 0 en PR) | `[DELICADA]` Revisor `APROBADO` en `b1b97bd5`; CI `verify` verde al 1.er intento |
| T-03 Login + Shell + Idioma | T-03 login-shell | `t-03-login-shell` | — (en serie) | #10 | ✅ Fusionada | 2026-11-26 | 2026-11-26 (`64004d3`) | 2 (PR) / 1 (prompt) | 2 (en PR por Revisor: `signOut` local fallback y refs síncronos) | `[DELICADA]` Revisor `APROBADO` en `5f2e4942`; preview probado por Augusto: PASÓ |
| T-04 Config clínica multi-país | Revisor T-04 (prompt) | — | — (en serie) | — | 🔍 En revisión | 2026-11-26 | | 1 (prompt) | | `[DELICADA]` Prompt en `docs/prompts/T-04.md` pendiente de `APTO` del Revisor (R-02) |
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
- [x] Previews automáticos de Vercel conectados y verificados en PR #3 (`T-01`) y PR #10 (`T-03`)
- [x] Variables públicas de Supabase configuradas en Vercel (verificado en vivo en preview de `T-03`)
- [ ] Confirmar migraciones de `supabase/migrations/` aplicadas y usuario sintético `admin` creado en el proyecto Supabase conectado a Vercel para probar pantallas autenticadas en preview de `T-04`
- [ ] Configurar cuenta gratuita de Sentry antes de `T-12`

## Problemas abiertos conocidos
- Ninguno por ahora.

## Documentos pendientes
- `docs/DEPLOY.md` → `T-12`, antes del primer deploy de pruebas con la Dra. Nur
- `CHANGELOG.md` → `T-13`, con la primera versión publicada (`v0.1.0`)
- Privacidad y términos → `T-14`, obligatorio antes de admitir usuarios/pacientes reales

## Métricas (actualizar al cerrar cada tarea)
- Lead time medio: ~2 h (3 tareas) · Bugs en producción este mes: 0 · CAMBIOS NECESARIOS del Revisor: 2
- CI verde al primer intento: 2 / 3 · Lecciones anotadas: 4
