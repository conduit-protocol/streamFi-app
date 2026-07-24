'use client';

import React, { useState } from 'react';

interface Props {
  onTokenSelected: (token: string) => void;
}

export function TokenSelector({ onTokenSelected }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSelect = () => {
    // Fix: Add explicit validation to ensure malformed inputs are not bypassed
    if (!input || input.trim() === '') {
      setError('Token address cannot be empty.');
      return;
    }
    
    // Basic Stellar contract ID validation (G... or C...)
    if (!/^[GC][A-Z0-9]{55}$/.test(input.trim())) {
      setError('Invalid token address format.');
      return;
    }

    setError('');
    onTokenSelected(input.trim());
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
      />
      {error && <span className="text-red-500 text-sm">{error}</span>}
      <button 
        onClick={handleSelect}
        className="bg-black text-white p-2 rounded"
      >
        Select Token
      </button>
    </div>
  );
}
