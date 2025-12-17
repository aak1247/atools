"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { zipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";

type SplitMode = "extract" | "per-page";
type Scope = "all" | "custom";

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

const parsePagesOrderedInput = (input: string, pageCount: number): number[] => {
  const out: number[] = [];
  const seen = new Set<number>();
  const raw = input.trim();
  if (!raw) return out;

  const tokens = raw
    .split(/[,\s]+/u)
    .map((t) => t.trim())
    .filter(Boolean);

  const push = (page: number) => {
    if (seen.has(page)) return;
    seen.add(page);
    out.push(page);
  };

  for (const token of tokens) {
    if (/^\d+$/u.test(token)) {
      push(clampInt(Number(token), 1, pageCount));
      continue;
    }
    const match = token.match(/^(\d+)?-(\d+)?$/u);
    if (!match) continue;
    const startRaw = match[1] ? Number(match[1]) : 1;
    const endRaw = match[2] ? Number(match[2]) : pageCount;
    if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw)) continue;
    const start = clampInt(Math.min(startRaw, endRaw), 1, pageCount);
    const end = clampInt(Math.max(startRaw, endRaw), 1, pageCount);
    for (let page = start; page <= end; page += 1) push(page);
  }

  return out;
};

const padPage = (page: number, totalPages: number) => {
  const width = Math.max(3, String(totalPages).length);
  return String(page).padStart(width, "0");
};

export default function PdfSplitClient() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";

  const ui = useMemo(() => {
    if (locale === "en-us") {
      return {
        hint: "Split PDFs or extract selected pages locally (no uploads).",
        pick: "Select PDF",
        clear: "Clear",
        mode: "Mode",
        extract: "Extract to one PDF",
        perPage: "Split to per-page PDFs (ZIP)",
        scope: "Scope",
        all: "All pages",
        custom: "Custom pages",
        pages: "Pages",
        pagesPlaceholder: "e.g. 1-3,5,10-",
        start: "Start",
        working: "Working…",
        result: "Result",
        downloadPdf: "Download PDF",
        downloadZip: "Download ZIP",
        note: "Tip: large PDFs may take longer and use more memory.",
      };
    }
    return {
      hint: "拆分 PDF 或提取指定页面，全程本地处理，不上传文件。",
      pick: "选择 PDF",
      clear: "清空",
      mode: "模式",
      extract: "提取为一个新 PDF",
      perPage: "按页拆分（ZIP）",
      scope: "范围",
      all: "全部页面",
      custom: "指定页码",
      pages: "页码",
      pagesPlaceholder: "例如：1-3,5,10-",
      start: "开始处理",
      working: "处理中…",
      result: "输出结果",
      downloadPdf: "下载 PDF",
      downloadZip: "下载 ZIP",
      note: "提示：页数较多的 PDF 处理时间更长，且会占用更多内存。",
    };
  }, [locale]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [mode, setMode] = useState<SplitMode>("extract");
  const [scope, setScope] = useState<Scope>("all");
  const [pagesInput, setPagesInput] = useState("1-");

  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("");
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [zipName, setZipName] = useState<string>("");

  const cleanupUrls = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    if (zipUrl) URL.revokeObjectURL(zipUrl);
  };

  const resetAll = () => {
    cleanupUrls();
    setPdf(null);
    setMode("extract");
    setScope("all");
    setPagesInput("1-");
    setIsWorking(false);
    setProgress(null);
    setError(null);
    setDownloadUrl(null);
    setDownloadName("");
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
    setDownloadUrl(null);
    setZipUrl(null);
    setError(null);
    setProgress(null);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes);
      const pageCount = doc.getPageCount();
      setPdf({ name: file.name, size: file.size, bytes, pageCount });
      setScope("all");
      setPagesInput("1-");
    } catch (e) {
      setPdf(null);
      setError(e instanceof Error ? e.message : locale === "en-us" ? "Failed to load PDF." : "PDF 加载失败。");
    } finally {
      event.target.value = "";
    }
  };

  const run = async () => {
    if (!pdf) {
      setError(locale === "en-us" ? "Please select a PDF first." : "请先选择 PDF 文件。");
      return;
    }

    setIsWorking(true);
    setError(null);
    setProgress(null);
    cleanupUrls();
    setDownloadUrl(null);
    setZipUrl(null);

    try {
      const src = await PDFDocument.load(pdf.bytes);
      const pageCount = src.getPageCount();
      const pages =
        scope === "all"
          ? Array.from({ length: pageCount }, (_, i) => i + 1)
          : parsePagesOrderedInput(pagesInput, pageCount);

      if (!pages.length) throw new Error(locale === "en-us" ? "Please input pages." : "请填写页码范围。");

      setProgress({ done: 0, total: pages.length });

      if (mode === "extract") {
        const out = await PDFDocument.create();
        const indices = pages.map((p) => p - 1);
        const copied = await out.copyPages(src, indices);
        copied.forEach((page) => out.addPage(page));
        const bytes = await out.save();
        const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setDownloadName(`extracted-${pdf.name.replace(/\\.pdf$/iu, "")}.pdf`);
        setProgress({ done: pages.length, total: pages.length });
        return;
      }

      const zipEntries: Record<string, Uint8Array> = {};
      for (let i = 0; i < pages.length; i += 1) {
        const pageNo = pages[i]!;
        const out = await PDFDocument.create();
        const copied = await out.copyPages(src, [pageNo - 1]);
        out.addPage(copied[0]!);
        const outBytes = await out.save();
        const filename = `page-${padPage(pageNo, pageCount)}.pdf`;
        zipEntries[filename] = new Uint8Array(outBytes);
        setProgress({ done: i + 1, total: pages.length });
      }

      const zipBytes = zipSync(zipEntries, { level: 0 });
      const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
      new Uint8Array(zipBuffer).set(zipBytes);
      const blob = new Blob([zipBuffer], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      setZipUrl(url);
      setZipName(`pages-${pdf.name.replace(/\\.pdf$/iu, "")}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : locale === "en-us" ? "Failed to process PDF." : "处理失败。");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <ToolPageLayout toolSlug="pdf-split">
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
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.mode}</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="mode" checked={mode === "extract"} onChange={() => setMode("extract")} />
                    <span>{ui.extract}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="mode" checked={mode === "per-page"} onChange={() => setMode("per-page")} />
                    <span>{ui.perPage}</span>
                  </label>
                </div>
              </div>

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

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={run}
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
                {downloadUrl ? (
                  <a
                    href={downloadUrl}
                    download={downloadName || "extracted.pdf"}
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                  >
                    {ui.downloadPdf}
                  </a>
                ) : null}
                {zipUrl ? (
                  <a
                    href={zipUrl}
                    download={zipName || "pages.zip"}
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                  >
                    {ui.downloadZip}
                  </a>
                ) : null}
                {!downloadUrl && !zipUrl ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{locale === "en-us" ? "No output yet." : "暂无输出。"}</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
