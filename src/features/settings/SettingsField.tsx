import type { ReactNode } from 'react';
import { Label } from '@/ui/components/ui/label';

export interface SettingsFieldProps {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly errorMessage?: string | null;
  readonly children: ReactNode;
}

export function SettingsField({
  id,
  label,
  hint,
  errorMessage,
  children,
}: SettingsFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={hintId} className="text-xs text-text-muted break-words">
          {hint}
        </p>
      ) : null}
      {errorMessage ? (
        <p
          id={errorId}
          role="alert"
          className="text-xs font-medium text-danger break-words"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
