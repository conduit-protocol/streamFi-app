"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface PaletteItem {
  id: string;
  label: string;
  href: string;
}

const STATIC_ITEMS: PaletteItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard" },
  { id: "streams", label: "Streams", href: "/streams" },
  { id: "create", label: "Create stream", href: "/create" },
  { id: "settings", label: "Settings", href: "/settings" },
  { id: "profile", label: "Profile", href: "/profile" },
];

/**
 * Global Cmd/Ctrl+K command palette (#549) for jumping to a top-level page
 * or a specific stream by numeric ID, without clicking through the navbar.
 *
 * Mounted once in the root layout so the shortcut works from any route.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  // Cmd/Ctrl+K toggles the palette from anywhere in the app.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus the search input on open; restore focus to whatever triggered it on close.
  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement | null;
      inputRef.current?.focus();
    } else {
      previousActiveElement.current?.focus();
    }
  }, [open]);

  const trimmed = query.trim();
  const streamJump: PaletteItem[] = /^\d+$/.test(trimmed)
    ? [{ id: "stream-jump", label: `Go to stream #${trimmed}`, href: `/stream/${trimmed}` }]
    : [];
  const matchingPages = trimmed
    ? STATIC_ITEMS.filter((i) => i.label.toLowerCase().includes(trimmed.toLowerCase()))
    : STATIC_ITEMS;
  const items = [...streamJump, ...matchingPages];

  const select = useCallback(
    (item: PaletteItem) => {
      close();
      router.push(item.href);
    },
    [close, router],
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) select(item);
    } else if (e.key === "Escape") {
      close();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-24 p-4 bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-panel overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <Search className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Jump to a page or enter a stream ID…"
            aria-label="Command palette search"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={items[activeIndex] ? `cmdk-${items[activeIndex]!.id}` : undefined}
            className="flex-1 bg-transparent outline-none text-sm text-black dark:text-white placeholder:text-gray-400"
          />
        </div>
        <div id="command-palette-list" role="listbox" aria-label="Results" className="max-h-72 overflow-y-auto py-1">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">No matches.</p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.id}
                id={`cmdk-${item.id}`}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => select(item)}
                className={[
                  "w-full text-left px-4 py-2 text-sm transition-colors",
                  i === activeIndex
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
