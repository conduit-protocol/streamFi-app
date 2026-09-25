"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, AlertCircle, Columns } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { StreamCard } from "@/components/stream/StreamCard";
import { StreamCardSkeleton } from "@/components/stream/StreamCardSkeleton";
import { streamsBySender, streamsByRecipient } from "@/lib/factory";
import { getStreamAddress, getStreamInfo, type StreamInfo } from '@/lib/stream';
import { readSnapshot, saveSnapshot } from "@/lib/offline-cache";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { deriveStatus, MAX_COMPARE, MIN_COMPARE, type StreamStatus } from "@/lib/stream-compare";
import { sortStreams, isSortKey, SORT_OPTIONS, type SortKey } from "@/lib/stream-sort";
import { tokenByAddress } from "@/lib/tokens";
import { truncateAddress } from "@/lib/format";

type Tab = "receiving" | "sending";

interface StreamRow {
  id: string;
  info: StreamInfo;
  status: StreamStatus;
}

interface LoadRowsResult {
  rows: StreamRow[];
  failedCount: number;
}

async function loadRows(
  publicKey: string,
  role: "sender" | "recipient",
  now: number,
): Promise<LoadRowsResult> {
  // Let initial list-fetch failures propagate so the page can surface a
  // visible error instead of silently rendering an empty state.
  const ids =
    role === "sender"
      ? await streamsBySender(publicKey, publicKey, 0, 100)
      : await streamsByRecipient(publicKey, publicKey, 0, 100);

  if (!ids || !Array.isArray(ids)) return { rows: [], failedCount: 0 };

  const rows: StreamRow[] = [];
  let failedCount = 0;
  for (const id of ids) {
    try {
      const addr = await getStreamAddress(publicKey, id);
      if (!addr) { failedCount++; continue; }
      const info = await getStreamInfo(publicKey, addr);
      rows.push({
        id: id.toString(),
        info,
        status: deriveStatus(info, now),
      });
    } catch {
      failedCount++;
    }
  }
  return { rows, failedCount };
}

// ── Page ──────────────────────────────────────────────────────────────────────

/** Read a validated tab value from the URL, defaulting to "receiving". */
function tabFromParam(value: string | null): Tab {
  return value === "sending" ? "sending" : "receiving";
}

/** Read a validated status value from the URL, defaulting to "ALL". */
function statusFromParam(value: string | null): "ALL" | StreamStatus {
  return value === "active" || value === "paused" || value === "ended" || value === "cancelled"
    ? value
    : "ALL";
}

