import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  // Store original navigator.clipboard to restore after tests
  const originalClipboard = globalThis.navigator?.clipboard;

  afterEach(() => {
    // Restore original clipboard after each test
    if (originalClipboard) {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true,
      });
    }
  });

  describe('Clipboard API path (preferred)', () => {
    it('should use navigator.clipboard.writeText when available', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });

      const result = await copyToClipboard('test text');

      expect(result).toBe(true);
      expect(mockWriteText).toHaveBeenCalledWith('test text');
    });

    it('should return true when clipboard write succeeds', async () => {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        writable: true,
        configurable: true,
      });

      const result = await copyToClipboard('success');
      expect(result).toBe(true);
    });

    it('should fall back to execCommand when clipboard write fails', async () => {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) },
        writable: true,
        configurable: true,
      });

      // Mock document.execCommand to return true
      document.execCommand = vi.fn().mockReturnValue(true);

      const result = await copyToClipboard('fallback text');

      expect(result).toBe(true);
      expect(document.execCommand).toHaveBeenCalledWith('copy');
    });
  });

  describe('execCommand fallback path (insecure contexts)', () => {
    beforeEach(() => {
      // Simulate insecure context where navigator.clipboard is undefined
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    it('should use execCommand when navigator.clipboard is unavailable', async () => {
      document.execCommand = vi.fn().mockReturnValue(true);

      const result = await copyToClipboard('fallback');

      expect(result).toBe(true);
      expect(document.execCommand).toHaveBeenCalledWith('copy');
    });

    it('should create and remove temporary textarea', async () => {
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      const removeChildSpy = vi.spyOn(document.body, 'removeChild');
      document.execCommand = vi.fn().mockReturnValue(true);

      await copyToClipboard('textarea test');

      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();

      const textareaCall = appendChildSpy.mock.calls[0][0] as HTMLTextAreaElement;
      expect(textareaCall.tagName).toBe('TEXTAREA');
      expect(textareaCall.value).toBe('textarea test');
    });

    it('should set textarea attributes correctly', async () => {
      let capturedTextarea: HTMLTextAreaElement | null = null;
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        capturedTextarea = node as HTMLTextAreaElement;
        return node;
      });
      document.execCommand = vi.fn().mockReturnValue(true);

      await copyToClipboard('test');

      expect(capturedTextarea).not.toBeNull();
      expect(capturedTextarea!.hasAttribute('readonly')).toBe(true);
      expect(capturedTextarea!.style.position).toBe('fixed');
      expect(capturedTextarea!.style.opacity).toBe('0');
    });

    it('should return false when execCommand fails', async () => {
      document.execCommand = vi.fn().mockReturnValue(false);

      const result = await copyToClipboard('fail test');

      expect(result).toBe(false);
    });

    it('should return false when execCommand throws', async () => {
      document.execCommand = vi.fn().mockImplementation(() => {
        throw new Error('execCommand not supported');
      });

      const result = await copyToClipboard('exception test');

      expect(result).toBe(false);
    });

    it('should clean up textarea even when execCommand throws', async () => {
      const removeChildSpy = vi.spyOn(document.body, 'removeChild');
      document.execCommand = vi.fn().mockImplementation(() => {
        throw new Error('error');
      });

      await copyToClipboard('cleanup test');

      expect(removeChildSpy).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should return false when document is undefined', async () => {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      // Temporarily make document undefined
      const originalDocument = globalThis.document;
      // @ts-expect-error Testing edge case
      globalThis.document = undefined;

      const result = await copyToClipboard('no document');

      expect(result).toBe(false);

      // Restore document
      globalThis.document = originalDocument;
    });

    it('should handle empty strings', async () => {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        writable: true,
        configurable: true,
      });

      const result = await copyToClipboard('');
      expect(result).toBe(true);
    });

    it('should handle special characters', async () => {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        writable: true,
        configurable: true,
      });

      const specialText = 'Test\nwith\tspecial\rchars: 你好 🚀';
      const result = await copyToClipboard(specialText);
      expect(result).toBe(true);
    });
  });
});
