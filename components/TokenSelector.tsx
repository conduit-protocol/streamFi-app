'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  tokenByAddress,
  getTokens,
  networksForAddress,
  fetchSep41Metadata,
  type TokenMeta,
} from '@/lib/tokens';
import { loadImportedTokens, saveImportedToken } from '@/lib/imported-tokens-storage';
import { isValidStellarContract } from '@/lib/stellar-address';
import { Modal } from '@/components/ui/Modal';

/**
 * Stellar Soroban contract addresses are base32-encoded with the RFC 4648
 * alphabet (A–Z and 2–7). The characters 0, 1, 8, and 9 never appear in a
 * valid StrKey address. Contract addresses always start with 'C'.
 *
 * Using [A-Z0-9] is wrong — it accepts four characters that are impossible
 * in a real contract address and would produce a confusing RPC error instead
 * of immediate client-side feedback.
 */
const CONTRACT_ADDRESS_RE = /^C[A-Z2-7]{55}$/;

export interface TokenSelectorProps {
  /** Currently selected contract address (controlled). */
  value: string;
  /** Called with the new address string on every input change. */
  onChange: (address: string) => void;
  /** Called when a valid token is resolved from the known token list. */
  onTokenResolved?: (token: TokenMeta | null) => void;
  /** Network to resolve token metadata against. Defaults to 'testnet'. */
  network?: 'mainnet' | 'testnet' | 'local';
  /** Disable the input (e.g. while a transaction is in-flight). */
  disabled?: boolean;
  /** Additional className forwarded to the outer wrapper. */
  className?: string;
  /**
   * Funded account used as the simulation source when reading SEP-41
   * metadata for a custom token import (#789) — typically the connected
   * wallet's public key. Importing is unavailable until this is set.
   */
  sourceAddress?: string | null;
}

type ResolveStatus = 'idle' | 'loading' | 'resolved' | 'unknown' | 'error';
type ImportStatus  = 'idle' | 'loading' | 'error';

/**
 * TokenSelector — controlled input for a Soroban token contract address.
 *
 * Responsibilities:
 * - Validates the address with CONTRACT_ADDRESS_RE before any async work.
 * - On a valid address, looks up token metadata from the known token list.
 *   The lookup is intentionally async so it can be extended to an RPC call
 *   (e.g. fetching the token's `name` / `symbol` from the contract itself)
 *   without changing the component's interface.
 * - Aborts any in-flight lookup when the address changes (rapid re-selection
 *   guard) so stale results can never overwrite a newer address.
 * - Surfaces distinct loading, resolved, unknown-token, and error states.
 * - Lets users paste an arbitrary Soroban contract address into search and
 *   import it (#789): SEP-41 metadata is read on-chain, an "Unverified Asset"
 *   disclaimer must be explicitly acknowledged, and the token is persisted
 *   locally and flagged as unverified in the list.
 */
