import type { ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/ui/components/ui/button';

export interface PatientFileActionConfirmPanelProps {
  readonly tone: 'danger' | 'primary';
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly busyLabel: string;
  readonly cancelLabel: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly confirmIcon: ReactNode;
  readonly isBusy: boolean;
  readonly hasError: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function PatientFileActionConfirmPanel({
  tone,
  title,
  description,
  confirmLabel,
  busyLabel,
  cancelLabel,
  errorTitle,
  errorDescription,
  confirmIcon,
  isBusy,
  hasError,
  onConfirm,
  onCancel,
}: PatientFileActionConfirmPanelProps) {
  const containerClass =
    tone === 'danger'
      ? 'space-y-3 rounded-md border border-danger-border bg-danger-bg p-3 text-danger-foreground'
      : 'space-y-3 rounded-md border border-border bg-surface-muted p-3 text-text-primary';

  const descriptionClass =
    tone === 'danger'
      ? 'text-xs text-danger-foreground/90 break-words'
      : 'text-xs text-text-secondary break-words';

  return (
    <div role="region" aria-label={title} className={containerClass}>
      <div className="space-y-1">
        <p className="text-xs font-semibold break-words">{title}</p>
        <p className={descriptionClass}>{description}</p>
      </div>

      {hasError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger-border bg-surface-card p-2.5 text-xs text-danger-foreground"
        >
          <AlertCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="font-semibold break-words">{errorTitle}</p>
            <p className="break-words">{errorDescription}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>

        <Button
          type="button"
          variant={tone === 'danger' ? 'destructive' : 'default'}
          size="sm"
          disabled={isBusy}
          onClick={onConfirm}
        >
          {isBusy ? (
            <>
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
              <span>{busyLabel}</span>
            </>
          ) : (
            <>
              {confirmIcon}
              <span>{confirmLabel}</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
