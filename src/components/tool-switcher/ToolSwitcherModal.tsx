"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ArrowRight, Clock, Sparkles } from "lucide-react";
import type { Locale } from "../../i18n/locales";
import type { Messages } from "../../i18n/messages";
import toolsMetaZh from "../../app/tools/tools-meta.zh-cn.json";
import toolsMetaEn from "../../app/tools/tools-meta.en-us.json";
import { getRecentToolSlugs, recordRecentToolSlug } from "../../lib/recent-tools";

export interface ToolNavItem {
  slug: string;
  path: string;
  name: string;
  shortName: string;
  description: string;
  category: string;
  icon: string;
  keywords?: string[];
}

interface ToolSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  messages: Messages;
  currentSlug?: string;
  isApplePlatform?: boolean;
}

const ALL_CATEGORY = "__ALL__";

function normalizeText(value: string): string {
  return value.toLowerCase().normalize("NFKC");
}

function calculateScore(tool: ToolNavItem, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;

  const normalizedShort = normalizeText(tool.shortName || "");
  const normalizedSlug = normalizeText(tool.slug || "");
  const normalizedName = normalizeText(tool.name || "");
  const normalizedCategory = normalizeText(tool.category || "");
  const normalizedKeywords = (tool.keywords || []).map(normalizeText).join(" ");
  const normalizedDesc = normalizeText(tool.description || "");

  const fullSearchable = `${normalizedShort} ${normalizedSlug} ${normalizedName} ${normalizedCategory} ${normalizedKeywords} ${normalizedDesc}`;

  // Every token must match somewhere
  const allMatch = queryTokens.every((token) => fullSearchable.includes(token));
  if (!allMatch) return -1;

  let score = 0;
  const joinedQuery = queryTokens.join(" ");

  // Exact matches
  if (normalizedSlug === joinedQuery || normalizedShort === joinedQuery) {
    score += 120;
  } else if (normalizedShort.startsWith(joinedQuery) || normalizedSlug.startsWith(joinedQuery)) {
    score += 80;
  } else if (normalizedName.includes(joinedQuery)) {
    score += 60;
  }

  // Token matches
  for (const token of queryTokens) {
    if (normalizedShort.includes(token)) score += 30;
    if (normalizedSlug.includes(token)) score += 25;
    if (normalizedKeywords.includes(token)) score += 15;
    if (normalizedCategory.includes(token)) score += 10;
    if (normalizedDesc.includes(token)) score += 5;
  }

  return score;
}

