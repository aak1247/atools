"use client";

import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { useMemo, useState } from "react";

const DEFAULT_UI = {
  title: "HTML 标签去除",
  subtitle: "将 HTML 转为纯文本（不上传服务器）",
  convertHeader: "转换",
  copyResult: "复制结果",
  inputHtml: "输入（HTML）",
  inputPlaceholder: "输入或粘贴 HTML 代码…",
  outputPlainText: "输出（纯文本）",
  outputPlaceholder: "去除标签后的纯文本会显示在这里…",
} as const;

type HtmlStripperUi = typeof DEFAULT_UI;

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
  const config = useOptionalToolConfig("html-stripper");
  const ui: HtmlStripperUi = useMemo(
    () => ({ ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<HtmlStripperUi>) }),
    [config?.ui],
  );

  const [input, setInput] = useState("<p>Hello <b>world</b><br/>Line2</p>");

  const output = useMemo(() => stripHtml(input), [input]);

  const copy = async () => {
    await navigator.clipboard.writeText(output);
  };

  return (
    <ToolPageLayout toolSlug="html-stripper" maxWidthClassName="max-w-5xl">
      <div className="space-y-8">

      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">{ui.convertHeader}</div>
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!output}
            className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {ui.copyResult}
          </button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.inputHtml}</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={ui.inputPlaceholder}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.outputPlainText}</div>
            <textarea
              value={output}
              readOnly
              placeholder={ui.outputPlaceholder}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
    </ToolPageLayout>
    );
}
