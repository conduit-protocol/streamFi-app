import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import toast from 'react-hot-toast';

import { AddToCalendarButton } from '../AddToCalendarButton';
import { downloadIcs } from '@/lib/calendar';

// The download itself is exercised in lib/calendar.test.ts — here the component's
// wiring is what matters, so capture the call instead of touching the DOM plumbing.
vi.mock('@/lib/calendar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/calendar')>();
  return { ...actual, downloadIcs: vi.fn() };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const END = 1767225600; // 2026-01-01T00:00:00Z
const mockDownloadIcs = vi.mocked(downloadIcs);

describe('AddToCalendarButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an accessible action for the stream end date', () => {
    render(<AddToCalendarButton streamId="42" endTime={END} />);

    const button = screen.getByRole('button', { name: 'Add stream end date to calendar' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Calendar');
  });

  it('downloads an .ics file named after the stream, containing the end date', () => {
    render(<AddToCalendarButton streamId="42" endTime={END} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add stream end date to calendar' }));

    expect(mockDownloadIcs).toHaveBeenCalledTimes(1);
    const [filename, ics] = mockDownloadIcs.mock.calls[0];
    expect(filename).toBe('stream-42-end.ics');
    expect(ics).toContain('DTSTART:20260101T000000Z');
    expect(ics).toContain('SUMMARY:Stream #42 completes');
    expect(toast.success).toHaveBeenCalledWith('Calendar file downloaded');
  });

  it('links back to the stream page on the current origin', () => {
    render(<AddToCalendarButton streamId="42" endTime={END} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add stream end date to calendar' }));

    const [, ics] = mockDownloadIcs.mock.calls[0];
    expect(ics).toContain(`URL:${window.location.origin}/stream/42`);
  });

  it('passes the stream metadata through to the event', () => {
    render(
      <AddToCalendarButton
        streamId="7"
        endTime={END}
        startTime={END - 3600}
        streamAddress="CSTREAMADDRESS"
        tokenSymbol="XLM"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add stream end date to calendar' }));

    const [, ics] = mockDownloadIcs.mock.calls[0];
    // Unfold continuation lines before substring-matching folded content.
    const unfolded = (ics as string).replace(/\r\n /g, '');
    expect(unfolded).toContain('Token: XLM');
    expect(unfolded).toContain('Contract: CSTREAMADDRESS');
  });

  it('shows the saved state after a download and keeps its label stable', () => {
    render(<AddToCalendarButton streamId="42" endTime={END} />);
    const button = screen.getByRole('button', { name: 'Add stream end date to calendar' });

    fireEvent.click(button);

    expect(button).toHaveTextContent('Saved');
    expect(button).toHaveAccessibleName('Add stream end date to calendar');
  });

  it('reports a failure instead of downloading when the stream has no end date', () => {
    render(<AddToCalendarButton streamId="42" endTime={0} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add stream end date to calendar' }));

    expect(mockDownloadIcs).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Could not create the calendar file.');
  });

  it('unmounts cleanly while the saved state is pending', () => {
    const { unmount } = render(<AddToCalendarButton streamId="42" endTime={END} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add stream end date to calendar' }));

    expect(() => unmount()).not.toThrow();
    cleanup();
  });
});
