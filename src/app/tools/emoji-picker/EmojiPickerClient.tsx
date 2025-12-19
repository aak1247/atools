"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Category = { key: string; name: string; ranges: Array<[number, number]> };

const DEFAULT_UI = {
  searchPlaceholder: "搜索（支持按 emoji / 码点十六进制，例如 1F600）",
  picked: "已选内容",
  clear: "清空",
  copy: "复制",
  recent: "最近使用",
  all: "全部",
  empty: "未找到匹配的 emoji。",
  tip: "提示：点击 emoji 即可复制；最近使用保存在本地浏览器。",
} as const;

type Ui = typeof DEFAULT_UI;

const RECENT_KEY = "atools:emoji-picker:recent:v1";

const getEmojiRegex = (): RegExp | null => {
  try {
    return new RegExp("\\p{Extended_Pictographic}", "u");
  } catch {
    return null;
  }
};

const EMOJI_RE = getEmojiRegex();

const isEmojiChar = (s: string): boolean => {
  if (!EMOJI_RE) return false;
  return EMOJI_RE.test(s);
};

const parseHexQuery = (q: string): number | null => {
  const raw = q.trim().toUpperCase().replace(/^U\\+/, "");
  if (!raw) return null;
  if (!/^[0-9A-F]{4,6}$/.test(raw)) return null;
  const n = Number.parseInt(raw, 16);
  return Number.isFinite(n) ? n : null;
};

const CATEGORIES: Category[] = [
  {
    key: "smileys",
    name: "表情",
    ranges: [
      [0x1f600, 0x1f64f],
      [0x1f900, 0x1f9ff],
    ],
  },
  {
    key: "hands",
    name: "手势",
    ranges: [
      [0x1f44a, 0x1f44f],
      [0x1f590, 0x1f596],
      [0x270a, 0x270d],
    ],
  },
  { key: "symbols", name: "符号", ranges: [[0x2600, 0x26ff], [0x2700, 0x27bf]] },
  {
    key: "objects",
    name: "物品",
    ranges: [
      [0x1f300, 0x1f5ff],
      [0x1f680, 0x1f6ff],
      [0x1f9e0, 0x1f9ff],
    ],
  },
];

const buildEmojiList = (ranges: Array<[number, number]>) => {
  const out: Array<{ emoji: string; codepoint: number }> = [];
  for (const [start, end] of ranges) {
    for (let cp = start; cp <= end; cp += 1) {
      let emoji = "";
      try {
        emoji = String.fromCodePoint(cp);
      } catch {
        continue;
      }
      if (!isEmojiChar(emoji)) continue;
      out.push({ emoji, codepoint: cp });
    }
  }
  return out;
};

const uniqByEmoji = (items: Array<{ emoji: string; codepoint: number }>) => {
  const seen = new Set<string>();
  const out: Array<{ emoji: string; codepoint: number }> = [];
  for (const it of items) {
    if (seen.has(it.emoji)) continue;
    seen.add(it.emoji);
    out.push(it);
  }
  return out;
};

const loadRecent = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).filter((s) => s.length > 0).slice(0, 48);
  } catch {
    return [];
  }
};

const saveRecent = (items: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 48)));
  } catch {
    // ignore
  }
};

export default function EmojiPickerClient() {
  return (
    <ToolPageLayout toolSlug="emoji-picker" maxWidthClassName="max-w-6xl">
      <EmojiPickerInner />
    </ToolPageLayout>
  );
}

