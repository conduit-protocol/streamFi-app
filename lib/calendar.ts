/**
 * Build and trigger downloads for .ics (iCalendar, RFC 5545) files — used by
 * the "add to calendar" action for a stream's end date (#566).
 */

export interface CalendarEventInput {
  /** Unique-ish identifier for the UID field, e.g. the stream address. */
  id: string;
  /** Event title. */
  title: string;
  /** Unix timestamp (seconds) the event occurs at. */
  timestamp: number;
  /** Optional free-text description. */
  description?: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Format a unix timestamp (seconds) as an iCalendar UTC date-time
 * (`YYYYMMDDTHHMMSSZ`), per RFC 5545.
 */
export function toIcsUtcDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escape text per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline). */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Build a minimal single-VEVENT .ics file marking a point-in-time event
 * (e.g. a stream's end date). DTSTART and DTEND are the same instant since
 * there's no meaningful duration to a "stream ends" reminder.
 */
export function buildIcsEvent({ id, title, timestamp, description }: CalendarEventInput): string {
  const dtstamp = toIcsUtcDate(Math.floor(Date.now() / 1000));
  const dtstart = toIcsUtcDate(timestamp);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Conduit//Stream Calendar Export//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${id}@conduit.sh`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtstart}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];
  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  // RFC 5545 requires CRLF line endings.
  return lines.join('\r\n') + '\r\n';
}

/**
 * Trigger a browser download of the given .ics content. No-op outside the
 * browser (SSR) since there's no `document` to build an anchor from.
 */
export function downloadIcsFile(filename: string, content: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
