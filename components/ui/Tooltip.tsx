'use client';

import { useState } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          className={`absolute z-50 ${
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          } left-1/2 -translate-x-1/2 px-2.5 py-1.5 text-xs text-white bg-black rounded shadow-card whitespace-nowrap animate-fade-in`}
          role="tooltip"
        >
          {content}
          <span
            className={`absolute left-1/2 -translate-x-1/2 ${
              side === 'top' ? 'top-full' : 'bottom-full'
            } border-4 border-transparent ${
              side === 'top' ? 'border-t-black' : 'border-b-black'
            }`}
          />
        </span>
      )}
    </span>
  );
}
