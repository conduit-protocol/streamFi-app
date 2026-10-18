'use client';

import { useState } from 'react';
import { X, Edit2, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface StreamNoteEditorProps {
  note: string | null;
  isEditing: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onSave: (note: string) => void;
  onClear: () => void;
}

export function StreamNoteEditor({
  note,
  isEditing,
  onStartEditing,
  onStopEditing,
  onSave,
  onClear,
}: StreamNoteEditorProps) {
  const [draftNote, setDraftNote] = useState(note || '');

  const handleEdit = () => {
    onStartEditing();
    setDraftNote(note || '');
  };

  const handleSave = () => {
    onSave(draftNote);
  };

  const handleCancel = () => {
    onStopEditing();
    setDraftNote(note || '');
  };

  if (isEditing) {
    return (
      <div className="space-y-3">
        <textarea
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          placeholder="Add a note or label for this stream..."
          maxLength={200}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          rows={3}
          autoFocus
        />
        <div className="flex gap-2">
          <Button variant="primary" onClick={handleSave} className="flex-1">
            <Check className="w-4 h-4" /> Save
          </Button>
          <Button variant="secondary" onClick={handleCancel} className="flex-1">
            <X className="w-4 h-4" /> Cancel
          </Button>
          {note && (
            <Button
              variant="secondary"
              onClick={onClear}
              className="flex-1"
              title="Clear this note"
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
      <div className="flex-1 min-w-0">
        {note ? (
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
            {note}
          </p>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">No note yet</p>
        )}
      </div>
      <button
        onClick={handleEdit}
        className="shrink-0 p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        title="Edit note"
        aria-label="Edit note"
      >
        <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </button>
    </div>
  );
}
