'use client';

import React, { useState, useRef, useEffect } from 'react';
import { simulateReadOnly } from '@/lib/soroban';
import { normalizeError } from '@/lib/safe-operations';

const VALIDATE_TIMEOUT_MS = 15_000;

interface Props {
  onTokenSelected: (token: string) => void;
  onRefreshNeeded?: () => void;
}

export function TokenSelector({ onTokenSelected, onRefreshNeeded }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
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

    if (!input || input.trim() === '') {
      setError('Token address cannot be empty.');
      return;
    }

    if (!/^[GC][A-Z0-9]{55}$/.test(input.trim())) {
      setError('Invalid token address format.');
      return;
    }

    const address = input.trim();
    setError('');
    setLoading(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      await simulateReadOnly(address, address, 'decimals', [], { signal, timeoutMs: VALIDATE_TIMEOUT_MS });
      if (!mounted.current) return;
      onTokenSelected(address);
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
        placeholder="Enter token address"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          if (error) setError('');
        }}
        disabled={loading}
      />
      {error && <span className="text-red-500 text-sm">{error}</span>}
      <button
        onClick={handleSelect}
        disabled={loading}
        className="bg-black text-white p-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Validating…' : 'Select Token'}
      </button>
    </div>
  );
}
