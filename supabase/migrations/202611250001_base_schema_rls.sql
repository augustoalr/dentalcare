BEGIN;

-- ============================================================================
-- T-02: Base multi-tenant schema (clinics, profiles, audit_log) + RLS + GRANTs
-- Target: PostgreSQL 17 / Supabase (idempotent migration)
-- ============================================================================

-- 1. Core business and audit tables (public schema)
CREATE TABLE IF NOT EXISTS public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  currency_code text NOT NULL DEFAULT 'AED' CHECK (currency_code ~ '^[A-Z]{3}$'),
  currency_symbol text NOT NULL DEFAULT 'AED' CHECK (length(trim(currency_symbol)) > 0),
  tax_rate_bps integer NOT NULL DEFAULT 500 CHECK (tax_rate_bps >= 0 AND tax_rate_bps <= 10000),
  tax_label text NOT NULL DEFAULT 'VAT' CHECK (length(trim(tax_label)) > 0),
  timezone text NOT NULL DEFAULT 'Asia/Dubai' CHECK (length(trim(timezone)) > 0),
  default_locale text NOT NULL DEFAULT 'en' CHECK (default_locale IN ('en', 'es')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (length(trim(full_name)) > 0),
  role text NOT NULL CHECK (role IN ('admin', 'dentist', 'receptionist')),
  preferred_locale text NOT NULL DEFAULT 'en' CHECK (preferred_locale IN ('en', 'es')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (length(trim(action)) > 0),
  entity_type text NOT NULL CHECK (length(trim(entity_type)) > 0),
  entity_id uuid,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes supporting RLS predicates and common queries
CREATE INDEX IF NOT EXISTS idx_profiles_clinic_id
  ON public.profiles (clinic_id);

CREATE INDEX IF NOT EXISTS idx_profiles_clinic_role
  ON public.profiles (clinic_id, role);

CREATE INDEX IF NOT EXISTS idx_audit_log_clinic_created_at
  ON public.audit_log (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON public.audit_log (entity_type, entity_id);

-- 3. Private schema and SECURITY DEFINER identity helpers (never exposed via PostgREST)
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.current_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.clinic_id
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid())
    AND p.is_active = true
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid())
    AND p.is_active = true
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.is_clinic_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = true
      AND p.deleted_at IS NULL
      AND p.role = 'admin'
  );
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

REVOKE ALL ON FUNCTION
  private.current_clinic_id(),
  private.current_user_role(),
  private.is_clinic_admin()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  private.current_clinic_id(),
  private.current_user_role(),
  private.is_clinic_admin()
  TO authenticated;

-- 4. Integrity, immutability, and anti-escalation triggers (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_clinic_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable columns (id, created_at) cannot be modified on clinics'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable columns (id, clinic_id, created_at) cannot be modified on profiles'
      USING ERRCODE = '42501';
  END IF;

  IF current_user IN ('authenticated', 'anon') THEN
    IF NOT private.is_clinic_admin() THEN
      IF OLD.id IS DISTINCT FROM (SELECT auth.uid()) THEN
        RAISE EXCEPTION 'Non-admin users can only update their own profile'
          USING ERRCODE = '42501';
      END IF;

      IF (pg_catalog.to_jsonb(NEW) - 'preferred_locale' - 'updated_at')
        IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'preferred_locale' - 'updated_at') THEN
        RAISE EXCEPTION 'Non-admin users can only update preferred_locale on their own profile'
          USING ERRCODE = '42501';
      END IF;
    ELSIF OLD.id = (SELECT auth.uid()) AND OLD.role = 'admin' THEN
      IF NEW.is_active = false
        OR NEW.deleted_at IS NOT NULL
        OR NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Clinic admin cannot self-deactivate, self-delete, or change their own role'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_audit_log_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.created_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is strictly immutable'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION
  private.set_updated_at(),
  private.guard_clinic_update(),
  private.guard_profile_update(),
  private.enforce_audit_log_defaults(),
  private.prevent_audit_log_mutation()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_clinics_10_guard_update
  BEFORE UPDATE ON public.clinics
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_clinic_update();

CREATE OR REPLACE TRIGGER trg_clinics_20_set_updated_at
  BEFORE UPDATE ON public.clinics
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE OR REPLACE TRIGGER trg_profiles_10_guard_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_profile_update();

CREATE OR REPLACE TRIGGER trg_profiles_20_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE OR REPLACE TRIGGER trg_audit_log_enforce_defaults
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_audit_log_defaults();

CREATE OR REPLACE TRIGGER trg_audit_log_no_mutation
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_audit_log_mutation();

CREATE OR REPLACE TRIGGER trg_audit_log_no_truncate
  BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.prevent_audit_log_mutation();

-- 5. Row Level Security and explicit least-privilege GRANTs
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.clinics, public.profiles, public.audit_log FROM PUBLIC, anon, authenticated;

GRANT SELECT, UPDATE ON public.clinics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;

-- Policies for public.clinics
DROP POLICY IF EXISTS clinics_select_own ON public.clinics;
CREATE POLICY clinics_select_own
  ON public.clinics
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT private.current_clinic_id())
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS clinics_update_admin ON public.clinics;
CREATE POLICY clinics_update_admin
  ON public.clinics
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT private.current_clinic_id())
    AND (SELECT private.is_clinic_admin())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    id = (SELECT private.current_clinic_id())
    AND (SELECT private.is_clinic_admin())
    AND deleted_at IS NULL
  );

-- Policies for public.profiles
DROP POLICY IF EXISTS profiles_select_same_clinic ON public.profiles;
CREATE POLICY profiles_select_same_clinic
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND (
      deleted_at IS NULL
      OR (SELECT private.is_clinic_admin())
    )
  );

DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;
CREATE POLICY profiles_insert_admin
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
    AND (SELECT private.is_clinic_admin())
  );

DROP POLICY IF EXISTS profiles_update_admin_or_self ON public.profiles;
CREATE POLICY profiles_update_admin_or_self
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND deleted_at IS NULL
    AND (
      (SELECT private.is_clinic_admin())
      OR id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
    AND (
      (SELECT private.is_clinic_admin())
      OR id = (SELECT auth.uid())
    )
  );

-- Policies for public.audit_log (append-only, admin-readable per clinic)
DROP POLICY IF EXISTS audit_log_select_admin ON public.audit_log;
CREATE POLICY audit_log_select_admin
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND (SELECT private.is_clinic_admin())
  );

DROP POLICY IF EXISTS audit_log_insert_member ON public.audit_log;
CREATE POLICY audit_log_insert_member
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
    AND actor_id = (SELECT auth.uid())
  );

COMMIT;
