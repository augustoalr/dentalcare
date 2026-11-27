# PRD — DentalCare (SaaS de Gestión Odontológica)

Versión: 0.1 · Estado: Aprobado por Augusto López Ramos el 2026-11-25

## 1. Problema
Las clínicas dentales pequeñas y medianas suelen gestionar su día a día con hojas de Excel sueltas, agendas en papel y mensajes dispersos de WhatsApp. Esto provoca citas olvidadas, fichas médicas incompletas, errores de cálculo en presupuestos/facturas y falta de visibilidad del estado diario de la clínica.

## 2. Usuarios
- **Principal (Recepción / Administración):** gestiona citas, alta de pacientes, recordatorios por WhatsApp, cobros y facturación diaria desde ordenador o tablet.
- **Principal (Dentista — perfil validado con la Dra. Nur Abou Harb en Dubái):** consulta su agenda del día, revisa alertas médicas críticas (alergias en rojo), escribe notas de cada visita, consulta/sube radiografías o fotos intraorales y prepara presupuestos.
- **Secundario (Administrador de clínica):** configura moneda, símbolo, porcentaje de impuesto, catálogo de tratamientos y equipo de la clínica.

## 3. Propuesta de valor
Sistema web/PWA unificado que sustituye el caos de Excel y papel con agenda inteligente, ficha clínica básica segura, presupuestos exactos, recordatorios por WhatsApp sin datos clínicos y facturación multi-país configurable.

## 4. MVP (Fase 1 — lo mínimo para validar el flujo completo)
1. **Acceso multi-clínica y roles:** inicio de sesión seguro con aislamiento total por `clinic_id` (`admin`, `dentist`, `receptionist`) e idiomas **inglés y español (i18n)** desde el día 1.
2. **Configuración de clínica multi-país (y bimoneda opcional):** moneda, símbolo y porcentaje de impuesto configurables por clínica (ej. AED 5% VAT, EUR 21% IVA, USD, Venezuela VES `Bs.` 16% IVA) más modo bimoneda opcional con tasa del día congelada (USD + Bs., `T-09b`) sin acoplarse a un solo país.
3. **Ficha completa de paciente (con datos sintéticos):** datos demográficos, **alertas médicas críticas (alergias) destacadas en rojo**, historial de notas por cita y subida de fotos intraorales/radiografías sintéticas en almacenamiento privado.
4. **Agenda inteligente y Panel del día:** calendario de citas con estados claros para el usuario, notas clínicas por visita y vista rápida del día.
5. **Catálogo de tratamientos:** servicios en inglés/español con precios en céntimos enteros y duración estándar.
6. **Presupuestos y Facturación/Pagos básicos:** creación de presupuestos con cálculo exacto, conversión a factura, registro de pagos parciales/totales y anulación segura (sin borrado físico).
7. **Recordatorios de cita por WhatsApp:** botón rápido `wa.me` a coste 0 USD sobre interfaz `IWhatsAppService` (preparada para conectar Meta Cloud API en piloto), **con cero datos clínicos en el mensaje**.

## 5. Fuera de alcance (Fase 2 — NO se hace en el MVP)
- Odontograma y periodontograma interactivo avanzado.
- Portal del paciente completo (autogestión online).
- Sincronización bidireccional con Google Calendar.
- Analítica predictiva o módulos de IA clínica.
- Integración con NABIDH / conectores gubernamentales de salud.
- Apps nativas en App Store / Google Play (el MVP es Web responsive + PWA).
- Envío automático de WhatsApp de pago vía Meta Cloud API (queda preparada la interfaz `IWhatsAppService` para enchufarlo en piloto).

## 6. Requisitos
- **Funcionales:**
  - `RF-01`: El personal inicia sesión y solo ve datos de su propia clínica según su rol.
  - `RF-02`: El admin configura moneda, símbolo, etiqueta e impuesto porcentual de su clínica.
  - `RF-03`: El equipo crea, busca y edita pacientes (con borrado lógico) viendo siempre sus alertas médicas críticas en rojo; el `admin` puede revisar pacientes archivados y restaurarlos con auditoría.
  - `RF-04`: El equipo adjunta, reemplaza y visualiza fotos intraorales/radiografías sintéticas desde almacenamiento privado (con optimización opcional para ahorrar espacio sin comprometer radiografías); quien sube un archivo por error puede eliminarlo definitivamente durante los primeros 15 minutos liberando espacio en Storage, y el `admin` puede restaurar archivos archivados o purgarlos definitivamente en cualquier momento dejando constancia en auditoría.
  - `RF-05`: El equipo agenda citas, actualiza su estado, registra notas clínicas por visita y ve el panel del día.
  - `RF-06`: Recepción/dentista lanza un recordatorio de cita por WhatsApp (`wa.me`) que contiene solo fecha, hora y clínica (cero datos clínicos).
  - `RF-07`: El equipo administra el catálogo de tratamientos y genera presupuestos con totales exactos en céntimos.
  - `RF-08`: El equipo emite facturas (desde presupuesto o directas), registra pagos parciales/totales y puede anular facturas sin borrarlas.
  - `RF-09`: Las acciones sensibles quedan registradas en un `audit_log` inmutable.
- **No funcionales:**
  - **Idiomas:** 100% de textos visibles en archivos de traducción EN/ES (R-14).
  - **Diseño y móvil:** responsive móvil-primero + PWA instalable, con tokens semánticos y manejo de estados Loading, Error, Empty y Overflow.
  - **Seguridad y privacidad:** Nivel de riesgo 3 en pruebas con datos 100% sintéticos; Nivel 4 obligatorio antes de admitir pacientes reales.
  - **Rendimiento:** carga inicial rápida (< 2,5 s en móvil 4G) y UI fluida.

## 7. Plataforma y stack
- **Web responsive + PWA** — React 19 + Vite + TypeScript + Tailwind CSS + shadcn/ui + Supabase + Vercel + GitHub Actions — motivo: coste 0 USD/mes en desarrollo, despliegue automático con previews por PR y seguridad multi-tenant nativa en PostgreSQL (detalle en `docs/adr/0001-stack.md`).

## 8. Restricciones
- **Presupuesto:** 0 USD/mes en desarrollo y validación (solo dominio en Hostinger).
- **Tiempo disponible:** 3–6 horas/semana (tareas pequeñas, en serie, de máximo 1–2 días de agente).
- **Datos sensibles:** SÍ (salud + facturación). Prohibido usar datos reales de pacientes en el MVP.

## 9. Criterio de éxito del MVP
- La Dra. Nur Abou Harb y Augusto completan de principio a fin, con **datos 100% sintéticos** y sin errores bloqueantes, el flujo real de un día en clínica: crear paciente con alergia crítica → agendar cita → lanzar recordatorio `wa.me` sin datos clínicos → añadir nota clínica y radiografía sintética → emitir presupuesto → convertir a factura y registrar pago.

## 10. Riesgos
- **Fuga de datos entre clínicas** → RLS obligatorio en 100% de tablas y Storage + tests automáticos con 2 clínicas ficticias + Revisor obligatorio en tareas `[DELICADA]`.
- **Filtración de datos médicos por WhatsApp o logs** → plantilla de recordatorio estrictamente sin datos clínicos + sanitización antes de enviar errores a Sentry.
- **Pausa de Supabase Free tras 7 días sin uso** → comprobar 5 min antes de demos y pasar a Supabase Pro (25 USD/mes) al entrar la primera clínica piloto real.
- **Cumplimiento legal/salud (Dubái / internacional)** → no introducir datos reales de pacientes hasta pasar revisión de persona cualificada (Nivel de riesgo 4).
