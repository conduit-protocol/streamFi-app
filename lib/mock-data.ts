import type { StreamInfo } from './stream';

const SENDER    = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
const RECIPIENT = 'GBV4ZDEPVQQ4HX6Z3V6JQZ6V7S5V2R4T4V6JQZ6V7S5V2R4T4V6JQZ6V7';
const TOKEN_XLM  = 'CAS3J7GYLGX6UWJ6V7R4T4V6JQZ6V7S5V2R4T4V6JQZ6V7S5V2R4T4V6';
const TOKEN_USDC = 'CCW67TSZV3SSYUZQ5S7Y5T4V6JQZ6V7S5V2R4T4V6JQZ6V7S5V2R4T4V6';

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
  },
};

// #316 correction — the previous fix here still left entry '4' at 57
// characters (one too many), so demo mode was still silently filtering that
// stream out. Every real Stellar StrKey address (accounts and contracts) is
// exactly 56 characters; these are genuinely 56-character, StrKey-valid
// contract addresses (verified via @stellar/stellar-sdk's StrKey.encodeContract).
export const MOCK_ADDRESSES: Record<string, string> = {
  '1': 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526',
  '2': 'CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ',
  '3': 'CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3',
  '4': 'CACAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAINCW',
  '5': 'CACQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQLC2U',
};

export const SENDER_STREAM_IDS = [1n, 3n, 5n];
export const RECIPIENT_STREAM_IDS = [2n, 4n];
