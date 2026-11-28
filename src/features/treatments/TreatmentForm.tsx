import { useState, type FormEvent } from 'react';
import { AlertCircle, Loader2, Save, ShieldCheck } from 'lucide-react';
import {
  bpsToPercentString,
  calculateTaxSummaryCents,
  centsToInputString,
  formatMoney,
  moneyStringToCents,
} from '@/domain/money';
import {
  isTreatmentCategory,
  parseDurationMinutesString,
  TREATMENT_CATEGORIES,
  TREATMENT_DEFAULT_DURATION_MIN,
  validateTreatmentInput,
  type TreatmentCategory,
  type TreatmentFieldErrors,
  type TreatmentInput,
  type TreatmentRecord,
} from '@/domain/treatments';
import { SettingsField } from '@/features/settings/SettingsField';
import { getTreatmentCategoryLabelKey } from '@/features/treatments/treatmentI18n';
import { useI18n, type TranslationKey } from '@/i18n';
import type { ClinicSummary } from '@/services/repositories/clinicAccessRepository';
import { isDuplicateTreatmentCodeError } from '@/services/repositories/treatmentRepository';
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

export interface TreatmentFormProps {
  readonly mode: 'create' | 'edit';
  readonly clinic: ClinicSummary;
  readonly initialValues?: TreatmentRecord;
  readonly onSubmit: (input: TreatmentInput) => Promise<void>;
  readonly onCancel: () => void;
}

interface TreatmentFormDraft {
  readonly code: string;
  readonly nameEn: string;
  readonly nameEs: string;
  readonly category: TreatmentCategory;
  readonly priceInput: string;
  readonly durationInput: string;
  readonly isActive: boolean;
}

function createInitialDraft(initial?: TreatmentRecord): TreatmentFormDraft {
  return Object.freeze({
    code: initial?.code ?? '',
    nameEn: initial?.nameEn ?? '',
    nameEs: initial?.nameEs ?? '',
    category: initial?.category ?? 'preventive',
    priceInput:
      initial !== undefined ? centsToInputString(initial.defaultPriceCents) : '',
    durationInput: String(
      initial?.defaultDurationMin ?? TREATMENT_DEFAULT_DURATION_MIN,
    ),
    isActive: initial?.isActive ?? true,
  });
}

function resolveTreatmentFieldErrors(
  errors: TreatmentFieldErrors | null,
  t: (key: TranslationKey) => string,
) {
  if (!errors) {
    return {
      code: null,
      nameEn: null,
      nameEs: null,
      category: null,
      defaultPriceCents: null,
      defaultDurationMin: null,
      isActive: null,
    };
  }

  return {
    code:
      errors.code === 'code_required'
        ? t('treatments.validation.codeRequired')
        : errors.code === 'code_too_long'
          ? t('treatments.validation.codeTooLong')
          : errors.code === 'code_invalid'
            ? t('treatments.validation.codeInvalid')
            : null,
    nameEn:
      errors.nameEn === 'name_required'
        ? t('treatments.validation.nameEnRequired')
        : errors.nameEn === 'name_too_long'
          ? t('treatments.validation.nameEnTooLong')
          : null,
    nameEs:
      errors.nameEs === 'name_required'
        ? t('treatments.validation.nameEsRequired')
        : errors.nameEs === 'name_too_long'
          ? t('treatments.validation.nameEsTooLong')
          : null,
    category:
      errors.category === 'category_invalid'
        ? t('treatments.validation.categoryInvalid')
        : null,
    defaultPriceCents:
      errors.defaultPriceCents === 'price_invalid'
        ? t('treatments.validation.priceInvalid')
        : null,
    defaultDurationMin:
      errors.defaultDurationMin === 'duration_invalid'
        ? t('treatments.validation.durationInvalid')
        : null,
    isActive:
      errors.isActive === 'is_active_invalid'
        ? t('treatments.validation.isActiveInvalid')
        : null,
  };
}

