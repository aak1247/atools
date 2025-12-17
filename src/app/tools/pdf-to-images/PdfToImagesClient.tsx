"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { zipSync } from "fflate";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";
import { loadPdfJs } from "../../../lib/pdfjs-loader";

type Scope = "all" | "custom";
type ImageFormat = "png" | "jpg";
type BackgroundMode = "white" | "transparent";

type LoadedPdf = {
  name: string;
  size: number;
  bytes: Uint8Array;
  pageCount: number;
};

const formatSize = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(value)));

const parsePagesInput = (input: string, pageCount: number): Set<number> => {
  const result = new Set<number>();
  const raw = input.trim();
  if (!raw) return result;

  const tokens = raw
    .split(/[,\s]+/u)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (/^\d+$/u.test(token)) {
      result.add(clampInt(Number(token), 1, pageCount));
      continue;
    }
    const match = token.match(/^(\d+)?-(\d+)?$/u);
    if (!match) continue;
    const startRaw = match[1] ? Number(match[1]) : 1;
    const endRaw = match[2] ? Number(match[2]) : pageCount;
    if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw)) continue;
    const start = clampInt(Math.min(startRaw, endRaw), 1, pageCount);
    const end = clampInt(Math.max(startRaw, endRaw), 1, pageCount);
    for (let page = start; page <= end; page += 1) result.add(page);
  }

  return result;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("BLOB_FAILED"));
        else resolve(blob);
      },
      type,
      quality,
    );
  });

