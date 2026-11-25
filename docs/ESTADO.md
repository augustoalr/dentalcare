# ESTADO del proyecto — DentalCare

Última actualización: 2026-11-25 11:35 GST por Arquitecto (Arranque Fase C)
Nivel de riesgo del proyecto: 3 (sube a 4 antes de pacientes reales) · Modo profesor: SÍ · Lecciones: `docs/APRENDIZAJE.md`

## Ahora mismo
- En curso: Ninguna (Fase C de documentación y archivos base completada; pendiente Fase D de montaje en GitHub/Vercel/Supabase)
- Bloqueado por el humano: Crear repo en GitHub, subir commit inicial, activar protección de `main` y cuentas gratuitas (Fase D)
- Próxima tarea propuesta: `T-01` — Esqueleto Frontend + Design Tokens + i18n (EN/ES) + CI completo

## Tabla de tareas

| Tarea | Conversación | Rama | Worktree | PR | Estado | Inicio | Merge | Rondas | Errores atrapados | Nota |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 Esqueleto Frontend + i18n + CI | — | — | — (en serie) | — | ⏳ Pendiente | | | | | Primera tarea tras Fase D |
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
- [ ] Completar Fase D (crear repo GitHub, subir archivos base, activar protección de `main` con check `"verify"`, configurar cuentas gratis y secretos en paneles)
- [ ] Abrir conversación nueva `"Manager"` en Fase E

## Problemas abiertos conocidos
- Ninguno por ahora.

## Documentos pendientes
- `docs/DEPLOY.md` → `T-12`, antes del primer deploy de pruebas con la Dra. Nur
- `CHANGELOG.md` → `T-13`, con la primera versión publicada (`v0.1.0`)
- Privacidad y términos → `T-14`, obligatorio antes de admitir usuarios/pacientes reales

## Métricas (actualizar al cerrar cada tarea)
- Lead time medio: — · Bugs en producción este mes: 0 · CAMBIOS NECESARIOS del Revisor: 0
- CI verde al primer intento: 0 / 0 · Lecciones anotadas: 0
