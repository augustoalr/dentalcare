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
| 2026-11-25 | T-01 | Preview Vercel (`dentalcare-git-t-01-esqueleto-frontend-tico17.vercel.app`): carga inicial, aviso sintético, cambio EN↔ES con persistencia tras recarga, alerta médica roja con icono y 3 estados base | Carga correcta, 100% traducido EN/ES, idioma persistido y estados/alerta médica legibles | Validado por Augusto en preview antes del merge de PR #3 (`06dd8116`) | PASÓ |
| 2026-11-26 | T-03 | Preview Vercel (`dentalcare-git-t-03-login-shell-tico17.vercel.app`): redirección `/` y `/patients` a `/login`, aviso sintético, cambio EN↔ES con recarga sin 404, intento de acceso con datos aleatorios contra Supabase Auth | Protección de rutas, traducciones completas, sin 404 SPA y error traducido ante credenciales incorrectas | Validado por Augusto en preview antes del merge de PR #10 (`5f2e4942`); Supabase ya estaba conectado en Vercel y devolvió error traducido de datos incorrectos | PASÓ |
| 2026-11-26 | T-04 | Preview Vercel (`dentalcare-git-t-04-config-clinica-tico17.vercel.app`) conectado a `dentalcare-dev`: login con `admin.demo@dentalcare.test`, presets Venezuela VES (`Bs.` 16% IVA) y USD, vista previa en vivo, guardado persistente tras F5 y verificación de `public.audit_log` | Ajustes editables solo para `admin`, vista previa exacta, cabecera refrescada al instante y entradas atómicas `clinic.settings_updated` en `audit_log` | Validado por Augusto en preview antes del merge de PR #13 (`8351db87`); 3 entradas `clinic.settings_updated` confirmadas en `dentalcare-dev` | PASÓ |
