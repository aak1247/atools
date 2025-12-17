"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

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

const DEFAULT_UI = {
  pretty: "格式化",
  minify: "压缩",
  sortKeys: "键排序",
  indent: "缩进",
  copyResult: "复制结果",
  input: "输入",
  output: "输出",
  inputPlaceholder: "粘贴 JSON…",
  outputPlaceholder: "结果会显示在这里…",
  errorPrefix: "错误：",
  invalidJson: "JSON 无法解析",
} as const;

type JsonFormatterUi = typeof DEFAULT_UI;

export default function JsonFormatterClient() {
  const config = useOptionalToolConfig("json-formatter");
  const ui: JsonFormatterUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<JsonFormatterUi>) };

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
        error: e instanceof Error ? e.message : ui.invalidJson,
      };
    }
  }, [indent, input, mode, sortKeys, ui.invalidJson]);

  const copy = async () => {
    if (!result.ok) return;
    await navigator.clipboard.writeText(result.text);
  };

  return (
    <ToolPageLayout toolSlug="json-formatter">
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
              {ui.pretty}
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
              {ui.minify}
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
              {ui.sortKeys}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              {ui.indent}
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
              {ui.copyResult}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.input}</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={ui.inputPlaceholder}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.output}</div>
            <textarea
              value={result.ok ? result.text : ""}
              readOnly
              placeholder={ui.outputPlaceholder}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
            {!result.ok && (
              <div className="mt-2 text-sm text-rose-600">
                {ui.errorPrefix} {result.error}
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
