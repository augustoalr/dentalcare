import { Stethoscope } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/ui/lib/utils';

export interface BrandMarkProps {
  showTagline?: boolean;
  className?: string;
}

export function BrandMark({ showTagline = true, className }: BrandMarkProps) {
  const { t } = useI18n();

  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Stethoscope className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <span className="block truncate text-lg font-bold tracking-tight text-text-primary">
          {t('app.name')}
        </span>
        {showTagline ? (
          <p className="truncate text-xs text-text-muted">{t('app.tagline')}</p>
        ) : null}
      </div>
    </div>
  );
}
