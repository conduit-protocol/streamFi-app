import { describe, it, expect } from "vitest";
import { sortStreams, isSortKey } from "../stream-sort";

function row(ratePerSecond: bigint, endTime: number) {
  return { info: { ratePerSecond, endTime } };
}

describe("isSortKey", () => {
  it("accepts known sort keys", () => {
    expect(isSortKey("amount-asc")).toBe(true);
    expect(isSortKey("default")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isSortKey("bogus")).toBe(false);
    expect(isSortKey(null)).toBe(false);
  });
});

describe("sortStreams", () => {
  const rows = [row(300n, 300), row(100n, 100), row(200n, 0)];

  it("leaves order untouched for 'default'", () => {
    expect(sortStreams(rows, "default")).toEqual(rows);
  });

  it("sorts by amount ascending", () => {
    const sorted = sortStreams(rows, "amount-asc");
    expect(sorted.map((r) => r.info.ratePerSecond)).toEqual([100n, 200n, 300n]);
  });

  it("sorts by amount descending", () => {
    const sorted = sortStreams(rows, "amount-desc");
    expect(sorted.map((r) => r.info.ratePerSecond)).toEqual([300n, 200n, 100n]);
  });

  it("sorts by end date ascending, with open-ended (0) streams last", () => {
    const sorted = sortStreams(rows, "end-asc");
    expect(sorted.map((r) => r.info.endTime)).toEqual([100, 300, 0]);
  });

  it("sorts by end date descending, with open-ended (0) streams first", () => {
    const sorted = sortStreams(rows, "end-desc");
    expect(sorted.map((r) => r.info.endTime)).toEqual([0, 300, 100]);
  });

  it("does not mutate the input array", () => {
    const copy = [...rows];
    sortStreams(rows, "amount-asc");
    expect(rows).toEqual(copy);
  });
});
