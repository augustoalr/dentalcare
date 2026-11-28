BEGIN;

-- ============================================================================
-- T-07: Treatments catalog (treatments_catalog) with exact bigint cent prices,
--       bilingual EN/ES names, admin-only write/archive/restore RLS, pure
--       archive/restore guards (B-01), anti-spoofing defaults, and atomic
--       audit_log triggers
-- Target: PostgreSQL 17 / Supabase (idempotent migration)
-- ============================================================================

-- 1. Business table (strict boolean CHECK constraints on NOT NULL columns)
CREATE TABLE IF NOT EXISTS public.treatments_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (
    length(trim(code)) > 0
    AND length(code) <= 32
    AND code ~ '^[A-Z0-9][A-Z0-9_-]*$'
  ),
  name_en text NOT NULL CHECK (
    length(trim(name_en)) > 0
    AND length(name_en) <= 120
  ),
  name_es text NOT NULL CHECK (
    length(trim(name_es)) > 0
    AND length(name_es) <= 120
  ),
  category text NOT NULL CHECK (
    category IN (
      'preventive',
      'restorative',
      'endodontics',
      'periodontics',
      'orthodontics',
      'surgery',
      'prosthetics',
      'diagnostics',
      'aesthetics',
      'other'
    )
  ),
  default_price_cents bigint NOT NULL CHECK (
    default_price_cents >= 0
    AND default_price_cents <= 99999999999
  ),
  default_duration_min integer NOT NULL DEFAULT 30 CHECK (
    default_duration_min >= 5
    AND default_duration_min <= 480
  ),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- 2. Indexes (including unique active code per clinic and archived listing)
