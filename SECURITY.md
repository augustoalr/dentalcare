# Seguridad — DentalCare

Nivel de riesgo actual: **3** (desarrollo y pruebas con datos sintéticos) → **4** obligatorio antes de admitir pacientes reales.

## Avisar de un fallo
- Contacta directamente con el dueño del producto (Augusto López Ramos) por canal privado.
- **Nunca** abras un issue público con detalles de una vulnerabilidad, tokens ni capturas con claves.

## Reglas de oro de DentalCare
1. **Cero datos reales de pacientes** durante desarrollo y validación del MVP: solo datos sintéticos/ficticios.
2. **Cero datos clínicos por WhatsApp ni en Sentry/logs:** los recordatorios solo llevan fecha, hora y nombre de la clínica.
3. **Aislamiento multi-tenant estricto:** todas las tablas llevan `clinic_id` con RLS obligatorio por rol (`admin`, `dentist`, `receptionist`). Storage privado por ruta `clinic_id/patient_id/...` con URLs firmadas temporales.
4. **Inmutabilidad de auditoría:** `audit_log` solo admite `INSERT` (nunca `UPDATE` ni `DELETE`).

## Inventario de secretos (solo NOMBRES, nunca valores)

| Variable | Para qué | Dónde vive | Entorno | Última rotación |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | URL pública del proyecto Supabase | Vercel / `.env.local` (pública) | local / preview / prod | Pendiente setup |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anónima protegida por RLS | Vercel / `.env.local` (pública) | local / preview / prod | Pendiente setup |
| `VITE_SENTRY_DSN` | Endpoint público de envío de errores (sin PII) | Vercel / `.env.local` (pública) | preview / prod | Pendiente setup |
| `SUPABASE_SERVICE_ROLE_KEY` | Tareas administrativas de servidor / Edge Functions | **Solo** paneles Supabase / GitHub Secrets (jamás en frontend) | preview / prod | Pendiente setup |
| `SUPABASE_DB_URL` | Conexión para verificación/migraciones en CI | **Solo** GitHub Secrets | CI / preview | Pendiente setup |

## Reglas sobre secretos (R-11 y R-16)
- Ningún secreto en git, en el frontend ni en variables públicas (`VITE_*` / `NEXT_PUBLIC_*`).
- RLS activo en el 100% de las tablas y buckets de Storage; cualquier cambio de RLS pasa por el **Revisor** (R-02).
- Si un secreto se expone (chat, log, commit): **rótalos de inmediato** en el panel correspondiente (borrar del archivo no basta) y actualiza la fecha en la tabla superior.

## Revisión periódica (el Revisor revisa este archivo en cada versión)
- [ ] `pnpm audit` de dependencias sin vulnerabilidades críticas
- [ ] Permisos RLS y GRANT de todas las tablas verificados con usuarios de 2 clínicas ficticias
- [ ] Accesos a paneles (GitHub, Supabase, Vercel, Sentry, Hostinger) con 2FA activado
- [ ] Confirmar que no existen datos reales de pacientes en entornos de prueba
