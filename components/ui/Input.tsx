import { forwardRef, useRef, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { X } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:      string;
  hint?:       string;
  error?:      string;
  allowClear?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, id, className = '', allowClear = false, value, onChange, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    const inputRef = useRef<HTMLInputElement>(null);

    const setRefs = (node: HTMLInputElement | null) => {
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
      inputRef.current = node;
    };

    const handleClear = () => {
      const el = inputRef.current;
      if (!el) return;

      el.value = '';

      if (onChange) {
        const event = {
          target: el,
          currentTarget: el,
        } as ChangeEvent<HTMLInputElement>;
        onChange(event);
      }

      el.focus();
    };

    const hasValue =
      typeof value === 'string'
        ? value.length > 0
        : typeof value === 'number'
          ? value > 0
          : Boolean(inputRef.current?.value.length);

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-black dark:text-white">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            {...props}
            ref={setRefs}
            id={inputId}
            value={value}
            onChange={onChange}
            className={`input ${allowClear ? 'pr-10' : ''} ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10' : ''} ${className}`}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          />
          {allowClear && hasValue && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear input"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
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
