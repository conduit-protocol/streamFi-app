'use client';

/**
 * DateRangePicker — date range filter for dashboard metrics (issue #718).
 *
 * Provides preset ranges (This Month, Last Month, This Quarter, etc.)
 * and a custom range option. Updates the parent via onChange callback.
 */

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

export interface DateRange {
  start: string; // ISO date string YYYY-MM-DD
  end: string;
  label: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function presetRanges(): DateRange[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const thisMonthStart = new Date(year, month, 1);
  const thisMonthEnd = new Date(year, month + 1, 0);
  const lastMonthStart = new Date(year, month - 1, 1);
  const lastMonthEnd = new Date(year, month, 0);
  const quarter = Math.floor(month / 3);
  const thisQuarterStart = new Date(year, quarter * 3, 1);
  const thisQuarterEnd = new Date(year, quarter * 3 + 3, 0);
  const thisYearStart = new Date(year, 0, 1);
  const thisYearEnd = new Date(year, 11, 31);

  return [
    {
      label: 'This Month',
      start: toISODate(thisMonthStart),
      end: toISODate(thisMonthEnd),
    },
    {
      label: 'Last Month',
      start: toISODate(lastMonthStart),
      end: toISODate(lastMonthEnd),
    },
    {
      label: 'This Quarter',
      start: toISODate(thisQuarterStart),
      end: toISODate(thisQuarterEnd),
    },
    {
      label: 'This Year',
      start: toISODate(thisYearStart),
      end: toISODate(thisYearEnd),
    },
    {
      label: 'Last 30 Days',
      start: toISODate(new Date(now.getTime() - 30 * 86400000)),
      end: toISODate(now),
    },
    {
      label: 'Last 90 Days',
      start: toISODate(new Date(now.getTime() - 90 * 86400000)),
      end: toISODate(now),
    },
  ];
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState(value.start);
  const [customEnd, setCustomEnd] = useState(value.end);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const presets = presetRanges();

  const handlePreset = (preset: DateRange) => {
    onChange(preset);
    setOpen(false);
  };

  const handleCustom = () => {
    if (!customStart || !customEnd) return;
    onChange({
      start: customStart,
      end: customEnd,
      label: `${customStart} to ${customEnd}`,
    });
    setOpen(false);
  };

  return (
    <div className={`relative ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-accent transition-colors"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Calendar className="w-4 h-4" />
        <span>{value.label || 'Select range'}</span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 bg-popover border rounded-lg shadow-lg p-3">
          <div className="space-y-1 mb-3">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePreset(preset)}
                className={`w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors ${
                  value.label === preset.label ? 'bg-accent font-medium' : ''
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Custom Range</p>
            <div className="flex gap-2 mb-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs border rounded"
              />
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs border rounded"
              />
            </div>
            <button
              type="button"
              onClick={handleCustom}
              className="w-full px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Apply Custom Range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
