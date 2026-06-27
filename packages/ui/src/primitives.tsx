import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from './cn';

// ── Card ───────────────────────────────────────────────────────
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-4 pb-2', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-xs font-medium uppercase tracking-wide text-muted', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 pt-2', className)} {...props} />;
}

// ── Badge ──────────────────────────────────────────────────────
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none',
  {
    variants: {
      variant: {
        default: 'bg-border/60 text-fg',
        accent: 'bg-accent/15 text-accent',
        success: 'bg-emerald-500/15 text-emerald-400',
        warning: 'bg-amber-500/15 text-amber-400',
        danger: 'bg-red-500/15 text-red-400',
        muted: 'bg-border/40 text-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  children?: React.ReactNode;
}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// ── Button ─────────────────────────────────────────────────────
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent/90',
        secondary: 'border border-border bg-surface text-fg hover:bg-border/40',
        ghost: 'text-muted hover:bg-border/40 hover:text-fg',
        danger: 'bg-red-500/90 text-white hover:bg-red-500',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

// ── Input ──────────────────────────────────────────────────────
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-9 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg placeholder:text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

// ── Label ──────────────────────────────────────────────────────
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-xs font-medium text-muted', className)}
      {...props}
    />
  );
}

// ── Stat ───────────────────────────────────────────────────────
export function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <span className="text-xl font-semibold tabular-nums text-fg">{value}</span>
      {sub ? <span className="text-xs text-muted">{sub}</span> : null}
    </div>
  );
}