function StreamsView() {
  const { publicKey, connected } = useWallet();
  // The global NetworkTroubleBanner already covers RPC-down / fetch-failure
  // cases, so suppress this page's own error row when it's showing.
  const { status: networkStatus } = useNetworkStatus();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [receiving, setReceiving] = useState<StreamRow[]>([]);
  const [sending, setSending] = useState<StreamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);

  // Tab, status/token filters, and sort are seeded from the URL on first
  // render so a shared/bookmarked link reproduces the same view (#548), then
  // kept in sync back to the URL as they change.
  const [tab, setTab] = useState<Tab>(() => tabFromParam(searchParams.get("tab")));
  const [statusFilter, setStatusFilter] = useState<"ALL" | StreamStatus>(() =>
    statusFromParam(searchParams.get("status")),
  );
  const [tokenFilter, setTokenFilter] = useState<string>(() => searchParams.get("token") ?? "ALL");
  const [sort, setSort] = useState<SortKey>(() => {
    const s = searchParams.get("sort");
    return isSortKey(s) ? s : "default";
  });
  // Stream ids ticked for the side-by-side /streams/compare view.
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tab !== "receiving") params.set("tab", tab);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (tokenFilter !== "ALL") params.set("token", tokenFilter);
    if (sort !== "default") params.set("sort", sort);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter, tokenFilter, sort, pathname]);

  const toggleSelected = (id: string) =>
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_COMPARE
          ? prev
          : [...prev, id],
    );

  useEffect(() => {
    setSelected([]);
    if (!publicKey) {
      // Wallet disconnected — clear stale stream rows immediately (fixes #81)
      setReceiving([]);
      setSending([]);
      setError(null);
      setPartialError(null);
      return;
    }
    let active = true;

    setLoading(true);
    setError(null);
    setPartialError(null);
    const now = Math.floor(Date.now() / 1000);
    Promise.all([
      loadRows(publicKey, "recipient", now),
      loadRows(publicKey, "sender", now),
    ])
      .then(([recv, sent]) => {
        if (!active) return;
        setReceiving(recv.rows);
        setSending(sent.rows);
        setCachedAt(null);
        void saveSnapshot(`streams:${publicKey}`, { receiving: recv.rows, sending: sent.rows });
        const totalFailed = recv.failedCount + sent.failedCount;
        setPartialError(
          totalFailed > 0
            ? `${totalFailed} stream${totalFailed === 1 ? "" : "s"} couldn\u2019t load`
            : null,
        );
      })
      .catch(async (e) => {
        if (!active) return;
        const snapshot = await readSnapshot<{ receiving: StreamRow[]; sending: StreamRow[] }>(`streams:${publicKey}`);
        if (!active) return;
        if (snapshot) {
          setReceiving(snapshot.value.receiving);
          setSending(snapshot.value.sending);
          setCachedAt(snapshot.savedAt);
          setError(null);
        } else {
          console.error(e); captureError(e, { tags: { source: 'streams-page' } });
          setError(e instanceof Error ? e.message : "Failed to load streams.");
          setReceiving([]);
          setSending([]);
        }
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [publicKey]);

  const baseRows = tab === "receiving" ? receiving : sending;

  // Distinct tokens present in the current tab, for the token filter's options.
  const tokenOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of baseRows) {
      if (!seen.has(row.info.token)) {
        seen.set(
          row.info.token,
          tokenByAddress(row.info.token, "testnet")?.symbol ?? truncateAddress(row.info.token),
        );
      }
    }
    return Array.from(seen, ([address, label]) => ({ address, label }));
  }, [baseRows]);

  const displayed = sortStreams(
    baseRows.filter(
      (row) =>
        (statusFilter === "ALL" || row.status === statusFilter) &&
        (tokenFilter === "ALL" || row.info.token === tokenFilter),
    ),
    sort,
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black tracking-tight">Streams</h1>
        <Link href="/create" className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> New stream
        </Link>
      </div>

      {/* Tabs and Filter */}
      <div className="flex flex-wrap justify-between items-end gap-y-2 border-b border-gray-200 dark:border-gray-800 mb-6">
        <div className="flex gap-1">
          {(["receiving", "sending"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                if (t !== tab) {
                  setSelected([]);
                  setTokenFilter("ALL");
                }
                setTab(t);
              }}
              className={[
                "px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors",
                tab === t
                  ? "border-black text-black dark:border-white dark:text-white"
                  : "border-transparent text-gray-400 hover:text-black dark:hover:text-white",
              ].join(" ")}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="border-gray-300 dark:border-gray-700 border py-1 px-2 text-sm rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
          >
            <option value="ALL">All Streams</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            aria-label="Filter by token"
            value={tokenFilter}
            onChange={(e) => setTokenFilter(e.target.value)}
            className="border-gray-300 dark:border-gray-700 border py-1 px-2 text-sm rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
          >
            <option value="ALL">All Tokens</option>
            {tokenOptions.map((t) => (
              <option key={t.address} value={t.address}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort streams"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="border-gray-300 dark:border-gray-700 border py-1 px-2 text-sm rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Compare selection bar */}
      {selected.length > 0 && (
        <div
          role="region"
          aria-label="Stream comparison selection"
          className="card flex items-center justify-between gap-3 py-3 mb-4 text-sm"
        >
          <span className="text-gray-600 dark:text-gray-400">
            {selected.length} selected
            {selected.length < MIN_COMPARE
              ? ` \u2014 pick at least ${MIN_COMPARE} to compare`
              : selected.length >= MAX_COMPARE
                ? ` (max ${MAX_COMPARE})`
                : ""}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelected([])}
              className="text-xs underline text-gray-400 hover:text-black dark:hover:text-white"
            >
              Clear
            </button>
            {selected.length >= MIN_COMPARE ? (
              <Link
                href={`/streams/compare?ids=${selected.join(",")}`}
                className="btn-primary text-sm"
              >
                <Columns className="w-4 h-4" /> Compare
              </Link>
            ) : (
              <span aria-disabled="true" className="btn-primary text-sm opacity-50 cursor-not-allowed">
                <Columns className="w-4 h-4" /> Compare
              </span>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {cachedAt && (
        <p className="text-xs text-gray-500 mb-4" role="status">
          Showing cached data as of {new Date(cachedAt).toLocaleString()}.
        </p>
      )}
      {error && networkStatus === "ok" && (
        <div
          role="alert"
          aria-live="polite"
          className="border border-gray-200 dark:border-gray-800 rounded p-4 text-sm text-gray-500 dark:text-gray-400 mb-4"
        >
          {error}
        </div>
      )}
      {partialError && !error && networkStatus === "ok" && (
        <div
          role="alert"
          aria-live="polite"
          className="card text-center py-3 mb-6 text-sm text-gray-600 dark:text-gray-400 flex items-center justify-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{partialError} &mdash;</span>
          <button
            onClick={() => {
              setReceiving([]);
              setSending([]);
              setLoading(true);
              setPartialError(null);
              setError(null);
              const now = Math.floor(Date.now() / 1000);
              Promise.all([
                loadRows(publicKey!, "recipient", now),
                loadRows(publicKey!, "sender", now),
              ])
                .then(([recv, sent]) => {
                  setReceiving(recv.rows);
                  setSending(sent.rows);
                  const totalFailed = recv.failedCount + sent.failedCount;
                  setPartialError(
                    totalFailed > 0
                      ? `${totalFailed} stream${totalFailed === 1 ? "" : "s"} couldn\u2019t load`
                      : null,
                  );
                })
                .catch((e) => {
                  console.error(e);
                  setError(e instanceof Error ? e.message : "Failed to load streams.");
                })
                .finally(() => setLoading(false));
            }}
            disabled={loading}
            className="underline font-semibold hover:text-black dark:hover:text-white disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
          >
            {loading ? "Retrying\u2026" : "retry"}
          </button>
        </div>
      )}
      {!connected ? (
        <div className="card text-center py-12 text-sm text-gray-400 dark:text-gray-500">
          Connect your wallet to see your streams.
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <StreamCardSkeleton key={i} />
          ))}
        </div>
      ) : displayed.length === 0 && error && networkStatus === "trouble" ? (
        <div className="card text-center py-12 text-sm text-gray-400 dark:text-gray-500">
          Your streams will appear here once the connection is back.
        </div>
      ) : displayed.length === 0 ? (
        <div className="card text-center py-12 text-sm text-gray-400 dark:text-gray-500">
          No streams match your filter.
          {tab === "sending" && statusFilter === "ALL" && (
            <>
              {" "}
              <Link
                href="/create"
                className="underline hover:text-black dark:hover:text-white"
              >
                Create your first stream
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((row) => {
            const isSelected = selected.includes(row.id);
            return (
            <div key={row.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                disabled={!isSelected && selected.length >= MAX_COMPARE}
                onChange={() => toggleSelected(row.id)}
                aria-label={`Select stream #${row.id} for comparison`}
                className="w-4 h-4 shrink-0 accent-black dark:accent-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              />
              <div className="flex-1 min-w-0">
            <StreamCard
              id={row.id}
              counterparty={
                tab === "receiving" ? row.info.sender : row.info.recipient
              }
              role={tab === "receiving" ? "recipient" : "sender"}
              token={row.info.token}
              ratePerSecond={row.info.ratePerSecond}
              startTime={row.info.startTime}
              endTime={row.info.endTime}
              status={row.status}
              pausedAt={row.info.pausedAt}
            />
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StreamsPage() {
  // useSearchParams() must sit under a Suspense boundary in Next 15, or the
  // whole route bails out of static rendering at build time (see the same
  // pattern in app/streams/compare/page.tsx).
  return (
    <Suspense fallback={null}>
      <StreamsView />
    </Suspense>
  );
}
import { captureError } from "@/lib/error-tracking";