export default function PdfToImagesClient() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";

  const ui = useMemo(() => {
    if (locale === "en-us") {
      return {
        hint: "Export PDF pages as images locally (no uploads).",
        pick: "Select PDF",
        clear: "Clear",
        scope: "Scope",
        all: "All pages",
        custom: "Custom pages",
        pages: "Pages",
        pagesPlaceholder: "e.g. 1-3,5,10-",
        format: "Format",
        png: "PNG",
        jpg: "JPG",
        quality: "JPG quality",
        scale: "Render scale",
        background: "Background",
        white: "White",
        transparent: "Transparent",
        start: "Convert",
        working: "Converting…",
        downloadZip: "Download ZIP",
        result: "Result",
        note: "Tip: high scale or many pages will use more memory.",
        noOutput: "No output yet.",
      };
    }
    return {
      hint: "将 PDF 页面导出为图片，全程本地处理，不上传文件。",
      pick: "选择 PDF",
      clear: "清空",
      scope: "范围",
      all: "全部页面",
      custom: "指定页码",
      pages: "页码",
      pagesPlaceholder: "例如：1-3,5,10-",
      format: "格式",
      png: "PNG",
      jpg: "JPG",
      quality: "JPG 质量",
      scale: "渲染倍率",
      background: "背景",
      white: "白色",
      transparent: "透明",
      start: "开始转换",
      working: "转换中…",
      downloadZip: "下载 ZIP",
      result: "输出结果",
      note: "提示：倍率越高/页数越多，占用内存越大。",
      noOutput: "暂无输出。",
    };
  }, [locale]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [pagesInput, setPagesInput] = useState("1-");
  const [format, setFormat] = useState<ImageFormat>("png");
  const [background, setBackground] = useState<BackgroundMode>("white");
  const [scale, setScale] = useState<number>(2);
  const [jpgQuality, setJpgQuality] = useState<number>(85);

  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [zipName, setZipName] = useState<string>("");

  const cleanupUrls = () => {
    if (zipUrl) URL.revokeObjectURL(zipUrl);
  };

  const resetAll = () => {
    cleanupUrls();
    setPdf(null);
    setScope("all");
    setPagesInput("1-");
    setFormat("png");
    setBackground("white");
    setScale(2);
    setJpgQuality(85);
    setIsWorking(false);
    setProgress(null);
    setError(null);
    setZipUrl(null);
    setZipName("");
  };

  useEffect(() => {
    return () => {
      cleanupUrls();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    cleanupUrls();
    setZipUrl(null);
    setZipName("");
    setError(null);
    setProgress(null);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ data: bytes }).promise;
      setPdf({ name: file.name, size: file.size, bytes, pageCount: doc.numPages });
      setScope("all");
      setPagesInput("1-");
    } catch {
      setPdf(null);
      setError(locale === "en-us" ? "Failed to load PDF." : "PDF 加载失败。");
    } finally {
      event.target.value = "";
    }
  };

  const convert = async () => {
    if (!pdf) {
      setError(locale === "en-us" ? "Please select a PDF first." : "请先选择 PDF 文件。");
      return;
    }

    setIsWorking(true);
    setError(null);
    setProgress(null);
    cleanupUrls();
    setZipUrl(null);
    setZipName("");

    try {
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ data: pdf.bytes }).promise;

      const selectedPages =
        scope === "all"
          ? Array.from({ length: doc.numPages }, (_, i) => i + 1)
          : Array.from(parsePagesInput(pagesInput, doc.numPages)).sort((a, b) => a - b);

      if (!selectedPages.length) throw new Error(locale === "en-us" ? "Please input pages." : "请填写页码范围。");
      if (selectedPages.length > 200) throw new Error(locale === "en-us" ? "Too many pages. Use custom range." : "页数过多，请使用指定页码范围。");

      setProgress({ done: 0, total: selectedPages.length });

      const zipEntries: Record<string, Uint8Array> = {};
      const mime = format === "png" ? "image/png" : "image/jpeg";
      const padWidth = Math.max(3, String(doc.numPages).length);

      for (let i = 0; i < selectedPages.length; i += 1) {
        const pageNo = selectedPages[i]!;
        const page = await doc.getPage(pageNo);
        if (!page.getViewport || !page.render) throw new Error(locale === "en-us" ? "Rendering is unavailable." : "无法渲染页面。");
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error(locale === "en-us" ? "Failed to create canvas context." : "无法创建画布。");

        const needWhite = format === "jpg" || background === "white";
        if (needWhite) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await canvasToBlob(canvas, mime, format === "jpg" ? jpgQuality / 100 : undefined);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const filename = `page-${String(pageNo).padStart(padWidth, "0")}.${format === "jpg" ? "jpg" : "png"}`;
        zipEntries[filename] = bytes;
        setProgress({ done: i + 1, total: selectedPages.length });
      }

      const zipBytes = zipSync(zipEntries, { level: 0 });
      const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
      new Uint8Array(zipBuffer).set(zipBytes);
      const blob = new Blob([zipBuffer], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      setZipUrl(url);
      setZipName(`images-${pdf.name.replace(/\\.pdf$/iu, "")}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : locale === "en-us" ? "Conversion failed." : "转换失败。");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <ToolPageLayout toolSlug="pdf-to-images">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 backdrop-blur dark:border-slate-700 dark:bg-slate-950/60">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{ui.hint}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{ui.note}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:scale-95"
              >
                {ui.pick}
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {ui.clear}
              </button>
              <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
            </div>
          </div>

          {pdf ? (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{pdf.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {formatSize(pdf.size)} · {pdf.pageCount} pages
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <div className="grid gap-2">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.scope}</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} />
                    <span>{ui.all}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="scope" checked={scope === "custom"} onChange={() => setScope("custom")} />
                    <span>{ui.custom}</span>
                  </label>
                </div>
                {scope === "custom" ? (
                  <label className="grid gap-1">
                    <span className="text-xs text-slate-600 dark:text-slate-300">{ui.pages}</span>
                    <input
                      value={pagesInput}
                      onChange={(e) => setPagesInput(e.target.value)}
                      placeholder={ui.pagesPlaceholder}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                ) : null}
              </div>

              <div className="grid gap-2">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.format}</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="format" checked={format === "png"} onChange={() => setFormat("png")} />
                    <span>{ui.png}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="format" checked={format === "jpg"} onChange={() => setFormat("jpg")} />
                    <span>{ui.jpg}</span>
                  </label>
                </div>
              </div>

              <div className="grid gap-2">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.scale}</div>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.25}
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                />
                <div className="text-xs text-slate-500 dark:text-slate-400">{scale}x</div>
              </div>

              {format === "jpg" ? (
                <div className="grid gap-2">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.quality}</div>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    step={1}
                    value={jpgQuality}
                    onChange={(e) => setJpgQuality(Number(e.target.value))}
                  />
                  <div className="text-xs text-slate-500 dark:text-slate-400">{jpgQuality}</div>
                </div>
              ) : (
                <div className="grid gap-2">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.background}</div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="bg" checked={background === "white"} onChange={() => setBackground("white")} />
                      <span>{ui.white}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="bg"
                        checked={background === "transparent"}
                        onChange={() => setBackground("transparent")}
                      />
                      <span>{ui.transparent}</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={convert}
                  disabled={!pdf || isWorking}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {isWorking ? ui.working : ui.start}
                </button>
                {progress ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {progress.done}/{progress.total}
                  </div>
                ) : null}
              </div>

              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.result}</div>
              <div className="flex flex-wrap gap-2">
                {zipUrl ? (
                  <a
                    href={zipUrl}
                    download={zipName || "images.zip"}
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                  >
                    {ui.downloadZip}
                  </a>
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{ui.noOutput}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
