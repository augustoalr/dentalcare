import { ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/ui/lib/utils';

export interface SandboxNoticeBannerProps {
  className?: string;
}

export function SandboxNoticeBanner({ className }: SandboxNoticeBannerProps) {
  const { t } = useI18n();

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-warning-border bg-warning-bg p-4 text-warning-foreground',
        className,
      )}
    >
      <ShieldCheck
        className="mt-0.5 h-5 w-5 shrink-0 text-warning"
        aria-hidden="true"
      />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold break-words">
          {t('app.sandboxNoticeTitle')}
        </p>
        <p className="text-sm break-words">{t('app.sandboxNoticeBody')}</p>
      </div>
    </div>
  );
}