export function TreatmentForm({
  mode,
  clinic,
  initialValues,
  onSubmit,
  onCancel,
}: TreatmentFormProps) {
  const { locale, t } = useI18n();
  const [draft, setDraft] = useState<TreatmentFormDraft>(() =>
    createInitialDraft(initialValues),
  );
  const [fieldErrors, setFieldErrors] = useState<TreatmentFieldErrors | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrorType, setSaveErrorType] = useState<
    'none' | 'duplicate' | 'generic'
  >('none');

  const translatedErrors = resolveTreatmentFieldErrors(fieldErrors, t);
  const parsedPriceCents = moneyStringToCents(draft.priceInput);
  const previewTaxSummary =
    parsedPriceCents !== null
      ? calculateTaxSummaryCents(parsedPriceCents, clinic.taxRateBps)
      : null;
  const clinicCurrencyDisplay = clinic.currencySymbol.trim() || clinic.currencyCode;

  const updateField = <K extends keyof TreatmentFormDraft>(
    key: K,
    value: TreatmentFormDraft[K],
  ) => {
    setDraft((prev) => Object.freeze({ ...prev, [key]: value }));
    if (fieldErrors) {
      setFieldErrors(null);
    }
    if (saveErrorType !== 'none') {
      setSaveErrorType('none');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    setSaveErrorType('none');

    const validation = validateTreatmentInput({
      code: draft.code,
      nameEn: draft.nameEn,
      nameEs: draft.nameEs,
      category: draft.category,
      defaultPriceCents: moneyStringToCents(draft.priceInput),
      defaultDurationMin: parseDurationMinutesString(draft.durationInput),
      isActive: draft.isActive,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors(null);
    setIsSaving(true);

    try {
      await onSubmit(validation.value);
    } catch (error) {
      setSaveErrorType(
        isDuplicateTreatmentCodeError(error) ? 'duplicate' : 'generic',
      );
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode === 'create'
            ? t('treatments.form.createCardTitle')
            : t('treatments.form.editCardTitle')}
        </CardTitle>
        <CardDescription>
          {mode === 'create'
            ? t('treatments.form.createCardDescription')
            : t('treatments.form.editCardDescription')}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form
          noValidate
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-5"
        >
          {saveErrorType !== 'none' ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-bg p-3.5 text-danger-foreground"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-danger"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 space-y-0.5 text-xs">
                <p className="font-semibold break-words">
                  {t('treatments.form.saveErrorTitle')}
                </p>
                <p className="break-words">
                  {saveErrorType === 'duplicate'
                    ? t('treatments.form.duplicateCodeError')
                    : t('treatments.form.saveErrorDescription')}
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsField
              id="treatment-code"
              label={t('treatments.form.codeLabel')}
              hint={t('treatments.form.codeHint')}
              errorMessage={translatedErrors.code}
            >
              <Input
                id="treatment-code"
                name="code"
                value={draft.code}
                placeholder={t('treatments.form.codePlaceholder')}
                disabled={isSaving}
                aria-invalid={translatedErrors.code !== null}
                aria-describedby={
                  translatedErrors.code
                    ? 'treatment-code-hint treatment-code-error'
                    : 'treatment-code-hint'
                }
                onChange={(e) => updateField('code', e.target.value)}
              />
            </SettingsField>

            <SettingsField
              id="treatment-category"
              label={t('treatments.form.categoryLabel')}
              errorMessage={translatedErrors.category}
            >
              <Select
                id="treatment-category"
                name="category"
                value={draft.category}
                disabled={isSaving}
                aria-invalid={translatedErrors.category !== null}
                aria-describedby={
                  translatedErrors.category
                    ? 'treatment-category-error'
                    : undefined
                }
                onChange={(e) => {
                  if (isTreatmentCategory(e.target.value)) {
                    updateField('category', e.target.value);
                  }
                }}
              >
                {TREATMENT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(getTreatmentCategoryLabelKey(category))}
                  </option>
                ))}
              </Select>
            </SettingsField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsField
              id="treatment-name-en"
              label={t('treatments.form.nameEnLabel')}
              errorMessage={translatedErrors.nameEn}
            >
              <Input
                id="treatment-name-en"
                name="nameEn"
                value={draft.nameEn}
                placeholder={t('treatments.form.nameEnPlaceholder')}
                disabled={isSaving}
                aria-invalid={translatedErrors.nameEn !== null}
                aria-describedby={
                  translatedErrors.nameEn
                    ? 'treatment-name-en-error'
                    : undefined
                }
                onChange={(e) => updateField('nameEn', e.target.value)}
              />
            </SettingsField>

            <SettingsField
              id="treatment-name-es"
              label={t('treatments.form.nameEsLabel')}
              errorMessage={translatedErrors.nameEs}
            >
              <Input
                id="treatment-name-es"
                name="nameEs"
                value={draft.nameEs}
                placeholder={t('treatments.form.nameEsPlaceholder')}
                disabled={isSaving}
                aria-invalid={translatedErrors.nameEs !== null}
                aria-describedby={
                  translatedErrors.nameEs
                    ? 'treatment-name-es-error'
                    : undefined
                }
                onChange={(e) => updateField('nameEs', e.target.value)}
              />
            </SettingsField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsField
              id="treatment-price"
              label={t('treatments.form.priceLabel').replace(
                '{currency}',
                clinicCurrencyDisplay,
              )}
              hint={t('treatments.form.priceHint')}
              errorMessage={translatedErrors.defaultPriceCents}
            >
              <Input
                id="treatment-price"
                name="price"
                inputMode="decimal"
                value={draft.priceInput}
                placeholder={t('treatments.form.pricePlaceholder')}
                disabled={isSaving}
                aria-invalid={translatedErrors.defaultPriceCents !== null}
                aria-describedby={
                  translatedErrors.defaultPriceCents
                    ? 'treatment-price-hint treatment-price-error'
                    : 'treatment-price-hint'
                }
                onChange={(e) => updateField('priceInput', e.target.value)}
              />
            </SettingsField>

            <SettingsField
              id="treatment-duration"
              label={t('treatments.form.durationLabel')}
              hint={t('treatments.form.durationHint')}
              errorMessage={translatedErrors.defaultDurationMin}
            >
              <Input
                id="treatment-duration"
                name="duration"
                inputMode="numeric"
                value={draft.durationInput}
                placeholder={t('treatments.form.durationPlaceholder')}
                disabled={isSaving}
                aria-invalid={translatedErrors.defaultDurationMin !== null}
                aria-describedby={
                  translatedErrors.defaultDurationMin
                    ? 'treatment-duration-hint treatment-duration-error'
                    : 'treatment-duration-hint'
                }
                onChange={(e) => updateField('durationInput', e.target.value)}
              />
            </SettingsField>
          </div>

          <div className="rounded-lg border border-border bg-surface-muted p-3.5 space-y-2">
            <p className="text-xs font-semibold text-text-primary">
              {t('treatments.form.previewTitle')}
            </p>
            {previewTaxSummary ? (
              <dl className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-text-secondary">
                    {t('treatments.form.previewBaseLabel')}
                  </dt>
                  <dd className="font-medium text-text-primary tabular-nums">
                    {formatMoney(previewTaxSummary.subtotalCents, clinic, locale)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-text-secondary">
                    {t('treatments.form.previewTaxLabel')
                      .replace('{taxLabel}', clinic.taxLabel)
                      .replace('{rate}', bpsToPercentString(clinic.taxRateBps))}
                  </dt>
                  <dd className="font-medium text-text-secondary tabular-nums">
                    {formatMoney(previewTaxSummary.taxCents, clinic, locale)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
                  <dt className="font-semibold text-text-primary">
                    {t('treatments.form.previewTotalLabel')}
                  </dt>
                  <dd className="font-bold text-primary tabular-nums">
                    {formatMoney(previewTaxSummary.totalCents, clinic, locale)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-text-muted break-words">
                {t('treatments.form.previewInvalidHint')}
              </p>
            )}
          </div>

          <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface-card p-3">
            <input
              id="treatment-is-active"
              name="isActive"
              type="checkbox"
              checked={draft.isActive}
              disabled={isSaving}
              onChange={(e) => updateField('isActive', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="min-w-0 space-y-0.5">
              <label
                htmlFor="treatment-is-active"
                className="text-sm font-medium text-text-primary cursor-pointer break-words"
              >
                {t('treatments.form.isActiveLabel')}
              </label>
              <p className="text-xs text-text-muted break-words">
                {t('treatments.form.isActiveHint')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md bg-surface-muted p-3 text-xs text-text-secondary">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="min-w-0 break-words">
              {t('treatments.form.auditNotice')}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={onCancel}
            >
              {t('treatments.form.cancelButton')}
            </Button>

            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  <span>{t('treatments.form.savingButton')}</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {mode === 'create'
                      ? t('treatments.form.createSubmitButton')
                      : t('treatments.form.editSubmitButton')}
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
