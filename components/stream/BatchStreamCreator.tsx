'use client';

import { useState } from 'react';
import { truncateAddress } from '@/lib/format';

interface Recipient {
  address: string;
  ratePerSecond: bigint;
}

export function BatchStreamCreator() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [addressInput, setAddressInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addRecipient = () => {
    if (!addressInput || !rateInput) return;

    if (!/^G[A-Z0-9]{55}$/.test(addressInput.trim())) {
      setError('Invalid Stellar address. Must start with G and be 56 characters.');
      return;
    }

    if (!/^\d+$/.test(rateInput)) {
      setError('Invalid rate input. Must be a positive integer.');
      return;
    }
    try {
      const rate = BigInt(rateInput);
      if (rate <= 0n) {
        setError('Rate must be greater than zero.');
        return;
      }
      setRecipients([...recipients, { address: addressInput.trim(), ratePerSecond: rate }]);
      setAddressInput('');
      setRateInput('');
      setError(null);
    } catch {
      setError('Invalid rate input. Must be an integer.');
    }
  };

  const removeRecipient = (index: number) => {
    setRecipients(recipients.filter((_, i) => i !== index));
  };

  const handleBatchCreate = () => {
    if (recipients.length === 0) return;
    setError('Batch stream creation is not yet available. Please create streams individually.');
  };

  return (
    <div className="card max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Batch Stream Creation</h2>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="border border-gray-200 dark:border-gray-800 rounded p-4 text-sm text-gray-500 dark:text-gray-400 mb-4"
        >
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          className="input flex-1"
          placeholder="Recipient Address (G...)"
          value={addressInput}
          onChange={e => setAddressInput(e.target.value.toUpperCase())}
          maxLength={56}
        />
        <input
          className="input w-32"
          placeholder="Rate (units/sec)"
          value={rateInput}
          onChange={e => setRateInput(e.target.value)}
          type="number"
        />
        <button className="btn btn-secondary" onClick={addRecipient}>Add</button>
      </div>

      <div className="mb-6 space-y-2">
        {recipients.map((rec, i) => (
          <div key={i} className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700">
            <span className="font-mono text-sm">{truncateAddress(rec.address)}</span>
            <div className="flex items-center gap-4">
              <span className="font-mono text-green-600 dark:text-green-400 font-bold">{rec.ratePerSecond.toString()}/s</span>
              <button className="text-red-500 text-sm hover:underline" onClick={() => removeRecipient(i)}>Remove</button>
            </div>
          </div>
        ))}
        {recipients.length === 0 && <p className="text-sm text-gray-500 italic text-center py-4">No recipients added yet.</p>}
      </div>

      <button
        className="btn btn-primary w-full"
        onClick={handleBatchCreate}
        disabled={recipients.length === 0}
      >
        Create {recipients.length} Streams
      </button>
    </div>
  );
}
