/**
 * Calendar-event (.ics) generation for stream end dates (#566).
 *
 * `/stream/[id]` surfaces a bounded stream's end date through `StreamTimeline`,
 * but there was no way to carry that date into an external calendar — a
 * recipient waiting on a stream to complete (for accounting, invoicing, a
 * reminder) had to re-type it by hand.
 *
 * `buildStreamEndIcs` turns the on-chain end timestamp into an RFC 5545
 * iCalendar document that Google Calendar, Apple Calendar and Outlook all
 * import, and `downloadIcs` hands it to the browser as a file download.
 *
 * Only bounded streams have something to schedule: an open-ended stream
 * (`endTime === 0`) has no end date, so building an event for it throws rather
 * than writing a bogus 1970 timestamp into somebody's calendar.
 */

/** Product identifier required by RFC 5545 — names the app the event came from. */
const PRODID = '-//Conduit Protocol//StreamFi//EN';

/** The event is scheduled as a one-hour block starting at the stream end time. */
const EVENT_DURATION_S = 3600;

/** Reminder that precedes the event by one hour. */
const ALARM_TRIGGER = '-PT1H';

export interface StreamCalendarEventInput {
  /** Numeric stream id exactly as it appears in the URL (`/stream/42` → `"42"`). */
  streamId: string;
  /** Stream end time in unix seconds. Required — open-ended streams have none. */
  endTime: number;
  /** Stream start time in unix seconds; added to the description when known. */
  startTime?: number;
  /** On-chain stream contract address; added to the description when known. */
  streamAddress?: string;
  /** Display symbol of the streamed token, when it resolves. */
  tokenSymbol?: string;
  /** Page URL of the stream, when one can be built. */
  appUrl?: string;
  /**
   * Timestamp (unix seconds) used for `DTSTAMP`. Injectable so tests can assert
   * the exact document instead of chasing the wall clock.
   */
  now?: number;
}

/**
 * Escape a value for an iCalendar TEXT field (RFC 5545 §3.3.11): backslash,
 * semicolon, comma and newlines must be escaped, and a raw newline would
 * otherwise terminate the content line and corrupt the document.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Unix seconds → iCalendar UTC timestamp (`20261001T120000Z`).
 *
 * Sub-second precision is dropped: RFC 5545 DATE-TIME with the `Z` suffix is
 * second-resolution, and a malformed fractional part makes some clients reject
 * the whole file.
 */
export function toIcsTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Fold a content line at 75 octets with a leading-space continuation
 * (RFC 5545 §3.1). Everything written here is ASCII, so octets and characters
 * line up; long contract addresses in the description are the reason this exists.
 */
export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const folded = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 0) {
    // A continuation line carries a leading space, so only 74 octets of payload fit.
    folded.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return folded.join('\r\n');
}

/** File name for the downloaded invitation, safe for every filesystem. */
export function streamEndIcsFilename(streamId: string): string {
  const safeId = String(streamId).replace(/[^A-Za-z0-9_-]/g, '');
  return `stream-${safeId || 'unknown'}-end.ics`;
}

/**
 * Build the `.ics` document for a stream's end date.
 *
 * @throws Error when the stream has no usable end time (open-ended streams), so
 * callers can surface a real message instead of importing a 1970 event.
 */
export function buildStreamEndIcs(input: StreamCalendarEventInput): string {
  const { streamId, endTime, startTime, streamAddress, tokenSymbol, appUrl } = input;

  if (typeof endTime !== 'number' || !Number.isFinite(endTime) || endTime <= 0) {
    throw new Error(
      `Cannot build a calendar event for stream #${streamId}: it has no end date (open-ended stream).`,
    );
  }

  const dtstamp = toIcsTimestamp(Math.floor(input.now ?? Date.now() / 1000));

  const descriptionParts = [
    `Stream #${streamId} completes and its remaining balance becomes withdrawable.`,
  ];
  if (tokenSymbol) descriptionParts.push(`Token: ${tokenSymbol}`);
  if (startTime !== undefined && startTime > 0) {
    descriptionParts.push(`Stream started: ${new Date(startTime * 1000).toISOString()}`);
  }
  if (streamAddress) descriptionParts.push(`Contract: ${streamAddress}`);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // Deterministic UID: re-importing the same stream updates the existing event
    // instead of piling up duplicates.
    `UID:stream-${streamId}-end@streamfi`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toIcsTimestamp(endTime)}`,
    `DTEND:${toIcsTimestamp(endTime + EVENT_DURATION_S)}`,
    `SUMMARY:${escapeIcsText(`Stream #${streamId} completes`)}`,
    `DESCRIPTION:${escapeIcsText(descriptionParts.join('\n'))}`,
    'TRANSP:TRANSPARENT',
  ];

  if (appUrl) lines.push(`URL:${escapeIcsText(appUrl)}`);

  lines.push(
    'BEGIN:VALARM',
    `TRIGGER:${ALARM_TRIGGER}`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Stream #${streamId} completes in one hour`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );

  // CRLF is mandatory in iCalendar; some clients silently reject bare LF.
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/**
 * Trigger a browser download of an `.ics` document.
 *
 * Kept here rather than in the component so the DOM plumbing is testable on its
 * own (jsdom has no real download).
 */
export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    // Release the object URL once the browser has had a chance to start the
    // download — revoking synchronously can cancel it in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
