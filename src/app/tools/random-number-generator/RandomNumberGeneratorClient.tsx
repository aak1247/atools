"use client";

import { useEffect, useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type OutputFormat = "newline" | "comma";

type Settings = {
  min: number;
  max: number;
  count: number;
  unique: boolean;
  format: OutputFormat;
};

const STORAGE_KEY = "atools.random-number-generator.v1";

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(value)));

const randomUint32 = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
};

const DEFAULT_UI = {
  params: "参数",
  min: "最小值",
  max: "最大值",
  count: "数量（1~10000）",
  outputFormat: "输出格式",
  formatNewline: "换行",
  formatComma: "逗号分隔",
  unique: "去重（不重复）",
  rangeSizePrefix: "范围大小：",
  generate: "生成",
  reset: "恢复默认",
  result: "结果",
  copy: "复制",
  copied: "已复制",
  placeholder: "点击“生成”后显示结果…",
  note: "说明：使用 crypto.getRandomValues 生成随机数。",
  errorPrefix: "错误：",
  errSafeInteger: "请输入安全整数范围内的 min/max",
  errRangeTooLarge: "范围过大（最大支持 2^32）",
  errUniqueExceedsRange: "去重模式下，数量不能超过范围大小",
  errGenerateFailed: "生成失败",
} as const;

type Ui = typeof DEFAULT_UI;

const randomIntInclusive = (min: number, max: number, ui: Ui) => {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const range = hi - lo + 1;
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi)) {
    throw new Error(ui.errSafeInteger);
  }
  if (range <= 0 || range > 2 ** 32) {
    throw new Error(ui.errRangeTooLarge);
  }

  const maxUnbiased = Math.floor((2 ** 32) / range) * range;
  while (true) {
    const x = randomUint32();
    if (x < maxUnbiased) return lo + (x % range);
  }
};

export default function RandomNumberGeneratorClient() {
  return (
    <ToolPageLayout toolSlug="random-number-generator" maxWidthClassName="max-w-4xl">
      <RandomNumberGeneratorInner />
    </ToolPageLayout>
  );
}

function RandomNumberGeneratorInner() {
  const config = useOptionalToolConfig("random-number-generator");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const [min, setMin] = useState(1);
  const [max, setMax] = useState(100);
  const [count, setCount] = useState(10);
  const [unique, setUnique] = useState(false);
  const [format, setFormat] = useState<OutputFormat>("newline");
  const [result, setResult] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (typeof parsed.min === "number") setMin(parsed.min);
      if (typeof parsed.max === "number") setMax(parsed.max);
      if (typeof parsed.count === "number") setCount(parsed.count);
      if (typeof parsed.unique === "boolean") setUnique(parsed.unique);
      if (parsed.format === "newline" || parsed.format === "comma") setFormat(parsed.format);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const settings: Settings = {
      min,
      max,
      count,
      unique,
      format,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [count, format, max, min, unique]);

  const rangeSize = useMemo(() => {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return hi - lo + 1;
  }, [max, min]);

  const text = useMemo(() => {
    if (format === "comma") return result.join(", ");
    return result.join("\n");
  }, [format, result]);

  const generate = () => {
    setError(null);
    setResult([]);
    try {
      const safeCount = clampInt(count, 1, 10000);
      if (unique && safeCount > rangeSize) {
        throw new Error(ui.errUniqueExceedsRange);
      }

      const values: number[] = [];
      if (!unique) {
        for (let i = 0; i < safeCount; i += 1) {
          values.push(randomIntInclusive(min, max, ui));
        }
      } else {
        const set = new Set<number>();
        while (set.size < safeCount) {
          set.add(randomIntInclusive(min, max, ui));
        }
        values.push(...Array.from(set));
      }
      setResult(values);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errGenerateFailed);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setMin(1);
    setMax(100);
    setCount(10);
    setUnique(false);
    setFormat("newline");
    setResult([]);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
          <div className="text-sm font-semibold text-slate-900">{ui.params}</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs text-slate-500">{ui.min}</div>
              <input
                type="number"
                value={min}
                onChange={(e) => setMin(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </label>
            <label className="block">
              <div className="text-xs text-slate-500">{ui.max}</div>
              <input
                type="number"
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </label>
            <label className="block">
              <div className="text-xs text-slate-500">{ui.count}</div>
              <input
                type="number"
                min={1}
                max={10000}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </label>
            <label className="block">
              <div className="text-xs text-slate-500">{ui.outputFormat}</div>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as OutputFormat)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              >
                <option value="newline">{ui.formatNewline}</option>
                <option value="comma">{ui.formatComma}</option>
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={unique}
                onChange={(e) => setUnique(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.unique}
            </label>
            <div className="text-xs text-slate-500">
              {ui.rangeSizePrefix}
              {Number.isFinite(rangeSize) ? rangeSize.toLocaleString() : "-"}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={generate}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-[0.99]"
            >
              {ui.generate}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.99]"
            >
              {ui.reset}
            </button>
          </div>

          {error && (
            <div className="mt-3 text-sm text-rose-600">
              {ui.errorPrefix}
              {error}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">{ui.result}</div>
            <button
              type="button"
              disabled={result.length === 0}
              onClick={copy}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {copied ? ui.copied : ui.copy}
            </button>
          </div>
          <textarea
            value={text}
            readOnly
            placeholder={ui.placeholder}
            className="mt-3 h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
          />
          <div className="mt-3 text-xs text-slate-500">{ui.note}</div>
        </div>
      </div>
    </div>
  );
}
