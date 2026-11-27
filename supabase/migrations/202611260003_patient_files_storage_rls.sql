BEGIN;

-- ============================================================================
-- T-06: Patient clinical files (intraoral photos & synthetic X-rays),
--       private Supabase Storage bucket (`patient-files`), multi-clinic RLS,
--       append-only Storage policies, and PII-free logical archive audit
-- Target: PostgreSQL 17 / Supabase (idempotent migration)
-- ============================================================================

-- 1. Multi-clinic relational integrity on public.patients
-- Guarantees a patient_files row cannot pair a Clinic A clinic_id with a Clinic B patient_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patients_clinic_id_id_unique'
      AND conrelid = 'public.patients'::regclass
  ) THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_clinic_id_id_unique UNIQUE (clinic_id, id);
  END IF;
END
$$;

-- 2. Clinical attachments metadata table (soft-delete only via deleted_at; never physical DELETE)
CREATE TABLE IF NOT EXISTS public.patient_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL,
  -- Nullable until public.appointments is introduced in T-08
  appointment_id uuid,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (
    length(trim(file_name)) > 0
    AND length(file_name) <= 255
  ),
  mime_type text NOT NULL CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  file_size_bytes bigint NOT NULL CHECK (
    file_size_bytes > 0
    AND file_size_bytes <= 10485760
  ),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT patient_files_clinic_patient_fkey
    FOREIGN KEY (clinic_id, patient_id)
    REFERENCES public.patients (clinic_id, id)
    ON DELETE RESTRICT,
  -- Strict non-nullable boolean checks (never evaluate to NULL/UNKNOWN):
  -- Exact lowercase `<clinic_id>/<patient_id>/<uuid>.<ext>` prefix and format, zero `..`
  CONSTRAINT patient_files_storage_path_format_check CHECK (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
    AND starts_with(storage_path, lower(clinic_id::text || '/' || patient_id::text || '/'))
  ),
  -- Mandatory alignment between mime_type and storage_path extension
  CONSTRAINT patient_files_mime_extension_check CHECK (
    (mime_type = 'image/jpeg' AND storage_path LIKE '%.jpg')
    OR (mime_type = 'image/png' AND storage_path LIKE '%.png')
    OR (mime_type = 'image/webp' AND storage_path LIKE '%.webp')
    OR (mime_type = 'application/pdf' AND storage_path LIKE '%.pdf')
  )
);

-- 3. Indexes supporting RLS predicates and fast active gallery listing per patient
CREATE INDEX IF NOT EXISTS idx_patient_files_clinic_id
  ON public.patient_files (clinic_id);

