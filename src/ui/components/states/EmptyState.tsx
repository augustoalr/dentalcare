import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/ui/lib/utils';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface-card p-6 text-center',
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-text-muted shrink-0">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden="true" />}
      </div>
      <div className="min-w-0 max-w-full space-y-1">
        <p className="text-sm font-semibold text-text-primary break-words">
          {title}
        </p>
        {description ? (
          <p className="text-sm text-text-muted break-words">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
