"use client";

import type { ChangeEvent } from "react";
import { PDFDocument } from "pdf-lib";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

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
  return `${value.toFixed(idx === 0 ? 0 : 2).replace(/\\.00$/, "")} ${units[idx]}`;
};

export default function PdfCompressorClient() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [useObjectStreams, setUseObjectStreams] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("output.pdf");
  const [outputSize, setOutputSize] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const beforeSize = file?.size ?? null;

  const reductionText = useMemo(() => {
    if (!beforeSize || !outputSize) return null;
    const diff = beforeSize - outputSize;
    const pct = (diff / beforeSize) * 100;
    const sign = diff === 0 ? "" : diff > 0 ? "-" : "+";
    return `${sign}${formatBytes(Math.abs(diff))}（${sign}${Math.abs(pct).toFixed(2)}%）`;
  }, [beforeSize, outputSize]);

  const pick = (selected: File) => {
    setFile(selected);
    setError(null);
    setOutputSize(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    const base = selected.name.replace(/\\.[^.]+$/, "") || "output";
    setDownloadName(`${base}.compressed.pdf`);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pick(selected);
  };

  const compress = async () => {
    if (!file) return;
    setIsWorking(true);
    setError(null);
    setOutputSize(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    try {
      const inputBytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(inputBytes);
      const outputBytes = await doc.save({ useObjectStreams, addDefaultPage: false });
      setOutputSize(outputBytes.length);
      const blob = new Blob([toArrayBuffer(outputBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "处理失败，请确认文件为有效 PDF（未加密）。");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <ToolPageLayout toolSlug="pdf-compressor">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-700">
              说明：这是“轻量压缩”（重写/优化结构），不做图片重采样与重编码，体积不一定变小。
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200"
            >
              选择 PDF
            </button>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onChange} />
          </div>

          {!file && (
            <div className="mt-6 rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200 text-sm text-slate-700">
              选择一个 PDF 文件后，可尝试优化并导出。
            </div>
          )}

          {file && (
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">设置</div>
                <div className="mt-4 grid gap-3 text-sm text-slate-700">
                  <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-slate-900">文件</div>
                      <div className="text-xs text-slate-500">{formatBytes(file.size)}</div>
                    </div>
                    <div className="mt-1 break-all text-xs text-slate-600">{file.name}</div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={useObjectStreams}
                      onChange={(e) => setUseObjectStreams(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    使用对象流（useObjectStreams）
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void compress()}
                      disabled={isWorking}
                      className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isWorking ? "处理中..." : "开始压缩"}
                    </button>
                    {downloadUrl && (
                      <a
                        href={downloadUrl}
                        download={downloadName}
                        className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        下载 {downloadName}
                      </a>
                    )}
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      原始体积：<span className="font-mono">{formatBytes(file.size)}</span>
                    </div>
                    <div>
                      压缩后体积：<span className="font-mono">{outputSize != null ? formatBytes(outputSize) : "-"}</span>
                    </div>
                    <div className="sm:col-span-2">
                      变化：<span className="font-mono">{reductionText ?? "-"}</span>
                    </div>
                  </div>

                  {error && (
                    <div className="mt-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                      {error}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-sm text-slate-700">
                <div className="text-sm font-semibold text-slate-900">提示</div>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  <li>如果 PDF 内部主要是图片，想显著减小体积通常需要重采样/重编码图片（会影响清晰度）。</li>
                  <li>加密/受保护的 PDF 可能无法处理。</li>
                  <li>全程在浏览器本地运行，不会上传文件。</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolPageLayout>
  );
}
