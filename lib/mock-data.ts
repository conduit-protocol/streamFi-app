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

export const MOCK_ADDRESSES: Record<string, string> = {
  '1': 'CCXJVGD3MZ7W5X4Y5T4V6JQZ6V7S5V2R4T4V6JQZ6V7S5V2R4T4V6AAAA',
  '2': 'CDR4T4V6JQZ6V7S5V2R4T4V6JQZ6V7S5V2R4T4V6JQZ6V7S5V2R4BBBB',
  '3': 'C5V2R4T4V6JQZ6V7S5V2R4T4V6JQZ6V7S5V2R4T4V6JQZ6V7S5V2CCCC',
  '4': 'C6JQZ6V7S5V2R4T4V6JQZ6V7S5V2R4T4V6JQZ6V7S5V2R4T4V6DDDD',
  '5': 'CZ6V7S5V2R4T4V6JQZ6V7S5V2R4T4V6JQZ6V7S5V2R4T4V6JQEEEE',
};

export const SENDER_STREAM_IDS = [1n, 3n, 5n];
export const RECIPIENT_STREAM_IDS = [2n, 4n];
