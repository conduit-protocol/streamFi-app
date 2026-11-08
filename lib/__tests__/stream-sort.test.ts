import { describe, it, expect } from "vitest";
import { sortStreams, isSortKey, claimableBalance, compareClaimableDesc, CLAIMABLE_DESC } from "../stream-sort";

function row(ratePerSecond: bigint, endTime: number) {
  return { info: { ratePerSecond, endTime } };
}

describe("isSortKey", () => {
  it("accepts known sort keys", () => {
    expect(isSortKey("amount-asc")).toBe(true);
    expect(isSortKey("default")).toBe(true);
    expect(isSortKey("claimable-desc")).toBe(true);
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

// ── #807 — accrued claimable balance sorting ─────────────────────────────────

type ClaimRowOverrides = Partial<{
  ratePerSecond: bigint;
  startTime: number;
  endTime: number;
  withdrawn: bigint;
  paused: boolean;
  pausedAt: number;
  cancelled: boolean;
  withdrawable: bigint;
  claimable: bigint;
}>;

/** Row carrying the full info needed to derive a claimable balance. */
function claimRow(overrides: ClaimRowOverrides = {}) {
  const { withdrawable, claimable, ...infoOverrides } = overrides;
  return {
    info: {
      ratePerSecond: 1n,
      startTime: 0,
      endTime: 1_000,
      withdrawn: 0n,
      paused: false,
      pausedAt: 0,
      cancelled: false,
      ...infoOverrides,
    },
    ...(withdrawable !== undefined ? { withdrawable } : {}),
    ...(claimable !== undefined ? { claimable } : {}),
  };
}

describe("claimableBalance (#807)", () => {
  it("derives accrued minus withdrawn", () => {
    expect(claimableBalance(claimRow({ ratePerSecond: 10n, startTime: 0, endTime: 1_000, withdrawn: 2_500n }), 500)).toBe(2_500n);
  });

  it("caps accrual at the stream end time", () => {
    expect(claimableBalance(claimRow({ ratePerSecond: 10n, startTime: 0, endTime: 100, withdrawn: 0n }), 10_000)).toBe(1_000n);
  });

  it("keeps accruing for open-ended streams", () => {
    expect(claimableBalance(claimRow({ ratePerSecond: 3n, startTime: 0, endTime: 0, withdrawn: 0n }), 1_000)).toBe(3_000n);
  });

  it("freezes at pausedAt while paused", () => {
    const row = claimRow({ ratePerSecond: 5n, startTime: 0, endTime: 1_000, paused: true, pausedAt: 100 });
    expect(claimableBalance(row, 900)).toBe(500n);
  });

  it("clamps to zero when the stream has not accrued yet", () => {
    expect(claimableBalance(claimRow({ ratePerSecond: 5n, startTime: 1_000 }), 0)).toBe(0n);
  });

  it("clamps to zero when withdrawn exceeds accrual", () => {
    expect(claimableBalance(claimRow({ ratePerSecond: 1n, startTime: 0, withdrawn: 9_999n }), 100)).toBe(0n);
  });

  it("prefers an explicit on-chain withdrawable/claimable value", () => {
    expect(claimableBalance(claimRow({ withdrawable: 12_345n, ratePerSecond: 1n }), 0)).toBe(12_345n);
    expect(claimableBalance(claimRow({ claimable: 4_000n, ratePerSecond: 1n }), 0)).toBe(4_000n);
    expect(claimableBalance(claimRow({ withdrawable: -5n }), 0)).toBe(0n);
  });
});

describe("sortStreams — claimable descending (#807)", () => {
  it("exposes the CLAIMABLE_DESC sort key", () => {
    expect(CLAIMABLE_DESC).toBe("claimable-desc");
    expect(isSortKey(CLAIMABLE_DESC)).toBe(true);
  });

  it("sorts by explicit withdrawable balances, largest first", () => {
    const rows = [
      claimRow({ withdrawable: 100n }),
      claimRow({ withdrawable: 900n }),
      claimRow({ withdrawable: 300n }),
    ];
    const sorted = sortStreams(rows, "claimable-desc");
    expect(sorted.map((r) => r.withdrawable)).toEqual([900n, 300n, 100n]);
  });

  it("derives claimable balances from stream info when withdrawable is absent", () => {
    const rows = [
      claimRow({ ratePerSecond: 10n, startTime: 0, endTime: 1_000, withdrawn: 0n }), // 5000 at now=500
      claimRow({ ratePerSecond: 1n, startTime: 0, endTime: 1_000, withdrawn: 0n }), //  500
      claimRow({ ratePerSecond: 5n, startTime: 0, endTime: 1_000, withdrawn: 0n }), // 2500
    ];
    const sorted = sortStreams(rows, "claimable-desc", 500);
    expect(sorted.map((r) => r.info.ratePerSecond)).toEqual([10n, 5n, 1n]);
  });

  it("keeps the input order for equal balances (stable sort)", () => {
    const rows = [
      claimRow({ withdrawable: 500n }),
      claimRow({ withdrawable: 500n }),
      claimRow({ withdrawable: 500n }),
    ];
    const sorted = sortStreams(rows, "claimable-desc");
    expect(sorted).toEqual(rows);
  });

  it("does not mutate the input array", () => {
    const rows = [claimRow({ withdrawable: 1n }), claimRow({ withdrawable: 2n })];
    const copy = [...rows];
    sortStreams(rows, "claimable-desc");
    expect(rows).toEqual(copy);
  });

  it("returns the array untouched for a single row or 'default'", () => {
    const single = [claimRow({ withdrawable: 10n })];
    expect(sortStreams(single, "claimable-desc")).toBe(single);

    const rows = [claimRow({ withdrawable: 1n }), claimRow({ withdrawable: 2n })];
    expect(sortStreams(rows, "default")).toBe(rows);
  });
});

describe("compareClaimableDesc (#807)", () => {
  it("orders the larger balance first and ties equally", () => {
    expect(compareClaimableDesc(claimRow({ withdrawable: 9n }), claimRow({ withdrawable: 2n }), 0)).toBe(-1);
    expect(compareClaimableDesc(claimRow({ withdrawable: 2n }), claimRow({ withdrawable: 9n }), 0)).toBe(1);
    expect(compareClaimableDesc(claimRow({ withdrawable: 9n }), claimRow({ withdrawable: 9n }), 0)).toBe(0);
  });
});
