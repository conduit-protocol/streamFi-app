import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreamTimeline } from './StreamTimeline';

describe('StreamTimeline', () => {
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
    it('should return null for open-ended streams (endTime === 0)', () => {
      const startTime = Math.floor(MOCK_NOW / 1000);
      
      const { container } = render(
        <StreamTimeline
          startTime={startTime}
          endTime={0}
          paused={false}
          pausedAt={0}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Progress calculation', () => {
    it('should calculate correct progress percentage', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 3600; // Started 1 hour ago
      const endTime = Math.floor(MOCK_NOW / 1000) + 3600;   // Ends in 1 hour
      
      render(
        <StreamTimeline
          startTime={startTime}
          endTime={endTime}
          paused={false}
          pausedAt={0}
        />
      );

      // 1 hour of 2 hours = 50%
      expect(screen.getByText('50% complete')).toBeInTheDocument();
    });

    it('should clamp progress at 0% for streams that havent started', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) + 3600; // Starts in 1 hour
      const endTime = Math.floor(MOCK_NOW / 1000) + 7200;   // Ends in 2 hours
      
      render(
        <StreamTimeline
          startTime={startTime}
          endTime={endTime}
          paused={false}
          pausedAt={0}
        />
      );

      expect(screen.getByText('0% complete')).toBeInTheDocument();
    });

    it('should clamp progress at 100% for streams past end time', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 7200; // Started 2 hours ago
      const endTime = Math.floor(MOCK_NOW / 1000) - 3600;   // Ended 1 hour ago
      
      render(
        <StreamTimeline
          startTime={startTime}
          endTime={endTime}
          paused={false}
          pausedAt={0}
        />
      );

      expect(screen.getByText('100% complete')).toBeInTheDocument();
    });
  });

  describe('Pause marker', () => {
    it('should show pause marker when stream is paused', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 3600; // Started 1 hour ago
      const endTime = Math.floor(MOCK_NOW / 1000) + 3600;   // Ends in 1 hour
      const pausedAt = Math.floor(MOCK_NOW / 1000) - 1800;  // Paused 30 min ago
      
      const { container } = render(
        <StreamTimeline
          startTime={startTime}
          endTime={endTime}
          paused={true}
          pausedAt={pausedAt}
        />
      );

      // Check for pause marker element
      const pauseMarker = container.querySelector('[title*="Paused at"]');
      expect(pauseMarker).toBeInTheDocument();
    });

    it('should not show pause marker when stream is not paused', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 3600;
      const endTime = Math.floor(MOCK_NOW / 1000) + 3600;
      
      const { container } = render(
        <StreamTimeline
          startTime={startTime}
          endTime={endTime}
          paused={false}
          pausedAt={0}
        />
      );

      const pauseMarker = container.querySelector('[title*="Paused at"]');
      expect(pauseMarker).not.toBeInTheDocument();
    });

    it('should position pause marker correctly', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 7200; // Started 2 hours ago
      const endTime = Math.floor(MOCK_NOW / 1000) + 7200;   // Ends in 2 hours
      const pausedAt = Math.floor(MOCK_NOW / 1000) - 3600;  // Paused 1 hour ago (25% through)
      
      const { container } = render(
        <StreamTimeline
          startTime={startTime}
          endTime={endTime}
          paused={true}
          pausedAt={pausedAt}
        />
      );

      const pauseMarker = container.querySelector('[title*="Paused at"]');
      expect(pauseMarker).toHaveStyle({ left: '25%' });
    });

    it('should clamp pause marker at stream boundaries', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 3600;
      const endTime = Math.floor(MOCK_NOW / 1000) + 3600;
      const pausedAt = Math.floor(MOCK_NOW / 1000) + 7200; // Paused after end time
      
      const { container } = render(
        <StreamTimeline
          startTime={startTime}
          endTime={endTime}
          paused={true}
          pausedAt={pausedAt}
        />
      );

      const pauseMarker = container.querySelector('[title*="Paused at"]');
      expect(pauseMarker).toHaveStyle({ left: '100%' });
    });
  });

  describe('Current position marker', () => {
    it('should show current position marker for in-progress streams', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 1800; // Started 30 min ago
      const endTime = Math.floor(MOCK_NOW / 1000) + 1800;   // Ends in 30 min
      
      const { container } = render(
        <StreamTimeline
          startTime={startTime}
          endTime={endTime}
          paused={false}
          pausedAt={0}
        />
      );

      // Current position dot has specific z-index and ring classes
      const positionDot = container.querySelector('[class*="z-20"][class*="ring-2"]');
      expect(positionDot).toBeInTheDocument();
    });

    it('should not show position marker at 0% progress', () => {
      const startTime = Math.floor(MOCK_NOW / 1000);
      const endTime = Math.floor(MOCK_NOW / 1000) + 3600;
      
      const { container } = render(
        <StreamTimeline
          startTime={startTime}
          endTime={endTime}
          paused={false}
          pausedAt={0}
        />
      );

      const positionDot = container.querySelector('[class*="z-20"][class*="ring-2"]');
      expect(positionDot).not.toBeInTheDocument();
    });

    it('should not show position marker at 100% progress', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 3600;
      const endTime = Math.floor(MOCK_NOW / 1000);
      
      const { container } = render(
        <StreamTimeline
          startTime={startTime}
          endTime={endTime}
          paused={false}
          pausedAt={0}
        />
      );

      const positionDot = container.querySelector('[class*="z-20"][class*="ring-2"]');
      expect(positionDot).not.toBeInTheDocument();
    });
  });

  describe('Timestamp labels', () => {
    it('should display start and end timestamps', () => {
      const startTime = Math.floor(MOCK_NOW / 1000);
      const endTime = Math.floor(MOCK_NOW / 1000) + 3600;
      
      const { container } = render(
        <StreamTimeline
          startTime={startTime}
          endTime={endTime}
          paused={false}
          pausedAt={0}
        />
      );

      // Check that timestamp elements exist
      const timeLabels = container.querySelectorAll('span[class*="text-xs"]');
      expect(timeLabels.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle very short duration streams', () => {
      const startTime = Math.floor(MOCK_NOW / 1000) - 30;
      const endTime = Math.floor(MOCK_NOW / 1000) + 30;
      
      expect(() => {
        render(
          <StreamTimeline
            startTime={startTime}
            endTime={endTime}
            paused={false}
            pausedAt={0}
          />
        );
      }).not.toThrow();
    });

    it('should handle equal start and end times gracefully', () => {
      const time = Math.floor(MOCK_NOW / 1000);
      
      const { container } = render(
        <StreamTimeline
          startTime={time}
          endTime={time}
          paused={false}
          pausedAt={0}
        />
      );

      // Should render something (not crash)
      expect(container.firstChild).not.toBeNull();
    });

    it('should handle pausedAt before startTime', () => {
      const startTime = Math.floor(MOCK_NOW / 1000);
      const endTime = Math.floor(MOCK_NOW / 1000) + 3600;
      const pausedAt = Math.floor(MOCK_NOW / 1000) - 3600;
      
      const { container } = render(
        <StreamTimeline
          startTime={startTime}
          endTime={endTime}
          paused={true}
          pausedAt={pausedAt}
        />
      );

      const pauseMarker = container.querySelector('[title*="Paused at"]');
      expect(pauseMarker).toHaveStyle({ left: '0%' });
    });
  });
});
