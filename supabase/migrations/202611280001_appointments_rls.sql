BEGIN;

-- ============================================================================
-- T-08: Appointments table, composite FK from patient_files.appointment_id,
--       multi-clinic RLS, DB-enforced clinical_notes role protection (B-02),
--       authoritative reminder_sent_at handling (B-01), PG 17 archive
--       transition guard, pure archive/restore, and strictly PII-free
--       atomic audit_log triggers
-- Target: PostgreSQL 17 / Supabase (idempotent migration)
-- ============================================================================

-- 1. Multi-clinic relational integrity on public.profiles
-- Guarantees an appointment cannot pair a Clinic A clinic_id with a Clinic B dentist_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_clinic_id_id_unique'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_clinic_id_id_unique UNIQUE (clinic_id, id);
  END IF;
END
$$;

-- 2. Appointments business table (soft-delete only via deleted_at; never physical DELETE)
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL,
  dentist_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (
    status IN (
      'scheduled',
      'confirmed',
      'in_progress',
      'completed',
      'cancelled',
      'no_show'
    )
  ),
  reason text CHECK (
    reason IS NULL
    OR (length(trim(reason)) > 0 AND length(reason) <= 300)
  ),
  clinical_notes text CHECK (
    clinical_notes IS NULL
    OR (length(trim(clinical_notes)) > 0 AND length(clinical_notes) <= 4000)
  ),
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- Strict non-nullable boolean CHECK aligned 1:1 with domain 5..720 min (M-02)
  CONSTRAINT appointments_time_range_check CHECK (
    ends_at >= starts_at + interval '5 minutes'
    AND ends_at <= starts_at + interval '12 hours'
  ),
  CONSTRAINT appointments_clinic_patient_id_unique
    UNIQUE (clinic_id, patient_id, id),
  CONSTRAINT appointments_clinic_patient_fkey
    FOREIGN KEY (clinic_id, patient_id)
    REFERENCES public.patients (clinic_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_clinic_dentist_fkey
    FOREIGN KEY (clinic_id, dentist_id)
    REFERENCES public.profiles (clinic_id, id)
    ON DELETE RESTRICT
);

