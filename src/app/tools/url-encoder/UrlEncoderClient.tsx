"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";

type Mode = "encode" | "decode";

const encodeForm = (text: string) =>
  encodeURIComponent(text).replace(/%20/g, "+");

const decodeForm = (text: string) =>
  decodeURIComponent(text.replace(/\+/g, "%20"));

export default function UrlEncoderClient() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";
  const ui =
    locale === "en-us"
      ? {
          encode: "Encode",
          decode: "Decode",
          useForm: "Use x-www-form-urlencoded (space as +)",
          text: "Text",
          urlEncoded: "URL-encoded",
          encodedResult: "Encoded result",
          decodedResult: "Decoded result",
          copy: "Copy",
          encodePlaceholder: "Enter text to encode...",
          decodePlaceholder: "Enter URL-encoded text to decode...",
          resultPlaceholder: "Result will appear here...",
          errorPrefix: "Error:",
          invalidInput: "Unable to parse input",
          hint:
            "Tip: Standard mode uses encodeURIComponent/decodeURIComponent. Form mode encodes spaces as “+”.",
        }
      : {
          encode: "编码",
          decode: "解码",
          useForm: "使用 x-www-form-urlencoded（空格为 +）",
          text: "原文",
          urlEncoded: "URL 编码",
          encodedResult: "编码结果",
          decodedResult: "解码结果",
          copy: "复制",
          encodePlaceholder: "输入要编码的内容…",
          decodePlaceholder: "输入要解码的 URL 编码内容…",
          resultPlaceholder: "结果会显示在这里…",
          errorPrefix: "错误：",
          invalidInput: "无法解析输入内容",
          hint:
            "提示：标准模式使用 encodeURIComponent / decodeURIComponent；表单模式会将空格编码为 “+”。",
        };

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
        error: error instanceof Error ? error.message : ui.invalidInput,
      };
    }
  }, [input, locale, mode, useFormEncoding]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <ToolPageLayout toolSlug="url-encoder">
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
              {ui.encode}
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
              {ui.decode}
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={useFormEncoding}
              onChange={(e) => setUseFormEncoding(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            {ui.useForm}
          </label>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {mode === "encode" ? ui.text : ui.urlEncoded}
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === "encode" ? ui.encodePlaceholder : ui.decodePlaceholder
              }
              className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">
                {mode === "encode" ? ui.encodedResult : ui.decodedResult}
              </div>
              <button
                type="button"
                disabled={!result.ok || !result.text}
                onClick={() => copy(result.text)}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                {ui.copy}
              </button>
            </div>

            <textarea
              value={result.ok ? result.text : ""}
              readOnly
              placeholder={ui.resultPlaceholder}
              className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
            />

            {!result.ok && (
              <div className="mt-2 text-sm text-rose-600">
                {ui.errorPrefix}
                {result.error}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">{ui.hint}</div>
      </div>
    </ToolPageLayout>
  );
}
