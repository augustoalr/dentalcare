import { Loader2 } from 'lucide-react';
import { cn } from '@/ui/lib/utils';

export interface LoadingStateProps {
  title: string;
  description?: string;
  className?: string;
}

export function LoadingState({
  title,
  description,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface-card p-6 text-center',
        className,
      )}
    >
      <Loader2
        className="h-6 w-6 animate-spin text-primary shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 max-w-full space-y-1">
        <p className="text-sm font-medium text-text-primary break-words">
          {title}
        </p>
        {description ? (
          <p className="text-sm text-text-muted break-words">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
