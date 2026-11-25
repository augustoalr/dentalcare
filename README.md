# DentalCare — SaaS de Gestión Odontológica

Sistema web/PWA unificado para clínicas dentales que sustituye el caos de Excel y papel con agenda inteligente, ficha clínica básica, presupuestos, recordatorios por WhatsApp sin datos clínicos y facturación multi-país configurable.

> **Aviso de seguridad (Nivel de riesgo 3 → 4):** Este proyecto maneja flujos de salud y facturación. Durante el desarrollo y las pruebas piloto se usan **exclusivamente datos sintéticos/falsos**. Nunca introduzcas datos reales de pacientes hasta completar la auditoría profesional de Nivel 4.

## Stack principal
- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS + shadcn/ui + i18n (EN/ES) + PWA
- **Backend y BD:** Supabase (PostgreSQL + Auth + RLS estricto por `clinic_id` + Storage privado + Edge Functions)
- **Hosting y CI:** Vercel + GitHub Actions (check obligatorio `verify`) + Sentry + dominio en Hostinger

## Primeros pasos (disponibles tras completar `T-01`)
1. Copia `.env.example` a `.env.local` y rellena únicamente tus claves de prueba (nunca subas `.env.local` a git).
2. Instala dependencias:
   ```bash
   pnpm install
   ```
3. Arranca el entorno local:
   ```bash
   pnpm dev
   ```
4. Ejecuta la verificación completa (la misma que corre el CI `verify`):
   ```bash
   pnpm verify
   ```

## Documentación del proyecto
- [AGENTS.md](AGENTS.md) — Reglas permanentes (R-01 a R-19) para todos los agentes
- [docs/PRD.md](docs/PRD.md) — Requisitos de producto, MVP y fuera de alcance
- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — Diagrama, componentes y modelo de datos canónico
- [docs/adr/0001-stack.md](docs/adr/0001-stack.md) — Decisión técnica del stack
- [docs/TAREAS.md](docs/TAREAS.md) — Backlog de tareas (`T-01` en adelante)
- [docs/ESTADO.md](docs/ESTADO.md) — Estado actual del proyecto (vive en `main`)
- [docs/MANAGER.md](docs/MANAGER.md) — Guía operativa del Manager
- [docs/APRENDIZAJE.md](docs/APRENDIZAJE.md) — Cuaderno de aprendizaje guiado (Modo profesor)
- [docs/PRUEBAS.md](docs/PRUEBAS.md) — Plan de pruebas, rendimiento y accesibilidad
- [SECURITY.md](SECURITY.md) — Inventario de secretos (solo nombres) y política de seguridad
- [CONTRIBUTING.md](CONTRIBUTING.md) — Reglas de ramas, commits y Pull Requests
