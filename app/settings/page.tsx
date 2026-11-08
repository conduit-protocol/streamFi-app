"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import { NetworkName, NETWORKS } from "@/lib/network-config";
import { saveSelectedNetwork } from "@/lib/network-storage";
import { useOnboarding } from "@/hooks/useOnboarding";
import {
  clearCustomRpcUrl,
  getCustomRpcUrl,
  isValidRpcUrl,
  pingRpcEndpoint,
  saveCustomRpcUrl,
  type RpcPingResult,
} from "@/lib/custom-rpc";
import { resetServer } from "@/lib/soroban";
import {
  type TimeFormat,
  type RefreshIntervalSeconds,
  REFRESH_INTERVAL_OPTIONS,
  notifySettingsUpdated,
} from "@/hooks/useSettings";
import { DeveloperPayloadInspector } from "@/components/DeveloperPayloadInspector";
import {
  type NotificationChannelConfig,
  type NotificationMatrix,
  type NotificationChannel,
  type NotificationEventKey,
  DEFAULT_NOTIFICATION_CHANNELS,
  DEFAULT_NOTIFICATION_MATRIX,
  NOTIFICATION_EVENT_LABELS,
  isNotificationSupported,
  requestNotificationPermission,
} from "@/lib/notifications";

interface SettingsState {
  network: NetworkName;

  notificationsEnabled: boolean;
  notificationChannels: NotificationChannelConfig;
  notificationMatrix: NotificationMatrix;
  /** Developer mode reveals raw contract storage keys and XDR payloads in confirmation dialogs (#787). */
  developerMode: boolean;
  /** Display timestamps as relative ("2h ago") or absolute date-time. Added #556. */
  timeFormat: TimeFormat;
  /**
   * Auto-refresh stream data every N seconds (0 = disabled).
   * Minimum enforced value is 10 s to avoid hammering the RPC endpoint. Added #572.
   */
  autoRefreshInterval: RefreshIntervalSeconds;
  /** Local currency for fiat display. Added #731. */
  currency: 'USD' | 'EUR' | 'GBP';
}

const STORAGE_KEY = "conduit:settings";

