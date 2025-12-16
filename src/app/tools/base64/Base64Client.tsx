"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";

type Mode = "encode" | "decode";

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string) => {
  const normalized = base64.replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const toUrlSafeBase64 = (base64: string) =>
  base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const fromUrlSafeBase64 = (urlSafe: string) => {
  const normalized = urlSafe.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  return normalized + "=".repeat(padLength);
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export default function Base64Client() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";
  const ui =
    locale === "en-us"
      ? {
          encode: "Encode",
          decode: "Decode",
          plainText: "Text",
          base64: "Base64",
          decoded: "Decoded",
          copy: "Copy",
          resultPlaceholder: "Result will appear here...",
          encodePlaceholder: "Enter text to encode...",
          decodePlaceholder: "Enter Base64 to decode...",
          errorPrefix: "Error:",
          invalidInput: "Unable to parse input",
          hint:
            "Tip: Decode ignores whitespace. URL-safe uses “-” and “_” and removes “=” padding.",
        }
      : {
          encode: "编码",
          decode: "解码",
          plainText: "原文",
          base64: "Base64",
          decoded: "解码结果",
          copy: "复制",
          resultPlaceholder: "结果会显示在这里…",
          encodePlaceholder: "输入要编码的文本…",
          decodePlaceholder: "输入要解码的 Base64…",
          errorPrefix: "错误：",
          invalidInput: "无法解析输入内容",
          hint: "提示：解码模式会忽略空白字符；URL-safe 会使用 “-” 和 “_” 并去除填充 “=”。",
        };

  const [mode, setMode] = useState<Mode>("encode");
  const [urlSafe, setUrlSafe] = useState(false);
  const [input, setInput] = useState("");

  const result = useMemo(() => {
    try {
      if (mode === "encode") {
        const bytes = new TextEncoder().encode(input);
        const base64 = bytesToBase64(bytes);
        return { ok: true as const, text: urlSafe ? toUrlSafeBase64(base64) : base64 };
      }

      const bytes = base64ToBytes(urlSafe ? fromUrlSafeBase64(input) : input);
      const decodedText = new TextDecoder().decode(bytes);
      return {
        ok: true as const,
        text: decodedText,
        extra: `HEX: ${bytesToHex(bytes)}`,
      };
    } catch (error) {
      return {
        ok: false as const,
        text: "",
        error: error instanceof Error ? error.message : ui.invalidInput,
      };
    }
  }, [input, locale, mode, urlSafe]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <ToolPageLayout toolSlug="base64">
      <div className="w-full max-w-4xl mx-auto px-4">
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
                checked={urlSafe}
                onChange={(e) => setUrlSafe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              URL-safe
            </label>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">
                {mode === "encode" ? ui.plainText : ui.base64}
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={mode === "encode" ? ui.encodePlaceholder : ui.decodePlaceholder}
                className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">
                  {mode === "encode" ? ui.base64 : ui.decoded}
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

              {result.ok && typeof result.extra === "string" && result.extra && (
                <div className="mt-2 break-all text-xs text-slate-500">{result.extra}</div>
              )}
            </div>
          </div>

          <div className="mt-6 text-xs text-slate-500">{ui.hint}</div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
