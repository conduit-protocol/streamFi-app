"use client";

/**
 * Lightweight read-only hook that returns the persisted settings values
 * that are needed across pages (timestamp format, auto-refresh interval).
 *
 * Pages that need to *write* settings should use the full SettingsPage state
 * directly.  This hook is intentionally read-only and dependency-free so it
 * can be used in any client component without prop-drilling.
 *
 * Added for issues #556 (timestamp format) and #572 (auto-refresh interval).
 */

import { useEffect, useState } from "react";

export type TimeFormat = "relative" | "absolute";

/** Minimum refresh interval (seconds) — prevents accidental RPC hammering. */
export const MIN_REFRESH_INTERVAL_S = 10;

/** Options surfaced in the Settings UI */
export const REFRESH_INTERVAL_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "10 s", value: 10 },
  { label: "30 s", value: 30 },
  { label: "1 min", value: 60 },
  { label: "5 min", value: 300 },
] as const;

export type RefreshIntervalSeconds = (typeof REFRESH_INTERVAL_OPTIONS)[number]["value"];

export interface PublicSettings {
  timeFormat: TimeFormat;
  /** 0 = disabled */
  autoRefreshInterval: RefreshIntervalSeconds;
  /**
   * When true, advanced/debugging details are surfaced across the app:
   * raw stroop amounts, full contract addresses, and the stream compare
   * view link. Mirrors the `advancedMode` toggle on the settings page
   * (issue #586).
   */
  advancedMode: boolean;
}

const STORAGE_KEY = "conduit:settings";

const DEFAULTS: PublicSettings = {
  timeFormat: "absolute",
  autoRefreshInterval: 0,
  advancedMode: false,
};

function readFromStorage(): PublicSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PublicSettings>;
    return {
      timeFormat: parsed.timeFormat === "relative" ? "relative" : "absolute",
      autoRefreshInterval: REFRESH_INTERVAL_OPTIONS.some(
        (o) => o.value === parsed.autoRefreshInterval,
      )
        ? (parsed.autoRefreshInterval as RefreshIntervalSeconds)
        : 0,
      advancedMode: parsed.advancedMode === true,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Custom event fired on `window` after a same-tab settings write so mounted
 * components re-read without waiting for a cross-tab `storage` event (which
 * by spec never fires in the tab that performed the write). See #586.
 */
export const SETTINGS_UPDATED_EVENT = "conduit:settings-updated";

/** Notify mounted `useSettings` subscribers to re-read from localStorage. */
export function notifySettingsUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
  }
}

/**
 * Returns current public settings, and re-reads them whenever any tab (via
 * the `storage` event) or the settings page in this tab (via
 * {@link notifySettingsUpdated}) writes to localStorage.
 */
export function useSettings(): PublicSettings {
  const [settings, setSettings] = useState<PublicSettings>(readFromStorage);

  useEffect(() => {
    const refresh = () => setSettings(readFromStorage());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SETTINGS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SETTINGS_UPDATED_EVENT, refresh);
    };
  }, []);

  return settings;
}
