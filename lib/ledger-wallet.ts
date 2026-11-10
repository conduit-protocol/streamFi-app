/**
 * ledger-wallet — Ledger hardware wallet support over WebHID (#792).
 *
 * The Ledger libraries (`@ledgerhq/hw-transport-webhid`, `@ledgerhq/hw-app-str`)
 * are only ever loaded through dynamic `import()` inside the functions below,
 * so they land in their own chunk and are fetched the first time a user picks
 * Ledger in the connect modal — never as part of the main bundle.
 *
 * Note: the issue suggested `@stellar/transport-webhid`, but no such package
 * exists on npm, so this uses Ledger's official WebHID transport together
 * with its Stellar app client.
 */
import type Transport from '@ledgerhq/hw-transport-webhid';
import { StrKey, TransactionBuilder } from '@stellar/stellar-sdk';

/** Human-readable wallet name stored in the wallet session. */
export const LEDGER_WALLET_NAME = 'Ledger';

/** Provider id used by the connect modal and the auto-reconnect cache. */
export const LEDGER_WALLET_ID = 'ledger';

/** SEP-0005 path of the first Stellar account on the device. */
export const LEDGER_DERIVATION_PATH = "44'/148'/0'";

export type LedgerErrorCode =
  | 'unsupported'
  | 'cancelled'
  | 'locked'
  | 'app-not-open'
  | 'rejected'
  | 'disconnected'
  | 'busy'
  | 'wrong-account'
  | 'unknown';

/** A Ledger failure with a user-facing message and a stable `code` for callers. */
export class LedgerError extends Error {
  readonly code: LedgerErrorCode;

  constructor(code: LedgerErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export const WEBHID_UNSUPPORTED_MESSAGE =
  'Ledger requires WebHID, which this browser does not support. Use a Chromium-based desktop browser (Chrome, Edge, Brave or Opera) over HTTPS.';

/**
 * True when the browser exposes WebHID. Safe to call during SSR (returns false).
 * WebHID is only available in secure contexts in Chromium-based desktop browsers.
 */
export function isWebHIDSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (window.isSecureContext === false) return false;
  return 'hid' in navigator && !!(navigator as Navigator & { hid?: unknown }).hid;
}

// Status words returned by the device / Stellar app.
const SW_LOCKED             = 0x5515;
const SW_USER_REFUSED       = 0x6985;
const SW_APP_NOT_OPEN       = [0x6511, 0x6d00, 0x6e00, 0x6e01, 0x6807];
const SW_HASH_SIGNING_OFF   = 0x6c66;
const SW_DATA_TOO_LARGE     = 0xb004;
const SW_DATA_PARSING_FAIL  = 0xb005;

/**
 * Normalise anything the Ledger stack (or WebHID itself) can throw into a
 * `LedgerError` with a message a user can act on. Errors are duck-typed on
 * `name` / `statusCode` so `@ledgerhq/errors` never has to be loaded eagerly.
 */
export function toLedgerError(error: unknown): LedgerError {
  if (error instanceof LedgerError) return error;

  const err = (error ?? {}) as { name?: string; message?: string; statusCode?: number };
  const name = err.name ?? '';
  const statusCode = typeof err.statusCode === 'number' ? err.statusCode : undefined;

  if (name === 'TransportOpenUserCancelled' || name === 'NotFoundError' || name === 'AbortError') {
    return new LedgerError('cancelled', 'Ledger connection cancelled — no device was selected.', { cause: error });
  }
  if (name === 'LockedDeviceError' || statusCode === SW_LOCKED) {
    return new LedgerError('locked', 'Your Ledger is locked. Unlock it with your PIN and try again.', { cause: error });
  }
  if (statusCode !== undefined && SW_APP_NOT_OPEN.includes(statusCode)) {
    return new LedgerError('app-not-open', 'Open the Stellar app on your Ledger and try again.', { cause: error });
  }
  if (statusCode === SW_USER_REFUSED || name === 'StellarUserRefusedError') {
    return new LedgerError('rejected', 'The request was rejected on your Ledger.', { cause: error });
  }
  if (statusCode === SW_HASH_SIGNING_OFF || name === 'StellarHashSigningNotEnabledError') {
    return new LedgerError(
      'unknown',
      'This transaction needs hash signing. Enable "Hash signing" in the Stellar app settings on your Ledger and try again.',
      { cause: error },
    );
  }
  if (
    statusCode === SW_DATA_TOO_LARGE || statusCode === SW_DATA_PARSING_FAIL ||
    name === 'StellarDataTooLargeError' || name === 'StellarDataParsingFailedError'
  ) {
    return new LedgerError(
      'unknown',
      'Your Ledger could not display this transaction. Update the Stellar app on your device and try again.',
      { cause: error },
    );
  }
  if (name === 'DisconnectedDevice' || name === 'DisconnectedDeviceDuringOperation') {
    return new LedgerError('disconnected', 'Your Ledger was disconnected. Reconnect it and try again.', { cause: error });
  }
  if (name === 'TransportInterfaceNotAvailable' || name === 'TransportRaceCondition' || name === 'InvalidStateError') {
    return new LedgerError(
      'busy',
      'Your Ledger is busy or in use by another application (e.g. Ledger Live). Close it and try again.',
      { cause: error },
    );
  }
  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return new LedgerError('cancelled', 'Ledger access was not granted. Click Connect and select your device.', { cause: error });
  }
  return new LedgerError('unknown', err.message || 'Failed to communicate with your Ledger.', { cause: error });
}