export default function ToolSwitcherModal({
  isOpen,
  onClose,
  locale,
  messages,
  currentSlug,
  isApplePlatform = false,
}: ToolSwitcherModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSlugs] = useState(() => getRecentToolSlugs());

  const allTools: ToolNavItem[] = useMemo(() => {
    return locale === "en-us"
      ? (toolsMetaEn as ToolNavItem[])
      : (toolsMetaZh as ToolNavItem[]);
  }, [locale]);

  const toolBySlugMap = useMemo(() => {
    const map = new Map<string, ToolNavItem>();
    for (const tool of allTools) {
      map.set(tool.slug, tool);
    }
    return map;
  }, [allTools]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const tool of allTools) {
      if (tool.category && tool.category.trim()) {
        set.add(tool.category.trim());
      }
    }
    return [ALL_CATEGORY, ...Array.from(set)];
  }, [allTools]);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Filter and rank tools
  const { displayedTools, isRecentMode } = useMemo(() => {
    const trimmedQuery = query.trim();
    const normalized = normalizeText(trimmedQuery);
    const tokens = normalized.length > 0 ? normalized.split(/\s+/) : [];

    if (tokens.length === 0) {
      // If category selected, filter by category
      if (selectedCategory !== ALL_CATEGORY) {
        const filtered = allTools.filter((t) => t.category === selectedCategory);
        return { displayedTools: filtered, isRecentMode: false };
      }

      // If no category and query is empty, show recent tools at the top followed by others
      const recents: ToolNavItem[] = [];
      const seen = new Set<string>();

      for (const slug of recentSlugs) {
        const tool = toolBySlugMap.get(slug);
        if (tool && tool.slug !== currentSlug) {
          recents.push(tool);
          seen.add(tool.slug);
        }
      }

      const others = allTools.filter(
        (t) => !seen.has(t.slug) && t.slug !== currentSlug
      );

      // Include current tool at the very end of list if needed
      const currentTool = currentSlug ? toolBySlugMap.get(currentSlug) : null;
      const combined = [...recents, ...others];
      if (currentTool && !seen.has(currentTool.slug)) {
        combined.push(currentTool);
      }

      return {
        displayedTools: combined,
        isRecentMode: recents.length > 0,
      };
    }

    // With search query
    const scored: { tool: ToolNavItem; score: number }[] = [];
    for (const tool of allTools) {
      if (selectedCategory !== ALL_CATEGORY && tool.category !== selectedCategory) {
        continue;
      }
      const score = calculateScore(tool, tokens);
      if (score >= 0) {
        scored.push({ tool, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return {
      displayedTools: scored.map((s) => s.tool),
      isRecentMode: false,
    };
  }, [allTools, currentSlug, query, recentSlugs, selectedCategory, toolBySlugMap]);

  const safeSelectedIndex =
    displayedTools.length === 0
      ? 0
      : Math.min(Math.max(0, selectedIndex), displayedTools.length - 1);

  // Keep selected item visible in list
  useEffect(() => {
    const activeEl = itemRefs.current[safeSelectedIndex];
    if (activeEl) {
      activeEl.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [safeSelectedIndex]);

  const handleSelectTool = useCallback(
    (tool: ToolNavItem) => {
      recordRecentToolSlug(tool.slug);
      onClose();
      router.push(`/${locale}/tools/${tool.slug}`);
    },
    [locale, onClose, router]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < displayedTools.length - 1 ? prev + 1 : 0
        );
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : Math.max(0, displayedTools.length - 1)
        );
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const selected = displayedTools[safeSelectedIndex];
        if (selected) {
          handleSelectTool(selected);
        }
      }
    },
    [displayedTools, handleSelectTool, onClose, safeSelectedIndex]
  );

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.quickSwitcherTitle}
      className="fixed inset-0 z-[100] flex items-start justify-center p-3 sm:p-4 md:p-6 lg:p-12"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-900/20 backdrop-blur-xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Bar */}
        <div className="relative flex items-center border-b border-slate-100 px-4">
          <Search className="h-5 w-5 shrink-0 text-indigo-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={messages.quickSwitcherPlaceholder}
            className="h-14 w-full bg-transparent px-3 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSelectedIndex(0);
                }}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                aria-label="Clear"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              ESC
            </kbd>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="pretty-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-2 text-xs">
          {categories.map((cat) => {
            const isAll = cat === ALL_CATEGORY;
            const label = isAll ? messages.categoryAll : cat;
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat);
                  setSelectedIndex(0);
                }}
                className={`shrink-0 rounded-full px-2.5 py-1 font-medium transition ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          role="listbox"
          className="pretty-scrollbar max-h-[52vh] min-h-[160px] overflow-y-auto p-2"
        >
          {displayedTools.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
                <Search className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">
                {messages.quickSwitcherNoResults}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {messages.emptyDescription}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayedTools.map((tool, idx) => {
                const isSelected = idx === safeSelectedIndex;
                const isCurrent = tool.slug === currentSlug;
                const isRecent =
                  isRecentMode && query.trim().length === 0 && idx < recentSlugs.length;

                return (
                  <button
                    key={tool.slug}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectTool(tool)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-all ${
                      isSelected
                        ? "bg-indigo-50/90 text-indigo-950 ring-1 ring-indigo-200/80 shadow-sm"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition ${
                          isSelected
                            ? "bg-indigo-600 text-white shadow-sm shadow-indigo-300"
                            : "bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700"
                        }`}
                      >
                        {isRecent ? (
                          <Clock className="h-4 w-4" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {tool.shortName || tool.name}
                          </span>
                          {tool.category && (
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-normal transition ${
                                isSelected
                                  ? "bg-indigo-100/80 text-indigo-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {tool.category}
                            </span>
                          )}
                          {isCurrent && (
                            <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-200/60">
                              {messages.quickSwitcherCurrent}
                            </span>
                          )}
                        </div>
                        <p
                          className={`mt-0.5 truncate text-xs ${
                            isSelected ? "text-indigo-800/80" : "text-slate-400"
                          }`}
                        >
                          {tool.description}
                        </p>
                      </div>
                    </div>

                    <div className="ml-3 shrink-0 flex items-center">
                      <ArrowRight
                        className={`h-4 w-4 transition-transform ${
                          isSelected
                            ? "translate-x-0.5 text-indigo-600 opacity-100"
                            : "opacity-0 text-slate-300"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info & shortcut hints */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[10px] shadow-xs">
                ↑
              </kbd>
              <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[10px] shadow-xs">
                ↓
              </kbd>
              <span>{messages.quickSwitcherHintNavigate}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[10px] shadow-xs">
                ↵
              </kbd>
              <span>{messages.quickSwitcherHintOpen}</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1">
              <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[10px] shadow-xs">
                esc
              </kbd>
              <span>{messages.quickSwitcherHintClose}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <span className="hidden sm:inline">
              {isApplePlatform ? "⌘K" : "Ctrl+K"}
            </span>
            <span>·</span>
            <span>
              {displayedTools.length} / {allTools.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
