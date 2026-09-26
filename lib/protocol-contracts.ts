export interface ProtocolContract {
  name: string;
  desc: string;
}

/**
 * Shared registry of Soroban smart contracts comprising the Conduit / streamFi protocol.
 * Used on the public About page and available for documentation and indexing.
 */
export const PROTOCOL_CONTRACTS: readonly ProtocolContract[] = [
  {
    name: 'DripStream',
    desc: 'One per stream. Holds the token balance. Enforces the release schedule. Self-contained.',
  },
  {
    name: 'DripFactory',
    desc: 'Singleton entry point. Deploys DripStream contracts, assigns IDs, maintains the global index.',
  },
  {
    name: 'DripGovernor',
    desc: 'Protocol configuration. Holds fee rates and minimum durations. Controlled by a multisig authority.',
  },
  {
    name: 'BatchTransferProcessor',
    desc: 'Batch execution engine. Dispatches multi-recipient transfers and manages grouped stream operations efficiently.',
  },
  {
    name: 'Oracle',
    desc: 'On-chain price and exchange rate feed. Supplies real-time asset pricing and conversion data.',
  },
  {
    name: 'TokenVault',
    desc: 'Secure token custody. Manages protocol asset reserves, deposits, and authorized withdrawals.',
  },
];
