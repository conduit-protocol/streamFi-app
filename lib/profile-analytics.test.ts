import { describe, it, expect } from "vitest";
import {
  computeGasEfficiency,
  DEFAULT_AVG_TX_FEE_STROOPS,
  type CashflowStream,
  computeCashflow,
} from "./profile-analytics";
import type { StreamInfo } from "./stream";

function makeMockStream(overrides: Partial<StreamInfo> = {}): StreamInfo {
  return {
    sender: "GSENDER1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF",
    recipient: "GRECIPIENT1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF",
    token: "CDUMMYTOKEN",
    ratePerSecond: 10_000_000n,
    startTime: 1000,
    endTime: 1000 + 86400 * 10, // 10 days
    withdrawn: 0n,
    paused: false,
    pausedAt: 0,
    clawbackEnabled: false,
    cancelled: false,
    operator: null,
    ...overrides,
  };
}

describe("computeGasEfficiency", () => {
  it("calculates total withdrawals avoided and gas fees saved for active streams (#785)", () => {
    const stream1: CashflowStream = {
      info: makeMockStream({
        startTime: 1000,
        endTime: 1000 + 86400 * 30, // 30 days
      }),
      direction: "outgoing",
    };

    const stream2: CashflowStream = {
      info: makeMockStream({
        startTime: 1000,
        endTime: 1000 + 86400 * 10, // 10 days
      }),
      direction: "incoming",
    };

    const now = 1000 + 86400 * 40;
    const summary = computeGasEfficiency([stream1, stream2], now);

    // Stream 1 (30 days) = 30 avoided payouts
    // Stream 2 (10 days) = 10 avoided payouts
    // Total = 40 avoided payouts
    expect(summary.totalWithdrawalsAvoided).toBe(40);
    expect(summary.avgTxFeeStroops).toBe(DEFAULT_AVG_TX_FEE_STROOPS);
    // 40 * 10_000 = 400_000 stroops
    expect(summary.totalGasSavedStroops).toBe(400_000n);
    expect(summary.totalStreams).toBe(2);
  });

  it("handles streams shorter than 1 day with a minimum of 1 avoided payout", () => {
    const stream: CashflowStream = {
      info: makeMockStream({
        startTime: 1000,
        endTime: 1000 + 3600, // 1 hour
      }),
      direction: "outgoing",
    };

    const summary = computeGasEfficiency([stream], 2000);
    expect(summary.totalWithdrawalsAvoided).toBe(1);
    expect(summary.totalGasSavedStroops).toBe(DEFAULT_AVG_TX_FEE_STROOPS);
  });

  it("returns 0 for empty streams array", () => {
    const summary = computeGasEfficiency([], 5000);
    expect(summary.totalWithdrawalsAvoided).toBe(0);
    expect(summary.totalGasSavedStroops).toBe(0n);
    expect(summary.totalStreams).toBe(0);
  });

  it("ignores streams with 0 rate or invalid duration", () => {
    const stream: CashflowStream = {
      info: makeMockStream({
        ratePerSecond: 0n,
        startTime: 5000,
        endTime: 2000,
      }),
      direction: "outgoing",
    };

    const summary = computeGasEfficiency([stream], 6000);
    expect(summary.totalWithdrawalsAvoided).toBe(0);
    expect(summary.totalGasSavedStroops).toBe(0n);
  });
});

describe("computeCashflow", () => {
  it("computes net cashflow over 30 days window", () => {
    const stream: CashflowStream = {
      info: makeMockStream({
        startTime: 0,
        endTime: 86400 * 10,
        ratePerSecond: 100n,
      }),
      direction: "incoming",
    };

    const summary = computeCashflow([stream], 86400 * 10);
    expect(summary.totalIncoming).toBeGreaterThan(0n);
    expect(summary.totalOutgoing).toBe(0n);
    expect(summary.net).toBe(summary.totalIncoming);
  });
});
