import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/lib/soroban', () => ({
  simulateReadOnly: vi.fn(),
}));

import { simulateReadOnly } from '@/lib/soroban';
import { TokenSelector } from '../TokenSelector';

const VALID_CONTRACT = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';
const VALID_SOURCE = 'GABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEJXA';

const mockSimulateReadOnly = vi.mocked(simulateReadOnly);

describe('TokenSelector', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockSimulateReadOnly.mockResolvedValue({} as Awaited<ReturnType<typeof simulateReadOnly>>);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  function input(): HTMLInputElement {
    const node = container.querySelector('input');
    if (!(node instanceof HTMLInputElement)) throw new Error('input not found');
    return node;
  }

  function button(): HTMLButtonElement {
    const node = container.querySelector('button');
    if (!(node instanceof HTMLButtonElement)) throw new Error('button not found');
    return node;
  }

  it('renders with defined default state even when optional props are omitted', () => {
    expect(() => {
      act(() => {
        root.render(React.createElement(TokenSelector));
      });
    }).not.toThrow();

    expect(input().value).toBe('');
    expect(container.textContent).toContain('Select Token');
  });

  it('shows a validation message instead of crashing for an invalid token address', async () => {
    act(() => {
      root.render(React.createElement(TokenSelector, { onTokenSelected: vi.fn(), initialToken: 'not-a-contract' }));
    });

    await act(async () => {
      button().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Invalid token contract address');
    expect(mockSimulateReadOnly).not.toHaveBeenCalled();
  });

  it('selects a valid contract without attempting RPC validation when no source account is supplied', async () => {
    const onTokenSelected = vi.fn();
    const onRefreshNeeded = vi.fn();

    act(() => {
      root.render(
        React.createElement(TokenSelector, {
          onTokenSelected,
          onRefreshNeeded,
          initialToken: `  ${VALID_CONTRACT.toLowerCase()}  `,
        }),
      );
    });

    await act(async () => {
      button().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onTokenSelected).toHaveBeenCalledWith(VALID_CONTRACT);
    expect(onRefreshNeeded).toHaveBeenCalledOnce();
    expect(mockSimulateReadOnly).not.toHaveBeenCalled();
  });

  it('uses a valid source account for optional on-chain decimals validation', async () => {
    const onTokenSelected = vi.fn();

    act(() => {
      root.render(
        React.createElement(TokenSelector, {
          onTokenSelected,
          validationSource: VALID_SOURCE,
          initialToken: VALID_CONTRACT,
        }),
      );
    });

    await act(async () => {
      button().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockSimulateReadOnly).toHaveBeenCalledWith(
      VALID_SOURCE,
      VALID_CONTRACT,
      'decimals',
      [],
      expect.objectContaining({ timeoutMs: 15_000 }),
    );
    expect(onTokenSelected).toHaveBeenCalledWith(VALID_CONTRACT);
  });
});
