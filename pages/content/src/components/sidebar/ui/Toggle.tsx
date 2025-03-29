import type React from 'react';
import { cn } from '@src/lib/utils';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  size?: 'sm' | 'md';
}

const Toggle: React.FC<ToggleProps> = ({ label, checked, onChange, className, size = 'md' }) => {
  const handleChange = () => {
    onChange(!checked);
  };

  const toggleSize = {
    sm: {
      container: 'w-8 h-4',
      circle: 'w-3 h-3',
      translate: 'translate-x-4',
    },
    md: {
      container: 'w-10 h-5',
      circle: 'h-4 w-4',
      translate: 'translate-x-5',
    },
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={handleChange}
        className={cn(
          'relative inline-flex flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out',
          'border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-background',
          toggleSize[size].container,
          checked ? 'bg-slate-900 dark:bg-slate-50' : 'bg-slate-200 dark:bg-slate-700',
        )}>
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none inline-block transform rounded-full shadow ring-0 transition duration-200 ease-in-out',
            toggleSize[size].circle,
            checked
              ? `${toggleSize[size].translate} bg-white dark:bg-slate-900`
              : 'translate-x-0 bg-white dark:bg-slate-900',
          )}
        />
      </button>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
    </div>
  );
};

export default Toggle;
