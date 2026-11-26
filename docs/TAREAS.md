# TAREAS (backlog MVP — DentalCare)

Reglas: tareas pequeñas (1–2 días máximo, trabajo en serie adaptado a 3–6 h/semana). Marca `[DELICADA]` obligatoria si toca BD, auth, seguridad, dinero, migraciones o permisos (pasa por Revisor antes y después, regla R-02).

## T-01 — Esqueleto Frontend + Design Tokens + i18n (EN/ES) + CI completo
- Historia de usuario: Como dueño del producto quiero una base web moderna en inglés y español con pruebas automáticas para construir pantallas consistentes desde el primer día.
- Objetivo: Inicializar React 19 + Vite + TypeScript + Tailwind CSS + shadcn/ui + PWA manifest + i18n (EN/ES) + tokens semánticos de color/espaciado + Vitest/ESLint + script `pnpm verify` conectado al CI.
- Criterios de aceptación:
  - [ ] App arranca con `pnpm dev` mostrando una pantalla de bienvenida con selector EN/ES (cero textos fijos fuera de i18n).
  - [ ] Existen tokens semánticos de diseño (incluyendo alerta médica crítica en rojo) y componentes base de estados Loading, Error y Empty.
  - [ ] `pnpm verify` ejecuta lint, typecheck, tests unitarios y build en verde local y en GitHub Actions.
  - [ ] `README.md` y `docs/ARQUITECTURA.md` reflejan la estructura real creada.
- Depende de: Ninguna (tras Fase D)
- Marca:
- Estado: ⏳

## T-02 — Esquema Base de BD (`clinics`, `profiles`, `audit_log`) + Auth + RLS por clínica
- Historia de usuario: Como clínica quiero que nuestros datos estén totalmente aislados de otras clínicas desde la base de datos.
- Objetivo: Crear la migración SQL inicial de `clinics`, `profiles` y `audit_log` (inmutable), activar RLS estricto por `clinic_id` y rol (`admin`/`dentist`/`receptionist`), añadir script `db:verify` al CI y crear el wrapper de acceso a Supabase.
- Criterios de aceptación:
  - [ ] Migración idempotente en `supabase/migrations/` con `clinic_id`, `deleted_at` (excepto `audit_log` inmutable solo `INSERT`) y políticas RLS + `GRANT` explícitos.
  - [ ] Tests de integración verifican con 2 clínicas sintéticas que Clínica A nunca lee ni modifica Clínica B, y que `audit_log` rechaza `UPDATE` y `DELETE`.
  - [ ] `pnpm verify` incluye la verificación de BD en verde.
  - [ ] Ninguna clave privada expuesta en el frontend (R-11).
- Depende de: T-01
- Marca: `[DELICADA]`
- Estado: ⏳

## T-03 — Pantalla de Login, Protección de Rutas y Shell de la Clínica
- Historia de usuario: Como miembro de la clínica quiero iniciar sesión de forma segura y moverme fácilmente desde ordenador o móvil en mi idioma.
- Objetivo: Implementar inicio/cierre de sesión con Supabase Auth, carga del perfil y clínica activa, rutas protegidas y menú responsive (Agenda, Pacientes, Tratamientos, Presupuestos, Facturación, Ajustes).
- Criterios de aceptación:
  - [ ] Un usuario sin sesión es redirigido a `/login`; al autenticarse ve el nombre de su clínica y su rol.
  - [ ] Cambio de idioma EN/ES persistido y sin textos internos en la interfaz (R-14).
  - [ ] Manejo visible de estados Loading, Error de credenciales y sesión expirada.
  - [ ] Tests de flujo de autenticación + `pnpm verify` en verde.
- Depende de: T-02
- Marca: `[DELICADA]`
- Estado: ⏳

