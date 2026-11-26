import { useState, type FormEvent } from 'react';
import { AlertCircle, AlertTriangle, Loader2, Save, ShieldAlert } from 'lucide-react';
import {
  PATIENT_MIN_BIRTH_DATE,
  validatePatientInput,
  type PatientFieldErrors,
  type PatientInput,
} from '@/domain/patients';
import { SettingsField } from '@/features/settings/SettingsField';
import { useI18n, type TranslationKey } from '@/i18n';
import { Button } from '@/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/ui/components/ui/card';
import { Input } from '@/ui/components/ui/input';
import { Textarea } from '@/ui/components/ui/textarea';

export interface PatientFormInitialValues {
  readonly fullName?: string;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly dateOfBirth?: string | null;
  readonly medicalAlerts?: string | null;
  readonly generalNotes?: string | null;
}

export interface PatientFormProps {
  readonly mode: 'create' | 'edit';
  readonly initialValues?: PatientFormInitialValues;
  readonly onSubmit: (input: PatientInput) => Promise<void>;
  readonly onCancel: () => void;
}

interface PatientFormDraft {
  readonly fullName: string;
  readonly phone: string;
  readonly email: string;
  readonly dateOfBirth: string;
  readonly medicalAlerts: string;
  readonly generalNotes: string;
}

function createInitialDraft(
  initial?: PatientFormInitialValues,
): PatientFormDraft {
  return Object.freeze({
    fullName: initial?.fullName ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    dateOfBirth: initial?.dateOfBirth ?? '',
    medicalAlerts: initial?.medicalAlerts ?? '',
    generalNotes: initial?.generalNotes ?? '',
  });
}

function resolvePatientFieldErrors(
  errors: PatientFieldErrors | null,
  t: (key: TranslationKey) => string,
) {
  if (!errors) {
    return {
      fullName: null,
      phone: null,
      email: null,
      dateOfBirth: null,
      medicalAlerts: null,
      generalNotes: null,
    };
  }

  return {
    fullName:
      errors.fullName === 'full_name_required'
        ? t('patients.validation.fullNameRequired')
        : errors.fullName === 'full_name_too_long'
          ? t('patients.validation.fullNameTooLong')
          : null,
    phone:
      errors.phone === 'phone_too_long'
        ? t('patients.validation.phoneTooLong')
        : null,
    email:
      errors.email === 'email_invalid'
        ? t('patients.validation.emailInvalid')
        : errors.email === 'email_too_long'
          ? t('patients.validation.emailTooLong')
          : null,
    dateOfBirth:
      errors.dateOfBirth === 'date_of_birth_invalid'
        ? t('patients.validation.dateOfBirthInvalid')
        : errors.dateOfBirth === 'date_of_birth_too_early'
          ? t('patients.validation.dateOfBirthTooEarly')
          : errors.dateOfBirth === 'date_of_birth_in_future'
            ? t('patients.validation.dateOfBirthInFuture')
            : null,
    medicalAlerts:
      errors.medicalAlerts === 'medical_alerts_too_long'
        ? t('patients.validation.medicalAlertsTooLong')
        : null,
    generalNotes:
      errors.generalNotes === 'general_notes_too_long'
        ? t('patients.validation.generalNotesTooLong')
        : null,
  };
}

