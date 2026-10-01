/**
 * Custom Soroban RPC endpoint override (#691).
 *
 * Developers running a local sandbox (`http://localhost:8000`) or a private
 * QuickNode/Triton node can override the preset network RPC URL from the
 * Settings page. The override is stored in localStorage and takes precedence
 * in `lib/env.ts#getRpcUrl` until cleared.
 */

export const CUSTOM_RPC_STORAGE_KEY = "conduit:custom-rpc";

export function isValidRpcUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Return the saved custom RPC override, or null when unset/invalid. */
export function getCustomRpcUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CUSTOM_RPC_STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed && isValidRpcUrl(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

export function saveCustomRpcUrl(url: string): void {
  const trimmed = url.trim();
  if (!isValidRpcUrl(trimmed)) {
    throw new Error("Enter a valid http(s) RPC URL.");
  }
  try {
    localStorage.setItem(CUSTOM_RPC_STORAGE_KEY, trimmed);
  } catch {
    // Storage can be unavailable in private browsing or embedded webviews.
  }
}

export function clearCustomRpcUrl(): void {
  try {
    localStorage.removeItem(CUSTOM_RPC_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export interface RpcPingResult {
  ok: boolean;
  latencyMs: number | null;
  error?: string;
}

/**
 * Validate an RPC endpoint by POSTing a lightweight `getHealth` JSON-RPC call
 * and measuring round-trip latency. Never throws — failures are returned as
 * `{ ok: false }` so the Settings UI can render them inline.
 */
export async function pingRpcEndpoint(
  url: string,
  timeoutMs = 10_000,
): Promise<RpcPingResult> {
  const trimmed = url.trim();
  if (!isValidRpcUrl(trimmed)) {
    return { ok: false, latencyMs: null, error: "Enter a valid http(s) RPC URL." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const res = await fetch(trimmed, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: controller.signal,
    });
    const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
    const latencyMs = Math.round(ended - started);
    if (!res.ok) {
      return { ok: false, latencyMs, error: `HTTP ${res.status} from RPC endpoint.` };
    }
    // A well-formed JSON-RPC response (even an error payload) proves the
    // endpoint is reachable and speaking RPC. Only a transport failure fails.
    await res.text().catch(() => "");
    return { ok: true, latencyMs };
  } catch (e) {
    const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
    const latencyMs = Math.round(ended - started);
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, latencyMs: null, error: `Timed out after ${timeoutMs} ms.` };
    }
    return {
      ok: false,
      latencyMs: null,
      error: e instanceof Error ? e.message : "Could not reach the RPC endpoint.",
    };
  } finally {
    clearTimeout(timer);
  }
}
