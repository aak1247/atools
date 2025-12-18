"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

const countWords = (text: string): number => {
  // 以空白分隔的英文单词统计（中文会被当作“词”间隔符之外的字符）
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.length;
};

const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

const DEFAULT_UI = {
  inputTitle: "输入",
  inputPlaceholder: "输入文本…",
  initialText: "在这里输入文本…\nHello world!",
  statsTitle: "统计",
  copy: "复制",
  labelValueSeparator: "：",
  totalChars: "字符数（含空白）",
  charsNoSpace: "字符数（去空白）",
  words: "单词数",
  lines: "行数",
  chineseChars: "中文字符数",
  bytes: "UTF-8 字节数",
  note: "说明：单词数按空白分隔统计；中文字符数按 Unicode 汉字区间粗略统计。",
} as const;

type WordCounterUi = typeof DEFAULT_UI;

export default function WordCounterClient() {
  const config = useOptionalToolConfig("word-counter");
  const ui: WordCounterUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<WordCounterUi>) };

  const [text, setText] = useState<string>(() => ui.initialText);

  const stats = useMemo(() => {
    const totalChars = text.length;
    const charsNoSpace = text.replace(/\s/g, "").length;
    const lines = text.length === 0 ? 0 : text.replace(/\r\n/g, "\n").split("\n").length;
    const words = text.trim() ? countWords(text) : 0;
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
    const bytes = utf8Bytes(text);
    return { totalChars, charsNoSpace, lines, words, chineseChars, bytes };
  }, [text]);

  const copy = async () => {
    const sep = ui.labelValueSeparator;
    const payload = [
      `${ui.totalChars}${sep}${stats.totalChars}`,
      `${ui.charsNoSpace}${sep}${stats.charsNoSpace}`,
      `${ui.words}${sep}${stats.words}`,
      `${ui.lines}${sep}${stats.lines}`,
      `${ui.chineseChars}${sep}${stats.chineseChars}`,
      `${ui.bytes}${sep}${stats.bytes}`,
    ].join("\n");
    await navigator.clipboard.writeText(payload);
  };

  return (
    <ToolPageLayout toolSlug="word-counter">
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.inputTitle}</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-[520px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              placeholder={ui.inputPlaceholder}
            />
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{ui.statsTitle}</div>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {ui.copy}
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                {[
                  { key: "totalChars", label: ui.totalChars, value: stats.totalChars },
                  { key: "charsNoSpace", label: ui.charsNoSpace, value: stats.charsNoSpace },
                  { key: "words", label: ui.words, value: stats.words },
                  { key: "lines", label: ui.lines, value: stats.lines },
                  { key: "chineseChars", label: ui.chineseChars, value: stats.chineseChars },
                  { key: "bytes", label: ui.bytes, value: stats.bytes },
                ].map((row) => (
                  <div key={row.key} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
                    <div className="text-sm font-medium text-slate-700">{row.label}</div>
                    <div className="text-lg font-bold text-slate-900">{row.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 text-xs text-slate-500">
              {ui.note}
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