CREATE INDEX IF NOT EXISTS idx_treatments_catalog_clinic_id
  ON public.treatments_catalog (clinic_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_treatments_catalog_clinic_code_active
  ON public.treatments_catalog (clinic_id, code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_treatments_catalog_clinic_active_category
  ON public.treatments_catalog (clinic_id, category, name_en)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_treatments_catalog_clinic_archived
  ON public.treatments_catalog (clinic_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- 3. Integrity, anti-spoofing, pure archive/restore (B-01), and audit triggers
CREATE OR REPLACE FUNCTION private.enforce_treatment_catalog_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.created_at := pg_catalog.now();
    NEW.updated_at := pg_catalog.now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_treatment_catalog_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable columns (id, clinic_id, created_at) cannot be modified on treatments_catalog'
      USING ERRCODE = '42501';
  END IF;

  IF current_user IN ('authenticated', 'anon') THEN
    IF OLD.deleted_at IS NOT NULL THEN
      IF NOT (
        private.is_clinic_admin()
        AND NEW.deleted_at IS NULL
        AND (pg_catalog.to_jsonb(NEW) - 'deleted_at' - 'updated_at')
          IS NOT DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'deleted_at' - 'updated_at')
      ) THEN
        RAISE EXCEPTION 'Archived treatments can only be restored by a clinic admin without modifying other columns'
          USING ERRCODE = '42501';
      END IF;
    ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      -- B-01: Pure archive only — block simultaneous mutation of business columns
      -- so callers cannot bypass before/after audit logging while setting deleted_at.
      IF NOT (
        private.is_clinic_admin()
        AND (pg_catalog.to_jsonb(NEW) - 'deleted_at' - 'updated_at')
          IS NOT DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'deleted_at' - 'updated_at')
      ) THEN
        RAISE EXCEPTION 'Treatments can only be archived by a clinic admin without modifying other columns'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.log_treatment_catalog_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  v_actor_id := (SELECT auth.uid());
  IF v_actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (
      clinic_id,
      actor_id,
      action,
      entity_type,
      entity_id,
      metadata_json
    )
    VALUES (
      NEW.clinic_id,
      v_actor_id,
      'treatment.created',
      'treatment',
      NEW.id,
      pg_catalog.jsonb_build_object(
        'code', NEW.code,
        'name_en', NEW.name_en,
        'name_es', NEW.name_es,
        'category', NEW.category,
        'default_price_cents', NEW.default_price_cents,
        'default_duration_min', NEW.default_duration_min,
        'is_active', NEW.is_active
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      INSERT INTO public.audit_log (
        clinic_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        metadata_json
      )
      VALUES (
        NEW.clinic_id,
        v_actor_id,
        'treatment.archived',
        'treatment',
        NEW.id,
        pg_catalog.jsonb_build_object('code', NEW.code)
      );
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      INSERT INTO public.audit_log (
        clinic_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        metadata_json
      )
      VALUES (
        NEW.clinic_id,
        v_actor_id,
        'treatment.restored',
        'treatment',
        NEW.id,
        pg_catalog.jsonb_build_object('code', NEW.code)
      );
    ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL THEN
      IF NEW.code IS DISTINCT FROM OLD.code
        OR NEW.name_en IS DISTINCT FROM OLD.name_en
        OR NEW.name_es IS DISTINCT FROM OLD.name_es
        OR NEW.category IS DISTINCT FROM OLD.category
        OR NEW.default_price_cents IS DISTINCT FROM OLD.default_price_cents
        OR NEW.default_duration_min IS DISTINCT FROM OLD.default_duration_min
        OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        INSERT INTO public.audit_log (
          clinic_id,
          actor_id,
          action,
          entity_type,
          entity_id,
          metadata_json
        )
        VALUES (
          NEW.clinic_id,
          v_actor_id,
          'treatment.updated',
          'treatment',
          NEW.id,
          pg_catalog.jsonb_build_object(
            'before', pg_catalog.jsonb_build_object(
              'code', OLD.code,
              'name_en', OLD.name_en,
              'name_es', OLD.name_es,
              'category', OLD.category,
              'default_price_cents', OLD.default_price_cents,
              'default_duration_min', OLD.default_duration_min,
              'is_active', OLD.is_active
            ),
            'after', pg_catalog.jsonb_build_object(
              'code', NEW.code,
              'name_en', NEW.name_en,
              'name_es', NEW.name_es,
              'category', NEW.category,
              'default_price_cents', NEW.default_price_cents,
              'default_duration_min', NEW.default_duration_min,
              'is_active', NEW.is_active
            )
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  private.enforce_treatment_catalog_defaults(),
  private.guard_treatment_catalog_update(),
  private.log_treatment_catalog_change()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_treatments_catalog_05_enforce_defaults
  BEFORE INSERT ON public.treatments_catalog
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_treatment_catalog_defaults();

CREATE OR REPLACE TRIGGER trg_treatments_catalog_10_guard_update
  BEFORE UPDATE ON public.treatments_catalog
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_treatment_catalog_update();

CREATE OR REPLACE TRIGGER trg_treatments_catalog_20_set_updated_at
  BEFORE UPDATE ON public.treatments_catalog
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE OR REPLACE TRIGGER trg_treatments_catalog_30_audit_changes
  AFTER INSERT OR UPDATE ON public.treatments_catalog
  FOR EACH ROW
  EXECUTE FUNCTION private.log_treatment_catalog_change();

-- 4. Row Level Security and explicit least-privilege GRANTs (NEVER GRANT DELETE)
ALTER TABLE public.treatments_catalog ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.treatments_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.treatments_catalog TO authenticated;

DROP POLICY IF EXISTS treatments_catalog_select_same_clinic ON public.treatments_catalog;
CREATE POLICY treatments_catalog_select_same_clinic
  ON public.treatments_catalog
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND (
      deleted_at IS NULL
      OR (SELECT private.is_clinic_admin())
    )
  );

DROP POLICY IF EXISTS treatments_catalog_insert_admin ON public.treatments_catalog;
CREATE POLICY treatments_catalog_insert_admin
  ON public.treatments_catalog
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
    AND (SELECT private.is_clinic_admin())
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS treatments_catalog_update_admin ON public.treatments_catalog;
CREATE POLICY treatments_catalog_update_admin
  ON public.treatments_catalog
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND (SELECT private.is_clinic_admin())
  )
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
    AND (SELECT private.is_clinic_admin())
  );

COMMIT;
