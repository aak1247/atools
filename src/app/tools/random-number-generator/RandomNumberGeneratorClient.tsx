"use client";

import { useEffect, useMemo, useState } from "react";

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

const randomIntInclusive = (min: number, max: number) => {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const range = hi - lo + 1;
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi)) {
    throw new Error("请输入安全整数范围内的 min/max");
  }
  if (range <= 0 || range > 2 ** 32) {
    throw new Error("范围过大（最大支持 2^32）");
  }

  const maxUnbiased = Math.floor((2 ** 32) / range) * range;
  while (true) {
    const x = randomUint32();
    if (x < maxUnbiased) return lo + (x % range);
  }
};

export default function RandomNumberGeneratorClient() {
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(100);
  const [count, setCount] = useState(10);
  const [unique, setUnique] = useState(false);
  const [format, setFormat] = useState<OutputFormat>("newline");
  const [result, setResult] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        throw new Error("去重模式下，数量不能超过范围大小");
      }

      const values: number[] = [];
      if (!unique) {
        for (let i = 0; i < safeCount; i += 1) {
          values.push(randomIntInclusive(min, max));
        }
      } else {
        const set = new Set<number>();
        while (set.size < safeCount) {
          set.add(randomIntInclusive(min, max));
        }
        values.push(...Array.from(set));
      }
      setResult(values);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
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
    <div className="mx-auto w-full max-w-4xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          随机数生成器
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          支持区间、数量、去重与复制（设置会保存到本地）
        </p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
            <div className="text-sm font-semibold text-slate-900">参数</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <div className="text-xs text-slate-500">最小值</div>
                <input
                  type="number"
                  value={min}
                  onChange={(e) => setMin(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <label className="block">
                <div className="text-xs text-slate-500">最大值</div>
                <input
                  type="number"
                  value={max}
                  onChange={(e) => setMax(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <label className="block">
                <div className="text-xs text-slate-500">数量（1~10000）</div>
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
                <div className="text-xs text-slate-500">输出格式</div>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as OutputFormat)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="newline">换行</option>
                  <option value="comma">逗号分隔</option>
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
                去重（不重复）
              </label>
              <div className="text-xs text-slate-500">
                范围大小：{Number.isFinite(rangeSize) ? rangeSize.toLocaleString() : "-"}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={generate}
                className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-[0.99]"
              >
                生成
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.99]"
              >
                恢复默认
              </button>
            </div>

            {error && <div className="mt-3 text-sm text-rose-600">错误：{error}</div>}
          </div>

          <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">结果</div>
              <button
                type="button"
                disabled={result.length === 0}
                onClick={copy}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                复制
              </button>
            </div>
            <textarea
              value={text}
              readOnly
              placeholder="点击“生成”后显示结果…"
              className="mt-3 h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
            <div className="mt-3 text-xs text-slate-500">
              说明：使用 crypto.getRandomValues 生成随机数。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

