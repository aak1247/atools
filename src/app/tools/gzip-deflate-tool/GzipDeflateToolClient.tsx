"use client";

import type { ChangeEvent } from "react";
import { deflateSync, gzipSync, gunzipSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Algo = "gzip" | "deflate";
type Mode = "compress" | "decompress";
type InputKind = "text" | "file";
type Level = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

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
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 2).replace(/\.00$/, "")} ${units[idx]}`;
};

export default function GzipDeflateToolClient() {
  const fileRef = useRef<HTMLInputElement>(null);

  const [inputKind, setInputKind] = useState<InputKind>("text");
  const [mode, setMode] = useState<Mode>("compress");
  const [algo, setAlgo] = useState<Algo>("gzip");
  const [level, setLevel] = useState<Level>(6);

  const [text, setText] = useState("");
  const [base64, setBase64] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const result = useMemo(() => {
    try {
      if (inputKind === "text") {
        if (mode === "compress") {
          const inputBytes = strToU8(text);
          const outBytes = algo === "gzip" ? gzipSync(inputBytes, { level }) : deflateSync(inputBytes, { level });
          const outBase64 = bytesToBase64(outBytes);
          return {
            ok: true as const,
            text: outBase64,
            bytesIn: inputBytes.byteLength,
            bytesOut: outBytes.byteLength,
          };
        }
        const inBytes = base64ToBytes(base64);
        const outBytes = algo === "gzip" ? gunzipSync(inBytes) : inflateSync(inBytes);
        return {
          ok: true as const,
          text: strFromU8(outBytes),
          bytesIn: inBytes.byteLength,
          bytesOut: outBytes.byteLength,
        };
      }

      if (!file) return { ok: true as const, pending: true as const };
      return { ok: true as const, pending: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "处理失败" };
    }
  }, [algo, base64, file, inputKind, level, mode, text]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setFileError(null);
  };

  const processFile = async () => {
    if (!file) return;
    setFileError(null);
    try {
      const inputBytes = new Uint8Array(await file.arrayBuffer());
      const outBytes =
        mode === "compress"
          ? algo === "gzip"
            ? gzipSync(inputBytes, { level })
            : deflateSync(inputBytes, { level })
          : algo === "gzip"
            ? gunzipSync(inputBytes)
            : inflateSync(inputBytes);

      const outName = (() => {
        const baseName = file.name || "file";
        if (mode === "compress") {
          return algo === "gzip" ? `${baseName}.gz` : `${baseName}.deflate`;
        }
        return baseName.replace(/(\.gz|\.deflate)$/i, "") || "output.bin";
      })();

      const blob = new Blob([toArrayBuffer(outBytes)], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "处理失败");
    }
  };

  return (
    <ToolPageLayout toolSlug="gzip-deflate-tool">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                输入
                <select
                  value={inputKind}
                  onChange={(e) => setInputKind(e.target.value as InputKind)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="text">文本</option>
                  <option value="file">文件</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                模式
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="compress">压缩</option>
                  <option value="decompress">解压</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                算法
                <select
                  value={algo}
                  onChange={(e) => setAlgo(e.target.value as Algo)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="gzip">gzip</option>
                  <option value="deflate">deflate</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                Level
                <select
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value) as Level)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  {Array.from({ length: 10 }, (_v, i) => i).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {inputKind === "text" && result.ok && "text" in result && (
              <button
                type="button"
                onClick={() => void copy(result.text ?? "")}
                disabled={!result.text}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                复制结果
              </button>
            )}
          </div>

          {inputKind === "text" ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-900">{mode === "compress" ? "原文" : "Base64（压缩数据）"}</div>
                <textarea
                  value={mode === "compress" ? text : base64}
                  onChange={(e) => (mode === "compress" ? setText(e.target.value) : setBase64(e.target.value))}
                  placeholder={mode === "compress" ? "输入要压缩的文本…" : "粘贴 Base64（gzip/deflate 数据）…"}
                  className="h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-900">{mode === "compress" ? "Base64 输出" : "解压文本输出"}</div>
                <textarea
                  value={result.ok && "text" in result ? result.text : ""}
                  readOnly
                  className="h-72 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                />
                {result.ok &&
                  "bytesIn" in result &&
                  typeof result.bytesIn === "number" &&
                  typeof result.bytesOut === "number" && (
                  <div className="mt-2 text-xs text-slate-500">
                    输入：{formatBytes(result.bytesIn)}，输出：{formatBytes(result.bytesOut)}
                  </div>
                )}
                {!result.ok && <div className="mt-2 text-sm text-rose-600">错误：{result.error}</div>}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-700">
                  选择文件后点击处理（{mode === "compress" ? "输出 .gz/.deflate" : "输出解压后的文件"}）。
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    选择文件
                  </button>
                  <input ref={fileRef} type="file" className="hidden" onChange={pickFile} />
                  <button
                    type="button"
                    onClick={() => void processFile()}
                    disabled={!file}
                    className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    开始处理
                  </button>
                </div>
              </div>
              {file && (
                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                  {file.name}（{formatBytes(file.size)}）
                </div>
              )}
              {fileError && (
                <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                  错误：{fileError}
                </div>
              )}
              <div className="mt-4 text-xs text-slate-500">
                提示：文件解压需确保算法与内容匹配；gzip 不是 zip（多文件打包请用 ZIP）。
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolPageLayout>
  );
}
