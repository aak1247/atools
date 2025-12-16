"use client";

import { useMemo, useState } from "react";

type Mode = "pretty" | "minify";

const sortJsonKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJsonKeysDeep);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((a, b) => a.localeCompare(b, "en"));
    const next: Record<string, unknown> = {};
    for (const key of keys) next[key] = sortJsonKeysDeep(record[key]);
    return next;
  }
  return value;
};

export default function JsonFormatterClient() {
  const [mode, setMode] = useState<Mode>("pretty");
  const [indent, setIndent] = useState(2);
  const [sortKeys, setSortKeys] = useState(false);
  const [input, setInput] = useState('{"hello":"world","arr":[3,2,1]}');

  const result = useMemo(() => {
    const raw = input.trim();
    if (!raw) return { ok: true as const, text: "" };
    try {
      const parsed = JSON.parse(raw) as unknown;
      const value = sortKeys ? sortJsonKeysDeep(parsed) : parsed;
      if (mode === "minify") return { ok: true as const, text: JSON.stringify(value) };
      return { ok: true as const, text: JSON.stringify(value, null, indent) };
    } catch (e) {
      return {
        ok: false as const,
        text: "",
        error: e instanceof Error ? e.message : "JSON 无法解析",
      };
    }
  }, [indent, input, mode, sortKeys]);

  const copy = async () => {
    if (!result.ok) return;
    await navigator.clipboard.writeText(result.text);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">JSON 格式化</h1>
        <p className="mt-2 text-sm text-slate-500">格式化 / 压缩 / 键排序，纯本地处理</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-2xl bg-slate-100/60 p-1">
            <button
              type="button"
              onClick={() => setMode("pretty")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mode === "pretty"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              格式化
            </button>
            <button
              type="button"
              onClick={() => setMode("minify")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mode === "minify"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              压缩
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={sortKeys}
                onChange={(e) => setSortKeys(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              键排序
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              缩进
              <select
                value={indent}
                disabled={mode === "minify"}
                onChange={(e) => setIndent(Number(e.target.value))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
              >
                <option value={2}>2</option>
                <option value={4}>4</option>
                <option value={8}>8</option>
              </select>
            </label>
            <button
              type="button"
              disabled={!result.ok}
              onClick={copy}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              复制结果
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">输入</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="粘贴 JSON…"
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">输出</div>
            <textarea
              value={result.ok ? result.text : ""}
              readOnly
              placeholder="结果会显示在这里…"
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
            {!result.ok && (
              <div className="mt-2 text-sm text-rose-600">错误：{result.error}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

