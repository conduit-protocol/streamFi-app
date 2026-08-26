import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:   string;
  hint?:    string;
  error?:   string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, id, className = '', ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-black dark:text-white">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`input ${error ? 'border-black dark:border-white border-2 focus:ring-black/10 dark:focus:ring-white/10' : ''} ${className}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>
        )}
        {error && (
          <p id={`${inputId}-error`} className="text-xs font-semibold text-black dark:text-white" role="alert">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
