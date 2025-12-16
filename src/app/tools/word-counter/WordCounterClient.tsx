"use client";

import { useMemo, useState } from "react";

const countWords = (text: string): number => {
  // 以空白分隔的英文单词统计（中文会被当作“词”间隔符之外的字符）
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.length;
};

const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

export default function WordCounterClient() {
  const [text, setText] = useState("在这里输入文本…\nHello world!");

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
    const payload = [
      `字符数（含空白）：${stats.totalChars}`,
      `字符数（去空白）：${stats.charsNoSpace}`,
      `单词数：${stats.words}`,
      `行数：${stats.lines}`,
      `中文字符数：${stats.chineseChars}`,
      `UTF-8 字节数：${stats.bytes}`,
    ].join("\n");
    await navigator.clipboard.writeText(payload);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">字数统计</h1>
        <p className="mt-2 text-sm text-slate-500">字符/单词/行数统计（纯本地处理）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">输入</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-[520px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              placeholder="输入文本…"
            />
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">统计</div>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  复制
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                {[
                  { label: "字符数（含空白）", value: stats.totalChars },
                  { label: "字符数（去空白）", value: stats.charsNoSpace },
                  { label: "单词数", value: stats.words },
                  { label: "行数", value: stats.lines },
                  { label: "中文字符数", value: stats.chineseChars },
                  { label: "UTF-8 字节数", value: stats.bytes },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
                    <div className="text-sm font-medium text-slate-700">{row.label}</div>
                    <div className="text-lg font-bold text-slate-900">{row.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 text-xs text-slate-500">
              说明：单词数按空白分隔统计；中文字符数按 Unicode 汉字区间粗略统计。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

