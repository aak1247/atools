"use client";

import { useMemo, useState } from "react";

type Mode = "html-escape" | "html-unescape" | "json-escape" | "json-unescape" | "unicode-escape" | "unicode-unescape";

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
          return { ok: false as const, text: "", error: "请输入 JSON 字符串字面量（以双引号开头），例如：\"\\\\n\" 或 \"Hello\"。" };
        }
        const parsed = JSON.parse(trimmed) as unknown;
        if (typeof parsed !== "string") return { ok: false as const, text: "", error: "输入不是 JSON 字符串。" };
        return { ok: true as const, text: parsed };
      }
      if (mode === "unicode-escape") return { ok: true as const, text: unicodeEscape(raw) };
      return { ok: true as const, text: unicodeUnescape(raw) };
    } catch (e) {
      return { ok: false as const, text: "", error: e instanceof Error ? e.message : "转换失败" };
    }
  }, [input, mode]);

  const copy = async () => {
    if (!computed.ok) return;
    await navigator.clipboard.writeText(computed.text);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">特殊字符转义工具</h1>
        <p className="mt-2 text-sm text-slate-500">HTML / JSON / Unicode 转义与反转义</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">模式</div>
          <button
            type="button"
            disabled={!computed.ok}
            onClick={() => void copy()}
            className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            复制结果
          </button>
        </div>

        <div className="mt-4">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
          >
            <option value="html-escape">HTML 转义（&lt; &gt; &amp; ...）</option>
            <option value="html-unescape">HTML 反转义</option>
            <option value="json-escape">JSON 字符串转义（JSON.stringify）</option>
            <option value="json-unescape">JSON 字符串反转义（JSON.parse）</option>
            <option value="unicode-escape">
              Unicode 转义（\\uXXXX / \\u{"{...}"}）
            </option>
            <option value="unicode-unescape">
              Unicode 反转义（\\uXXXX / \\u{"{...}"}）
            </option>
          </select>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">输入</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">输出</div>
            <textarea
              value={computed.ok ? computed.text : ""}
              readOnly
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              placeholder="结果会显示在这里…"
            />
            {!computed.ok && <div className="mt-2 text-sm text-rose-600">错误：{computed.error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
