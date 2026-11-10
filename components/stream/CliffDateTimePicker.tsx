'use client';

/**
 * CliffDateTimePicker — accessible date-time picker for stream cliff periods (issue #720).
 *
 * Disables dates outside the valid [start_time, end_time] range to prevent
 * users from choosing cliff dates past the stream end date.
 */

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, AlertTriangle } from 'lucide-react';

interface CliffDateTimePickerProps {
  /** Stream start timestamp (Unix seconds). */
  startTime: number;
  /** Stream end timestamp (Unix seconds). */
  endTime: number;
  /** Selected cliff timestamp (Unix seconds), 0 for none. */
  value: number;
  /** Called when the user selects a cliff time. */
  onChange: (timestamp: number) => void;
  /** Optional CSS class. */
  className?: string;
  /** Minimum elapsed duration from start before cliff activates (seconds). */
  minElapsedSeconds?: number;
}

function toDatetimeLocal(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return d.toISOString().slice(0, 16);
}

function fromDatetimeLocal(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

export function CliffDateTimePicker({
  startTime,
  endTime,
  value,
  onChange,
  className,
  minElapsedSeconds = 0,
}: CliffDateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [localValue, setLocalValue] = useState<string>(() =>
    value > 0 ? toDatetimeLocal(value) : ''
  );
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const minDate = toDatetimeLocal(startTime + minElapsedSeconds);
  const maxDate = toDatetimeLocal(endTime);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApply = () => {
    if (!localValue) {
      onChange(0);
      setOpen(false);
      return;
    }

    const timestamp = fromDatetimeLocal(localValue);

    if (timestamp <= startTime) {
      setError('Cliff must be after the stream start time');
      return;
    }
    if (timestamp >= endTime) {
      setError('Cliff must be before the stream end time');
      return;
    }
    if (minElapsedSeconds > 0 && timestamp < startTime + minElapsedSeconds) {
      setError(
        `Cliff must be at least ${Math.floor(minElapsedSeconds / 3600)}h after start`
      );
      return;
    }

    setError(null);
    onChange(timestamp);
    setOpen(false);
  };

  const handleClear = () => {
    setLocalValue('');
    setError(null);
    onChange(0);
    setOpen(false);
  };

  return (
    <div className={`relative ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-accent transition-colors w-full"
        aria-expanded={open}
      >
        <Calendar className="w-4 h-4" />
        <span className="flex-1 text-left">
          {value > 0 ? new Date(value * 1000).toLocaleString() : 'No cliff set'}
        </span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-80 bg-popover border rounded-lg shadow-lg p-4">
          <p className="text-sm font-medium mb-1">Set Cliff Period</p>
          <p className="text-xs text-muted-foreground mb-3">
            The cliff activates after this time. Funds vest before the cliff
            stay locked.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Cliff Date & Time
              </label>
              <input
                type="datetime-local"
                value={localValue}
                onChange={(e) => {
                  setLocalValue(e.target.value);
                  setError(null);
                }}
                min={minDate}
                max={maxDate}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>Stream starts: {new Date(startTime * 1000).toLocaleString()}</p>
              <p>Stream ends: {new Date(endTime * 1000).toLocaleString()}</p>
              {minElapsedSeconds > 0 && (
                <p className="flex items-center gap-1 text-yellow-600">
                  <AlertTriangle className="w-3 h-3" />
                  Minimum {Math.floor(minElapsedSeconds / 3600)}h after start
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950 rounded-md">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="flex-1 px-3 py-2 text-xs text-muted-foreground border rounded-lg hover:bg-accent"
              >
                Clear Cliff
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="flex-1 px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
