'use client';

import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { fromStroops } from '@/lib/format';

interface KpiCardsProps {
  /** Value streamed so far (withdrawn + withdrawable), in stroops. */
  totalValueStreamed: bigint;
  /** Combined per-second release rate across active streams, in stroops/s. */
  activeRunRate: bigint;
  /** Number of streams currently in `active` state. */
  activeStreamCount: number;
  /** Deduplicated total across the receiving + sending tabs. */
  totalStreamCount: number;
  /** `false` while the wallet is disconnected — cards show em dashes (#685). */
  connected?: boolean;
  loading?: boolean;
  error?: boolean;
}

/**
 * Summary KPI cards for the dashboard (#685).
 *
 * Surfaces the two headline aggregates treasury managers scan for — total
 * capital streamed and the combined burn rate — as large, dedicated cards
 * above the smaller per-metric stat grid. The run rate is expressed per hour
 * (e.g. `1250.00 / hour`) rather than per second, because per-second rates
 * read as noise at portfolio scale.
 */
export function KpiCards({
  totalValueStreamed,
  activeRunRate,
  activeStreamCount,
  totalStreamCount,
  connected = true,
  loading = false,
  error = false,
}: KpiCardsProps) {
  const { t } = useTranslation('dashboard');

  const placeholder = !connected ? '—' : loading ? '…' : error ? '—' : null;
  const runRatePerHour = activeRunRate * 3600n;

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6"
      data-testid="kpi-cards"
    >
      {/* Total Value Streamed — capital that has already flowed out of every
          known stream (claimed + claimable). */}
      <div className="card" data-testid="kpi-total-value-streamed">
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
          {t('stats.totalValueStreamed')}
        </p>
        <p className="text-3xl font-black font-mono tabular-nums">
          {placeholder ?? fromStroops(totalValueStreamed)}
        </p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
          {placeholder ?? t('kpi.totalStreamedSub', { count: totalStreamCount })}
        </p>
      </div>

      {/* Active Run Rate — combined burn rate across active streams, shown
          per hour so it maps to how treasury operators actually think. */}
      <div className="card" data-testid="kpi-active-run-rate">
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
          {t('stats.activeRunRate')}
        </p>
        <p className="text-3xl font-black font-mono tabular-nums">
          {placeholder ? (
            placeholder
          ) : (
            <>
              {fromStroops(runRatePerHour)}
              <span className="text-base font-semibold text-gray-500 dark:text-gray-400">
                {' '}
                {t('kpi.perHour')}
              </span>
            </>
          )}
        </p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
          {placeholder ??
            (activeStreamCount === 0
              ? t('kpi.noActivity')
              : t('kpi.runRateSub', { count: activeStreamCount }))}
        </p>
      </div>
    </div>
  );
}