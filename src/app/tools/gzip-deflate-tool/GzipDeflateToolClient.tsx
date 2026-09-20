"use client";

import type { ChangeEvent, DragEvent } from "react";
import { deflateSync, gzipSync, gunzipSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Algo = "gzip" | "deflate";
type Mode = "compress" | "decompress";
type InputKind = "text" | "file";
type Level = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const DEFAULT_UI = {
  inputLabel: "输入",
  inputText: "文本",
  inputFile: "文件",
  modeLabel: "模式",
  modeCompress: "压缩",
  modeDecompress: "解压",
  algoLabel: "算法",
  levelLabel: "Level",
  copyResult: "复制结果",
  plainText: "原文",
  base64Compressed: "Base64（压缩数据）",
  inputCompressPlaceholder: "输入要压缩的文本…",
  inputDecompressPlaceholder: "粘贴 Base64（gzip/deflate 数据）…",
  base64Output: "Base64 输出",
  decompressedTextOutput: "解压文本输出",
  statsTemplate: "输入：{in}，输出：{out}",
  fileDescCompress: "选择文件后点击处理（输出 .gz/.deflate）。",
  fileDescDecompress: "选择文件后点击处理（输出解压后的文件）。",
  chooseFile: "选择文件",
  replaceFile: "替换文件",
  startProcess: "开始处理",
  dropHint: "支持点击上传与拖拽上传文件；拖拽可直接替换当前文件。",
  errorPrefix: "错误：",
  processFailed: "处理失败",
  hint: "提示：文件解压需确保算法与内容匹配；gzip 不是 zip（多文件打包请用 ZIP）。",
} as const;

type GzipDeflateUi = typeof DEFAULT_UI;

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
  const config = useOptionalToolConfig("gzip-deflate-tool");
  const ui: GzipDeflateUi = useMemo(
    () => ({ ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<GzipDeflateUi>) }),
    [config?.ui],
  );

  const fileRef = useRef<HTMLInputElement>(null);

  const [inputKind, setInputKind] = useState<InputKind>("text");
  const [mode, setMode] = useState<Mode>("compress");
  const [algo, setAlgo] = useState<Algo>("gzip");
  const [level, setLevel] = useState<Level>(6);

  const [text, setText] = useState("");
  const [base64, setBase64] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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
      return { ok: false as const, error: e instanceof Error ? e.message : ui.processFailed };
    }
  }, [algo, base64, file, inputKind, level, mode, text, ui.processFailed]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  const pickFile = (selected: File | null) => {
    setFile(selected);
    setFileError(null);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    pickFile(selected);
    e.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0] ?? null;
    pickFile(selected);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
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
      setFileError(e instanceof Error ? e.message : ui.processFailed);
    }
  };

  return (
    <ToolPageLayout toolSlug="gzip-deflate-tool">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {ui.inputLabel}
                <select
                  value={inputKind}
                  onChange={(e) => setInputKind(e.target.value as InputKind)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="text">{ui.inputText}</option>
                  <option value="file">{ui.inputFile}</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {ui.modeLabel}
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="compress">{ui.modeCompress}</option>
                  <option value="decompress">{ui.modeDecompress}</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {ui.algoLabel}
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
                {ui.levelLabel}
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
                {ui.copyResult}
              </button>
            )}
          </div>

          {inputKind === "text" ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-900">{mode === "compress" ? ui.plainText : ui.base64Compressed}</div>
                <textarea
                  value={mode === "compress" ? text : base64}
                  onChange={(e) => (mode === "compress" ? setText(e.target.value) : setBase64(e.target.value))}
                  placeholder={mode === "compress" ? ui.inputCompressPlaceholder : ui.inputDecompressPlaceholder}
                  className="h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-900">{mode === "compress" ? ui.base64Output : ui.decompressedTextOutput}</div>
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
                    {ui.statsTemplate.replace("{in}", formatBytes(result.bytesIn)).replace("{out}", formatBytes(result.bytesOut))}
                  </div>
                )}
                {!result.ok && <div className="mt-2 text-sm text-rose-600">{ui.errorPrefix}{result.error}</div>}
              </div>
            </div>
          ) : (
            <div
              className={`mt-6 rounded-3xl border-2 border-dashed bg-white p-5 ring-1 transition ${
                isDragging ? "border-slate-400 bg-slate-50/60 ring-slate-300" : "border-slate-200 ring-slate-200"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-700">
                  {mode === "compress" ? ui.fileDescCompress : ui.fileDescDecompress}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    {file ? ui.replaceFile : ui.chooseFile}
                  </button>
                  <input ref={fileRef} type="file" className="hidden" onChange={onFileChange} />
                  <button
                    type="button"
                    onClick={() => void processFile()}
                    disabled={!file}
                    className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {ui.startProcess}
                  </button>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">{ui.dropHint}</div>
              {file && (
                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                  {file.name}（{formatBytes(file.size)}）
                </div>
              )}
              {fileError && (
                <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                  {ui.errorPrefix}{fileError}
                </div>
              )}
              <div className="mt-4 text-xs text-slate-500">
                {ui.hint}
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolPageLayout>
  );
}
