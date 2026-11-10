'use client';

import { useState, useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { LEDGER_WALLET_ID, WEBHID_UNSUPPORTED_MESSAGE, isWebHIDSupported } from '@/lib/ledger-wallet';

/**
 * MultiWalletModal (#737)
 *
 * Multi-wallet connection modal offering Freighter, xBull, Albedo, and
 * WalletConnect v2 options for desktop, mobile, and hardware wallet users,
 * plus Ledger over WebHID (#792) — disabled, with an explanation, in browsers
 * without WebHID support.
 */

type WalletProvider = {
  id: string;
  name: string;
  description: string;
  icon: string;
  url: string;
  /** Needs the WebHID API (Chromium desktop browsers only). */
  requiresWebHID?: boolean;
};

const WALLET_PROVIDERS: WalletProvider[] = [
  {
    id: 'freighter',
    name: 'Freighter',
    description: 'Browser extension wallet',
    icon: '🦊',
    url: 'https://freighter.app',
  },
  {
    id: 'xbull',
    name: 'xBull',
    description: 'Mobile & desktop wallet',
    icon: '🐂',
    url: 'https://xbull.app',
  },
  {
    id: 'albedo',
    name: 'Albedo',
    description: 'Web-based wallet',
    icon: '🌟',
    url: 'https://albedo.link',
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    description: 'Connect via QR code (mobile)',
    icon: '🔗',
    url: 'https://walletconnect.com',
  },
  {
    id: LEDGER_WALLET_ID,
    name: 'Ledger',
    description: 'Hardware wallet via USB (WebHID)',
    icon: '🔐',
    url: 'https://www.ledger.com',
    requiresWebHID: true,
  },
];

interface MultiWalletModalProps {
  open: boolean;
  onClose: () => void;
  onConnect: (providerId: string) => void;
}

export function MultiWalletModal({ open, onClose, onConnect }: MultiWalletModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  // Feature-detect after mount: `navigator` doesn't exist during SSR, and
  // reading it in render would cause a hydration mismatch.
  const [webHIDSupported, setWebHIDSupported] = useState(false);

  useEffect(() => {
    setWebHIDSupported(isWebHIDSupported());
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleConnect = (providerId: string) => {
    setSelected(providerId);
    onConnect(providerId);
  };

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close wallet selection"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/50 cursor-default"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select a wallet"
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold">Connect Wallet</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {WALLET_PROVIDERS.map(provider => {
            const unsupported = provider.requiresWebHID === true && !webHIDSupported;
            const noteId = `wallet-${provider.id}-unsupported`;
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => handleConnect(provider.id)}
                disabled={selected === provider.id || unsupported}
                aria-describedby={unsupported ? noteId : undefined}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-transparent dark:disabled:hover:border-gray-700"
              >
                <span className="text-2xl" aria-hidden="true">{provider.icon}</span>
                <div className="flex-1">
                  <p className="font-medium text-sm">{provider.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{provider.description}</p>
                  {unsupported && (
                    <p id={noteId} className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      {WEBHID_UNSUPPORTED_MESSAGE}
                    </p>
                  )}
                </div>
                {selected === provider.id && (
                  <span className="text-xs text-blue-600 animate-pulse">Connecting…</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800">
          <a
            href="https://stellar.org/wallets"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center gap-1"
          >
            Need a wallet? <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </>
  );
}
