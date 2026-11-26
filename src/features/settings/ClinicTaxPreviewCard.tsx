import { Calculator } from 'lucide-react';
import type { SupportedLocale } from '@/domain/locale';
import {
  bpsToPercentString,
  calculateTaxSummaryCents,
  formatMoney,
  PREVIEW_SAMPLE_SUBTOTAL_CENTS,
} from '@/domain/money';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/ui/components/ui/card';

export interface ClinicTaxPreviewCardProps {
  readonly currencyCode: string;
  readonly currencySymbol: string;
  readonly taxRateBps: number;
  readonly taxLabel: string;
  readonly timezone: string;
  readonly defaultLocale: SupportedLocale;
}

export function ClinicTaxPreviewCard({
  currencyCode,
  currencySymbol,
  taxRateBps,
  taxLabel,
  timezone,
  defaultLocale,
}: ClinicTaxPreviewCardProps) {
  const { locale, t } = useI18n();

  const summary = calculateTaxSummaryCents(
    PREVIEW_SAMPLE_SUBTOTAL_CENTS,
    taxRateBps,
  );
  const currencyConfig = { currencyCode, currencySymbol };
  const formattedSubtotal = formatMoney(
    summary.subtotalCents,
    currencyConfig,
    locale,
  );
  const formattedTax = formatMoney(summary.taxCents, currencyConfig, locale);
  const formattedTotal = formatMoney(
    summary.totalCents,
    currencyConfig,
    locale,
  );
  const percentText = bpsToPercentString(taxRateBps);

  return (
    <Card className="h-fit">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Calculator
              className="h-4 w-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <CardTitle>{t('settings.preview.title')}</CardTitle>
          </div>
          <Badge variant="primary">{t('settings.preview.badge')}</Badge>
        </div>
        <CardDescription>{t('settings.preview.description')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2.5 rounded-md border border-border bg-surface-muted p-4">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 text-text-secondary break-words">
              {t('settings.preview.subtotalLabel')}
            </span>
            <span className="shrink-0 font-medium text-text-primary">
              {formattedSubtotal}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 text-text-secondary break-words">
              {taxLabel} ({percentText}%)
            </span>
            <span className="shrink-0 font-medium text-text-primary">
              {formattedTax}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2.5 text-base font-semibold">
            <span className="min-w-0 text-text-primary break-words">
              {t('settings.preview.totalLabel')}
            </span>
            <span className="shrink-0 text-primary">{formattedTotal}</span>
          </div>
        </div>

        <dl className="space-y-2 text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-muted">
              {t('settings.preview.activeCurrencyLabel')}
            </dt>
            <dd className="min-w-0 font-medium text-text-primary break-words text-right">
              {currencyCode} ({currencySymbol})
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-muted">
              {t('settings.preview.activeTimezoneLabel')}
            </dt>
            <dd className="min-w-0 font-medium text-text-primary break-words text-right">
              {timezone}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-muted">
              {t('settings.preview.activeDefaultLocaleLabel')}
            </dt>
            <dd className="min-w-0 font-medium text-text-primary break-words text-right">
              {defaultLocale === 'es' ? t('language.es') : t('language.en')}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
