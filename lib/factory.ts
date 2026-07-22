/**
 * DripFactory contract call wrappers for conduit-app.
 */

import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { invokeContract, simulateReadOnly, scValToU64 } from './soroban';
import { tryGetFactoryContractId } from './env';
import { SENDER_STREAM_IDS, RECIPIENT_STREAM_IDS, MOCK_STREAM_IDS } from './mock-data';

let _factory: string | undefined;
function FACTORY(): string | undefined {
  return _factory ??= tryGetFactoryContractId();
}

function isMock(): boolean {
  return !FACTORY();
}

// ── Read-only ─────────────────────────────────────────────────────────────────

/** Total number of streams ever created */
export async function streamCount(source: string): Promise<bigint> {
  if (isMock()) return BigInt(MOCK_STREAM_IDS.length);
  const result = await simulateReadOnly(source, FACTORY()!, 'stream_count', []);
  return scValToU64(result);
}

/** Stream IDs created by a sender address (paginated) */
export async function streamsBySender(
  source:  string,
  sender:  string,
  offset:  number,
  limit:   number,
): Promise<bigint[]> {
  if (isMock()) return SENDER_STREAM_IDS;
  const result = await simulateReadOnly(source, FACTORY()!, 'streams_by_sender', [
    new Address(sender).toScVal(),
    nativeToScVal(offset, { type: 'u32' }),
    nativeToScVal(limit,  { type: 'u32' }),
  ]);
  return result.vec()!.map(v => scValToU64(v));
}

/** Stream IDs received by a recipient address (paginated) */
export async function streamsByRecipient(
  source:    string,
  recipient: string,
  offset:    number,
  limit:     number,
): Promise<bigint[]> {
  if (isMock()) return RECIPIENT_STREAM_IDS;
  const result = await simulateReadOnly(source, FACTORY()!, 'streams_by_recipient', [
    new Address(recipient).toScVal(),
    nativeToScVal(offset, { type: 'u32' }),
    nativeToScVal(limit,  { type: 'u32' }),
  ]);
  return result.vec()!.map(v => scValToU64(v));
}

// ── Mutating ──────────────────────────────────────────────────────────────────

export interface CreateStreamArgs {
  sender:       string;
  recipient:    string;
  token:        string;
  deposit:      bigint;
  ratePerSec:   bigint;
  startTime:    number;
  endTime:      number;
  clawback:     boolean;
}

/**
 * Create a new stream via the factory.
 *
 * Returns only the transaction hash — DripFactory::create_stream emits no
 * event carrying the assigned stream_id (see streamFi-contracts issue #39),
 * and invokeContract() doesn't currently surface the confirmed transaction's
 * actual return value either. Callers needing the new stream's ID must
 * re-query the factory (e.g. streamsBySender) after this resolves.
 */
export async function createStream(
  args:   CreateStreamArgs,
  signTx: (xdr: string) => Promise<string>,
): Promise<string> {
  if (isMock()) return 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6';
  return invokeContract(
    args.sender,
    FACTORY()!,
    'create_stream',
    [
      new Address(args.sender).toScVal(),
      new Address(args.recipient).toScVal(),
      new Address(args.token).toScVal(),
      nativeToScVal(args.deposit,    { type: 'i128' }),
      nativeToScVal(args.ratePerSec, { type: 'i128' }),
      nativeToScVal(args.startTime,  { type: 'u64' }),
      nativeToScVal(args.endTime,    { type: 'u64' }),
      nativeToScVal(args.clawback,   { type: 'bool' }),
    ],
    signTx,
  );
}
