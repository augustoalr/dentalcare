import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/ui/components/ui/button';
import { cn } from '@/ui/lib/utils';

export interface ErrorStateProps {
  title: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title,
  description,
  retryLabel,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-danger-border bg-danger-bg p-6 text-center',
        className,
      )}
    >
      <AlertCircle
        className="h-6 w-6 text-danger shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 max-w-full space-y-1">
        <p className="text-sm font-semibold text-danger-foreground break-words">
          {title}
        </p>
        {description ? (
          <p className="text-sm text-danger-foreground/90 break-words">
            {description}
          </p>
        ) : null}
      </div>
      {onRetry && retryLabel ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>{retryLabel}</span>
        </Button>
      ) : null}
    </div>
  );
}
