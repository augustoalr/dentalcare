# Plan de pruebas — DentalCare

## Qué se prueba y cómo

| Tipo | Herramienta | Qué cubre | Dónde |
|---|---|---|---|
| Unitarias | Vitest | Lógica pura en `src/domain/` (céntimos, impuestos `_bps`, estados, filtro anti datos clínicos en WhatsApp) | Local + CI (`verify`) |
| Integración | Vitest + Supabase (test) | Consultas + RLS + Storage con **2 clínicas ficticias** y los 3 roles (`admin`, `dentist`, `receptionist`) | Local + CI (`verify`) |
| e2e | Playwright (tras completar MVP base) | Login → crear paciente sintético → agendar cita → presupuesto → factura + pago | CI / antes de versión |
| Manual | Navegador escritorio + móvil real | Prueba funcional de Augusto en el **preview de Vercel antes del merge** (Nivel de riesgo 3, R-18) y validación con Dra. Nur | Preview por PR / antes de versión |

## Flujos críticos (nunca pueden romperse)
1. **Aislamiento multi-clínica:** un usuario de Clínica A jamás puede leer, editar ni descargar archivos de Clínica B.
2. **Alertas médicas visibles:** si un paciente tiene alergias críticas, aparecen destacadas en rojo al abrir su ficha.
3. **Privacidad en recordatorios:** ningún enlace `wa.me` ni log de Sentry contiene diagnósticos, tratamientos ni alertas médicas.
4. **Cálculo contable exacto:** presupuestos, facturas y pagos parciales cuadran al céntimo entero en cualquier moneda/impuesto configurado.
5. **Auditoría inmutable:** nadie puede modificar ni borrar filas de `audit_log`.

## Dispositivos de prueba
- Ordenador escritorio (Chrome / Edge — pantalla de recepción)
- Móvil real (iOS Safari y/o Android Chrome — consulta rápida del dentista en PWA)

## Presupuesto de rendimiento (límites propios)
- Pantalla principal carga en `< 2,5 s` en móvil gama media 4G
- JS inicial `< 250 KB` comprimido (gzip)
- Lighthouse (Performance / Accessibility / Best Practices) `≥ 90`

## Accesibilidad
- [ ] Navegación completa por teclado
- [ ] Contraste WCAG AA (especialmente en alertas médicas rojas)
- [ ] Nunca comunicar información crítica solo con color (siempre icono + etiqueta clara)
- [ ] Textos alternativos y etiquetas en formularios (EN y ES)

## Registro de pruebas manuales

| Fecha | Tarea | Paso | Esperado | Lo que vi | Resultado |
|---|---|---|---|---|---|
| *(Pendiente primera tarea visual)* | | | | | |
