'use client';

import { CalendarPlus } from 'lucide-react';
import { buildIcsEvent, downloadIcsFile } from '@/lib/calendar';

interface AddToCalendarButtonProps {
  streamId: string;
  streamAddress: string;
  /** Unix timestamp (seconds) the stream ends. */
  endTime: number;
}

/** Downloads a .ics file reminding the user when a stream ends (#566). */
export function AddToCalendarButton({ streamId, streamAddress, endTime }: AddToCalendarButtonProps) {
  function handleClick() {
    const ics = buildIcsEvent({
      id: streamAddress,
      title: `Stream #${streamId} ends`,
      timestamp: endTime,
      description: `Conduit stream #${streamId} completes at this time.`,
    });
    downloadIcsFile(`conduit-stream-${streamId}.ics`, ics);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-700 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors print:hidden"
      aria-label="Add stream end date to calendar"
    >
      <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
      Add to calendar
    </button>
  );
}
