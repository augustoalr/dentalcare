import { ShieldAlert } from 'lucide-react';
import { cn } from '@/ui/lib/utils';

export interface MedicalAlertBannerProps {
  label: string;
  title: string;
  description?: string;
  className?: string;
}

/**
 * High-contrast medical alert banner. Always pairs semantic red tokens with
 * a clear warning icon so critical allergies are never communicated by color alone.
 */
export function MedicalAlertBanner({
  label,
  title,
  description,
  className,
}: MedicalAlertBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border-2 border-medical-alert-border bg-medical-alert-bg p-4 text-medical-alert-foreground',
        className,
      )}
    >
      <ShieldAlert
        className="mt-0.5 h-5 w-5 shrink-0 text-medical-alert"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-medical-alert">
          {label}
        </p>
        <p className="text-sm font-semibold text-medical-alert-foreground break-words">
          {title}
        </p>
        {description ? (
          <p className="text-sm text-medical-alert-foreground/90 break-words">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
