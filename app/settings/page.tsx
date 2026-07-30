"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";

type Currency = "USD" | "EUR" | "XLM";
type Slippage = 0.5 | 1.0 | 2.0 | 5.0;

interface SettingsState {
  currency: Currency;
  slippageTolerance: Slippage;
  notificationsEnabled: boolean;
  advancedMode: boolean;
}

const STORAGE_KEY = "conduit:settings";

function loadSettings(): SettingsState {
  if (typeof window === "undefined") {
    return { currency: "USD", slippageTolerance: 1.0, notificationsEnabled: true, advancedMode: false };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SettingsState>;
      return {
        currency: parsed.currency ?? "USD",
        slippageTolerance: parsed.slippageTolerance ?? 1.0,
        notificationsEnabled: parsed.notificationsEnabled ?? true,
        advancedMode: parsed.advancedMode ?? false,
      };
    }
  } catch {
    // Ignore parse errors, use defaults
  }
  return { currency: "USD", slippageTolerance: 1.0, notificationsEnabled: true, advancedMode: false };
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<SettingsState>(loadSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSetting = useCallback(<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const handleReset = useCallback(() => {
    const defaults: SettingsState = { currency: "USD", slippageTolerance: 1.0, notificationsEnabled: true, advancedMode: false };
    setSettings(defaults);
    setTheme("system");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [setTheme]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Settings</h1>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400 font-medium animate-pulse">
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

      {/* Currency & Slippage */}
      <section className="card">
        <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
          Preferences
        </h2>
        <div className="flex flex-col space-y-4">
          <div className="flex flex-row items-center justify-between">
            <span className="text-sm">Display Currency</span>
            <select
              value={settings.currency}
              onChange={(e) => updateSetting("currency", e.target.value as Currency)}
              className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="XLM">XLM</option>
            </select>
          </div>
          <div className="flex flex-row items-center justify-between">
            <span className="text-sm">Slippage Tolerance</span>
            <div className="flex gap-2">
              {([0.5, 1.0, 2.0, 5.0] as Slippage[]).map((s) => (
                <button
                  key={s}
                  onClick={() => updateSetting("slippageTolerance", s)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    settings.slippageTolerance === s
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {s}%
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Notifications & Advanced */}
      <section className="card">
        <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
          General
        </h2>
        <div className="flex flex-col space-y-4">
          <label className="flex flex-row items-center justify-between cursor-pointer">
            <span className="text-sm">Enable Notifications</span>
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={(e) => updateSetting("notificationsEnabled", e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-black dark:text-white focus:ring-black dark:focus:ring-white"
            />
          </label>
          <label className="flex flex-row items-center justify-between cursor-pointer">
            <span className="text-sm">Advanced Mode</span>
            <input
              type="checkbox"
              checked={settings.advancedMode}
              onChange={(e) => updateSetting("advancedMode", e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-black dark:text-white focus:ring-black dark:focus:ring-white"
            />
          </label>
        </div>
      </section>

      {/* Reset */}
      <div className="flex justify-end">
        <button
          onClick={handleReset}
          className="px-4 py-2 rounded text-sm font-medium border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
