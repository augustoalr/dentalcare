import { useState, type FormEvent } from 'react';
import { Loader2, Save, ShieldCheck } from 'lucide-react';
import { isSupportedLocale, type SupportedLocale } from '@/domain/locale';
import {
  bpsToPercentString,
  COMMON_CLINIC_TIMEZONES,
  percentStringToBps,
  validateClinicSettings,
  type ClinicSettingsFieldErrors,
  type ClinicSettingsPreset,
} from '@/domain/money';
import { useAuth } from '@/features/auth/AuthContext';
import {
  ReadOnlySettingsBanner,
  SettingsSavedBanner,
  SettingsSaveErrorBanner,
} from '@/features/settings/ClinicSettingsNotices';
import { ClinicPresetsBar } from '@/features/settings/ClinicPresetsBar';
import { ClinicTaxPreviewCard } from '@/features/settings/ClinicTaxPreviewCard';
import { SettingsField } from '@/features/settings/SettingsField';
import { useI18n, type TranslationKey } from '@/i18n';
import type {
  ClinicSummary,
  UserProfile,
} from '@/services/repositories/clinicAccessRepository';
import { EmptyState } from '@/ui/components/states/EmptyState';
import { LoadingState } from '@/ui/components/states/LoadingState';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/ui/components/ui/card';
import { Input } from '@/ui/components/ui/input';
import { Select } from '@/ui/components/ui/select';

interface SettingsFormDraft {
  readonly name: string;
  readonly currencyCode: string;
  readonly currencySymbol: string;
  readonly taxRatePercent: string;
  readonly taxLabel: string;
  readonly timezone: string;
  readonly defaultLocale: SupportedLocale;
}

function createDraftFromClinic(clinic: ClinicSummary): SettingsFormDraft {
  return Object.freeze({
    name: clinic.name,
    currencyCode: clinic.currencyCode,
    currencySymbol: clinic.currencySymbol,
    taxRatePercent: bpsToPercentString(clinic.taxRateBps),
    taxLabel: clinic.taxLabel,
    timezone: clinic.timezone,
    defaultLocale: clinic.defaultLocale,
  });
}

function hasDraftChanges(
  draft: SettingsFormDraft,
  clinic: ClinicSummary,
): boolean {
  const parsedBps = percentStringToBps(draft.taxRatePercent);
  return (
    draft.name.trim() !== clinic.name ||
    draft.currencyCode.trim().toUpperCase() !== clinic.currencyCode ||
    draft.currencySymbol.trim() !== clinic.currencySymbol ||
    parsedBps !== clinic.taxRateBps ||
    draft.taxLabel.trim() !== clinic.taxLabel ||
    draft.timezone.trim() !== clinic.timezone ||
    draft.defaultLocale !== clinic.defaultLocale
  );
}

function resolveFieldErrors(
  errors: ClinicSettingsFieldErrors | null,
  t: (key: TranslationKey) => string,
) {
  if (!errors) {
    return {
      name: null,
      currencyCode: null,
      currencySymbol: null,
      taxRateBps: null,
      taxLabel: null,
      timezone: null,
      defaultLocale: null,
    };
  }

  return {
    name:
      errors.name === 'name_required'
        ? t('settings.validation.nameRequired')
        : errors.name === 'name_too_long'
          ? t('settings.validation.nameTooLong')
          : null,
    currencyCode:
      errors.currencyCode === 'currency_code_required'
        ? t('settings.validation.currencyCodeRequired')
        : errors.currencyCode === 'currency_code_invalid'
          ? t('settings.validation.currencyCodeInvalid')
          : null,
    currencySymbol:
      errors.currencySymbol === 'currency_symbol_required'
        ? t('settings.validation.currencySymbolRequired')
        : errors.currencySymbol === 'currency_symbol_too_long'
          ? t('settings.validation.currencySymbolTooLong')
          : null,
    taxRateBps:
      errors.taxRateBps === 'tax_rate_invalid'
        ? t('settings.validation.taxRateInvalid')
        : null,
    taxLabel:
      errors.taxLabel === 'tax_label_required'
        ? t('settings.validation.taxLabelRequired')
        : errors.taxLabel === 'tax_label_too_long'
          ? t('settings.validation.taxLabelTooLong')
          : null,
    timezone:
      errors.timezone === 'timezone_required'
        ? t('settings.validation.timezoneRequired')
        : errors.timezone === 'timezone_too_long'
          ? t('settings.validation.timezoneTooLong')
          : null,
    defaultLocale:
      errors.defaultLocale === 'default_locale_invalid'
        ? t('settings.validation.defaultLocaleInvalid')
        : null,
  };
}

