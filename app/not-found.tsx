import Link from 'next/link';

export interface FeaturedStreamPreview {
  id: string;
  title: string;
  token: string;
  rate: string;
  recipient: string;
}

/**
 * Featured public active streams displayed on the 404 page to re-engage visitors (#815).
 */
export const FEATURED_PUBLIC_STREAMS: readonly FeaturedStreamPreview[] = [
  {
    id: '1',
    title: 'Core Protocol Grant',
    token: 'XLM',
    rate: '1,000 XLM / day',
    recipient: 'GCA7...4X2Q',
  },
  {
    id: '2',
    title: 'Ecosystem Vesting Pool',
    token: 'USDC',
    rate: '500 USDC / day',
    recipient: 'GD5K...9M1P',
  },
  {
    id: '5',
    title: 'Contributor Payroll',
    token: 'XLM',
    rate: '500 XLM / day',
    recipient: 'GB8R...7L3N',
  },
];

export default function NotFound() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-24 flex flex-col items-center text-center gap-6">
      <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
        404
      </p>
      <h1 className="text-4xl font-black tracking-tight text-black dark:text-white">
        Page not found
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
        The link you followed doesn&apos;t exist or the stream ID may be
        incorrect. Double-check the URL and try again.
      </p>
      {/* Search stream by ID directly from 404 page (#759) */}
      <form
        action="/dashboard"
        method="GET"
        className="flex items-center gap-2 w-full max-w-sm"
      >
        <input
          type="text"
          name="streamId"
          placeholder="Search stream address or ID..."
          className="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          aria-label="Search stream ID"
        />
        <button type="submit" className="btn-secondary text-sm px-4 py-2">
          Find
        </button>
      </form>
      <Link href="/dashboard" className="btn-primary text-sm">
        Back to Dashboard
      </Link>

      {/* Trending active streams 3-item preview grid (#815) */}
      <section
        aria-labelledby="trending-streams-heading"
        data-testid="trending-streams-section"
        className="w-full max-w-3xl mt-8 pt-8 border-t border-gray-200 dark:border-gray-800 text-left"
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            id="trending-streams-heading"
            className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500"
          >
            Trending Active Streams
          </h2>
          <Link
            href="/streams"
            className="text-xs text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            View all streams →
          </Link>
        </div>
        <div
          data-testid="trending-streams-grid"
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          {FEATURED_PUBLIC_STREAMS.map((stream) => (
            <Link
              key={stream.id}
              href={`/stream/${stream.id}`}
              data-testid={`featured-stream-${stream.id}`}
              className="card flex flex-col justify-between gap-3 hover:border-black dark:hover:border-white transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-xs text-gray-400 dark:text-gray-500">
                    #{stream.id}
                  </span>
                  <span className="badge-active">Active</span>
                </div>
                <h3 className="font-semibold text-sm text-black dark:text-white">
                  {stream.title}
                </h3>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p className="amount font-medium text-black dark:text-white">
                  {stream.rate}
                </p>
                <p className="font-mono truncate">To: {stream.recipient}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
