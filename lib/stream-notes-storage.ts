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
export function getStreamNote(streamAddress: string): string | null {
  const notes = loadStreamNotes();
  return notes[streamAddress] || null;
}

/** Save a note for a specific stream address. */
export function saveStreamNote(streamAddress: string, note: string): void {
  const notes = loadStreamNotes();
  if (note.trim()) {
    notes[streamAddress] = note.trim();
  } else {
    delete notes[streamAddress];
  }
  safeSet(STREAM_NOTES_STORAGE_KEY, JSON.stringify(notes));
}

/** Delete a note for a specific stream address. */
export function deleteStreamNote(streamAddress: string): void {
  const notes = loadStreamNotes();
  delete notes[streamAddress];
  safeSet(STREAM_NOTES_STORAGE_KEY, JSON.stringify(notes));
}
