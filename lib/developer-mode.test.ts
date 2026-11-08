import { describe, it, expect } from "vitest";
import { formatContractStorageKey, buildSampleInvocationXdr } from "./developer-mode";

describe("developer-mode helpers", () => {
  const TEST_CONTRACT = "CDUMMYCONTRACT1234567890ABCDEF1234567890ABCDEF1234567890";

  it("formats Soroban contract storage key as base64 XDR", () => {
    const keyXdr = formatContractStorageKey(TEST_CONTRACT, "info");
    expect(keyXdr).toBeTruthy();
    expect(typeof keyXdr).toBe("string");
  });

  it("handles custom storage key symbols", () => {
    const adminKeyXdr = formatContractStorageKey(TEST_CONTRACT, "admin");
    expect(adminKeyXdr).toBeTruthy();
  });

  it("builds sample invocation XDR for contract methods", () => {
    const cancelXdr = buildSampleInvocationXdr(TEST_CONTRACT, "cancel");
    expect(cancelXdr).toBeTruthy();
    expect(typeof cancelXdr).toBe("string");

    const topUpXdr = buildSampleInvocationXdr(TEST_CONTRACT, "top_up");
    expect(topUpXdr).toBeTruthy();
  });
});
