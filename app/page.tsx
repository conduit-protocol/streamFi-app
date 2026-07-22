import Link from 'next/link';
import { ArrowRight, Zap, Shield, Clock } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-20">

      {/* Hero */}
      <div className="mb-16">
        <h1 className="text-5xl font-black tracking-tight leading-tight mb-4">
          Payments that flow<br />every second.
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400 mb-8 max-w-xl">
          Conduit lets you stream any Stellar asset to any address — continuously,
          per-second, on-chain. No batches. No invoices. No waiting.
        </p>
        <div className="flex items-center gap-3">
          <Link href="/create" className="btn-primary">
            Create a stream <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/streams" className="btn-secondary">
            View streams
          </Link>
        </div>
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
        {[
          {
            icon: <Zap className="w-5 h-5" />,
            title: 'Per-second precision',
            body:  'Rate is set in stroops per second. Recipients earn continuously and withdraw any time.',
          },
          {
            icon: <Shield className="w-5 h-5" />,
            title: 'Non-custodial',
            body:  'Tokens are held in a deployed Soroban contract — not a wallet, not an exchange.',
          },
          {
            icon: <Clock className="w-5 h-5" />,
            title: 'Flexible controls',
            body:  'Pause, resume, top-up, or cancel. Clawback for unvested tokens is opt-in at creation.',
          },
        ].map(f => (
          <div key={f.title} className="card">
            <div className="mb-3 text-black dark:text-white">{f.icon}</div>
            <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>

      {/* Use cases */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-12">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-6">Use cases</h2>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          {[
            'Payroll — employees earn as they work',
            'Grants — milestone-free funding over a vesting window',
            'Subscriptions — pay per second of access, cancel any time',
            'Token vesting — schedules enforced on-chain',
            'DAO contributor pay — transparent, verifiable salary streams',
          ].map(u => (
            <li key={u} className="flex items-start gap-2">
              <span className="mt-0.5 text-gray-300 dark:text-gray-600">—</span>
              <span>{u}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Audit notice */}
      <div className="mt-16 border border-gray-200 dark:border-gray-800 rounded p-4 text-xs text-gray-500 dark:text-gray-400">
        <strong className="text-black dark:text-white">⚠ Not audited.</strong>{' '}
        Conduit contracts have not been audited. Do not use on Stellar Mainnet with real funds until
        an audit is complete. See{' '}
        <a
          href="https://github.com/conduit-protocol/conduit-contracts/blob/main/docs/security.md"
          className="underline hover:text-black dark:hover:text-white"
          target="_blank"
          rel="noreferrer"
        >
          security.md
        </a>{' '}
        for the threat model.
      </div>
    </div>
  );
}
