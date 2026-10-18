import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddToCalendarButton } from '../AddToCalendarButton';

vi.mock('@/lib/calendar', () => ({
  buildGoogleCalendarUrl: vi.fn(() => 'https://calendar.google.com/calendar/render?event'),
  buildIcsEvent: vi.fn(() => 'ICS_CONTENT'),
  downloadIcsFile: vi.fn(),
}));

import { buildGoogleCalendarUrl, buildIcsEvent, downloadIcsFile } from '@/lib/calendar';

const mockBuildIcsEvent = vi.mocked(buildIcsEvent);
const mockBuildGoogleCalendarUrl = vi.mocked(buildGoogleCalendarUrl);
const mockDownloadIcsFile = vi.mocked(downloadIcsFile);

describe('AddToCalendarButton', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders a calendar menu with Google and iCalendar options', () => {
    act(() => {
      root.render(
        <AddToCalendarButton streamId="42" streamAddress="CSTREAMADDR" endTime={1_700_000_000} />,
      );
    });

    expect(container.querySelector('summary')?.textContent).toContain('Add to calendar');
    expect(container.querySelector('a')?.textContent).toContain('Google Calendar');
    expect(container.querySelector('button')?.textContent).toContain('Download .ics');
  });

  it('builds and downloads an .ics file with the stream end date on click', () => {
    act(() => {
      root.render(
        <AddToCalendarButton streamId="42" streamAddress="CSTREAMADDR" endTime={1_700_000_000} />,
      );
    });

    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockBuildIcsEvent).toHaveBeenCalledWith({
      id: 'CSTREAMADDR',
      title: 'Stream #42 ends',
      timestamp: 1_700_000_000,
      description: expect.stringContaining('#42'),
    });
    expect(mockDownloadIcsFile).toHaveBeenCalledWith('conduit-stream-42.ics', 'ICS_CONTENT');
  });

  it('links to a Google Calendar event including the stream contract URL', () => {
    act(() => {
      root.render(
        <AddToCalendarButton streamId="42" streamAddress="CSTREAMADDR" endTime={1_700_000_000} />,
      );
    });

    expect(container.querySelector('a')?.getAttribute('href')).toContain('calendar.google.com');
    expect(mockBuildGoogleCalendarUrl).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Stream #42 ends',
      timestamp: 1_700_000_000,
      url: expect.stringContaining('CSTREAMADDR'),
    }));
  });
});
