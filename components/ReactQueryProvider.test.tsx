import React, { act } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ReactQueryProvider } from './ReactQueryProvider';

/**
 * Test coverage for ReactQueryProvider.tsx (issue #632).
 */

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () =>
    React.createElement('div', { 'data-testid': 'react-query-devtools' }),
}));

function renderInto(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(el);
  });
  return { container, root };
}

function unmount(container: HTMLDivElement, root: Root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

function ClientProbe({ onClient }: { onClient: (client: QueryClient) => void }) {
  const client = useQueryClient();
  onClient(client);
  return React.createElement('div', { 'data-testid': 'probe' }, 'probe');
}

describe('ReactQueryProvider', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('renders its children', () => {
    const { container, root } = renderInto(
      <ReactQueryProvider>
        <div data-testid="child">hello</div>
      </ReactQueryProvider>,
    );
    expect(container.querySelector('[data-testid="child"]')?.textContent).toBe('hello');
    unmount(container, root);
  });

  it('provides a QueryClient to descendants via context', () => {
    let seenClient: QueryClient | undefined;
    const { container, root } = renderInto(
      <ReactQueryProvider>
        <ClientProbe onClient={(c) => { seenClient = c; }} />
      </ReactQueryProvider>,
    );
    expect(seenClient).toBeDefined();
    expect(typeof seenClient?.getQueryData).toBe('function');
    unmount(container, root);
  });

  it('keeps the same QueryClient instance across re-renders (useState initializer, not created fresh each render)', () => {
    const seenClients: QueryClient[] = [];
    const { container, root } = renderInto(
      <ReactQueryProvider>
        <ClientProbe onClient={(c) => seenClients.push(c)} />
      </ReactQueryProvider>,
    );

    act(() => {
      root.render(
        <ReactQueryProvider>
          <ClientProbe onClient={(c) => seenClients.push(c)} />
        </ReactQueryProvider>,
      );
    });

    expect(seenClients).toHaveLength(2);
    expect(seenClients[0]).toBe(seenClients[1]);
    unmount(container, root);
  });

  it('renders the devtools outside of production', () => {
    process.env.NODE_ENV = 'development';
    const { container, root } = renderInto(
      <ReactQueryProvider>
        <div />
      </ReactQueryProvider>,
    );
    expect(container.querySelector('[data-testid="react-query-devtools"]')).not.toBeNull();
    unmount(container, root);
  });

  it('does not render the devtools in production', () => {
    process.env.NODE_ENV = 'production';
    const { container, root } = renderInto(
      <ReactQueryProvider>
        <div />
      </ReactQueryProvider>,
    );
    expect(container.querySelector('[data-testid="react-query-devtools"]')).toBeNull();
    unmount(container, root);
  });
});