## T-04 — Configuración de la Clínica Multi-País (Moneda, Símbolo e Impuesto)
- Historia de usuario: Como administrador de clínica quiero configurar nuestra moneda y porcentaje de impuesto para usar DentalCare en Dubái, España o cualquier país.
- Objetivo: Crear pantalla de ajustes de clínica (solo `admin`) para editar nombre, moneda (`currency_code`), símbolo (`currency_symbol`), impuesto en puntos básicos (`tax_rate_bps`) y etiqueta (`VAT`/`IVA`), registrando el cambio en `audit_log`.
- Criterios de aceptación:
  - [ ] Solo el rol `admin` puede guardar cambios (bloqueado en UI y en RLS de BD; `dentist` y `receptionist` solo lectura).
  - [ ] Función pura de formateo de moneda en `src/domain/` probada con AED (5%), EUR (21%) y USD (0%).
  - [ ] Cada cambio genera una entrada en `audit_log`.
  - [ ] `pnpm verify` en verde.
- Depende de: T-03
- Marca: `[DELICADA]`
- Estado: ⏳

## T-05 — Esquema y Ficha de Pacientes + Alertas Médicas Críticas en Rojo
- Historia de usuario: Como dentista o recepcionista quiero gestionar la ficha de cada paciente y ver sus alergias críticas en rojo nada más abrirla para evitar riesgos médicos.
- Objetivo: Migración SQL de `patients` con RLS y `deleted_at`, listado con buscador, formulario de alta/edición (solo datos sintéticos) y cabecera de ficha con banner rojo destacado para `medical_alerts`.
- Criterios de aceptación:
  - [ ] Migración + RLS probados entre 2 clínicas ficticias; el borrado usa `deleted_at` (nunca `DELETE` físico).
  - [ ] Las alertas médicas aparecen en banner rojo semántico de alto contraste (con icono, no solo color) en la parte superior de la ficha.
  - [ ] Estados vacíos, carga, error y nombres largos (overflow) manejados correctamente.
  - [ ] `pnpm verify` en verde.
- Depende de: T-03
- Marca: `[DELICADA]`
- Estado: ⏳

## T-06 — Fotos Intraorales y Radiografías Sintéticas en Supabase Storage Privado
- Historia de usuario: Como dentista quiero adjuntar y revisar fotos o radiografías sintéticas dentro de la ficha del paciente sin que nadie fuera de mi clínica pueda verlas.
- Objetivo: Migración de `patient_files`, configuración de bucket privado en Supabase Storage con RLS por ruta `clinic_id/patient_id/...` y galería en la ficha del paciente con URLs firmadas temporales.
- Criterios de aceptación:
  - [ ] Bucket estrictamente privado (nunca URL pública directa); se valida tipo MIME permitido (imágenes/PDF) y tamaño máximo.
  - [ ] Tests verifican que un usuario de Clínica B no puede obtener ni listar archivos de Clínica A.
  - [ ] Borrado lógico en `patient_files` registrado en `audit_log`.
  - [ ] `pnpm verify` en verde.
- Depende de: T-05
- Marca: `[DELICADA]`
- Estado: ⏳

## T-07 — Catálogo de Tratamientos (Precios en Céntimos, EN/ES)
- Historia de usuario: Como administrador quiero mantener un catálogo de tratamientos con precios estándar para presupuestar rápido y sin errores.
- Objetivo: Migración de `treatments_catalog` (`default_price_cents` entero, `name_en`, `name_es`, `default_duration_min`) con RLS y CRUD en la interfaz.
- Criterios de aceptación:
  - [ ] Precios guardados siempre en céntimos enteros y mostrados con el símbolo/moneda de la clínica.
  - [ ] Solo `admin` puede crear/editar/archivar tratamientos (enforced por RLS); resto de roles solo lectura.
  - [ ] Tests unitarios de conversión euros/dirhams ↔ céntimos sin errores de decimales + `pnpm verify` en verde.
- Depende de: T-04
- Marca: `[DELICADA]`
- Estado: ⏳

## T-08 — Agenda de Citas + Notas Clínicas por Visita + Panel del Día
- Historia de usuario: Como dentista y recepcionista quiero ver las citas del día, cambiar su estado y escribir notas médicas de cada visita en un solo lugar.
- Objetivo: Migración de `appointments` con RLS, vista de agenda diaria/semanal, panel de inicio "Hoy en la clínica", cambio de estados con etiquetas claras EN/ES y notas clínicas asociadas a cada cita.
- Criterios de aceptación:
  - [ ] Migración + RLS validados (las `clinical_notes` solo pueden editarlas roles autorizados; borrado lógico con `deleted_at`).
  - [ ] Detección de solapamiento de citas para el mismo dentista con aviso claro al usuario.
  - [ ] Panel del día muestra resumen de citas hoy, confirmadas y pendientes en móvil y escritorio.
  - [ ] `pnpm verify` en verde.
