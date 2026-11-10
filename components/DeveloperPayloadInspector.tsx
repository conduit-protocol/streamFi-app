"use client";

import React, { useState } from "react";
import { CopyHashButton } from "@/components/ui/CopyHashButton";
import { formatContractStorageKey, buildSampleInvocationXdr } from "@/lib/developer-mode";

interface DeveloperPayloadInspectorProps {
  contractId: string;
  method: string;
  storageKeySymbol?: string;
  customXdr?: string;
  args?: Record<string, string | number | bigint | null | undefined>;
}

export function DeveloperPayloadInspector({
  contractId,
  method,
  storageKeySymbol = "info",
  customXdr,
  args,
}: DeveloperPayloadInspectorProps) {
  const [copied, setCopied] = useState(false);

  const rawStorageKey = formatContractStorageKey(contractId, storageKeySymbol);
  const rawXdr = customXdr || buildSampleInvocationXdr(contractId, method);

  const handleCopyAll = async () => {
    try {
      const payload = JSON.stringify(
        {
          contractId,
          method,
          storageKeySymbol,
          rawStorageKeyXdr: rawStorageKey,
          rawInvocationXdr: rawXdr,
          arguments: args,
        },
        null,
        2
      );
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className="mt-3 p-3 rounded-lg border border-purple-200 dark:border-purple-900/60 bg-purple-50/60 dark:bg-purple-950/20 text-xs font-mono space-y-2.5"
      data-testid="developer-mode-inspector"
    >
      <div className="flex items-center justify-between border-b border-purple-100 dark:border-purple-900/40 pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          <span className="font-semibold text-purple-900 dark:text-purple-300 uppercase tracking-wider text-[10px]">
            Developer Mode: Raw Contract Data & XDR
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopyAll}
          className="text-[10px] text-purple-700 dark:text-purple-400 hover:underline font-sans"
        >
          {copied ? "Copied JSON!" : "Copy Developer Data"}
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between items-center text-[11px] text-gray-500 dark:text-gray-400">
          <span>Target Contract:</span>
        </div>
        <code className="block p-1 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800 break-all text-[11px] select-all">
          {contractId}
        </code>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between items-center text-[11px] text-gray-500 dark:text-gray-400">
          <span>Raw Contract Storage Key (LedgerKey XDR):</span>
          <CopyHashButton hash={rawStorageKey} />
        </div>
        <code
          className="block p-1 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800 break-all text-[11px] text-purple-700 dark:text-purple-300 select-all"
          data-testid="raw-storage-key-xdr"
        >
          {rawStorageKey}
        </code>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between items-center text-[11px] text-gray-500 dark:text-gray-400">
          <span>Raw Invocation XDR ({method}()):</span>
          <CopyHashButton hash={rawXdr} />
        </div>
        <code
          className="block p-1 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800 break-all text-[11px] text-blue-700 dark:text-blue-300 select-all"
          data-testid="raw-invocation-xdr"
        >
          {rawXdr}
        </code>
      </div>

      {args && Object.keys(args).length > 0 && (
        <div className="space-y-1 pt-1">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Method Parameters:</span>
          <pre className="p-1 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800 overflow-x-auto text-[10px] text-gray-700 dark:text-gray-300">
            {JSON.stringify(args, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
