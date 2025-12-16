"use client";

import { useMemo, useState } from "react";

const stripHtml = (html: string): string => {
  const normalized = html
    .replace(/\r\n/g, "\n")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<\/\s*div\s*>/gi, "\n")
    .replace(/<\/\s*li\s*>/gi, "\n");

  // Next.js 会在服务端预渲染 client component 的初始 HTML，这里需要避免直接访问 DOM API。
  if (typeof DOMParser === "undefined") {
    return normalized
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const doc = new DOMParser().parseFromString(normalized, "text/html");
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
};

export default function HtmlStripperClient() {
  const [input, setInput] = useState("<p>Hello <b>world</b><br/>Line2</p>");

  const output = useMemo(() => stripHtml(input), [input]);

  const copy = async () => {
    await navigator.clipboard.writeText(output);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">HTML 标签去除</h1>
        <p className="mt-2 text-sm text-slate-500">将 HTML 转为纯文本（不上传服务器）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">转换</div>
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!output}
            className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            复制结果
          </button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">输入（HTML）</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">输出（纯文本）</div>
            <textarea
              value={output}
              readOnly
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
