"use client";

import { useMemo, useState } from "react";

type Format = "hex" | "base64" | "base64url";

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
    <div className="mx-auto w-full max-w-4xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">盐值生成器</h1>
        <p className="mt-2 text-sm text-slate-500">生成随机盐值（纯本地）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              字节长度
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
              格式
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as Format)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              >
                <option value="hex">Hex</option>
                <option value="base64">Base64</option>
                <option value="base64url">Base64URL</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={regenerate}
              className="rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-[0.99]"
            >
              生成
            </button>
            <button
              type="button"
              onClick={copy}
              className="rounded-2xl bg-slate-100 px-6 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 active:scale-[0.99]"
            >
              复制
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-sm font-semibold text-slate-900">结果</div>
          <textarea
            value={text}
            readOnly
            className="h-36 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
          />
          <div className="mt-2 text-xs text-slate-500">
            说明：使用 crypto.getRandomValues 生成随机字节。
          </div>
        </div>
      </div>
    </div>
  );
}

