"use client";

import { useMemo, useState } from "react";

const bytesToUuidV4 = (bytes: Uint8Array) => {
  const b = new Uint8Array(bytes);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;

  const hex = Array.from(b)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
};

const generateUuidV4 = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToUuidV4(bytes);
};

export default function UuidGeneratorClient() {
  const [count, setCount] = useState(5);
  const [uppercase, setUppercase] = useState(false);
  const [noHyphen, setNoHyphen] = useState(false);
  const [uuids, setUuids] = useState<string[]>(() => []);

  const normalized = useMemo(() => {
    const items = uuids.map((id) => {
      const value = noHyphen ? id.replace(/-/g, "") : id;
      return uppercase ? value.toUpperCase() : value.toLowerCase();
    });
    return items;
  }, [noHyphen, uppercase, uuids]);

  const generate = () => {
    const next = Array.from({ length: count }, () => generateUuidV4());
    setUuids(next);
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const canCopyAll = normalized.length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          UUID 生成器
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          UUID v4 批量生成，一键复制，纯本地运行
        </p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              数量
              <input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) =>
                  setCount(
                    Math.min(100, Math.max(1, Number.parseInt(e.target.value, 10) || 1)),
                  )
                }
                className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={uppercase}
                onChange={(e) => setUppercase(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              大写
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={noHyphen}
                onChange={(e) => setNoHyphen(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              去掉短横线
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={generate}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-[0.99]"
            >
              生成
            </button>
            <button
              type="button"
              disabled={!canCopyAll}
              onClick={() => copy(normalized.join("\n"))}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60 active:scale-[0.99]"
            >
              复制全部
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-sm font-semibold text-slate-900">结果</div>
          <div className="rounded-2xl border border-slate-200 bg-white">
            {normalized.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                点击“生成”开始
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {normalized.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-2 px-4 py-3">
                    <code className="break-all font-mono text-xs text-slate-900">
                      {id}
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(id)}
                      className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                    >
                      复制
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          提示：UUID v4 使用加密安全随机数生成（crypto.getRandomValues / randomUUID）。
        </div>
      </div>
    </div>
  );
}