- Depende de: T-05
- Marca: `[DELICADA]`
- Estado: ⏳

## T-09 — Recordatorios de Cita por WhatsApp (`IWhatsAppService` + `wa.me`)
- Historia de usuario: Como recepcionista quiero enviar recordatorios de cita por WhatsApp en un clic para reducir ausencias sin exponer datos médicos.
- Objetivo: Implementar la interfaz agnóstica `IWhatsAppService` y su adaptador `WaMeWhatsAppAdapter` (coste 0 USD) con botón desde la cita/panel del día y registro de `reminder_sent_at`.
- Criterios de aceptación:
  - [ ] Interfaz `IWhatsAppService` desacoplada en `src/services/whatsapp/` lista para enchufar Meta Cloud API en el futuro.
  - [ ] Plantilla de mensaje en EN/ES contiene **únicamente** nombre de pila, clínica, fecha y hora (tests unitarios bloquean cualquier campo clínico o alerta médica).
  - [ ] Al lanzar el recordatorio se actualiza `reminder_sent_at` en la cita.
  - [ ] `pnpm verify` en verde.
- Depende de: T-08
- Marca:
- Estado: ⏳

## T-09b — Modo Bimoneda por Clínica (Moneda Secundaria + Tasa del Día Congelada, ej. USD + Bs.)
- Historia de usuario: Como clínica en Venezuela (o país con economía bimonetaria) quiero trabajar en USD y Bolívares (`VES` / `Bs.`) a la vez con una tasa del día configurable para mostrar presupuestos, facturas y pagos en ambas monedas sin errores contables.
- Objetivo: Extender `clinics` con configuración opcional de moneda secundaria (`secondary_currency_code`, `secondary_currency_symbol`, `exchange_rate_micros` entero — nunca coma flotante), pantalla de actualización rápida de tasa del día en `/settings` (con auditoría en `audit_log`) y funciones puras en `src/domain/money.ts` para convertir importes entre moneda principal y secundaria congelando la tasa en cada documento futuro (`T-10`/`T-11`).
- Criterios de aceptación:
  - [ ] Migración SQL idempotente con restricciones `CHECK` y auditoría en `audit_log` para cada cambio de tasa del día.
  - [ ] Motor puro de conversión exacta en `src/domain/money.ts` usando enteros (`BigInt`) probado con USD ↔ VES (`Bs.`).
  - [ ] Clínicas de un solo país/moneda (ej. Dubái AED, España EUR) siguen operando en modo 1 moneda sin complejidad extra en pantalla.
  - [ ] `pnpm verify` (incluyendo `db:verify`) en verde.
- Depende de: T-04
- Marca: `[DELICADA]`
- Estado: ⏳

## T-10 — Presupuestos (`quotes` + `quote_items`) con Cálculo Exacto
- Historia de usuario: Como dentista quiero crear presupuestos claros desde el catálogo de tratamientos para que el paciente sepa el coste exacto antes de empezar.
- Objetivo: Migración de `quotes` y `quote_items` con RLS, motor puro de cálculo en céntimos e impuestos (`tax_rate_bps`) y pantalla de creación, estados y vista lista para imprimir.
- Criterios de aceptación:
  - [ ] Los presupuestos congelan precio unitario e impuesto de ese momento; cambiar el catálogo después no altera presupuestos existentes.
  - [ ] Tests unitarios cubren redondeos, múltiples líneas, cantidades e impuestos (0%, 5%, 21%) al céntimo exacto.
  - [ ] Estados en lenguaje humano EN/ES (`draft`, `sent`, `accepted`, `rejected`, `expired`).
  - [ ] `pnpm verify` en verde.
- Depende de: T-05, T-07, T-09b
- Marca: `[DELICADA]`
- Estado: ⏳