-- 3. Composite FK from public.patient_files.appointment_id -> public.appointments
-- Standard MATCH SIMPLE keeps appointment_id IS NULL allowed while enforcing
-- same-clinic & same-patient integrity whenever appointment_id is populated.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patient_files_clinic_patient_appointment_fkey'
      AND conrelid = 'public.patient_files'::regclass
  ) THEN
    ALTER TABLE public.patient_files
      ADD CONSTRAINT patient_files_clinic_patient_appointment_fkey
      FOREIGN KEY (clinic_id, patient_id, appointment_id)
      REFERENCES public.appointments (clinic_id, patient_id, id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

-- Non-partial index covering the composite FK (prevents Supabase unindexed_foreign_keys advisor)
CREATE INDEX IF NOT EXISTS idx_patient_files_clinic_patient_appointment
  ON public.patient_files (clinic_id, patient_id, appointment_id);

-- 4. Indexes covering ALL FKs, schedule range queries, patient history, and archived listing
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id
  ON public.appointments (clinic_id);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_patient_starts
  ON public.appointments (clinic_id, patient_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_dentist_starts
  ON public.appointments (clinic_id, dentist_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_active_range
  ON public.appointments (clinic_id, starts_at, ends_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_archived
  ON public.appointments (clinic_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- 5. Statement-scoped archive transition guard (PG 17 WCO_RLS_CONFLICT_CHECK)
-- Lets dentist/receptionist archive active appointments via UPDATE deleted_at
-- while keeping archived appointments 100% invisible to non-admin SELECT queries.
CREATE TABLE IF NOT EXISTS private.appointment_archive_transitions (
  txid xid8 NOT NULL,
  appointment_id uuid NOT NULL,
  PRIMARY KEY (txid, appointment_id)
);

REVOKE ALL ON TABLE private.appointment_archive_transitions
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.begin_appointment_archive_transition(p_appointment_id uuid)
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

  IF p_appointment_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.appointments AS a
    JOIN public.patients AS p
      ON p.id = a.patient_id
      AND p.clinic_id = a.clinic_id
    WHERE a.id = p_appointment_id
      AND a.clinic_id = private.current_clinic_id()
      AND a.deleted_at IS NULL
      AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Archive transition denied for appointment record'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config('dentalcare.archiving_appointment_active', 'on', true);

  INSERT INTO private.appointment_archive_transitions (txid, appointment_id)
  VALUES (pg_catalog.pg_current_xact_id(), p_appointment_id)
  ON CONFLICT (txid, appointment_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION private.end_appointment_archive_transition(p_appointment_id uuid)
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
  IF v_txid IS NOT NULL AND p_appointment_id IS NOT NULL THEN
    DELETE FROM private.appointment_archive_transitions
    WHERE txid = v_txid
      AND appointment_id = p_appointment_id;

    IF NOT EXISTS (
      SELECT 1
      FROM private.appointment_archive_transitions
      WHERE txid = v_txid
    ) THEN
      PERFORM pg_catalog.set_config('dentalcare.archiving_appointment_active', '', true);
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.is_appointment_being_archived(p_appointment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_txid xid8;
BEGIN
  IF p_appointment_id IS NULL THEN
    RETURN false;
  END IF;

  IF pg_catalog.current_setting('dentalcare.archiving_appointment_active', true) IS DISTINCT FROM 'on' THEN
    RETURN false;
  END IF;

  v_txid := pg_catalog.pg_current_xact_id_if_assigned();
  IF v_txid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM private.appointment_archive_transitions AS t
    WHERE t.txid = v_txid
      AND t.appointment_id = p_appointment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION
  private.begin_appointment_archive_transition(uuid),
  private.end_appointment_archive_transition(uuid),
  private.is_appointment_being_archived(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  private.begin_appointment_archive_transition(uuid),
  private.end_appointment_archive_transition(uuid),
  private.is_appointment_being_archived(uuid)
  TO authenticated;

-- 6. Integrity, anti-spoofing, clinical_notes role protection, pure archive/restore,
--    and strictly PII-free atomic audit_log triggers (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION private.enforce_appointment_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.created_at := pg_catalog.now();
    NEW.updated_at := pg_catalog.now();

    -- B-02: Fail-closed clinical_notes role enforcement on INSERT (avoids NULL NOT IN pitfall)
    IF NEW.clinical_notes IS NOT NULL
      AND COALESCE(private.current_user_role(), '') NOT IN ('admin', 'dentist') THEN
      RAISE EXCEPTION 'Only dentist or admin roles can author clinical notes on appointments'
        USING ERRCODE = '42501';
    END IF;

    -- Prevent spoofing reminder_sent_at when creating a new appointment
    IF NEW.reminder_sent_at IS NOT NULL THEN
      RAISE EXCEPTION 'reminder_sent_at cannot be set on appointment creation'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_appointment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable columns (id, clinic_id, patient_id, created_at) cannot be modified on appointments'
      USING ERRCODE = '42501';
  END IF;

  IF current_user IN ('authenticated', 'anon') THEN
    IF OLD.deleted_at IS NOT NULL THEN
      -- Pure admin-only restoration while parent patient is active
      IF NOT (
        private.is_clinic_admin()
        AND NEW.deleted_at IS NULL
        AND (pg_catalog.to_jsonb(NEW) - 'deleted_at' - 'updated_at')
          IS NOT DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'deleted_at' - 'updated_at')
        AND EXISTS (
          SELECT 1
          FROM public.patients AS p
          WHERE p.id = OLD.patient_id
            AND p.clinic_id = OLD.clinic_id
            AND p.deleted_at IS NULL
        )
      ) THEN
        RAISE EXCEPTION 'Archived appointments can only be restored by a clinic admin without modifying other columns while the patient is active'
          USING ERRCODE = '42501';
      END IF;
    ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      -- Pure archive only: block simultaneous mutation of business/clinical columns
      IF (pg_catalog.to_jsonb(NEW) - 'deleted_at' - 'updated_at')
        IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'deleted_at' - 'updated_at') THEN
        RAISE EXCEPTION 'Appointments can only be archived without modifying other columns'
          USING ERRCODE = '42501';
      END IF;

      PERFORM private.begin_appointment_archive_transition(NEW.id);
    ELSE
      -- Active appointment UPDATE (OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL)
      -- B-02: Fail-closed clinical_notes protection
      IF NEW.clinical_notes IS DISTINCT FROM OLD.clinical_notes
        AND COALESCE(private.current_user_role(), '') NOT IN ('admin', 'dentist') THEN
        RAISE EXCEPTION 'Only dentist or admin roles can modify clinical notes on appointments'
          USING ERRCODE = '42501';
      END IF;

      -- B-01: Authoritative reminder_sent_at protection for T-09
      IF NEW.reminder_sent_at IS DISTINCT FROM OLD.reminder_sent_at THEN
        IF NEW.reminder_sent_at IS NULL THEN
          RAISE EXCEPTION 'reminder_sent_at cannot be cleared once recorded'
            USING ERRCODE = '42501';
        END IF;
        NEW.reminder_sent_at := pg_catalog.now();
      END IF;

      -- Validate dentist reassignment against active dentist/admin profiles in same clinic
      IF NEW.dentist_id IS DISTINCT FROM OLD.dentist_id THEN
        IF NOT EXISTS (
          SELECT 1
          FROM public.profiles AS d
          WHERE d.id = NEW.dentist_id
            AND d.clinic_id = OLD.clinic_id
            AND d.role IN ('dentist', 'admin')
            AND d.is_active = true
            AND d.deleted_at IS NULL
        ) THEN
          RAISE EXCEPTION 'Assigned dentist must be an active dentist or admin profile in the same clinic'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.log_appointment_change()
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

  IF TG_OP = 'INSERT' THEN
    IF v_actor_id IS NOT NULL THEN
      -- STRICT PRIVACY: zero PII, never reason or clinical_notes
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
        'appointment.created',
        'appointment',
        NEW.id,
        pg_catalog.jsonb_build_object('status', NEW.status)
      );
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      PERFORM private.end_appointment_archive_transition(NEW.id);

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
          'appointment.archived',
          'appointment',
          NEW.id,
          '{}'::jsonb
        );
      END IF;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
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
          'appointment.restored',
          'appointment',
          NEW.id,
          '{}'::jsonb
        );
      END IF;
    ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL THEN
      IF v_actor_id IS NOT NULL THEN
        -- Independent IF checks so combined edits emit every relevant event and no-op emits 0
        IF NEW.status IS DISTINCT FROM OLD.status THEN
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
            'appointment.status_changed',
            'appointment',
            NEW.id,
            pg_catalog.jsonb_build_object(
              'before', OLD.status,
              'after', NEW.status
            )
          );
        END IF;

        IF NEW.clinical_notes IS DISTINCT FROM OLD.clinical_notes THEN
          -- STRICT PRIVACY: never store clinical_notes content in audit_log
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
            'appointment.clinical_notes_updated',
            'appointment',
            NEW.id,
            '{}'::jsonb
          );
        END IF;

        IF NEW.starts_at IS DISTINCT FROM OLD.starts_at
          OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
          OR NEW.dentist_id IS DISTINCT FROM OLD.dentist_id THEN
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
            'appointment.rescheduled',
            'appointment',
            NEW.id,
            '{}'::jsonb
          );
        END IF;

        IF NEW.reminder_sent_at IS DISTINCT FROM OLD.reminder_sent_at
          AND NEW.reminder_sent_at IS NOT NULL THEN
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
            'appointment.reminder_sent',
            'appointment',
            NEW.id,
            '{}'::jsonb
          );
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  private.enforce_appointment_defaults(),
  private.guard_appointment_update(),
  private.log_appointment_change()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_appointments_05_enforce_defaults
  BEFORE INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_appointment_defaults();

