import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

// shadcn/ui "Alert" pattern. The role is chosen by the caller (alert / status / note).
const alertVariants = cva('rounded-lg border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'bg-background text-foreground',
      info: 'border-sky-300 bg-sky-50 text-sky-950',
      warning: 'border-amber-300 bg-amber-50 text-amber-950',
      destructive: 'border-destructive/50 bg-red-50 text-destructive',
      success: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Alert({ className, variant, ...props }: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div className={cn(alertVariants({ variant }), className)} {...props} />;
}
