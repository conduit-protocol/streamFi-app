'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Check } from 'lucide-react';
import toast from 'react-hot-toast';

import {
  buildStreamEndIcs,
  downloadIcs,
  streamEndIcsFilename,
} from '@/lib/calendar';

interface AddToCalendarButtonProps {
  /** Stream id as it appears in the URL. */
  streamId: string;
  /** Stream end time in unix seconds — the date the event is built for. */
  endTime: number;
  /** Stream start time in unix seconds, when known. */
  startTime?: number;
  /** On-chain stream contract address, when known. */
  streamAddress?: string;
  /** Display symbol of the streamed token, when it resolves. */
  tokenSymbol?: string;
  /** URL of the stream page, when one can be built. */
  appUrl?: string;
}

/**
 * "Add to calendar" action for a stream's end date (#566).
 *
 * Downloads a standard `.ics` invitation for the stream's completion date so a
 * recipient can set a reminder without re-entering the date. Rendered by
 * `/stream/[id]` only for bounded streams — an open-ended stream has no end
 * date to schedule.
 */
export function AddToCalendarButton({
  streamId,
  endTime,
  startTime,
  streamAddress,
  tokenSymbol,
  appUrl,
}: AddToCalendarButtonProps) {
  const [saved, setSaved] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  function handleClick() {
    try {
      const ics = buildStreamEndIcs({
        streamId,
        endTime,
        startTime,
        streamAddress,
        tokenSymbol,
        // Only meaningful on the client, and only used at click time.
        appUrl:
          appUrl ??
          (typeof window !== 'undefined'
            ? `${window.location.origin}/stream/${streamId}`
            : undefined),
      });
      downloadIcs(streamEndIcsFilename(streamId), ics);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setSaved(true);
      timeoutRef.current = setTimeout(() => {
        if (mounted.current) setSaved(false);
        timeoutRef.current = null;
      }, 2500);

      toast.success('Calendar file downloaded');
    } catch {
      // Reached for open-ended streams (endTime === 0) or a blocked download —
      // say so instead of failing silently.
      toast.error('Could not create the calendar file.');
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-700 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors print:hidden"
      aria-label="Add stream end date to calendar"
      title="Download an .ics file for the stream end date"
    >
      {saved ? (
        <Check
          className="w-3.5 h-3.5 text-green-600 dark:text-green-400"
          aria-hidden="true"
        />
      ) : (
        <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      {saved ? 'Saved' : 'Calendar'}
    </button>
  );
}
