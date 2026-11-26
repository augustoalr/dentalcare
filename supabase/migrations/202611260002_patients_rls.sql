BEGIN;

-- ============================================================================
-- T-05: Patients table, multi-clinic RLS, logical archive & PII-free audit_log
-- Target: PostgreSQL 17 / Supabase (idempotent migration)
-- ============================================================================

-- 1. Patients business table (soft-delete only via deleted_at; never physical DELETE)
CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (
    length(trim(full_name)) > 0
    AND length(full_name) <= 120
  ),
  phone text CHECK (
    phone IS NULL
    OR (length(trim(phone)) > 0 AND length(phone) <= 32)
  ),
  email text CHECK (
    email IS NULL
    OR (length(trim(email)) > 0 AND length(email) <= 254)
  ),
  date_of_birth date CHECK (
    date_of_birth IS NULL
    OR (
      date_of_birth >= DATE '1900-01-01'
      AND date_of_birth <= (CURRENT_DATE + INTERVAL '1 day')::date
    )
  ),
  medical_alerts text CHECK (
    medical_alerts IS NULL
    OR (length(trim(medical_alerts)) > 0 AND length(trim(medical_alerts)) <= 1000)
  ),
  general_notes text CHECK (
    general_notes IS NULL
    OR (length(trim(general_notes)) > 0 AND length(trim(general_notes)) <= 2000)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- 2. Indexes supporting RLS predicates and active patient name search
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id
  ON public.patients (clinic_id);

CREATE INDEX IF NOT EXISTS idx_patients_clinic_active_name
  ON public.patients (clinic_id, lower(full_name))
  WHERE deleted_at IS NULL;

-- 3. Statement-scoped archive transition guard (private schema, unforgeable by clients)
-- PostgreSQL evaluates SELECT RLS policies as WCO_RLS_CONFLICT_CHECK on NEW rows
-- whenever an UPDATE references table columns in WHERE (even without RETURNING).
-- Recording the in-flight (txid, patient_id) between BEFORE UPDATE and AFTER UPDATE
-- lets active clinic staff transition deleted_at from NULL -> timestamp while keeping
-- archived rows 100% invisible to every SELECT query before and immediately after.
CREATE TABLE IF NOT EXISTS private.patient_archive_transitions (
  txid xid8 NOT NULL,
  patient_id uuid NOT NULL,
  PRIMARY KEY (txid, patient_id)
);

REVOKE ALL ON TABLE private.patient_archive_transitions
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.begin_patient_archive_transition(p_patient_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.pg_trigger_depth() < 1 THEN
    RAISE EXCEPTION 'Archive transition helper can only be invoked from an active trigger'
      USING ERRCODE = '42501';
  END IF;

  IF p_patient_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.patients AS p
    WHERE p.id = p_patient_id
      AND p.clinic_id = private.current_clinic_id()
      AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Archive transition denied for patient record'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config('dentalcare.archiving_active', 'on', true);

  INSERT INTO private.patient_archive_transitions (txid, patient_id)
  VALUES (pg_catalog.pg_current_xact_id(), p_patient_id)
  ON CONFLICT (txid, patient_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION private.end_patient_archive_transition(p_patient_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_txid xid8;
BEGIN
  IF pg_catalog.pg_trigger_depth() < 1 THEN
    RAISE EXCEPTION 'Archive transition helper can only be invoked from an active trigger'
      USING ERRCODE = '42501';
  END IF;

  v_txid := pg_catalog.pg_current_xact_id_if_assigned();
  IF v_txid IS NOT NULL AND p_patient_id IS NOT NULL THEN
    DELETE FROM private.patient_archive_transitions
    WHERE txid = v_txid
      AND patient_id = p_patient_id;

    IF NOT EXISTS (
      SELECT 1
      FROM private.patient_archive_transitions
      WHERE txid = v_txid
    ) THEN
      PERFORM pg_catalog.set_config('dentalcare.archiving_active', '', true);
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.is_patient_being_archived(p_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_txid xid8;
BEGIN
  IF p_patient_id IS NULL THEN
    RETURN false;
  END IF;

  IF pg_catalog.current_setting('dentalcare.archiving_active', true) IS DISTINCT FROM 'on' THEN
    RETURN false;
  END IF;

  v_txid := pg_catalog.pg_current_xact_id_if_assigned();
  IF v_txid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM private.patient_archive_transitions AS t
    WHERE t.txid = v_txid
      AND t.patient_id = p_patient_id
  );
END;
$$;

REVOKE ALL ON FUNCTION
  private.begin_patient_archive_transition(uuid),
  private.end_patient_archive_transition(uuid),
  private.is_patient_being_archived(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  private.begin_patient_archive_transition(uuid),
  private.end_patient_archive_transition(uuid),
  private.is_patient_being_archived(uuid)
  TO authenticated;

-- 4. Integrity and PII-free archive audit triggers (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION private.guard_patient_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable columns (id, clinic_id, created_at) cannot be modified on patients'
      USING ERRCODE = '42501';
  END IF;

  IF current_user IN ('authenticated', 'anon') THEN
    IF OLD.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Archived patient records cannot be modified or reactivated'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      PERFORM private.begin_patient_archive_transition(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.log_patient_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  -- Only audit authenticated/anon API sessions that carry a valid auth.uid().
  -- Owner/seed/migration scripts running as postgres without a JWT claim do not
  -- fail the actor_id FK on public.audit_log.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM private.end_patient_archive_transition(NEW.id);

    v_actor_id := (SELECT auth.uid());
    IF v_actor_id IS NOT NULL THEN
      -- STRICT PRIVACY: metadata_json is strictly '{}' (zero PII or clinical data).
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
        'patient.archived',
        'patient',
        NEW.id,
        '{}'::jsonb
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  private.guard_patient_update(),
  private.log_patient_archive()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_patients_10_guard_update
  BEFORE UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_patient_update();

CREATE OR REPLACE TRIGGER trg_patients_20_set_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE OR REPLACE TRIGGER trg_patients_30_audit_archive
  AFTER UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION private.log_patient_archive();

-- 5. Row Level Security and explicit least-privilege GRANTs (no GRANT DELETE)
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.patients FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.patients TO authenticated;

DROP POLICY IF EXISTS patients_select_same_clinic ON public.patients;
CREATE POLICY patients_select_same_clinic
  ON public.patients
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND (
      deleted_at IS NULL
      OR private.is_patient_being_archived(id)
    )
  );

DROP POLICY IF EXISTS patients_insert_same_clinic ON public.patients;
CREATE POLICY patients_insert_same_clinic
  ON public.patients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS patients_update_same_clinic ON public.patients;
CREATE POLICY patients_update_same_clinic
  ON public.patients
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
  );

COMMIT;
