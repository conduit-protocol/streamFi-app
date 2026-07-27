'use client';

import React, { useState, useRef, useEffect } from 'react';
import { StrKey } from '@stellar/stellar-sdk';
import { simulateReadOnly } from '@/lib/soroban';
import { normalizeError } from '@/lib/safe-operations';

const VALIDATE_TIMEOUT_MS = 15_000;
const EMPTY_TOKEN = '';

interface Props {
  onTokenSelected?: (token: string) => void;
  onRefreshNeeded?: () => void;
  /** Optional token to pre-fill when the selector mounts. */
  initialToken?: string | null;
  /**
   * Optional Stellar account to use as the source account for an on-chain
   * read-only validation call. Contract IDs are not valid transaction sources,
   * so this must be a G... public key when supplied.
   */
  validationSource?: string | null;
}

function normalizeTokenAddress(value: string): string {
  return value.trim().toUpperCase();
}

function isValidTokenContract(value: string): boolean {
  try {
    return StrKey.isValidContract(value);
  } catch {
    return false;
  }
}

function isValidSourceAccount(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return StrKey.isValidEd25519PublicKey(value);
  } catch {
    return false;
  }
}

export function TokenSelector({
  onTokenSelected,
  onRefreshNeeded,
  initialToken = EMPTY_TOKEN,
  validationSource = null,
}: Props) {
  // Regression guard: this state must be initialized from a defined fallback,
  // not from a same-named/unbound variable. That crash used to happen before
  // the selector had a chance to render any validation UI.
  const [input, setInput] = useState<string>(() => normalizeTokenAddress(initialToken ?? EMPTY_TOKEN));
  const [error, setError] = useState(EMPTY_TOKEN);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const handleSelect = async () => {
    if (loading) return;

    const address = normalizeTokenAddress(input);
    setInput(address);

    if (!address) {
      setError('Token address cannot be empty.');
      return;
    }

    if (!isValidTokenContract(address)) {
      setError('Invalid token contract address. Enter a valid Soroban contract ID starting with C.');
      return;
    }

    setError(EMPTY_TOKEN);

    const hasValidationSource = isValidSourceAccount(validationSource);

    if (validationSource && !hasValidationSource) {
      setError('Cannot validate token: source account must be a valid Stellar public key.');
      return;
    }

    abortRef.current?.abort();

    try {
      if (hasValidationSource) {
        setLoading(true);
        abortRef.current = new AbortController();
        const signal = abortRef.current.signal;

        await simulateReadOnly(validationSource, address, 'decimals', [], {
          signal,
          timeoutMs: VALIDATE_TIMEOUT_MS,
        });
        if (!mounted.current) return;
      }

      onTokenSelected?.(address);
      // Signal parent to invalidate stale Apollo cache (#153)
      onRefreshNeeded?.();
    } catch (err) {
      if (!mounted.current) return;
      const normalized = normalizeError(err);
      if (normalized.code === 'OPERATION_ABORTED') return;
      if (normalized.source === 'rpc' || normalized.message.includes('timeout') || normalized.message.includes('timed out')) {
        setError('Token validation timed out. The RPC provider may be unavailable — please try again.');
      } else {
        setError('The entered address is not a valid token contract, or the network is unavailable.');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <div className="flex flex-col space-y-2">
      <input
        type="text"
        className="border p-2 rounded"
        placeholder="Enter token contract address"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          if (error) setError(EMPTY_TOKEN);
        }}
        disabled={loading}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? 'token-selector-error' : undefined}
      />
      {error && (
        <span id="token-selector-error" className="text-red-500 text-sm" role="alert">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={handleSelect}
        disabled={loading}
        className="bg-black text-white p-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Validating…' : 'Select Token'}
      </button>
    </div>
  );
}
