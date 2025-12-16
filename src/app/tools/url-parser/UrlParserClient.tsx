"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Parsed =
  | { ok: true; url: URL; normalized: string; addedScheme: boolean }
  | { ok: false; error: string };

const tryParseUrl = (input: string): Parsed => {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "请输入 URL。" };
  try {
    const u = new URL(raw);
    return { ok: true, url: u, normalized: u.toString(), addedScheme: false };
  } catch {
    try {
      const u = new URL(`https://${raw}`);
      return { ok: true, url: u, normalized: u.toString(), addedScheme: true };
    } catch {
      return { ok: false, error: "URL 解析失败，请检查格式。" };
    }
  }
};

const setUrlPart = (base: URL, update: (u: URL) => void): string => {
  const u = new URL(base.toString());
  update(u);
  return u.toString();
};

export default function UrlParserClient() {
  const [input, setInput] = useState("");

  const parsed = useMemo(() => tryParseUrl(input), [input]);

  const params = useMemo(() => {
    if (!parsed.ok) return [];
    return Array.from(parsed.url.searchParams.entries()).map(([k, v]) => ({ key: k, value: v }));
  }, [parsed]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const updateParam = (idx: number, patch: Partial<{ key: string; value: string }>) => {
    if (!parsed.ok) return;
    const list = params.map((p) => ({ ...p }));
    const current = list[idx];
    if (!current) return;
    const next = { ...current, ...patch };
    list[idx] = next;

    const nextUrl = setUrlPart(parsed.url, (u) => {
      u.search = "";
      for (const p of list) {
        if (!p.key) continue;
        u.searchParams.append(p.key, p.value ?? "");
      }
    });
    setInput(nextUrl);
  };

  const removeParam = (idx: number) => {
    if (!parsed.ok) return;
    const list = params.filter((_p, i) => i !== idx);
    const nextUrl = setUrlPart(parsed.url, (u) => {
      u.search = "";
      for (const p of list) {
        if (!p.key) continue;
        u.searchParams.append(p.key, p.value ?? "");
      }
    });
    setInput(nextUrl);
  };

  const addParam = () => {
    if (!parsed.ok) return;
    const list = [...params, { key: "", value: "" }];
    const nextUrl = setUrlPart(parsed.url, (u) => {
      u.search = "";
      for (const p of list) {
        if (!p.key) continue;
        u.searchParams.append(p.key, p.value ?? "");
      }
    });
    setInput(nextUrl);
  };

  return (
    <ToolPageLayout toolSlug="url-parser">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-700">粘贴 URL 后会自动解析；修改字段会实时重组。</div>
            <button
              type="button"
              onClick={() => void copy(parsed.ok ? parsed.normalized : "")}
              disabled={!parsed.ok}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              复制规范化 URL
            </button>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold text-slate-900">URL 输入</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://example.com/path?foo=1&bar=2#hash"
              className="h-28 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
            {!parsed.ok && input.trim() && <div className="mt-2 text-sm text-rose-600">错误：{parsed.error}</div>}
            {parsed.ok && parsed.addedScheme && (
              <div className="mt-2 text-xs text-slate-500">提示：检测到缺少协议，已默认按 https:// 解析。</div>
            )}
          </div>

          {parsed.ok && (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">组成部分</div>
                <div className="mt-4 grid gap-3 text-sm text-slate-700">
                  <label className="block">
                    协议
                    <input
                      value={parsed.url.protocol.replace(/:$/, "")}
                      onChange={(e) => setInput(setUrlPart(parsed.url, (u) => (u.protocol = `${e.target.value.replace(/:$/, "")}:`)))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                  <label className="block">
                    主机（host）
                    <input
                      value={parsed.url.host}
                      onChange={(e) => setInput(setUrlPart(parsed.url, (u) => (u.host = e.target.value)))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                  <label className="block">
                    路径（pathname）
                    <input
                      value={parsed.url.pathname}
                      onChange={(e) => setInput(setUrlPart(parsed.url, (u) => (u.pathname = e.target.value || "/")))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                  <label className="block">
                    Hash
                    <input
                      value={parsed.url.hash.replace(/^#/, "")}
                      onChange={(e) => setInput(setUrlPart(parsed.url, (u) => (u.hash = e.target.value ? `#${e.target.value}` : "")))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">Query 参数</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={addParam}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                    >
                      添加
                    </button>
                    <button
                      type="button"
                      onClick={() => setInput(setUrlPart(parsed.url, (u) => (u.search = "")))}
                      disabled={params.length === 0}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {params.length === 0 && <div className="text-sm text-slate-500">暂无参数</div>}
                  {params.map((p, idx) => (
                    <div key={`${idx}-${p.key}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                      <input
                        value={p.key}
                        onChange={(e) => updateParam(idx, { key: e.target.value })}
                        placeholder="key"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      />
                      <input
                        value={p.value}
                        onChange={(e) => updateParam(idx, { value: e.target.value })}
                        placeholder="value"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      />
                      <button
                        type="button"
                        onClick={() => removeParam(idx)}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 text-xs text-slate-500">
                  说明：为简化处理，重复 key 会按输入顺序重新构造（可能与原始重复参数不同）。
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolPageLayout>
  );
}

