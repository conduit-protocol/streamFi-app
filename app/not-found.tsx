import Link from 'next/link';

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
    </div>
  );
}
