/**
 * Network presets for the Stellar/Soroban environments the app can target.
 *
 * The actual contract deployment IDs are still read from environment variables
 * because they change with every deployment; this module only centralises the
 * well-known RPC endpoints and network passphrases.
 */

export type NetworkName = 'testnet' | 'mainnet' | 'local';

export interface NetworkConfig {
  name: NetworkName;
  label: string;
  rpcUrl: string;
  passphrase: string;
  horizonUrl?: string;
}

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  testnet: {
    name: 'testnet',
    label: 'Testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org',
  },
  mainnet: {
    name: 'mainnet',
    label: 'Mainnet',
    rpcUrl: 'https://soroban-mainnet.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
    horizonUrl: 'https://horizon.stellar.org',
  },
  local: {
    name: 'local',
    label: 'Local standalone',
    rpcUrl: 'http://localhost:8000',
    passphrase: 'Standalone Network ; February 2017',
    horizonUrl: 'http://localhost:8000',
  },
};

export const DEFAULT_NETWORK: NetworkName = 'testnet';

export const NETWORK_STORAGE_KEY = 'conduit:network';

export function isValidNetworkName(value: string): value is NetworkName {
  return value === 'testnet' || value === 'mainnet' || value === 'local';
}

/** Return the default network config. */
export function getDefaultNetwork(): NetworkConfig {
  return NETWORKS[DEFAULT_NETWORK];
}
