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
  const entries = result.map();

  if (!entries) throw new Error('Malformed stream info: expected map result');
  const fields = entries;

  function getField(name: string): xdr.ScVal {
    const entry = fields.find(e => e.key().sym()?.toString() === name);
    if (!entry) throw new Error(`Missing field: ${name}`);
    return entry.val();
  }

  function requireType(name: string, expected: string, label: string): xdr.ScVal {
    const field = getField(name);
    if (field.switch().name !== expected) {
      throw new Error(`Malformed stream info: ${name} must be ${label}`);
    }
    return field;
  }

  function readAddress(name: string): string {
    return Address.fromScVal(requireType(name, 'scvAddress', 'an address')).toString();
  }

  function readI128(name: string): bigint {
    return scValToI128(requireType(name, 'scvI128', 'i128'));
  }

  function readU64(name: string): number {
    return Number(scValToU64(requireType(name, 'scvU64', 'u64')));
  }

  function readBool(name: string): boolean {
    return requireType(name, 'scvBool', 'boolean').b();
  }

  return {
    sender:          readAddress('sender'),
    recipient:       readAddress('recipient'),
    token:           readAddress('token'),
    ratePerSecond:   readI128('rate_per_second'),
    startTime:       readU64('start_time'),
    endTime:         readU64('end_time'),
    withdrawn:       readI128('withdrawn'),
    paused:          readBool('paused'),
    pausedAt:        readU64('paused_at'),
    clawbackEnabled: readBool('clawback_enabled'),
    cancelled:       readBool('cancelled'),
  };
}


// ── Mutating ──────────────────────────────────────────────────────────────────

/**
 * Withdraw the available balance from a stream.
 * Supports abort signal for cancellation.
 */
export async function withdraw(
  sender:        string,
  streamAddress: string,
  amount:        bigint,
  signTx:        (xdr: string, signal?: AbortSignal) => Promise<string>,
  signal?:       AbortSignal,
): Promise<string> {
  if (isMock()) return 'mock_tx_hash_withdraw';
  return invokeContract(
    sender,
    streamAddress,
    'withdraw',
    [nativeToScVal(amount, { type: 'i128' })],
    signTx,
    { signal },
  );
}

/**
 * Cancel a stream (sender only).
 */
export async function cancel(
  sender:        string,
  streamAddress: string,
  signTx:        (xdr: string, signal?: AbortSignal) => Promise<string>,
  signal?:       AbortSignal,
): Promise<string> {
  if (isMock()) return 'mock_tx_hash_cancel';
  return invokeContract(sender, streamAddress, 'cancel', [], signTx, { signal });
}

/**
 * Pause a stream (sender only, active streams).
 */
export async function pause(
  sender:        string,
  streamAddress: string,
  signTx:        (xdr: string, signal?: AbortSignal) => Promise<string>,
  signal?:       AbortSignal,
): Promise<string> {
  if (isMock()) return 'mock_tx_hash_pause';
  return invokeContract(sender, streamAddress, 'pause', [], signTx, { signal });
}

/**
 * Resume a paused stream (sender only).
 */
export async function resume(
  sender:        string,
  streamAddress: string,
  signTx:        (xdr: string, signal?: AbortSignal) => Promise<string>,
  signal?:       AbortSignal,
): Promise<string> {
  if (isMock()) return 'mock_tx_hash_resume';
  return invokeContract(sender, streamAddress, 'resume', [], signTx, { signal });
}

/**
 * Top up a stream with additional tokens (sender only).
 */
export async function topUp(
  sender:        string,
  streamAddress: string,
  amount:        bigint,
  signTx:        (xdr: string, signal?: AbortSignal) => Promise<string>,
  signal?:       AbortSignal,
): Promise<string> {
  if (isMock()) return 'mock_tx_hash_topup';
  return invokeContract(
    sender,
    streamAddress,
    'top_up',
    [nativeToScVal(amount, { type: 'i128' })],
    signTx,
    { signal },
  );
}

/**
 * Clawback unstreamed tokens (sender only, clawback-enabled streams).
 */
export async function clawback(
  sender:        string,
  streamAddress: string,
  signTx:        (xdr: string, signal?: AbortSignal) => Promise<string>,
  signal?:       AbortSignal,
): Promise<string> {
  if (isMock()) return 'mock_tx_hash_clawback';
  return invokeContract(sender, streamAddress, 'clawback', [], signTx, { signal });
}