function loadSettings(): SettingsState {
  if (typeof window === "undefined") {
    return {
      network: "testnet" as NetworkName,

      notificationsEnabled: true,
      notificationChannels: DEFAULT_NOTIFICATION_CHANNELS,
      notificationMatrix: DEFAULT_NOTIFICATION_MATRIX,
      developerMode: false,
      timeFormat: "absolute",
      autoRefreshInterval: 0,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SettingsState>;
      return {
        network: parsed.network ?? ("testnet" as NetworkName),

        notificationsEnabled: parsed.notificationsEnabled ?? true,
        notificationChannels: parsed.notificationChannels ?? DEFAULT_NOTIFICATION_CHANNELS,
        notificationMatrix: parsed.notificationMatrix ?? DEFAULT_NOTIFICATION_MATRIX,
        developerMode: parsed.developerMode === true,
        timeFormat: parsed.timeFormat === "relative" ? "relative" : "absolute",
        autoRefreshInterval: REFRESH_INTERVAL_OPTIONS.some(
          (o) => o.value === parsed.autoRefreshInterval,
        )
          ? (parsed.autoRefreshInterval as RefreshIntervalSeconds)
          : 0,
        currency: parsed.currency === "EUR" ? "EUR" : parsed.currency === "GBP" ? "GBP" : "USD",
      };
    }
  } catch {
    // Ignore parse errors, use defaults
  }
  return {
    network: "testnet" as NetworkName,

    notificationsEnabled: true,
    notificationChannels: DEFAULT_NOTIFICATION_CHANNELS,
    notificationMatrix: DEFAULT_NOTIFICATION_MATRIX,
    developerMode: false,
    timeFormat: "absolute",
    autoRefreshInterval: 0,
    currency: "USD",
  };
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { reset: resetOnboarding } = useOnboarding();
  const [settings, setSettings] = useState<SettingsState>(loadSettings);
  const [saved, setSaved] = useState(false);
  const didMount = useRef(false);

  // #691 — custom RPC endpoint override (local sandbox / private node).
  const [customRpc, setCustomRpc] = useState("");
  const [savedCustomRpc, setSavedCustomRpc] = useState<string | null>(null);
  const [ping, setPing] = useState<RpcPingResult | null>(null);
  const [pinging, setPinging] = useState(false);
  const [rpcMessage, setRpcMessage] = useState<string | null>(null);

  useEffect(() => {
    setSavedCustomRpc(getCustomRpcUrl());
    setCustomRpc(getCustomRpcUrl() ?? "");
  }, []);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      // Wake up mounted useSettings() subscribers in this tab — the
      // `storage` event only fires in *other* tabs (#586).
      notifySettingsUpdated();
    } catch {
      // Storage can be unavailable in private browsing or embedded webviews.
    }

    // Mirror the selected network into its own key so lib/network-storage can
    // read it without parsing the whole settings blob. Guarded by the same
    // didMount check so storage is never rewritten on the initial mount (#422).
    saveSelectedNetwork(settings.network);
  }, [settings]);

  const updateSetting = useCallback(
    <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    [],
  );

  const updateChannelConfig = useCallback(
    <K extends keyof NotificationChannelConfig>(key: K, value: NotificationChannelConfig[K]) => {
      setSettings((prev) => ({
        ...prev,
        notificationChannels: { ...prev.notificationChannels, [key]: value },
      }));
      setSaved(false);
    },
    [],
  );

  const updateMatrixCell = useCallback(
    (eventKey: NotificationEventKey, channel: NotificationChannel, value: boolean) => {
      setSettings((prev) => ({
        ...prev,
        notificationMatrix: {
          ...prev.notificationMatrix,
          [eventKey]: {
            ...prev.notificationMatrix[eventKey],
            [channel]: value,
          },
        },
      }));
      setSaved(false);
    },
    [],
  );

  const handleReset = useCallback(() => {
    const defaults: SettingsState = {
      network: "testnet" as NetworkName,

      notificationsEnabled: true,
      notificationChannels: DEFAULT_NOTIFICATION_CHANNELS,
      notificationMatrix: DEFAULT_NOTIFICATION_MATRIX,
      developerMode: false,
      timeFormat: "absolute",
      autoRefreshInterval: 0,
    };
    setSettings(defaults);
    setTheme("system");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [setTheme]);

  const handleTestPing = useCallback(async () => {
    setRpcMessage(null);
    setPing(null);
    if (!isValidRpcUrl(customRpc)) {
      setPing({ ok: false, latencyMs: null, error: "Enter a valid http(s) RPC URL." });
      return;
    }
    setPinging(true);
    try {
      const result = await pingRpcEndpoint(customRpc.trim());
      setPing(result);
    } finally {
      setPinging(false);
    }
  }, [customRpc]);

  const handleSaveCustomRpc = useCallback(async () => {
    setRpcMessage(null);
    const url = customRpc.trim();
    if (!isValidRpcUrl(url)) {
      setPing({ ok: false, latencyMs: null, error: "Enter a valid http(s) RPC URL." });
      return;
    }
    // Validate latency before saving — ping first, save only on success.
    setPinging(true);
    try {
      const result = await pingRpcEndpoint(url);
      setPing(result);
      if (!result.ok) return;
      saveCustomRpcUrl(url);
      resetServer();
      setSavedCustomRpc(url);
      setRpcMessage(`Custom RPC saved (${result.latencyMs} ms).`);
    } catch (e) {
      setPing({
        ok: false,
        latencyMs: null,
        error: e instanceof Error ? e.message : "Could not save the RPC endpoint.",
      });
    } finally {
      setPinging(false);
    }
  }, [customRpc]);

  const handleClearCustomRpc = useCallback(() => {
    clearCustomRpcUrl();
    resetServer();
    setSavedCustomRpc(null);
    setCustomRpc("");
    setPing(null);
    setRpcMessage("Custom RPC cleared — using the preset network endpoint.");
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Settings</h1>
        {saved && (
          <span
            className="text-sm text-green-600 dark:text-green-400 font-medium animate-pulse"
            aria-label="confirmation"
          >
            Settings saved
          </span>
        )}
      </div>

      {/* Appearance */}
      <section className="card">
        <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
          Appearance
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-sm">Theme</span>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                  theme === t
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Network */}
      <section className="card">
        <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
          Network
        </h2>
        <div className="flex flex-row items-center justify-between">
          <span className="text-sm">Stellar Network</span>
          <select
            value={settings.network}
            onChange={(e) =>
              updateSetting("network", e.target.value as NetworkName)
            }
            className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm"
          >
            {Object.values(NETWORKS).map((n) => (
              <option key={n.name} value={n.name}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        {/* Custom RPC endpoint override (#691) */}
        <div className="mt-5 border-t border-gray-100 dark:border-gray-800 pt-4">
          <span className="text-sm font-medium">Custom RPC endpoint</span>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 mb-3">
            Override the preset endpoint with a local sandbox or private node
            (e.g. QuickNode, Triton). Ping it first — saving requires a
            successful response.
          </p>
          <div className="flex flex-col gap-2">
            <input
              type="url"
              value={customRpc}
              onChange={(e) => {
                setCustomRpc(e.target.value);
                setPing(null);
                setRpcMessage(null);
              }}
              placeholder="https://my-private-rpc.example.com"
              aria-label="Custom RPC endpoint"
              className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm font-mono"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleTestPing}
                disabled={pinging || !customRpc.trim()}
                className="px-4 py-1.5 rounded text-sm font-medium border border-gray-300 dark:border-gray-700 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pinging ? "Pinging…" : "Test Ping"}
              </button>
              <button
                type="button"
                onClick={handleSaveCustomRpc}
                disabled={pinging || !isValidRpcUrl(customRpc)}
                className="px-4 py-1.5 rounded text-sm font-medium bg-black text-white dark:bg-white dark:text-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save endpoint
              </button>
              {savedCustomRpc && (
                <button
                  type="button"
                  onClick={handleClearCustomRpc}
                  className="px-4 py-1.5 rounded text-sm font-medium text-gray-500 hover:text-black dark:hover:text-white underline"
                >
                  Clear override
                </button>
              )}
            </div>
            {ping && (
              <p
                role="status"
                data-testid="rpc-ping-result"
                className={`text-xs font-mono ${ping.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
              >
                {ping.ok
                  ? `Reachable — ${ping.latencyMs} ms.`
                  : `Unreachable${ping.latencyMs !== null ? ` (${ping.latencyMs} ms)` : ""}: ${ping.error ?? "no response"}`}
              </p>
            )}
            {rpcMessage && (
              <p role="status" className="text-xs text-gray-500 dark:text-gray-400">
                {rpcMessage}
              </p>
            )}
            {savedCustomRpc && (
              <p className="text-xs text-gray-400 dark:text-gray-500 break-all">
                Active override: <span className="font-mono">{savedCustomRpc}</span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Currency & Slippage */}
      <section className="card">
        <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
          Preferences
        </h2>
        <div className="flex flex-col space-y-4">
          {/* Slippage Tolerance */}
          <div className="flex flex-row items-center justify-between">
            <span className="text-sm">Slippage Tolerance</span>
            <div className="flex gap-2">
              {["0.5%", "1%", "2%", "5%"].map((s) => (
                <button
                  key={s}
                  type="button"
                  className="px-3 py-1 rounded text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Timestamp Format — issue #556 */}
          <div className="flex flex-row items-center justify-between">
            <div>
              <span className="text-sm">Timestamp Format</span>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {settings.timeFormat === "relative"
                  ? "e.g. 2h ago, 5m ago"
                  : "e.g. Nov 14, 2023, 10:13 PM"}
              </p>
            </div>
            <div className="flex gap-2">
              {(["relative", "absolute"] as TimeFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => updateSetting("timeFormat", f)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    settings.timeFormat === f
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-Refresh Interval — issue #572 */}
          <div className="flex flex-row items-center justify-between">
            <div>
              <span className="text-sm">Auto-Refresh Interval</span>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                How often stream data refreshes automatically. Off conserves RPC
                calls.
              </p>
            </div>
            <select
              value={settings.autoRefreshInterval}
              onChange={(e) =>
                updateSetting(
                  "autoRefreshInterval",
                  Number(e.target.value) as RefreshIntervalSeconds,
                )
              }
              className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm"
            >
              {REFRESH_INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Currency Display — issue #731 */}
          <div className="flex flex-row items-center justify-between">
            <div>
              <span className="text-sm">Display Currency</span>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Show fiat estimates alongside token amounts.
              </p>
            </div>
            <select
              value={settings.currency}
              onChange={(e) =>
                updateSetting("currency", e.target.value as "USD" | "EUR" | "GBP")
              }
              className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Notifications & Advanced (#786) */}
      <section className="card">
        <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
          General
        </h2>
        <div className="flex flex-col space-y-6">
          <label className="flex flex-row items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm font-medium">Enable Notifications</span>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Master switch for protocol alerts and channel delivery.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={(e) =>
                updateSetting("notificationsEnabled", e.target.checked)
              }
              data-testid="notifications-master-toggle"
              className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-black dark:text-white focus:ring-black dark:focus:ring-white"
            />
          </label>

          {/* Channel Preferences Matrix (#786) */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4">
            <div>
              <span className="text-sm font-medium">Notification Channels</span>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Configure delivery channels (Browser Push, Email, Telegram) for receiving alerts.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Browser Push */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Browser Push</span>
                  <input
                    type="checkbox"
                    checked={settings.notificationChannels.browserPush}
                    onChange={(e) => updateChannelConfig("browserPush", e.target.checked)}
                    disabled={!settings.notificationsEnabled}
                    data-testid="channel-toggle-browserPush"
                    className="w-4 h-4 rounded text-black dark:text-white"
                  />
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Instant local browser alerts on stream progress and milestones.
                </p>
                {isNotificationSupported() && (
                  <button
                    type="button"
                    onClick={() => requestNotificationPermission()}
                    disabled={!settings.notificationsEnabled || !settings.notificationChannels.browserPush}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline block pt-1"
                  >
                    Request permission
                  </button>
                )}
              </div>

              {/* Email */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Email</span>
                  <input
                    type="checkbox"
                    checked={settings.notificationChannels.email}
                    onChange={(e) => updateChannelConfig("email", e.target.checked)}
                    disabled={!settings.notificationsEnabled}
                    data-testid="channel-toggle-email"
                    className="w-4 h-4 rounded text-black dark:text-white"
                  />
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Email notifications for major milestones and stream cancellations.
                </p>
                {settings.notificationChannels.email && (
                  <input
                    type="email"
                    value={settings.notificationChannels.emailAddress ?? ""}
                    onChange={(e) => updateChannelConfig("emailAddress", e.target.value)}
                    placeholder="name@example.com"
                    disabled={!settings.notificationsEnabled}
                    aria-label="Email address for notifications"
                    className="w-full text-xs px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded font-mono"
                  />
                )}
              </div>

              {/* Telegram */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Telegram</span>
                  <input
                    type="checkbox"
                    checked={settings.notificationChannels.telegram}
                    onChange={(e) => updateChannelConfig("telegram", e.target.checked)}
                    disabled={!settings.notificationsEnabled}
                    data-testid="channel-toggle-telegram"
                    className="w-4 h-4 rounded text-black dark:text-white"
                  />
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Real-time Telegram bot ping on cancellation and cliff reach.
                </p>
                {settings.notificationChannels.telegram && (
                  <input
                    type="text"
                    value={settings.notificationChannels.telegramHandle ?? ""}
                    onChange={(e) => updateChannelConfig("telegramHandle", e.target.value)}
                    placeholder="@username"
                    disabled={!settings.notificationsEnabled}
                    aria-label="Telegram username for notifications"
                    className="w-full text-xs px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded font-mono"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Granular Preferences Matrix */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
            <div>
              <span className="text-sm font-medium">Notification Preferences Matrix</span>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Select which channels notify you for specific protocol stream events.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table
                className="w-full text-left text-xs border border-gray-200 dark:border-gray-700 rounded-lg"
                data-testid="notification-matrix"
              >
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                    <th className="py-2 px-3 font-semibold">Event</th>
                    <th className="py-2 px-3 font-semibold text-center">Browser Push</th>
                    <th className="py-2 px-3 font-semibold text-center">Email</th>
                    <th className="py-2 px-3 font-semibold text-center">Telegram</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(Object.keys(NOTIFICATION_EVENT_LABELS) as NotificationEventKey[]).map((eventKey) => (
                    <tr key={eventKey} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                      <td className="py-2 px-3">
                        <span className="font-medium text-black dark:text-white block">
                          {NOTIFICATION_EVENT_LABELS[eventKey].title}
                        </span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          {NOTIFICATION_EVENT_LABELS[eventKey].desc}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={settings.notificationMatrix[eventKey]?.browserPush ?? false}
                          onChange={(e) => updateMatrixCell(eventKey, "browserPush", e.target.checked)}
                          disabled={!settings.notificationsEnabled || !settings.notificationChannels.browserPush}
                          data-testid={`matrix-${eventKey}-browserPush`}
                          className="w-4 h-4 rounded text-black dark:text-white"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={settings.notificationMatrix[eventKey]?.email ?? false}
                          onChange={(e) => updateMatrixCell(eventKey, "email", e.target.checked)}
                          disabled={!settings.notificationsEnabled || !settings.notificationChannels.email}
                          data-testid={`matrix-${eventKey}-email`}
                          className="w-4 h-4 rounded text-black dark:text-white"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={settings.notificationMatrix[eventKey]?.telegram ?? false}
                          onChange={(e) => updateMatrixCell(eventKey, "telegram", e.target.checked)}
                          disabled={!settings.notificationsEnabled || !settings.notificationChannels.telegram}
                          data-testid={`matrix-${eventKey}-telegram`}
                          className="w-4 h-4 rounded text-black dark:text-white"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Developer Mode (#787) */}
      <section className="card" data-testid="developer-mode-section">
        <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
          Developer Mode
        </h2>
        <div className="flex flex-col space-y-4">
          <label className="flex flex-row items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm font-medium">Developer Inspection Mode</span>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Display raw Soroban contract storage keys and base64 XDR payloads in transaction confirmation dialogs.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.developerMode}
              onChange={(e) => updateSetting("developerMode", e.target.checked)}
              data-testid="developer-mode-toggle"
              className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-black dark:text-white focus:ring-black dark:focus:ring-white"
            />
          </label>

          {settings.developerMode && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 rounded">
                  Active
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Transaction confirmation dialogs (Cancel, Top Up, Withdraw) will now display raw contract storage keys and invocation XDR payloads for debugging.
                </span>
              </div>
              <DeveloperPayloadInspector
                contractId="CDUMMYSTREAMEXAMPLE1234567890ABCDEF1234567890"
                method="cancel"
                storageKeySymbol="info"
              />
            </div>
          )}
        </div>
      </section>

      {/* Reset */}
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => {
            resetOnboarding();
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
          className="px-4 py-2 rounded text-sm font-medium border border-gray-300 dark:border-gray-700 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
        >
          Restart Tour
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 rounded text-sm font-medium border border-gray-300 dark:border-gray-700 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
