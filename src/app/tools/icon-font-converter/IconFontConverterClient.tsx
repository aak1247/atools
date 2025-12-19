"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

// 中文默认值
const DEFAULT_UI = {
  title: "图标字体转换器",
  pickFile: "选择字体文件",
  clear: "清空",
  settings: "设置",
  familyLabel: "font-family 名称",
  familyPlaceholder: "例如 MyIconFont",
  hint: "说明：此工具将字体文件转为 Base64 Data URL，并生成可直接粘贴到 CSS 的 @font-face 代码（适合内联或小型字体）。较大的字体文件会显著增大 CSS 体积。",
  cssTitle: "@font-face CSS",
  dataUrlTitle: "Data URL",
  copy: "复制",
  outputPlaceholder: "选择字体文件后生成…",
  readFailed: "读取失败",
  fileSizeKb: "{size} KB",
} as const;

type IconFontConverterUi = typeof DEFAULT_UI;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

type FontKind = "woff2" | "woff" | "ttf" | "otf" | "eot" | "unknown";

const detectKind = (file: File): FontKind => {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".woff2")) return "woff2";
  if (lower.endsWith(".woff")) return "woff";
  if (lower.endsWith(".ttf")) return "ttf";
  if (lower.endsWith(".otf")) return "otf";
  if (lower.endsWith(".eot")) return "eot";
  return "unknown";
};

const kindToMime = (k: FontKind): string => {
  if (k === "woff2") return "font/woff2";
  if (k === "woff") return "font/woff";
  if (k === "ttf") return "font/ttf";
  if (k === "otf") return "font/otf";
  if (k === "eot") return "application/vnd.ms-fontobject";
  return "application/octet-stream";
};

const kindToFormat = (k: FontKind): string => {
  if (k === "woff2") return "woff2";
  if (k === "woff") return "woff";
  if (k === "ttf") return "truetype";
  if (k === "otf") return "opentype";
  if (k === "eot") return "embedded-opentype";
  return "";
};

export default function IconFontConverterClient() {
  return (
    <ToolPageLayout toolSlug="icon-font-converter" maxWidthClassName="max-w-6xl">
      <IconFontConverterInner />
    </ToolPageLayout>
  );
}

function IconFontConverterInner() {
  const config = useOptionalToolConfig("icon-font-converter");
  const ui: IconFontConverterUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<IconFontConverterUi>) };

  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [family, setFamily] = useState("IconFont");
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const kind = useMemo(() => (file ? detectKind(file) : "unknown"), [file]);

  useEffect(() => {
    if (!file) return;

    let cancelled = false;
    const run = async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (cancelled) return;
        const b64 = bytesToBase64(bytes);
        const mime = kindToMime(kind);
        setDataUrl(`data:${mime};base64,${b64}`);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : ui.readFailed);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [file, kind, ui.readFailed]);

  const css = useMemo(() => {
    if (!dataUrl) return "";
    const fmt = kindToFormat(kind);
    const formatPart = fmt ? ` format('${fmt}')` : "";
    return `@font-face {\n  font-family: '${family || "IconFont"}';\n  src: url('${dataUrl}')${formatPart};\n  font-weight: normal;\n  font-style: normal;\n}\n`;
  }, [dataUrl, family, kind]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const pick = (selected: File) => {
    setFile(selected);
    setFamily(selected.name.replace(/\.[^.]+$/, "") || "IconFont");
    setError(null);
    setDataUrl("");
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pick(selected);
  };

  const clear = () => {
    setFile(null);
    setError(null);
    setDataUrl("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".woff2,.woff,.ttf,.otf,.eot,font/*,application/vnd.ms-fontobject"
              className="hidden"
              onChange={onChange}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {ui.pickFile}
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {ui.clear}
            </button>
            {file && (
              <div className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{file.name}</span>{" "}
                <span className="text-slate-500">({ui.fileSizeKb.replace("{size}", (file.size / 1024).toFixed(1))})</span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.settings}</div>
            <div className="mt-4 grid gap-4">
              <label className="block text-sm text-slate-700">
                {ui.familyLabel}
                <input
                  value={family}
                  onChange={(e) => setFamily(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  placeholder={ui.familyPlaceholder}
                />
              </label>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                {ui.hint}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{ui.cssTitle}</div>
                <button
                  type="button"
                  onClick={() => void copy(css)}
                  disabled={!css}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {ui.copy}
                </button>
              </div>
              <textarea
                value={css}
                readOnly
                className="mt-3 h-40 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                placeholder={ui.outputPlaceholder}
              />
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{ui.dataUrlTitle}</div>
                <button
                  type="button"
                  onClick={() => void copy(dataUrl)}
                  disabled={!dataUrl}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  {ui.copy}
                </button>
              </div>
              <textarea
                value={dataUrl}
                readOnly
                className="mt-3 h-36 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[10px] text-slate-900 outline-none"
                placeholder={ui.outputPlaceholder}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
