# ESTADO del proyecto — DentalCare

Última actualización: 2026-11-25 12:45 GST por Manager (Inicio de T-01)
Nivel de riesgo del proyecto: 3 (sube a 4 antes de pacientes reales) · Modo profesor: SÍ · Lecciones: `docs/APRENDIZAJE.md`

## Ahora mismo
- En curso: `T-01` — Esqueleto Frontend + Design Tokens + i18n (EN/ES) + CI completo (prompt listo en `docs/prompts/T-01.md`)
- Bloqueado por el humano: Ninguno para empezar `T-01` (confirmar conexión de Vercel/Supabase/Sentry antes de preview de `T-01` / arranque de `T-02`)
- Próxima tarea propuesta: `T-02` — Esquema Base de BD + Auth + RLS (`[DELICADA]`, tras fusionar `T-01`)

## Tabla de tareas

| Tarea | Conversación | Rama | Worktree | PR | Estado | Inicio | Merge | Rondas | Errores atrapados | Nota |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 Esqueleto Frontend + i18n + CI | T-01 esqueleto | `t-01-esqueleto-frontend` | — (en serie) | — | 🛠️ En curso | 2026-11-25 | | | | Prompt guardado en `docs/prompts/T-01.md` |
| T-02 Esquema BD base + Auth + RLS | — | — | — (en serie) | — | ⏳ Pendiente | | | | | `[DELICADA]` Depende de T-01 |
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
- [ ] Confirmar/configurar cuentas gratuitas y secretos en paneles (Vercel para previews de `T-01`, Supabase antes de `T-02`, Sentry antes de `T-12`)

## Problemas abiertos conocidos
- Ninguno por ahora.

## Documentos pendientes
- `docs/DEPLOY.md` → `T-12`, antes del primer deploy de pruebas con la Dra. Nur
- `CHANGELOG.md` → `T-13`, con la primera versión publicada (`v0.1.0`)
- Privacidad y términos → `T-14`, obligatorio antes de admitir usuarios/pacientes reales

## Métricas (actualizar al cerrar cada tarea)
- Lead time medio: — · Bugs en producción este mes: 0 · CAMBIOS NECESARIOS del Revisor: 0
- CI verde al primer intento: 0 / 0 · Lecciones anotadas: 0
