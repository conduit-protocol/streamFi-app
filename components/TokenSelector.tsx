'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { tokenByAddress, getTokens, networksForAddress, type TokenMeta } from '@/lib/tokens';

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
}

type ResolveStatus = 'idle' | 'loading' | 'resolved' | 'unknown' | 'error';

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
 */
export function TokenSelector({
  value,
  onChange,
  onTokenResolved,
  network = 'testnet',
  disabled = false,
  className = '',
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

  const filteredTokens = useMemo<TokenMeta[]>(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return [];
    return getTokens(network).filter(t => {
      if (t.symbol.toLowerCase().includes(q)) return true;
      if (t.name.toLowerCase().includes(q)) return true;
      if (t.address?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [debouncedSearch, network]);

  const showSearchResults = debouncedSearch.trim().length > 0;

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

        const found = tokenByAddress(address, network) ?? null;
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
          <span aria-hidden="true">✓ </span>
          {token.symbol} — {token.name}
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
            {filteredTokens.length === 0 ? (
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
    </div>
  );
}
