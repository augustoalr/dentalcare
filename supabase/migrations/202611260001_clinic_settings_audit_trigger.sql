BEGIN;

-- ============================================================================
-- T-04: Atomic audit_log trigger for multi-country clinic settings updates
-- Target: PostgreSQL 17 / Supabase (idempotent migration)
-- ============================================================================

CREATE OR REPLACE FUNCTION private.log_clinic_settings_change()
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

  v_actor_id := (SELECT auth.uid());
  IF v_actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip no-op updates where none of the 7 configurable clinic columns changed
  -- (even if BEFORE UPDATE trigger updated NEW.updated_at).
  IF NEW.name IS NOT DISTINCT FROM OLD.name
    AND NEW.currency_code IS NOT DISTINCT FROM OLD.currency_code
    AND NEW.currency_symbol IS NOT DISTINCT FROM OLD.currency_symbol
    AND NEW.tax_rate_bps IS NOT DISTINCT FROM OLD.tax_rate_bps
    AND NEW.tax_label IS NOT DISTINCT FROM OLD.tax_label
    AND NEW.timezone IS NOT DISTINCT FROM OLD.timezone
    AND NEW.default_locale IS NOT DISTINCT FROM OLD.default_locale THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_log (
    clinic_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata_json
  )
  VALUES (
    NEW.id,
    v_actor_id,
    'clinic.settings_updated',
    'clinic',
    NEW.id,
    pg_catalog.jsonb_build_object(
      'before', pg_catalog.jsonb_build_object(
        'name', OLD.name,
        'currency_code', OLD.currency_code,
        'currency_symbol', OLD.currency_symbol,
        'tax_rate_bps', OLD.tax_rate_bps,
        'tax_label', OLD.tax_label,
        'timezone', OLD.timezone,
        'default_locale', OLD.default_locale
      ),
      'after', pg_catalog.jsonb_build_object(
        'name', NEW.name,
        'currency_code', NEW.currency_code,
        'currency_symbol', NEW.currency_symbol,
        'tax_rate_bps', NEW.tax_rate_bps,
        'tax_label', NEW.tax_label,
        'timezone', NEW.timezone,
        'default_locale', NEW.default_locale
      )
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.log_clinic_settings_change()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_clinics_30_audit_settings
  AFTER UPDATE ON public.clinics
  FOR EACH ROW
  EXECUTE FUNCTION private.log_clinic_settings_change();

COMMIT;
