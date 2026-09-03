import { StrKey } from '@stellar/stellar-sdk';
import type { StreamInfo } from './stream';

// Valid 56-character StrKey public keys (G...) generated via
// @stellar/stellar-sdk's StrKey.encodeEd25519PublicKey (verified checksums).
const SENDER    = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 0x10));
const RECIPIENT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 0x20));
// Valid 56-character StrKey contract addresses (C...) generated via
// @stellar/stellar-sdk's StrKey.encodeContract (verified checksums).
const TOKEN_XLM  = StrKey.encodeContract(Buffer.alloc(32, 0x30));
const TOKEN_USDC = StrKey.encodeContract(Buffer.alloc(32, 0x40));

export const MOCK_STREAM_IDS = [1n, 2n, 3n, 4n, 5n];

const NOW = Math.floor(Date.now() / 1000);

export const MOCK_STREAMS: Record<string, StreamInfo> = {
  '1': {
    sender: SENDER,
    recipient: RECIPIENT,
    token: TOKEN_XLM,
    ratePerSecond: 11574074074074n,
    startTime: NOW - 86400 * 10,
    endTime: NOW + 86400 * 20,
    withdrawn: 50000000000000000n,
    paused: false,
    pausedAt: 0,
    clawbackEnabled: false,
    cancelled: false,
    operator: null,
  },
  '2': {
    sender: RECIPIENT,
    recipient: SENDER,
    token: TOKEN_USDC,
    ratePerSecond: 5787037037037n,
    startTime: NOW - 86400 * 5,
    endTime: NOW + 86400 * 25,
    withdrawn: 10000000000000000n,
    paused: true,
    pausedAt: NOW - 86400 * 2,
    clawbackEnabled: true,
    cancelled: false,
    operator: null,
  },
  '3': {
    sender: SENDER,
    recipient: RECIPIENT,
    token: TOKEN_XLM,
    ratePerSecond: 23148148148148n,
    startTime: NOW - 86400 * 30,
    endTime: NOW - 86400 * 5,
    withdrawn: 250000000000000000n,
    paused: false,
    pausedAt: 0,
    clawbackEnabled: false,
    cancelled: false,
    operator: null,
  },
  '4': {
    sender: RECIPIENT,
    recipient: SENDER,
    token: TOKEN_USDC,
    ratePerSecond: 11574074074074n,
    startTime: NOW - 86400 * 3,
    endTime: NOW - 86400 * 1,
    withdrawn: 30000000000000000n,
    paused: true,
    pausedAt: NOW - 86400 * 2,
    clawbackEnabled: false,
    cancelled: true,
    operator: null,
  },
  '5': {
    sender: SENDER,
    recipient: RECIPIENT,
    token: TOKEN_XLM,
    ratePerSecond: 5787037037037n,
    startTime: NOW - 86400 * 15,
    endTime: NOW + 86400 * 15,
    withdrawn: 80000000000000000n,
    paused: false,
    pausedAt: 0,
    clawbackEnabled: true,
    cancelled: false,
    operator: null,
  },
};

// Valid 56-character StrKey contract addresses generated via
// @stellar/stellar-sdk's StrKey.encodeContract (verified checksums).
export const MOCK_ADDRESSES: Record<string, string> = {
  '1': 'CCDT45LNPDPGPJGWNMWN7F3D7QNLBE2SZN4YY7GDKMLS4YVFV7QIB7N6',
  '2': 'CBREE3IT5EDCMQRUIAATY5ZZUOACGBQE766RXNZP5WGSNKQSNCA2DUAN',
  '3': 'CDWX3C3Y2FNA5ROZ54PAS7W7OKDZGHW5NHBCIE2SO5R4MVI6AC3APKNF',
  '4': 'CDTNN743Z42NSVOM6QUUOY3FN5526R3LZY6A5LHFEVWWFNFFVKY5FMO2',
  '5': 'CC25TYP47KHLCL4ODF6JSDUHTVWF7GWT3HNL2T5FDXAKJ4KOLVL4RDQN',
};

export const SENDER_STREAM_IDS = [1n, 3n, 5n];
export const RECIPIENT_STREAM_IDS = [2n, 4n];
