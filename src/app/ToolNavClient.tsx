"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Sparkles, ArrowRight, Command } from "lucide-react";
import toolsMetaZh from "./tools/tools-meta.zh-cn.json";
import toolsMetaEn from "./tools/tools-meta.en-us.json";
import { getMessages } from "../i18n/messages";
import { useOptionalI18n } from "../i18n/I18nProvider";

type ToolNavItem = {
  slug: string;
  path: string;
  name: string;
  shortName: string;
  description: string;
  category: string;
  icon: string;
  keywords?: string[];
};

const ALL_CATEGORY = "__ALL__";

const normalizeText = (value: string): string =>
  value.toLowerCase().normalize("NFKC");

export default function ToolNavClient() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";
  const messages = i18n?.messages ?? getMessages("zh-cn");
  const allTools: ToolNavItem[] =
    locale === "en-us" ? (toolsMetaEn as ToolNavItem[]) : (toolsMetaZh as ToolNavItem[]);

  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY);
  const [query, setQuery] = useState<string>("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const categoryContainerRef = useRef<HTMLDivElement>(null);
  const categoryDragStateRef = useRef<{
    isPointerDown: boolean;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    hasDragged: boolean;
    blockClick: boolean;
  }>({
    isPointerDown: false,
    pointerId: -1,
    startClientX: 0,
    startClientY: 0,
    startScrollLeft: 0,
    hasDragged: false,
    blockClick: false,
  });
  const categoryDragAbortRef = useRef<AbortController | null>(null);
  const bodyUserSelectRestoreRef = useRef<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const tool of allTools) {
      if (tool.category && tool.category.trim()) {
        set.add(tool.category.trim());
      }
    }
    return [ALL_CATEGORY, ...Array.from(set)];
  }, [allTools]);

  const filteredTools = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim());
    const hasQuery = normalizedQuery.length > 0;

    return allTools.filter((tool) => {
      if (
        activeCategory !== ALL_CATEGORY &&
        tool.category !== activeCategory
      ) {
        return false;
      }

      if (!hasQuery) {
        return true;
      }

      const keywordSource = [
        tool.name,
        tool.shortName,
        tool.description,
        tool.slug,
        tool.category,
        ...(tool.keywords ?? []),
      ]
        .filter(Boolean)
        .join(" ");

      const normalizedSource = normalizeText(keywordSource);
      const tokens = normalizedQuery.split(/\s+/);
      return tokens.every((token) => normalizedSource.includes(token));
    });
  }, [activeCategory, allTools, query]);

  // Smooth scroll to active category on change
  useEffect(() => {
    if (categoryContainerRef.current) {
      const activeBtn = categoryContainerRef.current.querySelector<HTMLButtonElement>(
        `button[data-active="true"]`
      );
      if (activeBtn) {
        activeBtn.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [activeCategory]);

  const endCategoryDrag = useCallback(() => {
    const drag = categoryDragStateRef.current;
    drag.isPointerDown = false;
    drag.pointerId = -1;
    drag.blockClick = drag.hasDragged;
    drag.hasDragged = false;

    if (bodyUserSelectRestoreRef.current !== null) {
      document.body.style.userSelect = bodyUserSelectRestoreRef.current;
      bodyUserSelectRestoreRef.current = null;
    }

    categoryDragAbortRef.current?.abort();
    categoryDragAbortRef.current = null;
  }, []);

  const onCategoryPointerMove = useCallback((e: PointerEvent) => {
    const container = categoryContainerRef.current;
    const drag = categoryDragStateRef.current;
    if (!container || !drag.isPointerDown) return;
    if (e.pointerType !== "mouse") return;
    if (drag.pointerId !== e.pointerId) return;

    const deltaX = e.clientX - drag.startClientX;
    const deltaY = e.clientY - drag.startClientY;
    const shouldStartDragging = Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY);

    if (shouldStartDragging && !drag.hasDragged) {
      drag.hasDragged = true;
      if (bodyUserSelectRestoreRef.current === null) {
        bodyUserSelectRestoreRef.current = document.body.style.userSelect;
        document.body.style.userSelect = "none";
      }
    }

    if (drag.hasDragged) {
      container.scrollLeft = drag.startScrollLeft - deltaX;
    }
  }, []);

  const onCategoryPointerUp = useCallback(
    (e: PointerEvent) => {
      const drag = categoryDragStateRef.current;
      if (!drag.isPointerDown) return;
      if (e.pointerType !== "mouse") return;
      if (drag.pointerId !== e.pointerId) return;
      endCategoryDrag();
    },
    [endCategoryDrag]
  );

  useEffect(() => {
    return () => {
      categoryDragAbortRef.current?.abort();
      categoryDragAbortRef.current = null;
      if (bodyUserSelectRestoreRef.current !== null) {
        document.body.style.userSelect = bodyUserSelectRestoreRef.current;
        bodyUserSelectRestoreRef.current = null;
      }
    };
  }, []);

  return (
    <section className="min-h-[80vh] space-y-10 py-8">
      {/* Header Section */}
      <div className="relative z-20 flex flex-col items-center gap-8">
        {/* Search Bar */}
        <div
          className={`relative w-full max-w-2xl transition-all duration-300 ease-out ${
            isSearchFocused ? "scale-105 transform" : ""
          }`}
        >
          <div className="group relative">
            <div
              className={`absolute -inset-0.5 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-20 blur transition duration-500 group-hover:opacity-40 ${
                isSearchFocused ? "opacity-50" : ""
              }`}
            />
            <div className="relative flex items-center rounded-full bg-white shadow-xl shadow-slate-200/50 ring-1 ring-slate-900/5">
              <div className="flex h-14 w-14 items-center justify-center text-slate-400">
                <Search className="h-5 w-5" />
              </div>
              <input
                type="text"
                placeholder={messages.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                className="h-14 w-full bg-transparent pr-14 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <div className="absolute right-4 flex items-center gap-2">
                <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-500 md:inline-flex items-center gap-1">
                  <Command className="h-3 w-3" /> K
                </kbd>
              </div>
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="w-full">
          <div
            ref={categoryContainerRef}
            className="pretty-scrollbar w-full select-none overflow-x-auto px-4 pb-4 pt-2 cursor-grab active:cursor-grabbing"
            style={{
              WebkitOverflowScrolling: "touch",
            }}
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse") return;
              const container = categoryContainerRef.current;
              if (!container) return;
              if (e.button !== 0) return;

              categoryDragAbortRef.current?.abort();
              categoryDragAbortRef.current = new AbortController();
              window.addEventListener("pointermove", onCategoryPointerMove, { signal: categoryDragAbortRef.current.signal });
              window.addEventListener("pointerup", onCategoryPointerUp, { signal: categoryDragAbortRef.current.signal });
              window.addEventListener("pointercancel", onCategoryPointerUp, { signal: categoryDragAbortRef.current.signal });

              categoryDragStateRef.current = {
                isPointerDown: true,
                pointerId: e.pointerId,
                startClientX: e.clientX,
                startClientY: e.clientY,
                startScrollLeft: container.scrollLeft,
                hasDragged: false,
                blockClick: false,
              };
            }}
            onClickCapture={(e) => {
              if (!categoryDragStateRef.current.blockClick) return;
              categoryDragStateRef.current.blockClick = false;
              e.preventDefault();
              e.stopPropagation();
            }}
            onWheel={(e) => {
              const container = categoryContainerRef.current;
              if (!container) return;
              if (e.shiftKey) return;
              if (container.scrollWidth <= container.clientWidth) return;
              if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

              container.scrollLeft += e.deltaY;
              e.preventDefault();
            }}
          >
            <div className="mx-auto flex w-max items-center gap-2">
              {categories.map((category) => {
                const isActive = category === activeCategory;
                const label = category === ALL_CATEGORY ? messages.categoryAll : category;
                return (
                <button
                  key={category}
                  data-active={isActive}
                  onClick={() => setActiveCategory(category)}
                  className={`group relative flex-shrink-0 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                    isActive
                      ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20 ring-2 ring-slate-900 ring-offset-2"
                      : "bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:shadow-md ring-1 ring-slate-200"
                  }`}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {category === ALL_CATEGORY && (
                      <Sparkles
                        className={`h-3.5 w-3.5 transition-colors ${
                          isActive ? "text-yellow-300" : "text-slate-400 group-hover:text-yellow-500"
                        }`}
                      />
                    )}
	                    {label}
	                  </span>
	                </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tools Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
	        {filteredTools.map((tool) => (
	          <Link
	            key={tool.slug}
	            href={`/${locale}${tool.path}`}
	            className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 hover:ring-slate-300"
	          >
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-50 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            
            <div className="relative z-10 flex h-full flex-col">
              <div className="mb-6 flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100 transition-transform duration-300 group-hover:scale-110 group-hover:bg-white group-hover:shadow-sm">
                  <span className="text-lg font-bold text-slate-900">
                    {tool.shortName.slice(0, 2)}
                  </span>
                </div>
                <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600 transition-colors group-hover:bg-slate-900 group-hover:text-white">
                  {tool.category}
                </div>
              </div>

              <h3 className="mb-2 text-lg font-bold text-slate-900">
                {tool.name.replace(/ - .*$/, "")}
              </h3>
              
              <p className="flex-1 text-sm leading-relaxed text-slate-500 line-clamp-2">
                {tool.description}
              </p>

              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                  <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  {messages.toolCardLocal}
                </span>
                
                <span className="flex items-center gap-1 text-xs font-semibold text-slate-400 transition-colors group-hover:text-slate-900">
                  {messages.toolCardTry}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </Link>
        ))}

        {/* More Tools Placeholder */}
        <div className="group relative flex h-full min-h-[240px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center transition-all duration-300 hover:border-slate-300 hover:bg-slate-50">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-100 transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md">
            <Sparkles className="h-6 w-6 text-slate-400 transition-colors group-hover:text-indigo-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">{messages.moreToolsTitle}</h3>
          <p className="mt-2 text-sm text-slate-500">{messages.moreToolsDescription}</p>
        </div>
      </div>

      {/* Empty State */}
      {filteredTools.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
          <div className="mb-4 rounded-full bg-slate-50 p-4">
            <Search className="h-8 w-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">{messages.emptyTitle}</h3>
          <p className="mt-2 text-slate-500">{messages.emptyDescription}</p>
          <button 
            onClick={() => {
              setQuery("");
              setActiveCategory(ALL_CATEGORY);
            }}
            className="mt-6 rounded-full bg-slate-900 px-6 py-2 text-sm font-medium text-white transition-transform hover:scale-105 active:scale-95"
          >
            {messages.clearFilters}
          </button>
        </div>
      )}
    </section>
  );
}
