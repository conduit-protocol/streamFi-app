'use client';

import { useEffect, useState } from 'react';
import { getStreamNote, saveStreamNote } from '@/lib/stream-notes-storage';

export interface UseStreamNoteReturn {
  note: string | null;
  isEditing: boolean;
  startEditing: () => void;
  stopEditing: () => void;
  updateNote: (newNote: string) => void;
  clearNote: () => void;
}

/** Hook for managing a stream's local note. */
export function useStreamNote(streamAddress: string): UseStreamNoteReturn {
  const [note, setNote] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Load note from storage on mount
  useEffect(() => {
    void getStreamNote(streamAddress).then(setNote);
  }, [streamAddress]);

  const updateNote = (newNote: string) => {
    void saveStreamNote(streamAddress, newNote);
    setNote(newNote.trim() || null);
    setIsEditing(false);
  };

  const clearNote = () => {
    void saveStreamNote(streamAddress, '');
    setNote(null);
    setIsEditing(false);
  };

  return {
    note,
    isEditing,
    startEditing: () => setIsEditing(true),
    stopEditing: () => setIsEditing(false),
    updateNote,
    clearNote,
  };
}

