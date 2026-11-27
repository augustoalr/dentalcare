import { useState } from 'react';
import { Archive, Clock, RotateCcw } from 'lucide-react';
import { formatMoney, type CurrencyDisplayConfig } from '@/domain/money';
import { formatPatientFileDate } from '@/domain/patientFiles';
import {
  getLocalizedTreatmentName,
  getSecondaryTreatmentName,
  type ArchivedTreatmentRecord,
} from '@/domain/treatments';
import { TreatmentActionConfirmPanel } from '@/features/treatments/TreatmentActionConfirmPanel';
import { getTreatmentCategoryLabelKey } from '@/features/treatments/treatmentI18n';
import { useI18n } from '@/i18n';
import { isDuplicateTreatmentCodeError } from '@/services/repositories/treatmentRepository';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';

export interface ArchivedTreatmentCardProps {
  readonly treatment: ArchivedTreatmentRecord;
  readonly currencyConfig: CurrencyDisplayConfig;
  readonly onRestore: (treatment: ArchivedTreatmentRecord) => Promise<void>;
}

export function ArchivedTreatmentCard({
  treatment,
  currencyConfig,
  onRestore,
}: ArchivedTreatmentCardProps) {
  const { locale, t } = useI18n();
  const [isConfirmingRestore, setIsConfirmingRestore] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreErrorType, setRestoreErrorType] = useState<
    'none' | 'duplicate' | 'generic'
  >('none');

  const primaryName = getLocalizedTreatmentName(treatment, locale);
  const secondaryName = getSecondaryTreatmentName(treatment, locale);
  const categoryLabel = t(getTreatmentCategoryLabelKey(treatment.category));
  const formattedPrice = formatMoney(
    treatment.defaultPriceCents,
    currencyConfig,
    locale,
  );
  const formattedDuration = t('treatments.card.durationMinutes').replace(
    '{minutes}',
    String(treatment.defaultDurationMin),
  );
  const formattedArchivedDate = formatPatientFileDate(
    treatment.deletedAt,
    locale,
  );

  const handleConfirmRestore = async () => {
    if (isRestoring) {
      return;
    }

    setIsRestoring(true);
    setRestoreErrorType('none');

    try {
      await onRestore(treatment);
    } catch (error) {
      setRestoreErrorType(
        isDuplicateTreatmentCodeError(error) ? 'duplicate' : 'generic',
      );
      setIsRestoring(false);
    }
  };

  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Badge
              variant="default"
              className="shrink-0 font-mono break-all [overflow-wrap:anywhere]"
            >
              {treatment.code}
            </Badge>
            <Badge variant="default" className="shrink-0">
              {categoryLabel}
            </Badge>
            <Badge variant="default" className="shrink-0">
              <Archive className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{t('treatments.status.archived')}</span>
            </Badge>
          </div>

          <div className="min-w-0 space-y-0.5">
            <h2 className="text-base font-semibold text-text-primary break-words [overflow-wrap:anywhere]">
              {primaryName}
            </h2>
            {secondaryName !== primaryName ? (
              <p className="text-xs text-text-muted break-words [overflow-wrap:anywhere]">
                {secondaryName}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{formattedDuration}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t('treatments.card.archivedOn').replace(
                '{date}',
                formattedArchivedDate,
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:items-end shrink-0">
          <p className="text-base font-semibold text-text-secondary tabular-nums break-words">
            {formattedPrice}
          </p>

          {!isConfirmingRestore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setRestoreErrorType('none');
                setIsConfirmingRestore(true);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('treatments.card.restoreButton')}</span>
            </Button>
          ) : null}
        </div>
      </div>

      {isConfirmingRestore ? (
        <TreatmentActionConfirmPanel
          tone="primary"
          title={t('treatments.card.restoreConfirm.title')}
          description={t('treatments.card.restoreConfirm.description')}
          confirmLabel={t('treatments.card.restoreConfirm.confirmButton')}
          busyLabel={t('treatments.card.restoreConfirm.restoringButton')}
          cancelLabel={t('treatments.card.restoreConfirm.cancelButton')}
          errorTitle={t('treatments.card.restoreConfirm.errorTitle')}
          errorDescription={
            restoreErrorType === 'duplicate'
              ? t('treatments.card.restoreConfirm.duplicateCodeError')
              : t('treatments.card.restoreConfirm.errorDescription')
          }
          confirmIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
          isBusy={isRestoring}
          hasError={restoreErrorType !== 'none'}
          onConfirm={() => void handleConfirmRestore()}
          onCancel={() => {
            setIsConfirmingRestore(false);
            setRestoreErrorType('none');
          }}
        />
      ) : null}
    </article>
  );
}
