# APRENDIZAJE — lo que aprendo con DentalCare

Modo profesor: SÍ · Lo actualiza el Manager al fusionar cada tarea (R-19).

## Lecciones (una línea por tarea)

| Fecha | Tarea | PR | Lección (1 línea, palabras simples) | Concepto nuevo | Tipo de error (si hubo) | ¿Repetido? |
|---|---|---|---|---|---|---|
| 2026-11-25 | Arranque | — | Guardar dinero en céntimos enteros y aislar proveedores tras conectores evita errores de redondeo y reescrituras futuras | Wrapper / Céntimos enteros | — | — |
| 2026-11-25 | T-01 | #3 | Declarar directamente en `package.json` toda herramienta usada en scripts (como `vite`) evita que el build falle en servidores limpios de CI y Vercel | Dependencia directa vs transitiva (`pnpm`) | Dependencia directa faltante (`vite`) | No |
| 2026-11-25 | T-02 | #7 | Validar el diseño de permisos de base de datos con el Revisor antes de programar evitó 3 huecos de seguridad y dejó el PR en verde al primer intento | Triggers `SECURITY INVOKER` / RLS con `RETURNING` | — (atrapados en prompt) | No |

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