function EmojiPickerInner() {
  const config = useOptionalToolConfig("emoji-picker");
  const ui: Ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<Ui>) };

  const [categoryKey, setCategoryKey] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState("");
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [copied, setCopied] = useState<string | null>(null);

  const allEmojis = useMemo(() => {
    const ranges: Array<[number, number]> = [
      [0x1f300, 0x1f5ff],
      [0x1f600, 0x1f64f],
      [0x1f680, 0x1f6ff],
      [0x1f900, 0x1f9ff],
      [0x2600, 0x26ff],
      [0x2700, 0x27bf],
    ];
    return uniqByEmoji(buildEmojiList(ranges));
  }, []);

  const categoryEmojis = useMemo(() => {
    if (categoryKey === "all") return allEmojis;
    const cat = CATEGORIES.find((c) => c.key === categoryKey);
    if (!cat) return allEmojis;
    return uniqByEmoji(buildEmojiList(cat.ranges));
  }, [allEmojis, categoryKey]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return categoryEmojis.slice(0, 800);
    const hex = parseHexQuery(q);
    if (hex != null) {
      return categoryEmojis.filter((it) => it.codepoint === hex).slice(0, 800);
    }
    const lower = q.toLowerCase();
    return categoryEmojis
      .filter((it) => it.emoji.includes(q) || it.codepoint.toString(16).includes(lower))
      .slice(0, 800);
  }, [categoryEmojis, query]);

  const copy = async (emoji: string) => {
    await navigator.clipboard.writeText(emoji);
    setCopied(emoji);
    setTimeout(() => setCopied((v) => (v === emoji ? null : v)), 900);
    setPicked((prev) => prev + emoji);
    setRecent((prev) => {
      const next = [emoji, ...prev.filter((x) => x !== emoji)].slice(0, 48);
      saveRecent(next);
      return next;
    });
  };

  const copyPicked = async () => {
    if (!picked) return;
    await navigator.clipboard.writeText(picked);
    setCopied("picked");
    setTimeout(() => setCopied((v) => (v === "picked" ? null : v)), 900);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        {!EMOJI_RE && (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
            当前浏览器不支持 Unicode 属性正则（{"\\p{Extended_Pictographic}"}），建议升级浏览器以获得完整 emoji 列表。
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-100 p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setCategoryKey("all")}
                  className={`rounded-2xl px-4 py-2 font-semibold transition ${
                    categoryKey === "all" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {ui.all}
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategoryKey(c.key)}
                    className={`rounded-2xl px-4 py-2 font-semibold transition ${
                      categoryKey === c.key ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={ui.searchPlaceholder}
                className="min-w-[220px] flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </div>

            {recent.length > 0 && (
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.recent}</div>
                <div className="mt-3 grid grid-cols-10 gap-2 sm:grid-cols-12 md:grid-cols-14 lg:grid-cols-16">
                  {recent.slice(0, 32).map((emoji, idx) => (
                    <button
                      key={`${emoji}-${idx}`}
                      type="button"
                      onClick={() => void copy(emoji)}
                      className="rounded-2xl bg-slate-50 py-2 text-xl ring-1 ring-slate-200 transition hover:bg-slate-100"
                      title="点击复制"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">Emoji</div>
                <div className="text-xs text-slate-500">{filtered.length} / {categoryEmojis.length}</div>
              </div>

              {filtered.length === 0 ? (
                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
                  {ui.empty}
                </div>
              ) : (
                <div className="mt-4 max-h-[520px] overflow-auto rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="grid grid-cols-10 gap-2 sm:grid-cols-12 md:grid-cols-14 lg:grid-cols-16">
                    {filtered.map((it) => (
                      <button
                        key={it.codepoint}
                        type="button"
                        onClick={() => void copy(it.emoji)}
                        className={`rounded-2xl py-2 text-xl ring-1 transition ${
                          copied === it.emoji ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200 hover:bg-slate-100"
                        }`}
                        title={`U+${it.codepoint.toString(16).toUpperCase()}`}
                      >
                        {it.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="text-xs text-slate-500">{ui.tip}</div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{ui.picked}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyPicked()}
                    disabled={!picked}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {ui.copy}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPicked("")}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    {ui.clear}
                  </button>
                </div>
              </div>
              <textarea
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
                className="mt-3 h-48 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                placeholder="点击左侧 emoji 自动追加到这里…"
              />
              {copied === "picked" && <div className="mt-2 text-xs text-emerald-700">已复制</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
