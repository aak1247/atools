"use client";

import { useMemo, useState } from "react";

type Mode = "encode" | "decode";

const encodeForm = (text: string) =>
  encodeURIComponent(text).replace(/%20/g, "+");

const decodeForm = (text: string) =>
  decodeURIComponent(text.replace(/\+/g, "%20"));

export default function UrlEncoderClient() {
  const [mode, setMode] = useState<Mode>("encode");
  const [useFormEncoding, setUseFormEncoding] = useState(false);
  const [input, setInput] = useState("");

  const result = useMemo(() => {
    try {
      if (mode === "encode") {
        const encoded = useFormEncoding ? encodeForm(input) : encodeURIComponent(input);
        return { ok: true as const, text: encoded };
      }
      const decoded = useFormEncoding ? decodeForm(input) : decodeURIComponent(input);
      return { ok: true as const, text: decoded };
    } catch (error) {
      return {
        ok: false as const,
        text: "",
        error: error instanceof Error ? error.message : "无法解析输入内容",
      };
    }
  }, [input, mode, useFormEncoding]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          URL 编码解码
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          一键编码/解码 URL 参数，纯本地处理
        </p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-2xl bg-slate-100/60 p-1">
            <button
              type="button"
              onClick={() => setMode("encode")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mode === "encode"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              编码
            </button>
            <button
              type="button"
              onClick={() => setMode("decode")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mode === "decode"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              解码
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={useFormEncoding}
              onChange={(e) => setUseFormEncoding(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            使用 x-www-form-urlencoded（空格为 +）
          </label>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {mode === "encode" ? "原文" : "URL 编码"}
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === "encode"
                  ? "输入要编码的内容…"
                  : "输入要解码的 URL 编码内容…"
              }
              className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">
                {mode === "encode" ? "编码结果" : "解码结果"}
              </div>
              <button
                type="button"
                disabled={!result.ok || !result.text}
                onClick={() => copy(result.text)}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                复制
              </button>
            </div>

            <textarea
              value={result.ok ? result.text : ""}
              readOnly
              placeholder="结果会显示在这里…"
              className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
            />

            {!result.ok && (
              <div className="mt-2 text-sm text-rose-600">错误：{result.error}</div>
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          提示：标准模式使用 encodeURIComponent / decodeURIComponent；表单模式会将空格编码为 “+”。
        </div>
      </div>
    </div>
  );
}

