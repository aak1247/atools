"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import toolsMeta from "./tools/tools-meta.json";

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

const allTools: ToolNavItem[] = toolsMeta as ToolNavItem[];

const ALL_CATEGORY = "全部";

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKC");

export default function ToolNavClient() {
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY);
  const [query, setQuery] = useState<string>("");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const tool of allTools) {
      if (tool.category && tool.category.trim()) {
        set.add(tool.category.trim());
      }
    }
    return [ALL_CATEGORY, ...Array.from(set)];
  }, []);

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
  }, [activeCategory, query]);

  return (
    <section className="space-y-6 animate-fade-in-up delay-100">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => {
            const isActive = category === activeCategory;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
        <div className="flex w-full items-center justify-between gap-3 md:w-auto">
          <p className="hidden text-xs text-slate-500 md:block">
            共{" "}
            <span className="font-semibold text-slate-900">
              {filteredTools.length}
            </span>{" "}
            个工具
          </p>
          <div className="relative w-full md:w-72">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
                />
              </svg>
            </span>
            <input
              type="search"
              placeholder="搜索工具名称、用途、关键字..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredTools.map((tool) => (
          <Link
            key={tool.slug}
            href={tool.path}
            className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white/80 p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-slate-200 hover:shadow-xl"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-slate-100 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="relative z-10 flex h-full flex-col">
              <div className="mb-4 inline-flex h-10 items-center rounded-full bg-slate-900 px-3 text-[11px] font-medium text-slate-50 shadow-sm">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px]">
                  {tool.shortName.slice(0, 2)}
                </span>
                <span>{tool.category}</span>
              </div>
              <h2 className="mb-2 text-base font-semibold text-slate-900">
                {tool.name.replace(/ - .*$/, "")}
              </h2>
              <p className="flex-1 text-xs leading-relaxed text-slate-600">
                {tool.description}
              </p>
              <div className="mt-5 flex items-center justify-between text-[11px] text-slate-500">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                  <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  本地运行 · 零上传
                </span>
                <span className="inline-flex items-center font-medium text-slate-700 group-hover:text-slate-900">
                  立即使用
                  <svg
                    className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-0.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </span>
              </div>
            </div>
          </Link>
        ))}

        <div className="group relative flex h-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center transition-all hover:bg-slate-50">
          <div className="mb-3 rounded-full bg-slate-100 p-3">
            <svg
              className="h-6 w-6 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-slate-900">更多工具</h3>
          <p className="mt-1 text-xs text-slate-500">持续更新中...</p>
        </div>
      </div>

      {filteredTools.length === 0 && (
        <p className="text-center text-xs text-slate-500">
          未找到匹配的工具，请尝试更换关键字或切换分类。
        </p>
      )}
    </section>
  );
}

