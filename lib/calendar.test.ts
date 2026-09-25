import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildStreamEndIcs,
  downloadIcs,
  escapeIcsText,
  foldIcsLine,
  streamEndIcsFilename,
  toIcsTimestamp,
} from './calendar';

// 2026-01-01T00:00:00Z — a fixed end date so every assertion is deterministic.
const END = 1767225600;
const NOW = 1767225000; // 2025-12-31T23:50:00Z

describe('toIcsTimestamp', () => {
  it('formats unix seconds as an iCalendar UTC timestamp', () => {
    expect(toIcsTimestamp(END)).toBe('20260101T000000Z');
  });

  it('drops sub-second precision, which some clients reject', () => {
    expect(toIcsTimestamp(END + 0.75)).toBe('20260101T000000Z');
  });

  it('renders the epoch instead of throwing on zero', () => {
    expect(toIcsTimestamp(0)).toBe('19700101T000000Z');
  });
});

describe('escapeIcsText', () => {
  it('escapes the characters RFC 5545 reserves', () => {
    expect(escapeIcsText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d');
  });

  it('escapes newlines so they cannot terminate the content line', () => {
    expect(escapeIcsText('line one\nline two')).toBe('line one\\nline two');
    expect(escapeIcsText('line one\r\nline two')).toBe('line one\\nline two');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeIcsText('Stream #42 completes')).toBe('Stream #42 completes');
  });
});

describe('foldIcsLine', () => {
  it('leaves lines of 75 octets or fewer untouched', () => {
    const line = 'A'.repeat(75);
    expect(foldIcsLine(line)).toBe(line);
  });

  it('folds a long line with space-prefixed continuations of at most 75 octets', () => {
    const folded = foldIcsLine('A'.repeat(200));
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(75);
    }
    // Every continuation line starts with the single unfolding space.
    for (const part of parts.slice(1)) {
      expect(part.startsWith(' ')).toBe(true);
    }
  });

  it('round-trips: unfolding restores the original line', () => {
    const line = `DESCRIPTION:${'long contract address '.repeat(12)}`;
    const unfolded = foldIcsLine(line).replace(/\r\n /g, '');
    expect(unfolded).toBe(line);
  });
});

describe('streamEndIcsFilename', () => {
  it('names the file after the stream', () => {
    expect(streamEndIcsFilename('42')).toBe('stream-42-end.ics');
  });

  it('strips characters that are unsafe in a file name', () => {
    expect(streamEndIcsFilename('../../etc/passwd')).toBe('stream-etcpasswd-end.ics');
  });

  it('falls back to a generic name when nothing usable is left', () => {
    expect(streamEndIcsFilename('///')).toBe('stream-unknown-end.ics');
  });
});

describe('buildStreamEndIcs', () => {
  it('builds a complete VCALENDAR for the stream end date', () => {
    const ics = buildStreamEndIcs({ streamId: '42', endTime: END, now: NOW });

    expect(ics).toBe(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Conduit Protocol//StreamFi//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        'UID:stream-42-end@streamfi',
        'DTSTAMP:20251231T235000Z',
        'DTSTART:20260101T000000Z',
        'DTEND:20260101T010000Z',
        'SUMMARY:Stream #42 completes',
        // The description exceeds 75 octets, so it is folded (RFC 5545 §3.1).
        'DESCRIPTION:Stream #42 completes and its remaining balance becomes withdraw',
        ' able.',
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        'DESCRIPTION:Stream #42 completes in one hour',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
      ]
        .join('\r\n')
        .concat('\r\n'),
    );
  });

  it('uses CRLF line endings everywhere — bare LF breaks strict clients', () => {
    const ics = buildStreamEndIcs({ streamId: '42', endTime: END, now: NOW });
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  });

  it('schedules a one-hour block that starts at the end time', () => {
    const ics = buildStreamEndIcs({ streamId: '7', endTime: END, now: NOW });
    expect(ics).toContain(`DTSTART:${toIcsTimestamp(END)}`);
    expect(ics).toContain(`DTEND:${toIcsTimestamp(END + 3600)}`);
  });

  it('carries a stable UID so a re-import updates the existing event', () => {
    const first = buildStreamEndIcs({ streamId: '42', endTime: END, now: NOW });
    const second = buildStreamEndIcs({ streamId: '42', endTime: END, now: NOW + 86_400 });
    const uidOf = (ics: string) => ics.split('\r\n').find((l) => l.startsWith('UID:'));

    expect(uidOf(first)).toBe('UID:stream-42-end@streamfi');
    expect(uidOf(second)).toBe(uidOf(first));
  });

  it('includes the token, contract address, start date and link when they are known', () => {
    const ics = buildStreamEndIcs({
      streamId: '42',
      endTime: END,
      startTime: END - 86_400,
      streamAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQAHHAGK4VC',
      tokenSymbol: 'XLM',
      appUrl: 'https://app.example/stream/42',
      now: NOW,
    });

    // Unfold continuation lines before substring-matching folded content.
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('Token: XLM');
    expect(unfolded).toContain('Contract: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQAHHAGK4VC');
    expect(unfolded).toContain('Stream started: 2025-12-31T00:00:00.000Z');
    expect(unfolded).toContain('URL:https://app.example/stream/42');
  });

  it('folds the long description instead of writing an over-long line', () => {
    const ics = buildStreamEndIcs({
      streamId: '42',
      endTime: END,
      streamAddress: 'C'.repeat(60),
      now: NOW,
    });
    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
    expect(ics.replace(/\r\n /g, '')).toContain(`Contract: ${'C'.repeat(60)}`);
  });

  it('escapes reserved characters in the summary', () => {
    const ics = buildStreamEndIcs({
      streamId: 'id;with,reserved\\chars',
      endTime: END,
      now: NOW,
    });
    const summary = ics.split('\r\n').find((l) => l.startsWith('SUMMARY:'));
    expect(summary).toBe('SUMMARY:Stream #id\\;with\\,reserved\\\\chars completes');
  });

  it('omits the URL line when no link can be built', () => {
    const ics = buildStreamEndIcs({ streamId: '42', endTime: END, now: NOW });
    expect(ics).not.toContain('URL:');
  });

  it.each([
    ['an open-ended stream', 0],
    ['a negative end time', -1],
    ['a NaN end time', Number.NaN],
    ['an infinite end time', Number.POSITIVE_INFINITY],
  ])('refuses to build an event for %s', (_label, endTime) => {
    expect(() => buildStreamEndIcs({ streamId: '42', endTime, now: NOW })).toThrow(
      /no end date/i,
    );
  });

  it('names the stream in the error so the caller can report which one failed', () => {
    expect(() => buildStreamEndIcs({ streamId: '99', endTime: 0, now: NOW })).toThrow(
      'stream #99',
    );
  });
});

describe('downloadIcs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a text/calendar blob, clicks a download link and cleans up', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const ics = buildStreamEndIcs({ streamId: '42', endTime: END, now: NOW });
    const clicked: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this.download);
      });

    downloadIcs('stream-42-end.ics', ics);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/calendar;charset=utf-8');
    expect(blob.size).toBe(ics.length);
    expect(clicked).toEqual(['stream-42-end.ics']);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // The temporary anchor is removed again — the DOM is left as it was found.
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('revokes the object URL after the click so the download still starts', () => {
    const revoke = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock-url'), revokeObjectURL: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      downloadIcs('stream-42-end.ics', 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
      expect(revoke).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(revoke).toHaveBeenCalledWith('blob:mock-url');
    } finally {
      vi.useRealTimers();
    }
  });
});
