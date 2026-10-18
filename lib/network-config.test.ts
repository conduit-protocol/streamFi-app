import { describe, it, expect } from 'vitest';
import {
  NETWORKS,
  DEFAULT_NETWORK,
  NETWORK_STORAGE_KEY,
  isValidNetworkName,
  getDefaultNetwork,
  type NetworkName,
} from './network-config';

describe('network-config', () => {
  describe('NETWORKS registry', () => {
    it('defines testnet, mainnet, and local configurations', () => {
      const keys = Object.keys(NETWORKS) as NetworkName[];
      expect(keys).toEqual(expect.arrayContaining(['testnet', 'mainnet', 'local']));
      expect(keys.length).toBe(3);
    });

    it('configures testnet correctly with valid URLs and passphrase', () => {
      const config = NETWORKS.testnet;
      expect(config.name).toBe('testnet');
      expect(config.label).toBe('Testnet');
      expect(config.rpcUrl).toBe('https://soroban-testnet.stellar.org');
      expect(config.passphrase).toBe('Test SDF Network ; September 2015');
      expect(config.horizonUrl).toBe('https://horizon-testnet.stellar.org');
      expect(() => new URL(config.rpcUrl)).not.toThrow();
      expect(() => new URL(config.horizonUrl!)).not.toThrow();
    });

    it('configures mainnet correctly with valid URLs and passphrase', () => {
      const config = NETWORKS.mainnet;
      expect(config.name).toBe('mainnet');
      expect(config.label).toBe('Mainnet');
      expect(config.rpcUrl).toBe('https://soroban-mainnet.stellar.org');
      expect(config.passphrase).toBe('Public Global Stellar Network ; September 2015');
      expect(config.horizonUrl).toBe('https://horizon.stellar.org');
      expect(() => new URL(config.rpcUrl)).not.toThrow();
      expect(() => new URL(config.horizonUrl!)).not.toThrow();
    });

    it('configures local network correctly with localhost endpoints', () => {
      const config = NETWORKS.local;
      expect(config.name).toBe('local');
      expect(config.label).toBe('Local standalone');
      expect(config.rpcUrl).toBe('http://localhost:8000');
      expect(config.passphrase).toBe('Standalone Network ; February 2017');
      expect(config.horizonUrl).toBe('http://localhost:8000');
      expect(() => new URL(config.rpcUrl)).not.toThrow();
    });
  });

  describe('DEFAULT_NETWORK and constants', () => {
    it('defaults to testnet', () => {
      expect(DEFAULT_NETWORK).toBe('testnet');
      expect(NETWORKS[DEFAULT_NETWORK]).toBeDefined();
    });

    it('specifies the expected storage key', () => {
      expect(NETWORK_STORAGE_KEY).toBe('conduit:network');
    });
  });

  describe('isValidNetworkName', () => {
    it('returns true for known valid network names', () => {
      expect(isValidNetworkName('testnet')).toBe(true);
      expect(isValidNetworkName('mainnet')).toBe(true);
      expect(isValidNetworkName('local')).toBe(true);
    });

    it('returns false for invalid network names', () => {
      expect(isValidNetworkName('')).toBe(false);
      expect(isValidNetworkName('futurenet')).toBe(false);
      expect(isValidNetworkName('standalone')).toBe(false);
      expect(isValidNetworkName('devnet')).toBe(false);
      expect(isValidNetworkName('custom')).toBe(false);
    });

    it('is case-sensitive and rejects mismatched casing', () => {
      expect(isValidNetworkName('Testnet')).toBe(false);
      expect(isValidNetworkName('TESTNET')).toBe(false);
      expect(isValidNetworkName('MAINNET')).toBe(false);
      expect(isValidNetworkName('Local')).toBe(false);
    });

    it('rejects strings with whitespace padding', () => {
      expect(isValidNetworkName(' testnet ')).toBe(false);
      expect(isValidNetworkName('mainnet\n')).toBe(false);
    });
  });

  describe('getDefaultNetwork', () => {
    it('returns the configuration corresponding to DEFAULT_NETWORK', () => {
      const defaultNet = getDefaultNetwork();
      expect(defaultNet).toBe(NETWORKS[DEFAULT_NETWORK]);
      expect(defaultNet.name).toBe('testnet');
      expect(defaultNet.rpcUrl).toBe('https://soroban-testnet.stellar.org');
    });
  });
});
