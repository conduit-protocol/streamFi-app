/**
 * Probes a contract address for a `withdraw` entry point by simulating a
 * read-only call. Used by the create form to warn users when the recipient
 * contract may not be able to pull funds from a stream (#458).
 *
 * @param contractAddress  The C... contract address to probe
 * @param sourceAddress    A funded Stellar account to use as the simulation source
 * @param options          Optional signal and timeout
 * @returns                `true` if the contract exposes a `withdraw` function,
 *                         `false` if the simulation fails (function not found,
 *                         wrong type, etc.)
 */
import { simulateReadOnly } from './soroban';
import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';

export async function checkContractHasWithdraw(
  contractAddress: string,
  sourceAddress: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<boolean> {
  try {
    // Simulate calling withdraw() with a dummy amount
    // If the function doesn't exist, the simulation will fail with a
    // "HostFunctionError" or similar, which we catch and return false.
    await simulateReadOnly(
      sourceAddress,
      contractAddress,
      'withdraw',
      [
        Address.fromString(sourceAddress).toScVal(),
        nativeToScVal(1, { type: 'i128' }),
      ],
      { timeoutMs: options?.timeoutMs ?? 10_000, signal: options?.signal },
    );
    return true;
  } catch {
    // Any simulation error means the contract doesn't expose withdraw()
    // or it has an incompatible signature. Either way, the user should
    // be warned.
    return false;
  }
}
