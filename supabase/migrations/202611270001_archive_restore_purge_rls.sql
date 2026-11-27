BEGIN;

-- ============================================================================
-- T-06b: Archived records review & restoration (admin only), controlled Storage
--        space purge (admin on archived files + 15-minute self-purge window for
--        the uploader), anti-spoofing of created_at (B-01), permanent post-purge
--        immutability (B-02), and PII-free atomic audit_log entries
-- Target: PostgreSQL 17 / Supabase (idempotent migration)
-- ============================================================================

-- 1. Add purged_at column, integrity CHECK, and partial indexes for archived views
ALTER TABLE public.patient_files
  ADD COLUMN IF NOT EXISTS purged_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patient_files_purged_requires_deleted_check'
      AND conrelid = 'public.patient_files'::regclass
  ) THEN
    ALTER TABLE public.patient_files
      ADD CONSTRAINT patient_files_purged_requires_deleted_check
      CHECK (purged_at IS NULL OR deleted_at IS NOT NULL);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_patient_files_patient_archived
  ON public.patient_files (clinic_id, patient_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL AND purged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_archived
  ON public.patients (clinic_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- 2. Safe restoration of archived patients (public.patients, admin only, PII-free audit)
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
      IF NOT (
        private.is_clinic_admin()
        AND NEW.deleted_at IS NULL
        AND (pg_catalog.to_jsonb(NEW) - 'deleted_at' - 'updated_at')
          IS NOT DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'deleted_at' - 'updated_at')
      ) THEN
        RAISE EXCEPTION 'Archived patient records can only be restored by a clinic admin without modifying other columns'
          USING ERRCODE = '42501';
      END IF;
    ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
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
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
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
        'patient.restored',
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

DROP POLICY IF EXISTS patients_select_same_clinic ON public.patients;
CREATE POLICY patients_select_same_clinic
  ON public.patients
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND (
      deleted_at IS NULL
      OR (SELECT private.is_clinic_admin())
      OR private.is_patient_being_archived(id)
    )
  );

DROP POLICY IF EXISTS patients_update_same_clinic ON public.patients;
CREATE POLICY patients_update_same_clinic
  ON public.patients
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND (
      deleted_at IS NULL
      OR (SELECT private.is_clinic_admin())
    )
  )
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
  );

-- 3. Safe restoration & purge of clinical files (public.patient_files)
-- B-01: Prevent authenticated/anon clients from spoofing future created_at on INSERT
-- to bypass the 15-minute uploader self-purge window.
CREATE OR REPLACE FUNCTION private.enforce_patient_file_defaults()
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

REVOKE ALL ON FUNCTION private.enforce_patient_file_defaults()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_patient_files_05_enforce_defaults
  BEFORE INSERT ON public.patient_files
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_patient_file_defaults();

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
      AND pf.purged_at IS NULL
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

REVOKE ALL ON FUNCTION private.begin_patient_file_archive_transition(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.begin_patient_file_archive_transition(uuid)
  TO authenticated;

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

  -- B-02: Defense-in-depth permanent immutability once purged (enforced for all roles,
  -- including owner/service_role; authenticated users are also blocked earlier by RLS USING).
  IF OLD.purged_at IS NOT NULL THEN
    RAISE EXCEPTION 'Purged patient file records are permanently immutable'
      USING ERRCODE = '42501';
  END IF;

  IF current_user IN ('authenticated', 'anon') THEN
    IF OLD.deleted_at IS NULL THEN
      IF NEW.purged_at IS NOT NULL THEN
        IF NOT (
          NEW.deleted_at IS NOT NULL
          AND OLD.uploaded_by = (SELECT auth.uid())
          AND OLD.created_at >= (pg_catalog.now() - interval '15 minutes')
          AND EXISTS (
            SELECT 1
            FROM public.patients AS p
            WHERE p.id = OLD.patient_id
              AND p.clinic_id = OLD.clinic_id
              AND p.deleted_at IS NULL
          )
        ) THEN
          RAISE EXCEPTION 'Active patient files can only be purged directly by their uploader within 15 minutes'
            USING ERRCODE = '42501';
        END IF;

        PERFORM private.begin_patient_file_archive_transition(NEW.id);
      ELSIF NEW.deleted_at IS NOT NULL THEN
        PERFORM private.begin_patient_file_archive_transition(NEW.id);
      END IF;
    ELSE
      IF NOT private.is_clinic_admin() THEN
        RAISE EXCEPTION 'Archived patient file records can only be restored or purged by a clinic admin'
          USING ERRCODE = '42501';
      END IF;

      IF NOT (
        EXISTS (
          SELECT 1
          FROM public.patients AS p
          WHERE p.id = OLD.patient_id
            AND p.clinic_id = OLD.clinic_id
            AND p.deleted_at IS NULL
        )
        AND (
          (NEW.deleted_at IS NULL AND NEW.purged_at IS NULL)
          OR (
            NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
            AND NEW.purged_at IS NOT NULL
          )
        )
      ) THEN
        RAISE EXCEPTION 'Archived patient file records only allow restore or purge while the patient is active'
          USING ERRCODE = '42501';
      END IF;
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

  IF OLD.purged_at IS NULL AND NEW.purged_at IS NOT NULL THEN
    IF OLD.deleted_at IS NULL THEN
      PERFORM private.end_patient_file_archive_transition(NEW.id);
    END IF;

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
        'patient_file.purged',
        'patient_file',
        NEW.id,
        '{}'::jsonb
      );
    END IF;
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM private.end_patient_file_archive_transition(NEW.id);

    v_actor_id := (SELECT auth.uid());
    IF v_actor_id IS NOT NULL THEN
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
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    v_actor_id := (SELECT auth.uid());
    IF v_actor_id IS NOT NULL THEN
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
        'patient_file.restored',
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

DROP POLICY IF EXISTS patient_files_select_same_clinic ON public.patient_files;
CREATE POLICY patient_files_select_same_clinic
  ON public.patient_files
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND EXISTS (
      SELECT 1
      FROM public.patients AS p
      WHERE p.id = patient_files.patient_id
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
    AND (
      (deleted_at IS NULL AND purged_at IS NULL)
      OR (SELECT private.is_clinic_admin())
      OR private.is_patient_file_being_archived(id)
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
    AND purged_at IS NULL
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
    AND purged_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.patients AS p
      WHERE p.id = patient_files.patient_id
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
    AND (
      deleted_at IS NULL
      OR (SELECT private.is_clinic_admin())
    )
  )
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
  );

-- 4. Supabase Storage RLS policies on storage.objects
-- NOTE: Do NOT execute ALTER TABLE or REVOKE/GRANT on storage.objects (owner: supabase_storage_admin).
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
        AND pf.purged_at IS NULL
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
        AND (
          pf.deleted_at IS NULL
          OR (SELECT private.is_clinic_admin())
        )
    )
  );

DROP POLICY IF EXISTS patient_files_storage_delete_authorized ON storage.objects;
CREATE POLICY patient_files_storage_delete_authorized
  ON storage.objects
  FOR DELETE
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
        AND pf.purged_at IS NULL
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
        AND (
          (
            pf.deleted_at IS NOT NULL
            AND (SELECT private.is_clinic_admin())
          )
          OR (
            pf.deleted_at IS NULL
            AND pf.uploaded_by = (SELECT auth.uid())
            AND pf.created_at >= (now() - interval '15 minutes')
          )
        )
    )
  );

COMMIT;
