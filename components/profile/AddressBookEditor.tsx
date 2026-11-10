'use client';

import { useState } from 'react';
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import { useAddressBook } from '@/hooks/useAddressBook';
import { truncateAddress } from '@/lib/format';

/**
 * Address book editor for the profile page (#729).
 * Lets users assign, edit, and remove friendly nicknames for Stellar addresses.
 */
export function AddressBookEditor() {
  const { book, setNickname, removeNickname } = useAddressBook();
  const [newAddress, setNewAddress] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const entries = Object.values(book).sort((a, b) => a.nickname.localeCompare(b.nickname));

  function handleAdd() {
    const addr = newAddress.trim();
    const nick = newNickname.trim();
    if (!addr || !nick) {
      setError('Both address and nickname are required.');
      return;
    }
    if (addr.length !== 56) {
      setError('Address must be a 56-character Stellar address.');
      return;
    }
    setNickname(addr, nick);
    setNewAddress('');
    setNewNickname('');
    setError(null);
  }

  function startEdit(address: string, current: string) {
    setEditingAddress(address);
    setEditValue(current);
  }

  function saveEdit() {
    if (editingAddress && editValue.trim()) {
      setNickname(editingAddress, editValue.trim());
    }
    setEditingAddress(null);
    setEditValue('');
  }

  return (
    <div className="card mb-6">
      <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
        Address Book
      </h2>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
        Assign friendly names to recipient addresses. Stored locally in your browser.
      </p>

      {/* Add new entry */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          placeholder="G… address (56 chars)"
          value={newAddress}
          onChange={(e) => { setNewAddress(e.target.value); setError(null); }}
          className="input font-mono text-xs flex-1"
          maxLength={56}
        />
        <input
          type="text"
          placeholder="Nickname (e.g. Alice — DevOps)"
          value={newNickname}
          onChange={(e) => { setNewNickname(e.target.value); setError(null); }}
          className="input text-xs flex-1"
          maxLength={50}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="btn-primary text-xs inline-flex items-center gap-1 shrink-0"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {/* Entries list */}
      {entries.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
          No nicknames saved yet. Add one above to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.address}
              className="flex items-center gap-2 rounded border border-gray-100 dark:border-gray-800 px-3 py-2"
            >
              {editingAddress === entry.address ? (
                <>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="input text-xs flex-1"
                    maxLength={50}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="text-green-600 hover:text-green-700"
                    aria-label="Save nickname"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAddress(null)}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Cancel edit"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-black dark:text-white truncate">
                      {entry.nickname}
                    </p>
                    <p className="text-xs font-mono text-gray-400 dark:text-gray-500 truncate">
                      {truncateAddress(entry.address)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(entry.address, entry.nickname)}
                    className="text-gray-400 hover:text-black dark:hover:text-white"
                    aria-label={`Edit nickname for ${entry.nickname}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeNickname(entry.address)}
                    className="text-gray-400 hover:text-red-600"
                    aria-label={`Remove nickname for ${entry.nickname}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
