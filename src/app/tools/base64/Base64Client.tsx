"use client";

import { useMemo, useState } from "react";

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
        error: error instanceof Error ? error.message : "无法解析输入内容",
      };
    }
  }, [input, mode, urlSafe]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Base64 编码解码
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          支持 UTF-8 文本与 URL-safe Base64，纯本地处理
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
              {mode === "encode" ? "原文" : "Base64"}
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === "encode" ? "输入要编码的文本…" : "输入要解码的 Base64…"}
              className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">
                {mode === "encode" ? "Base64" : "解码结果"}
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

            {result.ok && typeof result.extra === "string" && result.extra && (
              <div className="mt-2 break-all text-xs text-slate-500">{result.extra}</div>
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          提示：解码模式会忽略空白字符；URL-safe 会使用 “-” 和 “_” 并去除填充 “=”。
        </div>
      </div>
    </div>
  );
}

