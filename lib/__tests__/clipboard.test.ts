/**
 * Tests for lib/clipboard.ts (#609).
 *
 * Covers the copyToClipboard helper: the async Clipboard API path,
 * the legacy execCommand fallback, and edge cases (no navigator, no
 * document, permission denied).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyToClipboard } from '../clipboard';

describe('copyToClipboard', () => {
  let execCommandSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execCommandSpy = vi.fn().mockReturnValue(true);
    // Mock document.execCommand for the fallback path
    vi.stubGlobal('document', {
      ...document,
      execCommand: execCommandSpy,
      createElement: vi.fn(() => ({
        value: '',
        setAttribute: vi.fn(),
        style: {},
        select: vi.fn(),
        setSelectionRange: vi.fn(),
      })),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const result = await copyToClipboard('hello');

    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns true on successful clipboard API call', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    expect(await copyToClipboard('test')).toBe(true);
  });

  it('falls back to execCommand when clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', {});

    const result = await copyToClipboard('fallback text');

    expect(result).toBe(true);
    expect(execCommandSpy).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand when clipboard API throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const result = await copyToClipboard('denied');

    expect(result).toBe(true);
    expect(execCommandSpy).toHaveBeenCalledWith('copy');
  });

  it('returns false when neither navigator nor document is available', async () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('document', undefined);

    const result = await copyToClipboard('no env');

    expect(result).toBe(false);
  });

  it('returns false when execCommand fails', async () => {
    vi.stubGlobal('navigator', {});
    execCommandSpy.mockReturnValue(false);

    const result = await copyToClipboard('fail');

    expect(result).toBe(false);
  });

  it('creates a hidden textarea with correct styles for fallback', async () => {
    vi.stubGlobal('navigator', {});
    const createElementSpy = vi.fn(() => ({
      value: '',
      setAttribute: vi.fn(),
      style: {} as Record<string, string>,
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    }));
    vi.stubGlobal('document', {
      ...document,
      execCommand: execCommandSpy,
      createElement: createElementSpy,
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });

    await copyToClipboard('styled');

    const textArea = createElementSpy.mock.results[0]!.value;
    expect(textArea.value).toBe('styled');
    expect(textArea.style.position).toBe('fixed');
    expect(textArea.style.opacity).toBe('0');
    expect(textArea.setAttribute).toHaveBeenCalledWith('readonly', '');
  });

  it('cleans up the textarea from the DOM after copy', async () => {
    vi.stubGlobal('navigator', {});
    const removeChildSpy = vi.fn();
    vi.stubGlobal('document', {
      ...document,
      execCommand: execCommandSpy,
      createElement: vi.fn(() => ({
        value: '',
        setAttribute: vi.fn(),
        style: {},
        select: vi.fn(),
        setSelectionRange: vi.fn(),
      })),
      body: { appendChild: vi.fn(), removeChild: removeChildSpy },
    });

    await copyToClipboard('cleanup');

    expect(removeChildSpy).toHaveBeenCalledOnce();
  });
});
