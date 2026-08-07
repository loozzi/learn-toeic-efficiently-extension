import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'outline' | 'ghost' | 'destructive';
type Size = 'md' | 'sm';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover disabled:hover:bg-primary',
  outline: 'border border-border bg-surface text-foreground hover:bg-surface-muted',
  ghost: 'text-foreground hover:bg-surface-muted',
  destructive: 'border border-destructive/40 text-destructive hover:bg-destructive/10',
};

const SIZE: Record<Size, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-xs',
};

export function Button({ variant = 'outline', size = 'md', icon, className = '', children, ...rest }: {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
