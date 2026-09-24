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
      <Link href="/dashboard" className="btn-primary text-sm">
        Back to Dashboard
      </Link>
    </div>
  );
}
