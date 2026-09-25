/**
 * lib/calendar.ts — unit tests (#566)
 *
 * Coverage:
 *   - toIcsUtcDate formats per RFC 5545 (YYYYMMDDTHHMMSSZ).
 *   - buildIcsEvent produces a well-formed single-VEVENT calendar with
 *     CRLF line endings, escaped text, and matching DTSTART/DTEND.
 *   - downloadIcsFile drives the Blob + anchor download flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toIcsUtcDate, buildIcsEvent, downloadIcsFile } from './calendar';

describe('toIcsUtcDate', () => {
  it('formats a unix timestamp as YYYYMMDDTHHMMSSZ in UTC', () => {
    // 2024-03-15T09:05:03Z
    const ts = Date.UTC(2024, 2, 15, 9, 5, 3) / 1000;
    expect(toIcsUtcDate(ts)).toBe('20240315T090503Z');
  });

  it('zero-pads single-digit month/day/hour/minute/second', () => {
    // 2024-01-02T03:04:05Z
    const ts = Date.UTC(2024, 0, 2, 3, 4, 5) / 1000;
    expect(toIcsUtcDate(ts)).toBe('20240102T030405Z');
  });
});

describe('buildIcsEvent', () => {
  it('produces a well-formed single-VEVENT calendar', () => {
    const endTime = Date.UTC(2024, 5, 1, 12, 0, 0) / 1000;
    const ics = buildIcsEvent({
      id: 'CSTREAMADDR',
      title: 'Stream #42 ends',
      timestamp: endTime,
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:CSTREAMADDR@conduit.sh');
    expect(ics).toContain(`DTSTART:${toIcsUtcDate(endTime)}`);
    expect(ics).toContain(`DTEND:${toIcsUtcDate(endTime)}`);
    expect(ics).toContain('SUMMARY:Stream #42 ends');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
    // RFC 5545 requires CRLF line endings.
    expect(ics).toContain('\r\n');
  });

  it('includes DESCRIPTION only when provided', () => {
    const ts = Math.floor(Date.now() / 1000);
    const withDesc = buildIcsEvent({ id: 'a', title: 't', timestamp: ts, description: 'hello' });
    const withoutDesc = buildIcsEvent({ id: 'a', title: 't', timestamp: ts });

    expect(withDesc).toContain('DESCRIPTION:hello');
    expect(withoutDesc).not.toContain('DESCRIPTION:');
  });

  it('escapes commas, semicolons, backslashes, and newlines in text fields', () => {
    const ts = Math.floor(Date.now() / 1000);
    const ics = buildIcsEvent({
      id: 'a',
      title: 'a, b; c\\d',
      timestamp: ts,
      description: 'line1\nline2',
    });

    expect(ics).toContain('SUMMARY:a\\, b\\; c\\\\d');
    expect(ics).toContain('DESCRIPTION:line1\\nline2');
  });
});

describe('downloadIcsFile', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('creates an anchor, clicks it, and revokes the object URL', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadIcsFile('stream.ics', 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    clickSpy.mockRestore();
  });

  it('sets the anchor download filename', () => {
    let capturedFilename = '';
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        capturedFilename = this.download;
      });

    downloadIcsFile('my-stream.ics', 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');

    expect(capturedFilename).toBe('my-stream.ics');
    clickSpy.mockRestore();
  });
});
