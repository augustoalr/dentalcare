# ADR 0001 — Stack técnico y coste cero en MVP para DentalCare

Fecha: 2026-11-25 · Estado: Aceptada

## Contexto
Necesitamos construir un SaaS de gestión odontológica multi-clínica y multi-país (EN/ES) que valide el flujo diario con una dentista general en Dubái (Dra. Nur Abou Harb), manteniendo:
- Presupuesto de **0 USD/mes** durante desarrollo y validación (solo coste de dominio en Hostinger).
- Dedicación de **3–6 horas/semana** con equipo de agentes IA (Manager + 1 Coder en serie + Revisor).
- Seguridad estricta por clínica (nivel de riesgo 3 en pruebas sintéticas, preparado para nivel 4 antes de datos reales).

## Opciones
1. **React 19 + Vite + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel + `IWhatsAppService` (`wa.me` en MVP)**
   - *Pros:* 0 USD/mes en capas gratuitas, PWA responsive sin burocracia de tiendas móviles, PostgreSQL real con RLS multi-tenant nativo, previews automáticos por PR en Vercel y conector intercambiable para WhatsApp.
   - *Contras:* Supabase Free se pausa tras 7 días sin uso y Vercel Hobby no es para uso comercial de pago (requiere pasar a Pro al facturar a la primera clínica).
2. **Backend propio (Node/NestJS + PostgreSQL gestionado) + Apps nativas iOS/Android + Meta Cloud API desde el día 1**
   - *Pros:* control total del servidor y experiencia nativa.
   - *Contras:* multiplica el coste mensual desde el inicio, duplica el esfuerzo de mantenimiento y exige verificación empresarial previa en Meta y tiendas antes de validar el producto.

## Decisión
Elegimos la **Opción 1**: React 19 + Vite + TypeScript + Tailwind + shadcn/ui en Vercel, PostgreSQL + Auth + RLS + Storage + Edge Functions en Supabase, Sentry (plan gratis, sin PII), CI en GitHub Actions (`verify`) y recordatorios tras la interfaz `IWhatsAppService` empezando con `WaMeWhatsAppAdapter`.

## Consecuencias
- **Ganamos:** velocidad de entrega con coste 0 USD/mes, aislamiento real de datos a nivel de base de datos (RLS) y facilidad para enchufar Meta Cloud API o añadir países/monedas sin reescribir la app.
- **Debemos vigilar:** la pausa de 7 días de Supabase Free durante semanas de baja actividad, la transición a planes Pro antes de incorporar la primera clínica piloto comercial y la auditoría profesional obligatoria (Nivel 4) antes de almacenar pacientes reales.
