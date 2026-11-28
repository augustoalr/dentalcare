import { useState } from 'react';
import { Archive, Clock, Pencil } from 'lucide-react';
import { formatMoney, type CurrencyDisplayConfig } from '@/domain/money';
import {
  getLocalizedTreatmentName,
  getSecondaryTreatmentName,
  type TreatmentRecord,
} from '@/domain/treatments';
import { TreatmentActionConfirmPanel } from '@/features/treatments/TreatmentActionConfirmPanel';
import { getTreatmentCategoryLabelKey } from '@/features/treatments/treatmentI18n';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';

export interface TreatmentCardProps {
  readonly treatment: TreatmentRecord;
  readonly currencyConfig: CurrencyDisplayConfig;
  readonly isAdmin: boolean;
  readonly onEdit?: (treatment: TreatmentRecord) => void;
  readonly onArchive?: (treatment: TreatmentRecord) => Promise<void>;
}

export function TreatmentCard({
  treatment,
  currencyConfig,
  isAdmin,
  onEdit,
  onArchive,
}: TreatmentCardProps) {
  const { locale, t } = useI18n();
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [hasArchiveError, setHasArchiveError] = useState(false);

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

  const handleConfirmArchive = async () => {
    if (!onArchive || isArchiving) {
      return;
    }

    setIsArchiving(true);
    setHasArchiveError(false);

    try {
      await onArchive(treatment);
    } catch {
      setHasArchiveError(true);
      setIsArchiving(false);
    }
  };

  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface-card p-4 transition-colors">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Badge
              variant="primary"
              className="shrink-0 font-mono break-all [overflow-wrap:anywhere]"
            >
              {treatment.code}
            </Badge>
            <Badge variant="default" className="shrink-0">
              {categoryLabel}
            </Badge>
            <Badge
              variant={treatment.isActive ? 'success' : 'warning'}
              className="shrink-0"
            >
              {treatment.isActive
                ? t('treatments.status.active')
                : t('treatments.status.paused')}
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

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{formattedDuration}</span>
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:items-end shrink-0">
          <p className="text-lg font-bold tracking-tight text-text-primary tabular-nums break-words">
            {formattedPrice}
          </p>

          {isAdmin && !isConfirmingArchive ? (
            <div className="flex flex-wrap items-center gap-2">
              {onEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(treatment)}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t('treatments.card.editButton')}</span>
                </Button>
              ) : null}

              {onArchive ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setHasArchiveError(false);
                    setIsConfirmingArchive(true);
                  }}
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t('treatments.card.archiveButton')}</span>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {isAdmin && isConfirmingArchive ? (
        <TreatmentActionConfirmPanel
          tone="danger"
          title={t('treatments.card.archiveConfirm.title')}
          description={t('treatments.card.archiveConfirm.description')}
          confirmLabel={t('treatments.card.archiveConfirm.confirmButton')}
          busyLabel={t('treatments.card.archiveConfirm.archivingButton')}
          cancelLabel={t('treatments.card.archiveConfirm.cancelButton')}
          errorTitle={t('treatments.card.archiveConfirm.errorTitle')}
          errorDescription={t(
            'treatments.card.archiveConfirm.errorDescription',
          )}
          confirmIcon={<Archive className="h-3.5 w-3.5" aria-hidden="true" />}
          isBusy={isArchiving}
          hasError={hasArchiveError}
          onConfirm={() => void handleConfirmArchive()}
          onCancel={() => {
            setIsConfirmingArchive(false);
            setHasArchiveError(false);
          }}
        />
      ) : null}
    </article>
  );
}
