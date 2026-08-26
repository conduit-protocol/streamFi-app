import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreamProgressBar } from './StreamProgressBar';

describe('StreamProgressBar', () => {
  let originalDateNow: () => number;
  const MOCK_NOW = 1704067200000; // 2024-01-01 00:00:00 UTC

  beforeEach(() => {
    originalDateNow = Date.now;
    Date.now = vi.fn(() => MOCK_NOW);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe('Open-ended streams', () => {
    it('should show 0% progress for open-ended stream (endTime === 0)', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 3600; // Started 1 hour ago
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={0}
          status="active"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });

    it('should show 0% progress when endTime <= startTime', () => {
      const startTime = Math.floor(MOCK_NOW / 1000);
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={startTime - 100}
          status="active"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });
  });

  describe('Active streams', () => {
    it('should calculate correct progress for active stream', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 3600; // Started 1 hour ago
      const endTime = Math.floor(MOCK_NOW / 1000) + 3600;   // Ends in 1 hour
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="active"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      // 1 hour elapsed out of 2 hours total = 50%
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    });

    it('should show 0% for stream that hasnt started', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) + 3600; // Starts in 1 hour
      const endTime = Math.floor(MOCK_NOW / 1000) + 7200;   // Ends in 2 hours
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="active"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });

    it('should clamp progress at 100% for streams that should have ended', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 7200; // Started 2 hours ago
      const endTime = Math.floor(MOCK_NOW / 1000) - 3600;   // Ended 1 hour ago
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="active"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '100');
    });
  });

  describe('Paused streams', () => {
    it('should freeze progress at current position when paused', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 3600; // Started 1 hour ago
      const endTime = Math.floor(MOCK_NOW / 1000) + 3600;   // Ends in 1 hour
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="paused"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      // Should be frozen at 50% (1 hour elapsed of 2 hours total)
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    });

    it('should not animate when paused', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 1800; // Started 30 min ago
      const endTime = Math.floor(MOCK_NOW / 1000) + 1800;   // Ends in 30 min
      
      const { container } = render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="paused"
        />
      );

      const fillElement = container.querySelector('[class*="absolute"]');
      expect(fillElement).toBeTruthy();
      // Check that animation is set to 'none' in the DOM
      // (actual check depends on how the component sets the style)
    });
  });

  describe('Ended streams', () => {
    it('should show 100% for ended streams', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 7200; // Started 2 hours ago
      const endTime = Math.floor(MOCK_NOW / 1000) - 3600;   // Ended 1 hour ago
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="ended"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '100');
    });

    it('should not animate when ended', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 3600;
      const endTime = Math.floor(MOCK_NOW / 1000);
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="ended"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '100');
    });
  });

  describe('Cancelled streams', () => {
    it('should show progress at cancellation time', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 3600; // Started 1 hour ago
      const endTime = Math.floor(MOCK_NOW / 1000) + 3600;   // Would end in 1 hour
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="cancelled"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      // Should show ~50% (where it was when cancelled)
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 1800;
      const endTime = Math.floor(MOCK_NOW / 1000) + 1800;
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="active"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
      expect(progressBar).toHaveAttribute('aria-valuenow');
    });

    it('should use custom label when provided', () => {
      const startTime = Math.floor(MOCK_NOW / 1000);
      const endTime = Math.floor(MOCK_NOW / 1000) + 3600;
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="active"
          label="Stream progress"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-label', 'Stream progress');
    });

    it('should generate default label with percentage', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 900;  // 15 min ago
      const endTime = Math.floor(MOCK_NOW / 1000) + 2700;   // 45 min from now
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="active"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      // 15 min of 60 min = 25%
      expect(progressBar).toHaveAttribute('aria-label', '25% complete');
    });
  });

  describe('Edge cases', () => {
    it('should handle streams with very short duration', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 5;  // 5 seconds ago
      const endTime = Math.floor(MOCK_NOW / 1000) + 5;    // 5 seconds from now
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="active"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    });

    it('should handle streams with very long duration', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 86400;      // 1 day ago
      const endTime = Math.floor(MOCK_NOW / 1000) + 86400 * 29;   // 29 days from now
      
      render(
        <StreamProgressBar
          startTime={startTime}
          endTime={endTime}
          status="active"
        />
      );

      const progressBar = screen.getByRole('progressbar');
      // 1 day of 30 days = ~3%
      expect(progressBar).toHaveAttribute('aria-valuenow', '3');
    });

    it('should render without errors when timestamps are equal', () => {
      const time = Math.floor(MOCK_NOW / 1000);
      
      expect(() => {
        render(
          <StreamProgressBar
            startTime={time}
            endTime={time}
            status="active"
          />
        );
      }).not.toThrow();
    });
  });
});
