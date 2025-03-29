import type React from 'react';

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
  className?: string;
}

const Toggle: React.FC<ToggleProps> = ({ enabled, onChange, label, className = '' }) => {
  const baseStyles = `
    relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
    transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
  `;

  const toggleStyles = enabled ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-200 dark:bg-gray-700';

  const handleStyles = `
    pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
    transition duration-200 ease-in-out
  `;

  const handlePosition = enabled ? 'translate-x-5' : 'translate-x-0';

  const labelStyles = `
    text-sm font-medium text-gray-900 dark:text-gray-100 select-none cursor-pointer
  `;

  return (
    <label className={`flex items-center space-x-3 ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`${baseStyles} ${toggleStyles}`}>
        <span aria-hidden="true" className={`${handleStyles} ${handlePosition}`} />
      </button>
      {label && <span className={labelStyles}>{label}</span>}
    </label>
  );
};

export default Toggle;
