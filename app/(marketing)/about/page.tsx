import Link from 'next/link';

export const metadata = {
  title: 'About — Conduit',
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16">

      <h1 className="text-4xl font-black tracking-tight mb-6">About Conduit</h1>

      <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
        Conduit is an open-source protocol for continuous token streaming on the Stellar network.
        Instead of lump-sum transfers, Conduit releases tokens every second — enforced on-chain
        by deployed Soroban contracts with no trusted intermediary.
      </p>

      <h2 className="text-lg font-black mb-3">How it works</h2>
      <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-8">
        <li>A sender deposits tokens and sets a release rate (stroops per second).</li>
        <li>The factory deploys a new <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">DripStream</code> contract holding those tokens.</li>
        <li>Time passes. The recipient&apos;s withdrawable balance grows every second.</li>
        <li>The recipient calls <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">withdraw()</code> whenever they want.</li>
        <li>The sender can pause, resume, or cancel at any time — settlement is always atomic.</li>
      </ol>

      <h2 className="text-lg font-black mb-3">Contracts</h2>
      <div className="space-y-3 mb-8">
        {[
          {
            name: 'DripStream',
            desc: 'One per stream. Holds the token balance. Enforces the release schedule. Self-contained.',
          },
          {
            name: 'DripFactory',
            desc: 'Singleton entry point. Deploys DripStream contracts, assigns IDs, maintains the global index.',
          },
          {
            name: 'DripGovernor',
            desc: 'Protocol configuration. Holds fee rates and minimum durations. Controlled by a multisig authority.',
          },
        ].map(c => (
          <div key={c.name} className="card">
            <p className="font-mono font-bold text-sm mb-1">{c.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.desc}</p>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-black mb-3">Status</h2>
      <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400 mb-8">
        {([
          ['DripStream contract',   '✓ Testnet'],
          ['DripFactory contract',  '✓ Testnet'],
          ['DripGovernor contract', '○ In progress'],
          ['conduit-sdk',           '✓ v0.1'],
          ['conduit-app',           '○ Beta'],
          ['Mainnet deployment',    '○ Planned Q3 2026'],
          ['Security audit',        '○ Not started'],
        ] as const).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 py-1.5">
            <span>{label}</span>
            <span className={value.startsWith('✓') ? 'font-semibold' : 'text-gray-400 dark:text-gray-500'}>{value}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Link href="/create" className="btn-primary">Create a stream</Link>
        <a
          href="https://github.com/conduit-protocol"
          className="btn-secondary"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
    </div>
  );
}
