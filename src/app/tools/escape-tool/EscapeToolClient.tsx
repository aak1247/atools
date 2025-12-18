"use client";

import { useMemo, useState } from "react";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Mode = "html-escape" | "html-unescape" | "json-escape" | "json-unescape" | "unicode-escape" | "unicode-unescape";

const DEFAULT_UI = {
  title: "特殊字符转义工具",
  subtitle: "HTML / JSON / Unicode 转义与反转义",
  modeLabel: "模式",
  copyResult: "复制结果",
  inputLabel: "输入",
  outputLabel: "输出",
  outputPlaceholder: "结果会显示在这里…",
  errorPrefix: "错误：",
  errJsonLiteral: "请输入 JSON 字符串字面量（以双引号开头），例如：\"\\\\n\" 或 \"Hello\"。",
  errNotJsonString: "输入不是 JSON 字符串。",
  errConvertFailed: "转换失败",
  optHtmlEscape: "HTML 转义（< > & ...）",
  optHtmlUnescape: "HTML 反转义",
  optJsonEscape: "JSON 字符串转义（JSON.stringify）",
  optJsonUnescape: "JSON 字符串反转义（JSON.parse）",
  optUnicodeEscape: "Unicode 转义（\\uXXXX / \\u{...}）",
  optUnicodeUnescape: "Unicode 反转义（\\uXXXX / \\u{...}）",
} as const;

type EscapeToolUi = typeof DEFAULT_UI;

const htmlEscape = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const htmlUnescape = (text: string): string => {
  const doc = new DOMParser().parseFromString(text, "text/html");
  return doc.documentElement.textContent ?? "";
};

const unicodeEscape = (text: string): string =>
  Array.from(text)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code <= 0x7e && code >= 0x20) return ch;
      if (code <= 0xffff) return `\\u${code.toString(16).padStart(4, "0")}`;
      return `\\u{${code.toString(16)}}`;
    })
    .join("");

const unicodeUnescape = (text: string): string => {
  const replaced = text
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return replaced;
};

export default function EscapeToolClient() {
  const config = useOptionalToolConfig("escape-tool");
  const ui: EscapeToolUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<EscapeToolUi>) };

  const [mode, setMode] = useState<Mode>("html-escape");
  const [input, setInput] = useState("<div>Hello \"world\" & 你好</div>");

  const computed = useMemo(() => {
    const raw = input;
    try {
      if (mode === "html-escape") return { ok: true as const, text: htmlEscape(raw) };
      if (mode === "html-unescape") return { ok: true as const, text: htmlUnescape(raw) };
      if (mode === "json-escape") return { ok: true as const, text: JSON.stringify(raw) };
      if (mode === "json-unescape") {
        const trimmed = raw.trim();
        if (!trimmed.startsWith('"')) {
          return { ok: false as const, text: "", error: ui.errJsonLiteral };
        }
        const parsed = JSON.parse(trimmed) as unknown;
        if (typeof parsed !== "string") return { ok: false as const, text: "", error: ui.errNotJsonString };
        return { ok: true as const, text: parsed };
      }
      if (mode === "unicode-escape") return { ok: true as const, text: unicodeEscape(raw) };
      return { ok: true as const, text: unicodeUnescape(raw) };
    } catch (e) {
      return { ok: false as const, text: "", error: e instanceof Error ? e.message : ui.errConvertFailed };
    }
  }, [input, mode, ui.errConvertFailed, ui.errJsonLiteral, ui.errNotJsonString]);

  const copy = async () => {
    if (!computed.ok) return;
    await navigator.clipboard.writeText(computed.text);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{ui.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{ui.subtitle}</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">{ui.modeLabel}</div>
          <button
            type="button"
            disabled={!computed.ok}
            onClick={() => void copy()}
            className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {ui.copyResult}
          </button>
        </div>

        <div className="mt-4">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
          >
            <option value="html-escape">{ui.optHtmlEscape}</option>
            <option value="html-unescape">{ui.optHtmlUnescape}</option>
            <option value="json-escape">{ui.optJsonEscape}</option>
            <option value="json-unescape">{ui.optJsonUnescape}</option>
            <option value="unicode-escape">{ui.optUnicodeEscape}</option>
            <option value="unicode-unescape">{ui.optUnicodeUnescape}</option>
          </select>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.inputLabel}</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.outputLabel}</div>
            <textarea
              value={computed.ok ? computed.text : ""}
              readOnly
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              placeholder={ui.outputPlaceholder}
            />
            {!computed.ok && (
              <div className="mt-2 text-sm text-rose-600">
                {ui.errorPrefix}
                {computed.error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
