'use client';

import React, { useState, useRef } from 'react';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { truncateAddress } from '@/lib/format';

interface Recipient {
  address: string;
  ratePerSecond: bigint;
}

export function BatchStreamCreator() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [addressInput, setAddressInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const isSubmittingRef = useRef(false);

  const addRecipient = () => {
    if (!addressInput || !rateInput) return;
    if (!/^\d+$/.test(rateInput)) {
      alert("Invalid rate input. Must be a positive integer.");
      return;
    }
    try {
      const rate = BigInt(rateInput);
      setRecipients([...recipients, { address: addressInput, ratePerSecond: rate }]);
      setAddressInput('');
      setRateInput('');
    } catch (e) {
      alert("Invalid rate input. Must be an integer.");
    }
  };

  const removeRecipient = (index: number) => {
    setRecipients(recipients.filter((_, i) => i !== index));
  };

  const handleBatchCreate = async () => {
    if (recipients.length === 0 || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      // Simulate interaction with SDK ConduitBatcher
      await new Promise(resolve => setTimeout(resolve, 2000));
      setSuccess(true);
      setRecipients([]);
    } catch (error) {
      console.error("Batch creation failed", error);
      alert("Failed to submit batch transaction.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="card text-center py-8">
        <h3 className="text-xl font-bold text-green-600 mb-2">Batch Stream Created!</h3>
        <p className="text-gray-500">Your transaction was successful.</p>
        <button className="btn btn-primary mt-4" onClick={() => setSuccess(false)}>
          Create Another Batch
        </button>
      </div>
    );
  }

  return (
    <div className="card max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Batch Stream Creation</h2>
      
      <div className="flex gap-2 mb-4">
        <input 
          className="input flex-1" 
          placeholder="Recipient Address (G...)" 
          value={addressInput} 
          onChange={e => setAddressInput(e.target.value)} 
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
        disabled={recipients.length === 0 || isSubmitting}
      >
        {isSubmitting ? 'Submitting...' : `Create ${recipients.length} Streams`}
      </button>
    </div>
  );
}
