import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadStreamNotes,
  getStreamNote,
  saveStreamNote,
  deleteStreamNote,
} from './stream-notes-storage';

describe('stream-notes-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and gets a stream note', () => {
    const address = 'addr1';
    saveStreamNote(address, 'My Note');
    expect(getStreamNote(address)).toBe('My Note');
    
    const allNotes = loadStreamNotes();
    expect(allNotes[address]).toBe('My Note');
  });

  it('deletes a stream note', () => {
    const address = 'addr2';
    saveStreamNote(address, 'To be deleted');
    deleteStreamNote(address);
    expect(getStreamNote(address)).toBeNull();
  });

  it('gracefully handles empty notes', () => {
    const address = 'addr3';
    expect(getStreamNote(address)).toBeNull();
  });

  it('trims whitespace and removes note if empty', () => {
    const address = 'addr4';
    saveStreamNote(address, '   ');
    expect(getStreamNote(address)).toBeNull();

    saveStreamNote(address, '  Note  ');
    expect(getStreamNote(address)).toBe('Note');
  });
});
