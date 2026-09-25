import { describe, it, expect } from "vitest";
import { presetToRange, streamInRange, ALL_TIME_RANGE } from "../date-range";

describe("presetToRange", () => {
  const now = new Date("2026-03-15T12:00:00Z").getTime();

  it("returns an unbounded range for 'all'", () => {
    expect(presetToRange("all", now)).toEqual(ALL_TIME_RANGE);
  });

  it("returns an unbounded range for 'custom' (caller supplies the bounds)", () => {
    expect(presetToRange("custom", now)).toEqual(ALL_TIME_RANGE);
  });

  it("bounds 'today' to the start of the current day through now", () => {
    const r = presetToRange("today", now);
    expect(r.end).toBe(Math.floor(now / 1000));
    expect(r.start).toBeLessThan(r.end!);
    expect(r.end! - r.start!).toBeLessThanOrEqual(86_400);
  });

  it("bounds '7d' to exactly 7 days before now", () => {
    const r = presetToRange("7d", now);
    expect(r.end).toBe(Math.floor(now / 1000));
    expect(r.start).toBe(Math.floor(now / 1000) - 7 * 86_400);
  });

  it("bounds '30d' to exactly 30 days before now", () => {
    const r = presetToRange("30d", now);
    expect(r.start).toBe(Math.floor(now / 1000) - 30 * 86_400);
  });

  it("bounds 'month' to the start of the current calendar month", () => {
    const r = presetToRange("month", now);
    const start = new Date(r.start! * 1000);
    expect(start.getUTCDate() === 1 || start.getDate() === 1).toBe(true);
  });
});

describe("streamInRange", () => {
  it("is always in range for the unbounded (all-time) range", () => {
    expect(streamInRange(0, 0, ALL_TIME_RANGE)).toBe(true);
    expect(streamInRange(1_000, 2_000, ALL_TIME_RANGE)).toBe(true);
  });

  it("excludes a stream that ended before the range starts", () => {
    expect(streamInRange(100, 200, { start: 300, end: 400 })).toBe(false);
  });

  it("excludes a stream that starts after the range ends", () => {
    expect(streamInRange(500, 600, { start: 100, end: 200 })).toBe(false);
  });

  it("includes a stream that overlaps the range", () => {
    expect(streamInRange(150, 250, { start: 100, end: 200 })).toBe(true);
  });

  it("includes an open-ended stream (endTime === 0) that started before the range's end", () => {
    expect(streamInRange(50, 0, { start: 100, end: 200 })).toBe(true);
  });

  it("excludes an open-ended stream that starts after the range's end", () => {
    expect(streamInRange(300, 0, { start: 100, end: 200 })).toBe(false);
  });

  it("respects only a lower bound when end is null", () => {
    expect(streamInRange(50, 150, { start: 100, end: null })).toBe(true);
    expect(streamInRange(50, 90, { start: 100, end: null })).toBe(false);
  });

  it("respects only an upper bound when start is null", () => {
    expect(streamInRange(50, 150, { start: null, end: 200 })).toBe(true);
    expect(streamInRange(250, 300, { start: null, end: 200 })).toBe(false);
  });
});
