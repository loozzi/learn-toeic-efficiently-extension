import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function IconButton({ children, className = '', ...rest }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
