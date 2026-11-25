import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/ui/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium max-w-full',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface-muted text-text-secondary',
        primary: 'border-primary/30 bg-primary/10 text-primary',
        warning: 'border-warning-border bg-warning-bg text-warning-foreground',
        medical:
          'border-medical-alert-border bg-medical-alert-bg text-medical-alert-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
