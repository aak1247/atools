"use client";

import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { useMemo, useState } from "react";

type Algorithm = "SHA-1" | "SHA-256" | "SHA-512";
type KeyFormat = "text" | "hex";

const DEFAULT_UI = {
  title: "HMAC 生成器",
  subtitle: "SHA1/SHA256/SHA512（纯本地）",
  algoLabel: "算法",
  keyFormatLabel: "Key 格式",
  keyFormatText: "文本",
  keyFormatHex: "Hex",
  hexUppercase: "Hex 大写",
  generating: "生成中…",
  generate: "生成",
  keyLabel: "Key",
  keyPlaceholderHex: "例如：0011223344556677…",
  keyPlaceholderText: "输入 Key 文本…",
  keyHintHex: "Hex 模式下会忽略空白并要求偶数长度。",
  keyHintText: "文本模式使用 UTF-8 编码导入 Key。",
  messageLabel: "消息",
  hmacHex: "HMAC（Hex）",
  hmacBase64: "HMAC（Base64）",
  copy: "复制",
  resultPlaceholder: "点击“生成”后显示…",
  errorPrefix: "错误：",
  generateFailed: "生成失败",
  hexOddLengthError: "Hex 长度必须为偶数",
  hexInvalidCharError: "Hex 含有非法字符",
  hint: "提示：HMAC 输出与 Key/消息的编码方式有关；如果要兼容后端实现，请确认 Key 是否为原始字节或文本。",
} as const;

type HmacGeneratorUi = typeof DEFAULT_UI;

const bytesToHex = (bytes: Uint8Array, upper: boolean) => {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return upper ? hex.toUpperCase() : hex;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const parseHexBytes = (hex: string, ui: HmacGeneratorUi) => {
  const normalized = hex.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (normalized.length % 2 !== 0) throw new Error(ui.hexOddLengthError);
  if (!/^[0-9a-f]*$/i.test(normalized)) throw new Error(ui.hexInvalidCharError);
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

export default function HmacGeneratorClient() {
  const config = useOptionalToolConfig("hmac-generator");
  const ui: HmacGeneratorUi = useMemo(
    () => ({ ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<HmacGeneratorUi>) }),
    [config?.ui],
  );

  const [algorithm, setAlgorithm] = useState<Algorithm>("SHA-256");
  const [keyFormat, setKeyFormat] = useState<KeyFormat>("text");
  const [key, setKey] = useState("secret");
  const [message, setMessage] = useState("Hello HMAC!");
  const [upper, setUpper] = useState(false);
  const [hex, setHex] = useState("");
  const [base64, setBase64] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const generate = async () => {
    setError(null);
    setHex("");
    setBase64("");
    setIsWorking(true);
    try {
      const keyBytes = keyFormat === "hex" ? parseHexBytes(key, ui) : new TextEncoder().encode(key);
      const msgBytes = new TextEncoder().encode(message);

      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: { name: algorithm } },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
      const bytes = new Uint8Array(sig);
      setHex(bytesToHex(bytes, upper));
      setBase64(bytesToBase64(bytes));
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.generateFailed);
    } finally {
      setIsWorking(false);
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  return (
    <ToolPageLayout toolSlug="hmac-generator" maxWidthClassName="max-w-5xl">
      <div className="space-y-8">

      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              {ui.algoLabel}
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value as Algorithm)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              >
                <option value="SHA-1">SHA1</option>
                <option value="SHA-256">SHA256</option>
                <option value="SHA-512">SHA512</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              {ui.keyFormatLabel}
              <select
                value={keyFormat}
                onChange={(e) => setKeyFormat(e.target.value as KeyFormat)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              >
                <option value="text">{ui.keyFormatText}</option>
                <option value="hex">{ui.keyFormatHex}</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={upper}
                onChange={(e) => setUpper(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.hexUppercase}
            </label>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={isWorking}
            className="rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 disabled:opacity-60 active:scale-[0.99]"
          >
            {isWorking ? ui.generating : ui.generate}
          </button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block">
              <div className="mb-2 text-sm font-semibold text-slate-900">{ui.keyLabel}</div>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={keyFormat === "hex" ? ui.keyPlaceholderHex : ui.keyPlaceholderText}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              <div className="mt-2 text-xs text-slate-500">
                {keyFormat === "hex"
                  ? ui.keyHintHex
                  : ui.keyHintText}
              </div>
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-semibold text-slate-900">{ui.messageLabel}</div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="h-56 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </label>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{ui.hmacHex}</div>
                <button
                  type="button"
                  disabled={!hex}
                  onClick={() => copy(hex)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  {ui.copy}
                </button>
              </div>
              <textarea
                value={hex}
                readOnly
                placeholder={ui.resultPlaceholder}
                className="mt-3 h-28 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
            </div>

            <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{ui.hmacBase64}</div>
                <button
                  type="button"
                  disabled={!base64}
                  onClick={() => copy(base64)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  {ui.copy}
                </button>
              </div>
              <textarea
                value={base64}
                readOnly
                placeholder={ui.resultPlaceholder}
                className="mt-3 h-28 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
            </div>

            {error && <div className="text-sm text-rose-600">{ui.errorPrefix}{error}</div>}
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          {ui.hint}
        </div>
      </div>
    </div>
    </ToolPageLayout>
    );
}

