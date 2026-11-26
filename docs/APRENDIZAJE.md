# APRENDIZAJE — lo que aprendo con DentalCare

Modo profesor: SÍ · Lo actualiza el Manager al fusionar cada tarea (R-19).

## Lecciones (una línea por tarea)

| Fecha | Tarea | PR | Lección (1 línea, palabras simples) | Concepto nuevo | Tipo de error (si hubo) | ¿Repetido? |
|---|---|---|---|---|---|---|
| 2026-11-25 | Arranque | — | Guardar dinero en céntimos enteros y aislar proveedores tras conectores evita errores de redondeo y reescrituras futuras | Wrapper / Céntimos enteros | — | — |
| 2026-11-25 | T-01 | #3 | Declarar directamente en `package.json` toda herramienta usada en scripts (como `vite`) evita que el build falle en servidores limpios de CI y Vercel | Dependencia directa vs transitiva (`pnpm`) | Dependencia directa faltante (`vite`) | No |
| 2026-11-25 | T-02 | #7 | Validar el diseño de permisos de base de datos con el Revisor antes de programar evitó 3 huecos de seguridad y dejó el PR en verde al primer intento | Triggers `SECURITY INVOKER` / RLS con `RETURNING` | — (atrapados en prompt) | No |
| 2026-11-26 | T-03 | #10 | En ordenadores compartidos de clínica, cerrar sesión debe incluir respaldo `scope: 'local'` para borrar siempre el token local aunque falle internet en ese instante | `signOut({ scope: 'local' })` / sincronización de refs | Cierre de sesión incompleto ante fallo de red (`B-01`) y carrera en `SIGNED_OUT` (`B-02`) | No |
| 2026-11-26 | T-04 | #13 | Registrar auditoría con un trigger en PostgreSQL y calcular dinero en céntimos enteros (`BigInt`) permite añadir nuevos países (como Venezuela USD/Bs.) sin errores de redondeo ni huecos de trazabilidad | Trigger `AFTER UPDATE` atómico / `BigInt` en céntimos | — | No |
| 2026-11-26 | T-05 | #16 | Archivar pacientes con `deleted_at` (sin borrar filas), mostrar alergias en rojo arriba de todo y guardar la auditoría sin datos personales protege tanto la seguridad clínica como la privacidad | Borrado lógico + transición RLS en PostgreSQL 17 / auditoría sin PII | — | No |

## Errores que se repiten (candidatos a regla)
- *(Vacío todavía. Cuando el mismo tipo de error aparezca por 2.ª vez, el Manager propondrá aquí una nueva regla `R-20…` siguiendo el manual 01 §11).*

## Mi nivel (lo marco yo una vez por semana)

| Tema | Lo puedo explicar | Lo puedo cambiar con ayuda | Lo hago solo |
|---|---|---|---|
| Ramas, PRs y protección de `main` | [ ] | [ ] | [ ] |
| Variables de entorno y secretos (`.env`) | [ ] | [ ] | [ ] |
| Base de datos multi-tenant (`clinic_id` + RLS) | [ ] | [ ] | [ ] |
| Precios en céntimos enteros e impuestos (`_bps`) | [ ] | [ ] | [ ] |
| Interfaces / wrappers (`IWhatsAppService`) | [ ] | [ ] | [ ] |
| Tests automáticos y CI (`verify`) | [ ] | [ ] | [ ] |