CREATE INDEX IF NOT EXISTS idx_patient_files_patient_active
  ON public.patient_files (clinic_id, patient_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 4. Statement-scoped archive transition guard (PG 17 WCO_RLS_CONFLICT_CHECK)
-- Replicates the audited T-05 pattern so active clinic staff can archive a file
-- via UPDATE deleted_at while keeping archived files 100% invisible to SELECT.
CREATE TABLE IF NOT EXISTS private.patient_file_archive_transitions (
  txid xid8 NOT NULL,
  patient_file_id uuid NOT NULL,
  PRIMARY KEY (txid, patient_file_id)
);

REVOKE ALL ON TABLE private.patient_file_archive_transitions
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.begin_patient_file_archive_transition(p_patient_file_id uuid)
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

  IF p_patient_file_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.patient_files AS pf
    JOIN public.patients AS p
      ON p.id = pf.patient_id
      AND p.clinic_id = pf.clinic_id
    WHERE pf.id = p_patient_file_id
      AND pf.clinic_id = private.current_clinic_id()
      AND pf.deleted_at IS NULL
      AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Archive transition denied for patient file record'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config('dentalcare.archiving_patient_file_active', 'on', true);

  INSERT INTO private.patient_file_archive_transitions (txid, patient_file_id)
  VALUES (pg_catalog.pg_current_xact_id(), p_patient_file_id)
  ON CONFLICT (txid, patient_file_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION private.end_patient_file_archive_transition(p_patient_file_id uuid)
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
  IF v_txid IS NOT NULL AND p_patient_file_id IS NOT NULL THEN
    DELETE FROM private.patient_file_archive_transitions
    WHERE txid = v_txid
      AND patient_file_id = p_patient_file_id;

    IF NOT EXISTS (
      SELECT 1
      FROM private.patient_file_archive_transitions
      WHERE txid = v_txid
    ) THEN
      PERFORM pg_catalog.set_config('dentalcare.archiving_patient_file_active', '', true);
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.is_patient_file_being_archived(p_patient_file_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_txid xid8;
BEGIN
  IF p_patient_file_id IS NULL THEN
    RETURN false;
  END IF;

  IF pg_catalog.current_setting('dentalcare.archiving_patient_file_active', true) IS DISTINCT FROM 'on' THEN
    RETURN false;
  END IF;

  v_txid := pg_catalog.pg_current_xact_id_if_assigned();
  IF v_txid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM private.patient_file_archive_transitions AS t
    WHERE t.txid = v_txid
      AND t.patient_file_id = p_patient_file_id
  );
END;
$$;

REVOKE ALL ON FUNCTION
  private.begin_patient_file_archive_transition(uuid),
  private.end_patient_file_archive_transition(uuid),
  private.is_patient_file_being_archived(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  private.begin_patient_file_archive_transition(uuid),
  private.end_patient_file_archive_transition(uuid),
  private.is_patient_file_being_archived(uuid)
  TO authenticated;

-- 5. Integrity and PII-free archive audit triggers (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION private.guard_patient_file_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
    OR NEW.file_name IS DISTINCT FROM OLD.file_name
    OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
    OR NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes
    OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable columns cannot be modified on patient_files'
      USING ERRCODE = '42501';
  END IF;

  IF current_user IN ('authenticated', 'anon') THEN
    IF OLD.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Archived patient file records cannot be modified or reactivated'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      PERFORM private.begin_patient_file_archive_transition(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.log_patient_file_archive()
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

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM private.end_patient_file_archive_transition(NEW.id);

    v_actor_id := (SELECT auth.uid());
    IF v_actor_id IS NOT NULL THEN
      -- STRICT PRIVACY: metadata_json is strictly '{}' (zero PII and never file_name).
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
        'patient_file.archived',
        'patient_file',
        NEW.id,
        '{}'::jsonb
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  private.guard_patient_file_update(),
  private.log_patient_file_archive()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_patient_files_10_guard_update
  BEFORE UPDATE ON public.patient_files
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_patient_file_update();

CREATE OR REPLACE TRIGGER trg_patient_files_20_set_updated_at
  BEFORE UPDATE ON public.patient_files
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE OR REPLACE TRIGGER trg_patient_files_30_audit_archive
  AFTER UPDATE ON public.patient_files
  FOR EACH ROW
  EXECUTE FUNCTION private.log_patient_file_archive();

-- 6. Row Level Security and explicit least-privilege GRANTs on public.patient_files
ALTER TABLE public.patient_files ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.patient_files FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.patient_files TO authenticated;

DROP POLICY IF EXISTS patient_files_select_same_clinic ON public.patient_files;
CREATE POLICY patient_files_select_same_clinic
  ON public.patient_files
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND (
      deleted_at IS NULL
      OR private.is_patient_file_being_archived(id)
    )
    AND EXISTS (
      SELECT 1
      FROM public.patients AS p
      WHERE p.id = patient_files.patient_id
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS patient_files_insert_same_clinic ON public.patient_files;
CREATE POLICY patient_files_insert_same_clinic
  ON public.patient_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
    AND uploaded_by = (SELECT auth.uid())
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.patients AS p
      WHERE p.id = patient_files.patient_id
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS patient_files_update_same_clinic ON public.patient_files;
CREATE POLICY patient_files_update_same_clinic
  ON public.patient_files
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.patients AS p
      WHERE p.id = patient_files.patient_id
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
  );

-- 7. Private Supabase Storage bucket (`patient-files`) and append-only RLS policies
-- NOTE: Do NOT execute ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY or
-- REVOKE/GRANT on storage.objects; in Supabase Cloud the owner is supabase_storage_admin
-- and RLS is already enabled.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-files',
  'patient-files',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS patient_files_storage_insert_same_clinic ON storage.objects;
CREATE POLICY patient_files_storage_insert_same_clinic
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'patient-files'
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = (SELECT private.current_clinic_id())::text
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
    AND EXISTS (
      SELECT 1
      FROM public.patients AS p
      WHERE p.id::text = (storage.foldername(name))[2]
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS patient_files_storage_select_same_clinic ON storage.objects;
CREATE POLICY patient_files_storage_select_same_clinic
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'patient-files'
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = (SELECT private.current_clinic_id())::text
    AND EXISTS (
      SELECT 1
      FROM public.patient_files AS pf
      JOIN public.patients AS p
        ON p.id = pf.patient_id
      WHERE pf.storage_path = storage.objects.name
        AND pf.clinic_id = (SELECT private.current_clinic_id())
        AND pf.deleted_at IS NULL
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
  );

COMMIT;
