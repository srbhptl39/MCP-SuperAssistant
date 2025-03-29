import type React from 'react';
import { cn } from '@src/lib/utils';

interface TypographyProps {
  variant: 'h1' | 'h2' | 'h3' | 'h4' | 'subtitle' | 'body' | 'small' | 'caption';
  className?: string;
  children: React.ReactNode;
}

const Typography: React.FC<TypographyProps> = ({ variant, className, children }) => {
  const baseStyles = 'font-inter';

  const variantStyles = {
    h1: 'scroll-m-20 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50',
    h2: 'scroll-m-20 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50',
    h3: 'scroll-m-20 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50',
    h4: 'scroll-m-20 text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50',
    subtitle: 'text-sm font-medium text-slate-600 dark:text-slate-400',
    body: 'text-sm text-slate-700 dark:text-slate-300',
    small: 'text-xs text-slate-700 dark:text-slate-300',
    caption: 'text-xs text-slate-500 dark:text-slate-500',
  };

  const Component =
    variant === 'h1' ? 'h1' : variant === 'h2' ? 'h2' : variant === 'h3' ? 'h3' : variant === 'h4' ? 'h4' : 'div';

  return <Component className={cn(baseStyles, variantStyles[variant], className)}>{children}</Component>;
};

export default Typography;
