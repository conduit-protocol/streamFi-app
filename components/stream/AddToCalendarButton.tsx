'use client';

import { CalendarPlus, ChevronDown, Download } from 'lucide-react';
import { buildGoogleCalendarUrl, buildIcsEvent, downloadIcsFile } from '@/lib/calendar';

interface AddToCalendarButtonProps {
  streamId: string;
  streamAddress: string;
  /** Unix timestamp (seconds) the stream ends. */
  endTime: number;
  /** Unix timestamp (seconds) when cliff unlock occurs. */
  cliffTime?: number;
  /** Token symbol for cliff reminder text. */
  tokenSymbol?: string;
}

/** Downloads a .ics file reminding the user when a stream ends or cliff unlocks (#566, #802). */
export function AddToCalendarButton({
  streamId,
  streamAddress,
  endTime,
  cliffTime,
  tokenSymbol,
}: AddToCalendarButtonProps) {
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

  function handleCliffClick() {
    if (!cliffTime) return;
    const cliffTitle = tokenSymbol
      ? `⏰ ${tokenSymbol} stream cliff unlock reminder`
      : `Stream #${streamId} cliff unlock reminder`;
    const cliffDescription = `${cliffTitle}\n\nInitial funds will unlock tomorrow.\n\nContract: ${contractUrl}`;
    const ics = buildIcsEvent({
      id: `${streamAddress}-cliff`,
      title: cliffTitle,
      timestamp: cliffTime - 24 * 60 * 60,
      description: cliffDescription,
    });
    downloadIcsFile(`conduit-stream-${streamId}-cliff.ics`, ics);
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
        {cliffTime && (
          <>
            <hr className="my-1 border-gray-100 dark:border-gray-800" />
            <button
              type="button"
              onClick={handleCliffClick}
              className="flex w-full items-center gap-1.5 rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-900"
              title="24-hour reminder before cliff unlock"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Cliff unlock reminder
            </button>
          </>
        )}
      </div>
    </details>
  );
}