export function TokenSelector({
  value,
  onChange,
  onTokenResolved,
  network = 'testnet',
  disabled = false,
  className = '',
  sourceAddress = null,
}: TokenSelectorProps) {
  const [status, setStatus]   = useState<ResolveStatus>('idle');
  const [token, setToken]     = useState<TokenMeta | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Networks (other than the current one) on which an otherwise-unknown
  // address IS a known token — so the message can point the user there (#429).
  const [otherNetworks, setOtherNetworks] = useState<Array<'mainnet' | 'testnet'>>([]);

  // ── Token search filtering (#653) ─────────────────────────────────────────
  // Debounced search across symbol, name, and 56-char contract address so
  // custom/imported tokens are findable as the known-token list grows.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  // ── Imported (unverified) tokens (#789) ──────────────────────────────────
  // Loaded after mount so server and first client render match. The ref
  // mirrors state so resolveToken can see a token imported in the same tick.
  const [importedTokens, setImportedTokens] = useState<TokenMeta[]>([]);
  const importedRef = useRef<TokenMeta[]>([]);

  useEffect(() => {
    const list = loadImportedTokens(network);
    importedRef.current = list;
    setImportedTokens(list);
  }, [network]);

  const allTokens = useMemo<TokenMeta[]>(
    () => [...getTokens(network), ...importedTokens],
    [network, importedTokens],
  );

  const filteredTokens = useMemo<TokenMeta[]>(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return [];
    return allTokens.filter(t => {
      if (t.symbol.toLowerCase().includes(q)) return true;
      if (t.name.toLowerCase().includes(q)) return true;
      if (t.address?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [debouncedSearch, allTokens]);

  const showSearchResults = debouncedSearch.trim().length > 0;

  // A pasted contract address that is in neither list can be imported.
  const importCandidate = useMemo<string | null>(() => {
    const q = debouncedSearch.trim().toUpperCase();
    if (!isValidStellarContract(q)) return null;
    return allTokens.some(t => t.address === q) ? null : q;
  }, [debouncedSearch, allTokens]);

  const [importStatus, setImportStatus]   = useState<ImportStatus>('idle');
  const [importError, setImportError]     = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<TokenMeta | null>(null);
  const [acknowledged, setAcknowledged]   = useState(false);
  const importAbortRef = useRef<AbortController | null>(null);

  // Any change to the import candidate cancels an in-flight metadata read.
  useEffect(() => {
    importAbortRef.current?.abort();
    setImportStatus('idle');
    setImportError(null);
  }, [importCandidate]);

  useEffect(() => () => importAbortRef.current?.abort(), []);

  const startImport = useCallback(async (address: string) => {
    importAbortRef.current?.abort();
    const controller = new AbortController();
    importAbortRef.current = controller;

    setImportStatus('loading');
    setImportError(null);

    try {
      const meta = await fetchSep41Metadata(address, sourceAddress ?? '', {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setAcknowledged(false);
      setPendingImport(meta);
      setImportStatus('idle');
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setImportError(err instanceof Error ? err.message : 'Could not read token metadata.');
      setImportStatus('error');
    }
  }, [sourceAddress]);

  const cancelImport = useCallback(() => {
    setPendingImport(null);
    setAcknowledged(false);
  }, []);

  const confirmImport = useCallback(() => {
    if (!pendingImport?.address || !acknowledged) return;
    const list = saveImportedToken(network, pendingImport);
    importedRef.current = list;
    setImportedTokens(list);
    setPendingImport(null);
    setAcknowledged(false);
    setSearch('');
    setDebouncedSearch('');
    onChange(pendingImport.address);
  }, [pendingImport, acknowledged, network, onChange]);

  // Ref to the AbortController for the current in-flight metadata lookup.
  // Replaced on every new lookup so the previous one can be cancelled.
  const abortRef = useRef<AbortController | null>(null);

  const resolveToken = useCallback(
    async (address: string) => {
      // Cancel any previous in-flight lookup.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('loading');
      setToken(null);
      setErrorMsg(null);
      setOtherNetworks([]);

      try {
        // Simulate async resolution — allows a future upgrade to a real RPC
        // call (e.g. contract.name()) without touching the interface.
        await Promise.resolve();

        // Bail out if the address changed while we were "awaiting".
        if (controller.signal.aborted) return;

        const found =
          tokenByAddress(address, network) ??
          importedRef.current.find(t => t.address === address) ??
          null;
        if (controller.signal.aborted) return;

        setToken(found);
        setStatus(found ? 'resolved' : 'unknown');
        if (!found) {
          setOtherNetworks(
            networksForAddress(address).filter(n => n !== network),
          );
        }
        onTokenResolved?.(found);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Could not resolve token metadata';
        setErrorMsg(msg);
        setStatus('error');
        onTokenResolved?.(null);
      }
    },
    [network, onTokenResolved],
  );

  useEffect(() => {
    // Reset to idle when the input is cleared or invalid.
    if (!CONTRACT_ADDRESS_RE.test(value)) {
      abortRef.current?.abort();
      setStatus('idle');
      setToken(null);
      setErrorMsg(null);
      setOtherNetworks([]);
      if (value.length > 0) {
        // Non-empty but invalid — the error state is shown by the validation
        // message below rather than as a resolve error.
      }
      return;
    }

    resolveToken(value);

    return () => {
      // Cleanup: abort if this effect runs again (address changed) or on unmount.
      abortRef.current?.abort();
    };
    // resolveToken is stable (useCallback); value + network drive re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, network]);

  const isValidFormat = value.length === 0 || CONTRACT_ADDRESS_RE.test(value);
  const showValidationError = value.length > 0 && !CONTRACT_ADDRESS_RE.test(value);

  return (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-xs font-semibold dark:text-white">
        Token contract address
      </label>

      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder="C…"
        aria-label="Token contract address"
        aria-invalid={!isValidFormat}
        aria-describedby={
          showValidationError
            ? 'token-selector-format-error'
            : status === 'error'
              ? 'token-selector-resolve-error'
              : undefined
        }
        className="input font-mono w-full"
        spellCheck={false}
        autoComplete="off"
      />

      {/* Format validation error */}
      {showValidationError && (
        <p
          id="token-selector-format-error"
          role="alert"
          className="text-xs text-red-600 mt-1"
        >
          Must be a valid Stellar contract address starting with C (base32, A–Z and 2–7 only,
          56 characters total).
        </p>
      )}

      {/* Async resolution feedback */}
      {!showValidationError && status === 'loading' && (
        <p className="text-xs text-gray-400 mt-1" role="status" aria-live="polite">
          Looking up token…
        </p>
      )}

      {!showValidationError && status === 'resolved' && token && (
        <p className="text-xs text-gray-500 mt-1" role="status" aria-live="polite">
          {token.verified === false ? (
            <>
              <span aria-hidden="true">⚠ </span>
              {token.symbol} — {token.name}
              <span className="text-amber-600 dark:text-amber-400"> (unverified, imported by you)</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">✓ </span>
              {token.symbol} — {token.name}
            </>
          )}
        </p>
      )}

      {!showValidationError && status === 'unknown' && (
        <p className="text-xs text-gray-400 mt-1" role="status" aria-live="polite">
          {otherNetworks.length > 0
            ? `This contract is a known token on ${otherNetworks.join(' and ')}, but not on ` +
              `${network}. Switch networks or choose a different token.`
            : 'Contract address not in the known token list — it may still be valid on-chain.'}
        </p>
      )}

      {!showValidationError && status === 'error' && (
        <p
          id="token-selector-resolve-error"
          role="alert"
          className="text-xs text-red-600 mt-1"
        >
          {errorMsg ?? 'Could not resolve token metadata. Please try again.'}
        </p>
      )}

      {/* Token search filter (#653) — debounced filtering across symbol,
          name, and 56-char contract address. The result list only renders
          while a search query is present so the default view is unchanged. */}
      <div className="pt-2">
        <label
          htmlFor="token-selector-search"
          className="block text-xs font-semibold dark:text-white"
        >
          Search tokens
        </label>
        <input
          id="token-selector-search"
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={disabled}
          placeholder="Search by symbol, name, or address…"
          aria-label="Search tokens"
          autoComplete="off"
          spellCheck={false}
          className="input w-full mt-1"
        />
        {showSearchResults && (
          <div
            role="listbox"
            aria-label="Matching tokens"
            className="mt-1 max-h-48 overflow-y-auto rounded border border-gray-200 dark:border-gray-700"
          >
            {filteredTokens.length === 0 && importCandidate ? (
              <div className="px-3 py-2 space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  This contract is not in the verified token list.
                </p>
                <button
                  type="button"
                  onClick={() => startImport(importCandidate)}
                  disabled={disabled || importStatus === 'loading' || !sourceAddress}
                  aria-describedby={
                    !sourceAddress
                      ? 'token-selector-import-hint'
                      : importStatus === 'error'
                        ? 'token-selector-import-error'
                        : undefined
                  }
                  className="btn-secondary text-xs"
                >
                  {importStatus === 'loading' ? 'Reading token metadata…' : 'Import token'}
                </button>
                {!sourceAddress && (
                  <p id="token-selector-import-hint" className="text-xs text-gray-400">
                    Connect a wallet to look up token metadata.
                  </p>
                )}
                {importStatus === 'loading' && (
                  <p className="sr-only" role="status" aria-live="polite">
                    Reading token metadata…
                  </p>
                )}
                {importStatus === 'error' && (
                  <p
                    id="token-selector-import-error"
                    role="alert"
                    className="text-xs text-red-600"
                  >
                    {importError ?? 'Could not read token metadata.'} You can try again.
                  </p>
                )}
              </div>
            ) : filteredTokens.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400" role="status">
                No tokens match “{debouncedSearch.trim()}”.
              </p>
            ) : (
              filteredTokens.map(t => {
                const isSelected = !!t.address && t.address === value;
                return (
                  <button
                    key={t.address ?? t.symbol}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={disabled || !t.address}
                    onClick={() => {
                      if (t.address) onChange(t.address);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                  >
                    <span className="font-semibold">{t.symbol}</span>
                    {t.verified && (
                      <span
                        className="inline-flex items-center ml-1 text-blue-500"
                        title="Verified token"
                        aria-label="Verified token"
                      >
                        ✓
                      </span>
                    )}
                    {t.verified === false && (
                      <span className="ml-1 rounded border border-amber-300 px-1 text-[10px] font-semibold uppercase text-amber-700 dark:border-amber-700 dark:text-amber-400">
                        Unverified
                      </span>
                    )}
                    <span className="text-gray-500 dark:text-gray-400"> — {t.name}</span>
                    {t.address && (
                      <span className="block font-mono text-[10px] text-gray-400 truncate">
                        {t.address}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Unverified asset disclaimer (#789). Modal provides the focus trap,
          Escape-to-close, and focus restoration. */}
      {pendingImport && (
        <Modal title="Unverified Asset" onClose={cancelImport}>
          <div className="space-y-4">
            <p id="token-import-warning" className="text-sm text-gray-600 dark:text-gray-400">
              This token is not on the verified list. Anyone can deploy a contract with any
              name or symbol, including copies of well-known assets. Make sure you trust this
              contract before streaming funds with it.
            </p>
            <div className="rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 text-sm">
              <div className="flex justify-between gap-4 px-3 py-2">
                <span className="text-gray-500">Name</span>
                <span>{pendingImport.name}</span>
              </div>
              <div className="flex justify-between gap-4 px-3 py-2">
                <span className="text-gray-500">Symbol</span>
                <span className="font-semibold">{pendingImport.symbol}</span>
              </div>
              <div className="flex justify-between gap-4 px-3 py-2">
                <span className="text-gray-500">Decimals</span>
                <span className="font-mono">{pendingImport.decimals}</span>
              </div>
              <div className="px-3 py-2">
                <span className="block text-gray-500">Contract</span>
                <span className="block font-mono text-xs break-all">{pendingImport.address}</span>
              </div>
            </div>
            <label htmlFor="token-import-acknowledge" className="flex items-start gap-2 cursor-pointer">
              <input
                id="token-import-acknowledge"
                type="checkbox"
                checked={acknowledged}
                onChange={e => setAcknowledged(e.target.checked)}
                aria-describedby="token-import-warning"
                className="mt-0.5 rounded border-gray-300"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">
                I understand this token is unverified and I accept the risk of importing it.
              </span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={confirmImport}
                disabled={!acknowledged}
              >
                Import token
              </button>
              <button type="button" className="btn-secondary" onClick={cancelImport}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
