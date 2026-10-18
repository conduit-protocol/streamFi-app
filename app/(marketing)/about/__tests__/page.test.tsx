import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import AboutPage from '../page';
import { PROTOCOL_CONTRACTS } from '@/lib/protocol-contracts';

describe('AboutPage', () => {
  it('renders all protocol contracts including BatchTransferProcessor, Oracle, and TokenVault', () => {
    const html = renderToString(React.createElement(AboutPage));

    for (const contract of PROTOCOL_CONTRACTS) {
      expect(html).toContain(contract.name);
      expect(html).toContain(contract.desc);
    }

    expect(html).toContain('BatchTransferProcessor');
    expect(html).toContain('Oracle');
    expect(html).toContain('TokenVault');
  });
});
