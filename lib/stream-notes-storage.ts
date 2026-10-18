/**
 * stream-notes-storage — local storage for per-stream user notes/labels.
 *
 * Follows the same pattern as wallet-storage.ts and onboarding-storage.ts:
 * all access goes through safe helpers, never calls clear(), and degrades
 * gracefully to in-memory storage in restricted environments.
 */

const STREAM_NOTES_STORAGE_KEY = 'conduit:stream-notes';

export interface StreamNotesStore {
  [streamAddress: string]: string; // streamAddress -> note text
}

const memoryStore = new Map<string, string>();
const NOTE_KEY = 'conduit:stream-notes-key';

async function getKey(): Promise<CryptoKey> {
  const seed = process.env.NEXT_PUBLIC_STREAM_NOTE_KEY || 'conduit-local-notes';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encrypt(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getKey(), new TextEncoder().encode(value));
  const bytes = new Uint8Array(iv.length + data.byteLength);
  bytes.set(iv); bytes.set(new Uint8Array(data), iv.length);
  return btoa(String.fromCharCode(...bytes));
}

async function decrypt(value: string): Promise<string | null> {
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await getKey(), bytes.slice(12));
    return new TextDecoder().decode(plain);
  } catch { return null; }
}

function safeGet(key: string): string | null {
  if (memoryStore.has(key)) {
    return memoryStore.get(key)!;
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const value = localStorage.getItem(key);
      if (value !== null) return value;
    }
  } catch {
    /* fall through to memory */
  }
  return null;
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    /* fall through to memory */
  }
  memoryStore.set(key, value);
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
  } catch {
    /* fall through to memory */
  }
  memoryStore.delete(key);
}

/** Load all stream notes from storage. */
export function loadStreamNotes(): StreamNotesStore {
  const raw = safeGet(STREAM_NOTES_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<StreamNotesStore>;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as StreamNotesStore;
    }
    return {};
  } catch {
    return {};
  }
}

/** Get a note for a specific stream address. */
export async function getStreamNote(streamAddress: string): Promise<string | null> {
  const notes = loadStreamNotes();
  const value = notes[streamAddress];
  if (!value) return null;
  return (await decrypt(value)) ?? value;
}

/** Save a note for a specific stream address. */
export async function saveStreamNote(streamAddress: string, note: string): Promise<void> {
  const notes = loadStreamNotes();
  if (note.trim()) {
    notes[streamAddress] = note.trim();
  } else {
    delete notes[streamAddress];
  }
  if (notes[streamAddress]) notes[streamAddress] = await encrypt(notes[streamAddress]);
  safeSet(STREAM_NOTES_STORAGE_KEY, JSON.stringify(notes));
}

/** Delete a note for a specific stream address. */
export function deleteStreamNote(streamAddress: string): void {
  const notes = loadStreamNotes();
  delete notes[streamAddress];
  safeSet(STREAM_NOTES_STORAGE_KEY, JSON.stringify(notes));
}

