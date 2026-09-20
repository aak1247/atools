"use client";

import ToolPageLayout from "../../../components/ToolPageLayout";
import { useMemo, useState } from "react";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Format = "hex" | "base64" | "base64url";

// 中文默认值
const DEFAULT_UI = {
  title: "盐值生成器",
  subtitle: "生成随机盐值（纯本地）",
  bytesLengthLabel: "字节长度",
  formatLabel: "格式",
  formatHex: "Hex",
  formatBase64: "Base64",
  formatBase64url: "Base64URL",
  generateButton: "生成",
  copyButton: "复制",
  resultTitle: "结果",
  hint: "说明：使用 crypto.getRandomValues 生成随机字节。",
} as const;

type SaltGeneratorUi = typeof DEFAULT_UI;

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const toBase64Url = (base64: string) =>
  base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

export default function SaltGeneratorClient() {
  const config = useOptionalToolConfig("salt-generator");
  const ui: SaltGeneratorUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<SaltGeneratorUi>) };

  const [bytesLength, setBytesLength] = useState(16);
  const [format, setFormat] = useState<Format>("hex");
  const [salt, setSalt] = useState<Uint8Array>(() => crypto.getRandomValues(new Uint8Array(16)));

  const text = useMemo(() => {
    if (format === "hex") return bytesToHex(salt);
    const base64 = bytesToBase64(salt);
    return format === "base64" ? base64 : toBase64Url(base64);
  }, [format, salt]);

  const regenerate = () => {
    const n = Math.min(1024, Math.max(1, Math.trunc(bytesLength)));
    setSalt(crypto.getRandomValues(new Uint8Array(n)));
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <ToolPageLayout toolSlug="salt-generator" maxWidthClassName="max-w-4xl">
      <div className="space-y-8">

        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {ui.bytesLengthLabel}
                <input
                  type="number"
                  min={1}
                  max={1024}
                  value={bytesLength}
                  onChange={(e) => setBytesLength(Number(e.target.value))}
                  className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {ui.formatLabel}
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as Format)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="hex">{ui.formatHex}</option>
                  <option value="base64">{ui.formatBase64}</option>
                  <option value="base64url">{ui.formatBase64url}</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={regenerate}
                className="rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-[0.99]"
              >
                {ui.generateButton}
              </button>
              <button
                type="button"
                onClick={copy}
                className="rounded-2xl bg-slate-100 px-6 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 active:scale-[0.99]"
              >
                {ui.copyButton}
              </button>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.resultTitle}</div>
            <textarea
              value={text}
              readOnly
              className="h-36 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
            <div className="mt-2 text-xs text-slate-500">
              {ui.hint}
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
