"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

const DEFAULT_UI = {
  title: "Markdown 编辑器",
  input: "Markdown 输入",
  preview: "预览（纯文本）",
  placeholder: "在这里输入 Markdown…",
  copy: "复制",
  clear: "清空",
} as const;

type MarkdownEditorUi = typeof DEFAULT_UI;

export default function MarkdownEditorClient() {
  const config = useOptionalToolConfig("markdown-editor");
  const ui: MarkdownEditorUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<MarkdownEditorUi>) };

  const [value, setValue] = useState<string>("# Hello Markdown\n\n- 支持本地编辑\n- 预览为纯文本（后续可扩展为富文本渲染）\n");

  const previewText = useMemo(() => value, [value]);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
  };

  const clear = () => setValue("");

  return (
    <ToolPageLayout toolSlug="markdown-editor">
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">{ui.title}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {ui.copy}
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {ui.clear}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.input}</div>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={ui.placeholder}
              className="h-96 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.preview}</div>
            <pre className="h-96 w-full overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900">
              {previewText || ""}
            </pre>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}

