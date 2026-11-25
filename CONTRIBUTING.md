# Cómo contribuir a DentalCare

## Ramas
- `main` está protegida: ningún cambio entra sin Pull Request y sin el check obligatorio `"verify"` en verde.
- Nombre de rama: `t-XX-descripcion-corta` (ejemplo: `t-01-esqueleto-frontend`).
- Ramas cortas y atómicas: una tarea = una rama = un PR.

## Commits (Conventional Commits)
- `feat(T-XX): …` función nueva
- `fix(T-XX): …` corrección de fallo
- `docs(T-XX): …` documentación (`docs(estado): T-XX` para actualizar ESTADO/APRENDIZAJE)
- `test(T-XX): …` pruebas nuevas
- `chore(T-XX): …` mantenimiento o configuración

## Pull Requests
- Título obligatorio: `T-XX: qué hace`
- Descripción: qué cambia, cómo se probó, riesgos, documentos actualizados y sección `Para Augusto` (Qué hice y por qué, según regla R-19).
- Merge: siempre `squash` con `--match-head-commit <sha>` tras publicar el checklist con `gh pr comment` (y `APROBADO` del Revisor en tareas `[DELICADA]`).

## Antes de abrir el PR
- Ejecutar `pnpm verify` en local (debe salir 100% en verde).
- Comprobar que no hay secretos, claves ni datos reales de pacientes en el diff.
- No añadir dependencias nuevas sin justificarlas en el PR y revisar su licencia.
