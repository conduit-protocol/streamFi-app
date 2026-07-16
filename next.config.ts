import type { NextConfig } from 'next';

// Soroban RPC / Horizon endpoints this app talks to directly from the
// browser. NEXT_PUBLIC_SOROBAN_RPC_URL / NEXT_PUBLIC_HORIZON_URL are
// env-configurable (self-hosted RPC is supported), so a static CSP can't
// perfectly enumerate every possible deployment — this covers the public
// Stellar-operated testnet/mainnet endpoints used by default. Self-hosted
// RPC operators must add their own origin here.
const CONNECT_SRC = [
  "'self'",
  'https://soroban-testnet.stellar.org',
  'https://soroban-mainnet.stellar.org',
  'https://horizon-testnet.stellar.org',
  'https://horizon.stellar.org',
].join(' ');

const CSP = [
  "default-src 'self'",
  // Next.js's own inlined bootstrap/hydration scripts require 'unsafe-inline';
  // a nonce-based CSP would remove this but needs middleware wiring, out of
  // scope for this pass — tracked as a follow-up, not a currently-exploited gap.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Required for @stellar/stellar-sdk in Edge / Node environments
  serverExternalPackages: ['@stellar/stellar-sdk'],

  // Expose only public vars to the browser
  env: {
    NEXT_PUBLIC_SOROBAN_RPC_URL:      process.env.NEXT_PUBLIC_SOROBAN_RPC_URL      ?? '',
    NEXT_PUBLIC_NETWORK_PASSPHRASE:   process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE   ?? '',
    NEXT_PUBLIC_FACTORY_CONTRACT_ID:  process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID  ?? '',
    NEXT_PUBLIC_GOVERNOR_CONTRACT_ID: process.env.NEXT_PUBLIC_GOVERNOR_CONTRACT_ID ?? '',
    NEXT_PUBLIC_HORIZON_URL:          process.env.NEXT_PUBLIC_HORIZON_URL          ?? '',
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          // Clickjacking protection — meaningful here since this is a
          // payments UI (stream creation/withdrawal), not just marketing pages.
          { key: 'X-Frame-Options',         value: 'DENY' },
          { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