interface ClinicSettingsWorkspaceProps {
  readonly clinic: ClinicSummary;
  readonly profile: UserProfile;
}

function ClinicSettingsWorkspace({
  clinic,
  profile,
}: ClinicSettingsWorkspaceProps) {
  const { updateClinicSettings } = useAuth();
  const { t } = useI18n();

  const isAdmin = profile.role === 'admin';
  const [draft, setDraft] = useState<SettingsFormDraft>(() =>
    createDraftFromClinic(clinic),
  );
  const [fieldErrors, setFieldErrors] =
    useState<ClinicSettingsFieldErrors | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);

  const isDirty = hasDraftChanges(draft, clinic);
  const controlsDisabled = !isAdmin || isSaving;
  const translatedErrors = resolveFieldErrors(fieldErrors, t);

  const parsedPreviewBps = percentStringToBps(draft.taxRatePercent);
  const previewTaxRateBps =
    parsedPreviewBps !== null ? parsedPreviewBps : clinic.taxRateBps;
  const previewCurrencyCode =
    draft.currencyCode.trim().toUpperCase() || clinic.currencyCode;
  const previewCurrencySymbol =
    draft.currencySymbol.trim() || clinic.currencySymbol;
  const previewTaxLabel = draft.taxLabel.trim() || clinic.taxLabel;
  const previewTimezone = draft.timezone.trim() || clinic.timezone;

  const updateDraftField = <K extends keyof SettingsFormDraft>(
    key: K,
    value: SettingsFormDraft[K],
  ) => {
    setDraft((prev) => Object.freeze({ ...prev, [key]: value }));
    if (fieldErrors) {
      setFieldErrors(null);
    }
    if (saveSucceeded) {
      setSaveSucceeded(false);
    }
    if (hasSaveError) {
      setHasSaveError(false);
    }
  };

  const handleApplyPreset = (preset: ClinicSettingsPreset) => {
    if (controlsDisabled) {
      return;
    }

    setDraft((prev) =>
      Object.freeze({
        ...prev,
        currencyCode: preset.currencyCode,
        currencySymbol: preset.currencySymbol,
        taxRatePercent: bpsToPercentString(preset.taxRateBps),
        taxLabel: preset.taxLabel,
        timezone: preset.timezone,
        defaultLocale: preset.defaultLocale,
      }),
    );
    setFieldErrors(null);
    setSaveSucceeded(false);
    setHasSaveError(false);
  };

  const handleResetChanges = () => {
    setDraft(createDraftFromClinic(clinic));
    setFieldErrors(null);
    setSaveSucceeded(false);
    setHasSaveError(false);
  };

  const submitSettings = async () => {
    if (!isAdmin || isSaving) {
      return;
    }

    setSaveSucceeded(false);
    setHasSaveError(false);

    const validation = validateClinicSettings({
      name: draft.name,
      currencyCode: draft.currencyCode,
      currencySymbol: draft.currencySymbol,
      taxRateBps: percentStringToBps(draft.taxRatePercent),
      taxLabel: draft.taxLabel,
      timezone: draft.timezone,
      defaultLocale: draft.defaultLocale,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors(null);
    setIsSaving(true);

    try {
      const updated = await updateClinicSettings(validation.value);
      setDraft(createDraftFromClinic(updated));
      setSaveSucceeded(true);
    } catch {
      setHasSaveError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitSettings();
  };

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary break-words">
            {t('settings.title')}
          </h1>
          <Badge variant={isAdmin ? 'primary' : 'default'}>
            {isAdmin ? t('settings.adminBadge') : t('settings.readOnlyBadge')}
          </Badge>
        </div>
        <p className="max-w-3xl text-sm text-text-secondary break-words">
          {t('settings.description')}
        </p>
      </div>

      {!isAdmin ? <ReadOnlySettingsBanner /> : null}
      {saveSucceeded ? <SettingsSavedBanner /> : null}
      {hasSaveError ? (
        <SettingsSaveErrorBanner
          onRetry={isAdmin ? () => void submitSettings() : undefined}
        />
      ) : null}

      {isAdmin ? (
        <ClinicPresetsBar
          disabled={controlsDisabled}
          onSelectPreset={handleApplyPreset}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('settings.form.cardTitle')}</CardTitle>
            <CardDescription>{t('settings.form.cardDescription')}</CardDescription>
          </CardHeader>

          <CardContent>
            <form noValidate onSubmit={handleSubmit} className="space-y-5">
              <SettingsField
                id="clinic-name"
                label={t('settings.form.nameLabel')}
                errorMessage={translatedErrors.name}
              >
                <Input
                  id="clinic-name"
                  name="name"
                  value={draft.name}
                  placeholder={t('settings.form.namePlaceholder')}
                  disabled={controlsDisabled}
                  aria-invalid={translatedErrors.name !== null}
                  aria-describedby={
                    translatedErrors.name ? 'clinic-name-error' : undefined
                  }
                  onChange={(e) => updateDraftField('name', e.target.value)}
                />
              </SettingsField>

              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField
                  id="clinic-currency-code"
                  label={t('settings.form.currencyCodeLabel')}
                  hint={t('settings.form.currencyCodeHint')}
                  errorMessage={translatedErrors.currencyCode}
                >
                  <Input
                    id="clinic-currency-code"
                    name="currencyCode"
                    value={draft.currencyCode}
                    placeholder={t('settings.form.currencyCodePlaceholder')}
                    disabled={controlsDisabled}
                    aria-invalid={translatedErrors.currencyCode !== null}
                    aria-describedby={
                      translatedErrors.currencyCode
                        ? 'clinic-currency-code-hint clinic-currency-code-error'
                        : 'clinic-currency-code-hint'
                    }
                    onChange={(e) =>
                      updateDraftField('currencyCode', e.target.value)
                    }
                  />
                </SettingsField>

                <SettingsField
                  id="clinic-currency-symbol"
                  label={t('settings.form.currencySymbolLabel')}
                  hint={t('settings.form.currencySymbolHint')}
                  errorMessage={translatedErrors.currencySymbol}
                >
                  <Input
                    id="clinic-currency-symbol"
                    name="currencySymbol"
                    value={draft.currencySymbol}
                    placeholder={t('settings.form.currencySymbolPlaceholder')}
                    disabled={controlsDisabled}
                    aria-invalid={translatedErrors.currencySymbol !== null}
                    aria-describedby={
                      translatedErrors.currencySymbol
                        ? 'clinic-currency-symbol-hint clinic-currency-symbol-error'
                        : 'clinic-currency-symbol-hint'
                    }
                    onChange={(e) =>
                      updateDraftField('currencySymbol', e.target.value)
                    }
                  />
                </SettingsField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField
                  id="clinic-tax-rate"
                  label={t('settings.form.taxRateLabel')}
                  hint={t('settings.form.taxRateHint')}
                  errorMessage={translatedErrors.taxRateBps}
                >
                  <Input
                    id="clinic-tax-rate"
                    name="taxRatePercent"
                    inputMode="decimal"
                    value={draft.taxRatePercent}
                    placeholder={t('settings.form.taxRatePlaceholder')}
                    disabled={controlsDisabled}
                    aria-invalid={translatedErrors.taxRateBps !== null}
                    aria-describedby={
                      translatedErrors.taxRateBps
                        ? 'clinic-tax-rate-hint clinic-tax-rate-error'
                        : 'clinic-tax-rate-hint'
                    }
                    onChange={(e) =>
                      updateDraftField('taxRatePercent', e.target.value)
                    }
                  />
                </SettingsField>

                <SettingsField
                  id="clinic-tax-label"
                  label={t('settings.form.taxLabelLabel')}
                  hint={t('settings.form.taxLabelHint')}
                  errorMessage={translatedErrors.taxLabel}
                >
                  <Input
                    id="clinic-tax-label"
                    name="taxLabel"
                    value={draft.taxLabel}
                    placeholder={t('settings.form.taxLabelPlaceholder')}
                    disabled={controlsDisabled}
                    aria-invalid={translatedErrors.taxLabel !== null}
                    aria-describedby={
                      translatedErrors.taxLabel
                        ? 'clinic-tax-label-hint clinic-tax-label-error'
                        : 'clinic-tax-label-hint'
                    }
                    onChange={(e) =>
                      updateDraftField('taxLabel', e.target.value)
                    }
                  />
                </SettingsField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField
                  id="clinic-timezone"
                  label={t('settings.form.timezoneLabel')}
                  hint={t('settings.form.timezoneHint')}
                  errorMessage={translatedErrors.timezone}
                >
                  <Input
                    id="clinic-timezone"
                    name="timezone"
                    list="clinic-common-timezones"
                    value={draft.timezone}
                    placeholder={t('settings.form.timezonePlaceholder')}
                    disabled={controlsDisabled}
                    aria-invalid={translatedErrors.timezone !== null}
                    aria-describedby={
                      translatedErrors.timezone
                        ? 'clinic-timezone-hint clinic-timezone-error'
                        : 'clinic-timezone-hint'
                    }
                    onChange={(e) =>
                      updateDraftField('timezone', e.target.value)
                    }
                  />
                  <datalist id="clinic-common-timezones">
                    {COMMON_CLINIC_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz} />
                    ))}
                  </datalist>
                </SettingsField>

                <SettingsField
                  id="clinic-default-locale"
                  label={t('settings.form.defaultLocaleLabel')}
                  hint={t('settings.form.defaultLocaleHint')}
                  errorMessage={translatedErrors.defaultLocale}
                >
                  <Select
                    id="clinic-default-locale"
                    name="defaultLocale"
                    value={draft.defaultLocale}
                    disabled={controlsDisabled}
                    aria-invalid={translatedErrors.defaultLocale !== null}
                    aria-describedby={
                      translatedErrors.defaultLocale
                        ? 'clinic-default-locale-hint clinic-default-locale-error'
                        : 'clinic-default-locale-hint'
                    }
                    onChange={(e) => {
                      if (isSupportedLocale(e.target.value)) {
                        updateDraftField('defaultLocale', e.target.value);
                      }
                    }}
                  >
                    <option value="en">{t('language.en')}</option>
                    <option value="es">{t('language.es')}</option>
                  </Select>
                </SettingsField>
              </div>

              <div className="flex items-start gap-2 rounded-md bg-surface-muted p-3 text-xs text-text-secondary">
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="min-w-0 break-words">
                  {t('settings.auditNotice')}
                </span>
              </div>

              {isAdmin ? (
                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
                  {isDirty ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={handleResetChanges}
                    >
                      {t('settings.form.resetButton')}
                    </Button>
                  ) : null}

                  <Button
                    type="submit"
                    disabled={!isDirty || isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        <span>{t('settings.form.savingButton')}</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" aria-hidden="true" />
                        <span>{t('settings.form.saveButton')}</span>
                      </>
                    )}
                  </Button>
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <ClinicTaxPreviewCard
          currencyCode={previewCurrencyCode}
          currencySymbol={previewCurrencySymbol}
          taxRateBps={previewTaxRateBps}
          taxLabel={previewTaxLabel}
          timezone={previewTimezone}
          defaultLocale={draft.defaultLocale}
        />
      </div>
    </section>
  );
}

export function ClinicSettingsPage() {
  const { status, clinic, profile } = useAuth();
  const { t } = useI18n();

  if (status === 'loading') {
    return (
      <LoadingState
        title={t('states.loadingTitle')}
        description={t('states.loadingDescription')}
      />
    );
  }

  if (!clinic || !profile) {
    return (
      <EmptyState
        title={t('settings.emptyTitle')}
        description={t('settings.emptyDescription')}
      />
    );
  }

  return (
    <ClinicSettingsWorkspace
      key={clinic.id}
      clinic={clinic}
      profile={profile}
    />
  );
}
