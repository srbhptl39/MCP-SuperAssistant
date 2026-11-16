import type { ReactNode } from 'react';

export const inputClass =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition ' +
  'focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 ' +
  'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-700';

export const buttonClass =
  'inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium ' +
  'text-neutral-800 transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-300 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 dark:focus:ring-neutral-600';

export const Card = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <div className="border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
      {description ? <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{description}</p> : null}
    </div>
    <div className="flex flex-col gap-6 p-5">{children}</div>
  </section>
);

export const Field = ({ label, hint, children }: { label: string; hint?: ReactNode; children?: ReactNode }) => (
  <div className="flex flex-1 flex-col gap-2">
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
      {hint ? <span className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{hint}</span> : null}
    </div>
    {children}
  </div>
);

export const Toggle = ({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={
      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-neutral-900 ' +
      (checked ? 'bg-neutral-900 dark:bg-neutral-100' : 'bg-neutral-300 dark:bg-neutral-700')
    }>
    <span
      className={
        'inline-block h-5 w-5 transform rounded-full bg-white shadow transition dark:bg-neutral-900 ' +
        (checked ? 'translate-x-5' : 'translate-x-0.5')
      }
    />
  </button>
);

export interface RadioOption<T extends string> {
  value: T;
  label: string;
}

export const RadioGroup = <T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: RadioOption<T>[];
  onChange: (v: T) => void;
}) => (
  <div className="flex flex-col gap-2">
    {options.map(opt => (
      <label
        key={opt.value}
        className="flex cursor-pointer items-center gap-2.5 text-sm text-neutral-800 dark:text-neutral-200">
        <input
          type="radio"
          name={name}
          checked={value === opt.value}
          onChange={() => onChange(opt.value)}
          className="h-4 w-4 accent-neutral-900 dark:accent-neutral-100"
        />
        {opt.label}
      </label>
    ))}
  </div>
);

export const SavedTag = ({ show }: { show: boolean }) => (
  <span
    aria-live="polite"
    className={
      'text-xs font-medium text-green-600 transition-opacity duration-300 dark:text-green-400 ' +
      (show ? 'opacity-100' : 'opacity-0')
    }>
    Saved
  </span>
);

export const primaryButtonClass =
  'inline-flex items-center justify-center rounded-md border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-sm font-medium ' +
  'text-white transition hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-300 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:focus:ring-neutral-600';