CREATE OR REPLACE TRIGGER trg_appointments_10_guard_update
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_appointment_update();

CREATE OR REPLACE TRIGGER trg_appointments_20_set_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE OR REPLACE TRIGGER trg_appointments_30_audit_changes
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION private.log_appointment_change();

-- 7. Row Level Security and explicit least-privilege GRANTs (NEVER GRANT DELETE)
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.appointments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;

DROP POLICY IF EXISTS appointments_select_same_clinic ON public.appointments;
CREATE POLICY appointments_select_same_clinic
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND EXISTS (
      SELECT 1
      FROM public.patients AS p
      WHERE p.id = appointments.patient_id
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
    AND (
      deleted_at IS NULL
      OR (SELECT private.is_clinic_admin())
      OR private.is_appointment_being_archived(id)
    )
  );

DROP POLICY IF EXISTS appointments_insert_same_clinic ON public.appointments;
CREATE POLICY appointments_insert_same_clinic
  ON public.appointments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = (SELECT private.current_clinic_id())
    AND deleted_at IS NULL
    AND reminder_sent_at IS NULL
    AND (
      clinical_notes IS NULL
      OR (SELECT private.current_user_role()) IN ('admin', 'dentist')
    )
    AND EXISTS (
      SELECT 1
      FROM public.patients AS p
      WHERE p.id = appointments.patient_id
        AND p.clinic_id = (SELECT private.current_clinic_id())
        AND p.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS d
      WHERE d.id = appointments.dentist_id
        AND d.clinic_id = (SELECT private.current_clinic_id())
        AND d.role IN ('dentist', 'admin')
        AND d.is_active = true
        AND d.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS appointments_update_same_clinic ON public.appointments;
CREATE POLICY appointments_update_same_clinic
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = (SELECT private.current_clinic_id())
    AND EXISTS (
      SELECT 1
      FROM public.patients AS p
      WHERE p.id = appointments.patient_id
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

COMMIT;
