'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'streamfi:address-book';

export interface AddressBookEntry {
  address: string;
  nickname: string;
  updatedAt: number;
}

function readBook(): Record<string, AddressBookEntry> {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeBook(book: Record<string, AddressBookEntry>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
  } catch { /* storage is optional */ }
}

/**
 * LocalStorage-backed address book for assigning friendly nicknames to
 * Stellar addresses (#729). Stored per-browser — nothing leaves the device.
 */
export function useAddressBook() {
  const [book, setBook] = useState<Record<string, AddressBookEntry>>({});

  useEffect(() => {
    setBook(readBook());
  }, []);

  const setNickname = useCallback((address: string, nickname: string) => {
    setBook((prev) => {
      const next = { ...prev };
      const trimmed = nickname.trim();
      if (!trimmed) {
        delete next[address];
      } else {
        next[address] = { address, nickname: trimmed, updatedAt: Date.now() };
      }
      writeBook(next);
      return next;
    });
  }, []);

  const removeNickname = useCallback((address: string) => {
    setNickname(address, '');
  }, [setNickname]);

  /** Return the nickname for an address, or null if none is set. */
  const getNickname = useCallback(
    (address: string): string | null => book[address]?.nickname ?? null,
    [book],
  );

  /** Return the address with its nickname if set, otherwise the raw address. */
  const displayName = useCallback(
    (address: string): string => book[address]?.nickname ?? address,
    [book],
  );

  return { book, setNickname, removeNickname, getNickname, displayName };
}
