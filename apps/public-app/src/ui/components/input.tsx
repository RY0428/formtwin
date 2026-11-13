import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

// shadcn/ui "Input" pattern.
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive file:mr-3 file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  );
}