// ── Transport lifecycle ──────────────────────────────────────────────────────

let activeTransport: Transport | null = null;
let disconnectHandler: (() => void) | null = null;

// The device handles one APDU exchange at a time; overlapping requests fail
// with `TransportRaceCondition`. Every device interaction is chained here so
// concurrent signTx() calls queue instead of colliding.
let deviceQueue: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = deviceQueue.then(fn, fn);
  deviceQueue = run.catch(() => undefined);
  return run;
}

function loadTransport() {
  return import('@ledgerhq/hw-transport-webhid').then((m) => m.default);
}

function loadStellarApp() {
  return import('@ledgerhq/hw-app-str').then((m) => m.default);
}

/**
 * Open (or reuse) a WebHID transport. Prefers a device the user has already
 * granted to this origin, so only the very first connect shows the browser's
 * device picker. `interactive: false` never shows the picker.
 */
async function openTransport({ interactive }: { interactive: boolean }): Promise<Transport> {
  if (activeTransport) return activeTransport;
  if (!isWebHIDSupported()) {
    throw new LedgerError('unsupported', WEBHID_UNSUPPORTED_MESSAGE);
  }

  let transport: Transport | null;
  try {
    const TransportWebHID = await loadTransport();
    transport = await TransportWebHID.openConnected();
    if (!transport && interactive) {
      transport = await TransportWebHID.request();
    }
  } catch (error) {
    throw toLedgerError(error);
  }
  if (!transport) {
    throw new LedgerError('disconnected', 'No Ledger found. Connect and unlock your device, then try again.');
  }

  activeTransport = transport;
  const onDisconnect = () => {
    if (activeTransport !== transport) return;
    activeTransport = null;
    transport.off('disconnect', onDisconnect);
    disconnectHandler?.();
  };
  transport.on('disconnect', onDisconnect);
  return transport;
}

/** Close the active transport, if any. Never throws. */
export async function closeLedger(): Promise<void> {
  const transport = activeTransport;
  activeTransport = null;
  if (!transport) return;
  try {
    await transport.close();
  } catch {
    /* already gone */
  }
}

/**
 * Register a callback fired when the device is unplugged (or the transport
 * otherwise drops) while connected. Replaces any previous handler.
 */
export function onLedgerDisconnect(handler: (() => void) | null): void {
  disconnectHandler = handler;
}

async function readPublicKey(transport: Transport): Promise<string> {
  const Str = await loadStellarApp();
  const app = new Str(transport);
  const { rawPublicKey } = await app.getPublicKey(LEDGER_DERIVATION_PATH);
  return StrKey.encodeEd25519PublicKey(rawPublicKey);
}

/**
 * Connect to a Ledger and return the G-address of its first Stellar account.
 * Throws `LedgerError` for every failure mode (unsupported browser, picker
 * cancelled, device locked, Stellar app not open, unplugged…).
 */
export function connectLedger(options: { interactive?: boolean } = {}): Promise<string> {
  return serialize(async () => {
    const transport = await openTransport({ interactive: options.interactive ?? true });
    try {
      return await readPublicKey(transport);
    } catch (error) {
      const ledgerError = toLedgerError(error);
      // A locked device / closed app leaves the transport usable, but a
      // half-open session is confusing to resume — start clean next time.
      await closeLedger();
      throw ledgerError;
    }
  });
}

/**
 * Sign a base64 XDR transaction (or fee-bump) on the Ledger and return the
 * signed XDR. The user reviews and approves the transaction on the device.
 *
 * Re-opens a previously granted device if the transport dropped (e.g. after a
 * page reload restored the session), and refuses to sign if the device now
 * holds a different account than the connected one.
 */
export function signWithLedger(
  xdr: string,
  networkPassphrase: string,
  expectedPublicKey: string,
): Promise<string> {
  return serialize(() => signOnDevice(xdr, networkPassphrase, expectedPublicKey));
}

async function signOnDevice(
  xdr: string,
  networkPassphrase: string,
  expectedPublicKey: string,
): Promise<string> {
  const transport = await openTransport({ interactive: true });
  try {
    const devicePublicKey = await readPublicKey(transport);
    if (devicePublicKey !== expectedPublicKey) {
      throw new LedgerError(
        'wrong-account',
        'The connected Ledger holds a different account than this session. Reconnect your wallet.',
      );
    }

    const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
    const Str = await loadStellarApp();
    const app = new Str(transport);
    const { signature } = await app.signTransaction(LEDGER_DERIVATION_PATH, tx.signatureBase());
    tx.addSignature(expectedPublicKey, signature.toString('base64'));
    return tx.toXDR();
  } catch (error) {
    throw toLedgerError(error);
  }
}
