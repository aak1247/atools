"use client";

import type { ChangeEvent } from "react";
import { PDFDocument } from "pdf-lib";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Mode = "image" | "pdf" | "unsupported";
type ImageOut = "png" | "jpeg" | "webp";

const DEFAULT_UI = {
  pick: "选择文件",
  clear: "清空",
  run: "开始清理",
  working: "处理中…",
  download: "下载",
  original: "原文件",
  result: "清理后",
  imageSettings: "图片输出",
  format: "格式",
  quality: "质量（JPEG/WebP）",
  pdfSettings: "PDF 清理选项",
  pdfExplain: "说明：将 PDF 重新保存并清空常见文档信息字段（标题/作者/主题/关键词等）。",
  unsupported:
    "暂仅支持：图片（JPEG/PNG/WebP）与 PDF。其他格式的“元数据清理”在纯前端环境难以可靠实现。",
} as const;

type Ui = typeof DEFAULT_UI;

const fileMode = (file: File | null): Mode => {
  if (!file) return "unsupported";
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  return "unsupported";
};

const imageAccept = "image/jpeg,image/png,image/webp";

export default function MetadataRemoverClient() {
  return (
    <ToolPageLayout toolSlug="metadata-remover" maxWidthClassName="max-w-6xl">
      <MetadataRemoverInner />
    </ToolPageLayout>
  );
}

function MetadataRemoverInner() {
  const config = useOptionalToolConfig("metadata-remover");
  const ui: Ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<Ui>) };

  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  const [outFormat, setOutFormat] = useState<ImageOut>("png");
  const [quality, setQuality] = useState(0.92);

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("cleaned.bin");

  const mode = useMemo(() => fileMode(file), [file]);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl, originalUrl]);

  const resetOutput = () => {
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  };

  const pick = (selected: File) => {
    resetOutput();
    setFile(selected);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(URL.createObjectURL(selected));
    const base = selected.name.replace(/\.[^.]+$/, "") || "cleaned";
    if (selected.type.startsWith("image/")) setDownloadName(`${base}.clean.${outFormat}`);
    else if (selected.type === "application/pdf" || selected.name.toLowerCase().endsWith(".pdf")) setDownloadName(`${base}.clean.pdf`);
    else setDownloadName(`${base}.clean.bin`);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pick(selected);
  };

  useEffect(() => {
    if (!file) return;
    const base = file.name.replace(/\.[^.]+$/, "") || "cleaned";
    if (mode === "image") setDownloadName(`${base}.clean.${outFormat}`);
  }, [file, mode, outFormat]);

  const cleanImage = async (f: File) => {
    const bitmap = await createImageBitmap(f);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(bitmap, 0, 0);

    const mime = outFormat === "png" ? "image/png" : outFormat === "jpeg" ? "image/jpeg" : "image/webp";
    const q = outFormat === "png" ? 1 : Math.min(1, Math.max(0.1, quality));
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (!b) reject(new Error("Failed to export image"));
          else resolve(b);
        },
        mime,
        q,
      );
    });

    return blob;
  };

  const cleanPdf = async (f: File) => {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    doc.setTitle("");
    doc.setAuthor("");
    doc.setSubject("");
    doc.setKeywords([]);
    doc.setCreator("");
    doc.setProducer("");
    doc.setCreationDate(new Date(0));
    doc.setModificationDate(new Date(0));
    const out = await doc.save();
    return new Blob([new Uint8Array(out)], { type: "application/pdf" });
  };

  const run = async () => {
    if (!file) return;
    setIsWorking(true);
    setError(null);
    resetOutput();
    try {
      let blob: Blob | null = null;
      if (mode === "image") blob = await cleanImage(file);
      else if (mode === "pdf") blob = await cleanPdf(file);
      else throw new Error(ui.unsupported);

      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "处理失败");
    } finally {
      setIsWorking(false);
    }
  };

  const clear = () => {
    setFile(null);
    setError(null);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">{ui.pick}</div>
          <button
            type="button"
            onClick={clear}
            className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
          >
            {ui.clear}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input ref={inputRef} type="file" className="hidden" onChange={onChange} accept={`${imageAccept},application/pdf,.pdf`} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {ui.pick}
          </button>
          {file && (
            <div className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{file.name}</span>{" "}
              <span className="text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          )}
        </div>

        {!file ? (
          <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
            {ui.unsupported}
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">
                  {mode === "image" ? ui.imageSettings : mode === "pdf" ? ui.pdfSettings : "设置"}
                </div>

                {mode === "image" ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm text-slate-700">
                      {ui.format}
                      <select
                        value={outFormat}
                        onChange={(e) => setOutFormat(e.target.value as ImageOut)}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      >
                        <option value="png">PNG（推荐）</option>
                        <option value="jpeg">JPEG</option>
                        <option value="webp">WebP</option>
                      </select>
                    </label>
                    <label className={`block text-sm text-slate-700 ${outFormat === "png" ? "opacity-60" : ""}`}>
                      {ui.quality}
                      <input
                        type="number"
                        min={0.1}
                        max={1}
                        step={0.01}
                        value={quality}
                        onChange={(e) => setQuality(Number(e.target.value))}
                        disabled={outFormat === "png"}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                      />
                    </label>
                  </div>
                ) : mode === "pdf" ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                    {ui.pdfExplain}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
                    {ui.unsupported}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void run()}
                    disabled={isWorking || mode === "unsupported"}
                    className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isWorking ? ui.working : ui.run}
                  </button>
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      download={downloadName}
                      className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      {ui.download} {downloadName}
                    </a>
                  )}
                </div>

                {error && (
                  <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                    {error}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.original}</div>
                <div className="mt-3 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                  {mode === "image" && originalUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={originalUrl} alt="original" className="h-72 w-full object-contain p-4" />
                  ) : (
                    <div className="flex h-72 items-center justify-center text-xs text-slate-500">
                      {mode === "pdf" ? "PDF 文件（无法直接预览）" : "不支持预览"}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.result}</div>
                <div className="mt-3 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                  {mode === "image" && downloadUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={downloadUrl} alt="cleaned" className="h-72 w-full object-contain p-4" />
                  ) : downloadUrl ? (
                    <div className="flex h-72 items-center justify-center">
                      <a
                        href={downloadUrl}
                        download={downloadName}
                        className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        下载 {downloadName}
                      </a>
                    </div>
                  ) : (
                    <div className="flex h-72 items-center justify-center text-xs text-slate-500">等待处理…</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