export function PatientForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
}: PatientFormProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<PatientFormDraft>(() =>
    createInitialDraft(initialValues),
  );
  const [fieldErrors, setFieldErrors] = useState<PatientFieldErrors | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);

  const translatedErrors = resolvePatientFieldErrors(fieldErrors, t);

  const updateField = <K extends keyof PatientFormDraft>(
    key: K,
    value: PatientFormDraft[K],
  ) => {
    setDraft((prev) => Object.freeze({ ...prev, [key]: value }));
    if (fieldErrors) {
      setFieldErrors(null);
    }
    if (hasSaveError) {
      setHasSaveError(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    setHasSaveError(false);
    const validation = validatePatientInput(draft);

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors(null);
    setIsSaving(true);

    try {
      await onSubmit(validation.value);
    } catch {
      setHasSaveError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode === 'create'
            ? t('patients.form.createCardTitle')
            : t('patients.form.editCardTitle')}
        </CardTitle>
        <CardDescription>
          {mode === 'create'
            ? t('patients.form.createCardDescription')
            : t('patients.form.editCardDescription')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div
          role="note"
          className="flex items-start gap-3 rounded-md border border-warning-border bg-warning-bg p-3.5 text-warning-foreground"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 space-y-0.5 text-xs">
            <p className="font-semibold break-words">
              {t('patients.form.syntheticNoticeTitle')}
            </p>
            <p className="text-warning-foreground/90 break-words">
              {t('patients.form.syntheticNoticeBody')}
            </p>
          </div>
        </div>

        {hasSaveError ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border border-danger-border bg-danger-bg p-3.5 text-danger-foreground"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-danger"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-0.5 text-xs">
              <p className="font-semibold break-words">
                {t('patients.form.saveErrorTitle')}
              </p>
              <p className="text-danger-foreground/90 break-words">
                {t('patients.form.saveErrorDescription')}
              </p>
            </div>
          </div>
        ) : null}

        <form noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <SettingsField
            id="patient-full-name"
            label={t('patients.form.fullNameLabel')}
            errorMessage={translatedErrors.fullName}
          >
            <Input
              id="patient-full-name"
              name="fullName"
              value={draft.fullName}
              placeholder={t('patients.form.fullNamePlaceholder')}
              disabled={isSaving}
              aria-invalid={translatedErrors.fullName !== null}
              aria-describedby={
                translatedErrors.fullName ? 'patient-full-name-error' : undefined
              }
              onChange={(e) => updateField('fullName', e.target.value)}
            />
          </SettingsField>

          <div className="grid gap-4 sm:grid-cols-3">
            <SettingsField
              id="patient-phone"
              label={t('patients.form.phoneLabel')}
              errorMessage={translatedErrors.phone}
            >
              <Input
                id="patient-phone"
                name="phone"
                type="tel"
                value={draft.phone}
                placeholder={t('patients.form.phonePlaceholder')}
                disabled={isSaving}
                aria-invalid={translatedErrors.phone !== null}
                aria-describedby={
                  translatedErrors.phone ? 'patient-phone-error' : undefined
                }
                onChange={(e) => updateField('phone', e.target.value)}
              />
            </SettingsField>

            <SettingsField
              id="patient-email"
              label={t('patients.form.emailLabel')}
              errorMessage={translatedErrors.email}
            >
              <Input
                id="patient-email"
                name="email"
                type="email"
                value={draft.email}
                placeholder={t('patients.form.emailPlaceholder')}
                disabled={isSaving}
                aria-invalid={translatedErrors.email !== null}
                aria-describedby={
                  translatedErrors.email ? 'patient-email-error' : undefined
                }
                onChange={(e) => updateField('email', e.target.value)}
              />
            </SettingsField>

            <SettingsField
              id="patient-dob"
              label={t('patients.form.dateOfBirthLabel')}
              hint={t('patients.form.dateOfBirthHint')}
              errorMessage={translatedErrors.dateOfBirth}
            >
              <Input
                id="patient-dob"
                name="dateOfBirth"
                type="date"
                min={PATIENT_MIN_BIRTH_DATE}
                value={draft.dateOfBirth}
                disabled={isSaving}
                aria-invalid={translatedErrors.dateOfBirth !== null}
                aria-describedby={
                  translatedErrors.dateOfBirth
                    ? 'patient-dob-hint patient-dob-error'
                    : 'patient-dob-hint'
                }
                onChange={(e) => updateField('dateOfBirth', e.target.value)}
              />
            </SettingsField>
          </div>

          <div className="rounded-lg border-2 border-medical-alert-border/60 bg-medical-alert-bg/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-medical-alert">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-wider">
                {t('patients.detail.medicalAlertBannerLabel')}
              </span>
            </div>
            <SettingsField
              id="patient-medical-alerts"
              label={t('patients.form.medicalAlertsLabel')}
              hint={t('patients.form.medicalAlertsHint')}
              errorMessage={translatedErrors.medicalAlerts}
            >
              <Textarea
                id="patient-medical-alerts"
                name="medicalAlerts"
                value={draft.medicalAlerts}
                placeholder={t('patients.form.medicalAlertsPlaceholder')}
                disabled={isSaving}
                aria-invalid={translatedErrors.medicalAlerts !== null}
                aria-describedby={
                  translatedErrors.medicalAlerts
                    ? 'patient-medical-alerts-hint patient-medical-alerts-error'
                    : 'patient-medical-alerts-hint'
                }
                onChange={(e) => updateField('medicalAlerts', e.target.value)}
              />
            </SettingsField>
          </div>

          <SettingsField
            id="patient-general-notes"
            label={t('patients.form.generalNotesLabel')}
            hint={t('patients.form.generalNotesHint')}
            errorMessage={translatedErrors.generalNotes}
          >
            <Textarea
              id="patient-general-notes"
              name="generalNotes"
              value={draft.generalNotes}
              placeholder={t('patients.form.generalNotesPlaceholder')}
              disabled={isSaving}
              aria-invalid={translatedErrors.generalNotes !== null}
              aria-describedby={
                translatedErrors.generalNotes
                  ? 'patient-general-notes-hint patient-general-notes-error'
                  : 'patient-general-notes-hint'
              }
              onChange={(e) => updateField('generalNotes', e.target.value)}
            />
          </SettingsField>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={onCancel}
            >
              {t('patients.form.cancelButton')}
            </Button>

            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  <span>{t('patients.form.savingButton')}</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {mode === 'create'
                      ? t('patients.form.createSubmitButton')
                      : t('patients.form.editSubmitButton')}
                  </span>
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
