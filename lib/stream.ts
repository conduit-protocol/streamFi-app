/**
 * DripStream contract call wrappers for conduit-app.
 *
 * All mutating calls require a `signTx` callback from WalletContext.
 * Read-only calls take a `source` address to build the simulation transaction.
 */

import { xdr, Address, nativeToScVal } from '@stellar/stellar-sdk';
import { invokeContract, simulateReadOnly, scValToI128, scValToU64 } from './soroban';
import { tryGetFactoryContractId } from './env';
import { MOCK_STREAMS, MOCK_ADDRESSES } from './mock-data';

let _factory: string | undefined;
function FACTORY(): string | undefined {
  return _factory ??= tryGetFactoryContractId();
}

function isMock(): boolean {
  return !FACTORY();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreamInfo {
  sender:          string;
  recipient:       string;
  token:           string;
  ratePerSecond:   bigint;
  startTime:       number;
  endTime:         number;
  withdrawn:       bigint;
  paused:          boolean;
  pausedAt:        number;
  clawbackEnabled: boolean;
  cancelled:       boolean;
}

// ── Read-only ─────────────────────────────────────────────────────────────────

/**
 * Fetch the stream contract address from the factory index.
 */
export async function getStreamAddress(source: string, streamId: bigint): Promise<string | null> {
  if (isMock()) return MOCK_ADDRESSES[streamId.toString()] ?? null;
  try {
    const result = await simulateReadOnly(
      source,
      FACTORY()!,
      'stream_address',
      [nativeToScVal(streamId, { type: 'u64' })],
    );
    if (result.switch().name === 'scvVoid') return null;
    return Address.fromScVal(result).toString();
  } catch {
    return null;
  }
}

/**
 * Get the current withdrawable balance from a stream contract.
 */
export async function getWithdrawable(source: string, streamAddress: string): Promise<bigint> {
  if (isMock()) {
    const entry = Object.entries(MOCK_ADDRESSES).find(([, addr]) => addr === streamAddress);
    if (entry) return MOCK_STREAMS[entry[0]]?.withdrawn ?? 0n;
    return 10000000000000000n;
  }
  const result = await simulateReadOnly(source, streamAddress, 'withdrawable', []);
  return scValToI128(result);
}

/**
 * Get the full stream info struct.
 */
export async function getStreamInfo(source: string, streamAddress: string): Promise<StreamInfo> {
  if (isMock()) {
    const entry = Object.entries(MOCK_ADDRESSES).find(([, addr]) => addr === streamAddress);
    const fallback: StreamInfo = {
      sender: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      recipient: 'GBV4ZDEPVQQ4HX6Z3V6JQZ6V7S5V2R4T4V6JQZ6V7S5V2R4T4V6JQZ6V7',
      token: 'CAS3J7GYLGX6UWJ6V7R4T4V6JQZ6V7S5V2R4T4V6JQZ6V7S5V2R4T4V6',
      ratePerSecond: 11574074074074n,
      startTime: Math.floor(Date.now() / 1000) - 86400,
      endTime: Math.floor(Date.now() / 1000) + 86400 * 7,
      withdrawn: 5000000000000000n,
      paused: false,
      pausedAt: 0,
      clawbackEnabled: false,
      cancelled: false,
    };
    return entry ? (MOCK_STREAMS[entry[0]] ?? fallback) : fallback;
  }
  const result = await simulateReadOnly(source, streamAddress, 'info', []);
  const map    = result.map()!;

  function getField(name: string): xdr.ScVal {
    const entry = map.find(e => e.key().sym()?.toString() === name);
    if (!entry) throw new Error(`Missing field: ${name}`);
    return entry.val();
  }

  return {
    sender:          Address.fromScVal(getField('sender')).toString(),
    recipient:       Address.fromScVal(getField('recipient')).toString(),
    token:           Address.fromScVal(getField('token')).toString(),
    ratePerSecond:   scValToI128(getField('rate_per_second')),
    startTime:       Number(scValToU64(getField('start_time'))),
    endTime:         Number(scValToU64(getField('end_time'))),
    withdrawn:       scValToI128(getField('withdrawn')),
    paused:          getField('paused').b(),
    pausedAt:        Number(scValToU64(getField('paused_at'))),
    clawbackEnabled: getField('clawback_enabled').b(),
    cancelled:       getField('cancelled').b(),
  };
}

// ── Mutating ──────────────────────────────────────────────────────────────────

export async function withdraw(
  sender:        string,
  streamAddress: string,
  amount:        bigint,
  signTx:        (xdr: string) => Promise<string>,
): Promise<string> {
  if (isMock()) return 'mock_tx_hash_withdraw';
  return invokeContract(
    sender,
    streamAddress,
    'withdraw',
    [nativeToScVal(amount, { type: 'i128' })],
    signTx,
  );
}

export async function cancel(
  sender:        string,
  streamAddress: string,
  signTx:        (xdr: string) => Promise<string>,
): Promise<string> {
  if (isMock()) return 'mock_tx_hash_cancel';
  return invokeContract(sender, streamAddress, 'cancel', [], signTx);
}

export async function pause(
  sender:        string,
  streamAddress: string,
  signTx:        (xdr: string) => Promise<string>,
): Promise<string> {
  if (isMock()) return 'mock_tx_hash_pause';
  return invokeContract(sender, streamAddress, 'pause', [], signTx);
}

export async function resume(
  sender:        string,
  streamAddress: string,
  signTx:        (xdr: string) => Promise<string>,
): Promise<string> {
  if (isMock()) return 'mock_tx_hash_resume';
  return invokeContract(sender, streamAddress, 'resume', [], signTx);
}

export async function topUp(
  sender:        string,
  streamAddress: string,
  amount:        bigint,
  signTx:        (xdr: string) => Promise<string>,
): Promise<string> {
  if (isMock()) return 'mock_tx_hash_topup';
  return invokeContract(
    sender,
    streamAddress,
    'top_up',
    [nativeToScVal(amount, { type: 'i128' })],
    signTx,
  );
}

export async function clawback(
  sender:        string,
  streamAddress: string,
  signTx:        (xdr: string) => Promise<string>,
): Promise<string> {
  if (isMock()) return 'mock_tx_hash_clawback';
  return invokeContract(sender, streamAddress, 'clawback', [], signTx);
}
