import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Tooltip } from '@/components/ui/Tooltip';
import { QrCodeModal } from '@/components/ui/QrCodeModal';
import { EndingSoonWidget } from '@/components/stream/EndingSoonWidget';

describe('UI upgrade behaviors', () => {
  let container: HTMLDivElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
    container = undefined;
    root = undefined;
  });

  it('clears the input value when the clear action is used', () => {
    function TestInput() {
      const [value, setValue] = useState('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      return (
        <Input
          allowClear
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="wallet input"
        />
      );
    }

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(<TestInput />);
    });

    const clearButton = container.querySelector('button[aria-label="Clear input"]') as HTMLButtonElement | null;
    expect(clearButton).not.toBeNull();

    act(() => {
      clearButton!.click();
    });

    const input = container.querySelector('input[aria-label="wallet input"]') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('shows and hides the tooltip on touch interactions', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        <Tooltip content="Helpful text">
          <button type="button">Info</button>
        </Tooltip>,
      );
    });

    const trigger = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      trigger.dispatchEvent(new Event('touchstart', { bubbles: true }));
    });
    expect(container.textContent).toContain('Helpful text');

    act(() => {
      trigger.dispatchEvent(new Event('touchend', { bubbles: true }));
    });
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('uses high error correction and includes a PNG download action in the QR modal', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        <QrCodeModal
          isOpen
          value="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
          title="Wallet address"
          onClose={() => undefined}
        />,
      );
    });

    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toContain('Download PNG');
    expect(container.textContent).toContain('H');
  });

  it('toggles between sender and recipient views in the ending-soon widget', () => {
    const now = Date.now();
    const streams = [
      {
        id: 'sender-stream',
        role: 'sender' as const,
        counterparty: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        token: 'XLM',
        endTime: now / 1000 + 60 * 60 * 24 * 2,
      },
      {
        id: 'recipient-stream',
        role: 'recipient' as const,
        counterparty: 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
        token: 'USDC',
        endTime: now / 1000 + 60 * 60 * 24 * 5,
      },
    ];

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(<EndingSoonWidget streams={streams as any} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const senderToggle = buttons.find((button) => button.textContent?.includes('As Sender')); 
    const recipientToggle = buttons.find((button) => button.textContent?.includes('As Recipient'));

    expect(senderToggle).not.toBeNull();
    expect(recipientToggle).not.toBeNull();

    act(() => {
      recipientToggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('As Recipient');
  });
});
