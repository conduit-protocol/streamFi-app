'use client';

import { CalendarPlus, ChevronDown, Download } from 'lucide-react';
import { buildGoogleCalendarUrl, buildIcsEvent, downloadIcsFile } from '@/lib/calendar';

interface AddToCalendarButtonProps {
  streamId: string;
  streamAddress: string;
  /** Unix timestamp (seconds) the stream ends. */
  endTime: number;
}

/** Downloads a .ics file reminding the user when a stream ends (#566). */
export function AddToCalendarButton({ streamId, streamAddress, endTime }: AddToCalendarButtonProps) {
  const contractUrl = `https://stellar.expert/explorer/public/contract/${streamAddress}`;
  const title = `Stream #${streamId} ends`;
  const description = `Conduit stream #${streamId} completes at this time.\n\nContract: ${contractUrl}`;

  function handleClick() {
    const ics = buildIcsEvent({
      id: streamAddress,
      title,
      timestamp: endTime,
      description,
    });
    downloadIcsFile(`conduit-stream-${streamId}.ics`, ics);
  }

  return (
    <details className="relative inline-block print:hidden">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-white dark:hover:bg-gray-900 [&::-webkit-details-marker]:hidden">
        <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
        Add to calendar
        <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-48 rounded border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-950">
        <a
          href={buildGoogleCalendarUrl({ title, timestamp: endTime, description, url: contractUrl })}
          target="_blank"
          rel="noreferrer"
          className="block rounded px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-900"
        >
          Add to Google Calendar
        </a>
        <button type="button" onClick={handleClick} className="flex w-full items-center gap-1.5 rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-900">
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Download .ics file
        </button>
      </div>
    </details>
  );
}