## T-11 — Facturación y Pagos Básicos (`invoices`, `invoice_items`, `payments`)
- Historia de usuario: Como recepcionista o administrador quiero convertir presupuestos en facturas y registrar pagos parciales o totales sin perder trazabilidad contable.
- Objetivo: Migración de `invoices`, `invoice_items` y `payments` con RLS, numeración secuencial por clínica, registro de cobros y anulación segura (`void`) registrada en `audit_log`.
- Criterios de aceptación:
  - [ ] Una factura emitida nunca se borra físicamente; solo se anula pasando a estado `void` con registro en `audit_log`.
  - [ ] El estado (`issued` → `partially_paid` → `paid`) se actualiza coherentemente al sumar los pagos en céntimos enteros.
  - [ ] Tests de integración RLS confirman aislamiento entre clínicas y permisos por rol.
  - [ ] `pnpm verify` en verde.
- Depende de: T-10
- Marca: `[DELICADA]`
- Estado: ⏳

## T-12 — Documentación de Despliegue (`docs/DEPLOY.md`), Sentry y Rollback
- Historia de usuario: Como dueño del producto quiero saber exactamente cómo publicar, monitorizar fallos y volver atrás si algo falla antes de enseñar la app a la Dra. Nur.
- Objetivo: Crear `docs/DEPLOY.md` completo (entornos, límites de planes gratis, backups y procedimiento de rollback), integrar wrapper de Sentry con filtro estricto anti-PII y verificar el primer despliegue en Vercel.
- Criterios de aceptación:
  - [ ] Existe `docs/DEPLOY.md` siguiendo la plantilla oficial del manual.
  - [ ] Wrapper de Sentry limpia cualquier campo sensible antes de enviar errores (verificado con test unitario).
  - [ ] Procedimiento de rollback documentado y probado al menos una vez en preview/staging.
  - [ ] `pnpm verify` en verde.
- Depende de: T-11
- Marca: `[DELICADA]`
- Estado: ⏳

## T-13 — Dataset Sintético de Validación, Auditoría de `SECURITY.md` y MVP `v0.1.0`
- Historia de usuario: Como dueño del producto quiero un entorno de prueba realista (100% ficticio) y la versión `v0.1.0` documentada para validar DentalCare con la Dra. Nur Abou Harb.
- Objetivo: Crear script de seed 100% sintético (clínica demo Dubái en AED 5% + pacientes ficticios), crear `CHANGELOG.md` para `v0.1.0`, revisar `SECURITY.md` con el Revisor y ejecutar el flujo completo de prueba manual.
- Criterios de aceptación:
  - [ ] Existe `CHANGELOG.md` documentando `v0.1.0`.
  - [ ] Seed 100% sintético claramente etiquetado como entorno de demostración (R-10).
  - [ ] `SECURITY.md` revisado y aprobado por el Revisor; cero secretos o datos reales detectados.
  - [ ] Prueba funcional completa de Augusto y validación con la Dra. Nur anotada en `docs/PRUEBAS.md`.
- Depende de: T-12
- Marca: `[DELICADA]`
- Estado: ⏳

## T-14 — Borrador de Privacidad, Términos y Checklist de Paso a Nivel de Riesgo 4
- Historia de usuario: Como dueño del producto quiero tener claros los textos legales y requisitos técnicos antes de permitir cualquier dato real de pacientes.
- Objetivo: Redactar borrador inicial de Política de Privacidad y Términos de Uso (para revisión legal/humana) y crear el checklist bloqueante de auditoría por persona cualificada exigido por el Nivel de Riesgo 4.
- Criterios de aceptación:
  - [ ] Borradores de privacidad y términos listos en `docs/` (pendientes de aprobación humana y asesoría profesional).
  - [ ] Checklist explícito de controles de Nivel 4 (backups automáticos en Supabase Pro, auditoría RLS externa, revisión legal sanitaria).
  - [ ] Aprobación explícita de Augusto antes de cambiar el nivel de riesgo o desactivar el bloqueo de datos reales.
- Depende de: T-13
- Marca: `[DELICADA]`
- Estado: ⏳
