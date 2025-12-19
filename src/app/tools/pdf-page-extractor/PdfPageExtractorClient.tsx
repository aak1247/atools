"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { zipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Mode = "single" | "per-page";
type LoadedPdf = { name: string; size: number; bytes: Uint8Array; pageCount: number };

const formatSize = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(value)));

const parsePagesInput = (input: string, pageCount: number): number[] => {
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

export default function PdfPageExtractorClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [pagesInput, setPagesInput] = useState("1-");
  const [mode, setMode] = useState<Mode>("single");

  const [isWorking, setIsWorking] = useState(false);
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
    setPagesInput("1-");
    setMode("single");
    setIsWorking(false);
    setError(null);
    setDownloadUrl(null);
    setDownloadName("");
    setZipUrl(null);
    setZipName("");
  };

  useEffect(() => {
    return () => cleanupUrls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    cleanupUrls();
    setDownloadUrl(null);
    setZipUrl(null);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes);
      setPdf({ name: file.name, size: file.size, bytes, pageCount: doc.getPageCount() });
      setPagesInput("1-");
    } catch (e) {
      setPdf(null);
      setError(e instanceof Error ? e.message : DEFAULT_UI.errParseFailed);
    }
  };

  const run = async (ui: Ui) => {
    if (!pdf) return;
    setIsWorking(true);
    setError(null);
    cleanupUrls();
    setDownloadUrl(null);
    setZipUrl(null);

    try {
      const pages = parsePagesInput(pagesInput, pdf.pageCount);
      if (!pages.length) throw new Error(ui.errNoValidPages);

      const src = await PDFDocument.load(pdf.bytes);
      const indices = pages.map((p) => p - 1).filter((idx) => idx >= 0 && idx < pdf.pageCount);
      const base = pdf.name.replace(/\.pdf$/iu, "") || "output";

      if (mode === "single") {
        const out = await PDFDocument.create();
        const copied = await out.copyPages(src, indices);
        copied.forEach((p) => out.addPage(p));
        const bytes = await out.save();
        const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setDownloadName(`${base}.extracted.pdf`);
        return;
      }

      const files: Record<string, Uint8Array> = {};
      for (const page of pages) {
        const idx = page - 1;
        if (idx < 0 || idx >= pdf.pageCount) continue;
        const out = await PDFDocument.create();
        const [copied] = await out.copyPages(src, [idx]);
        out.addPage(copied);
        const bytes = await out.save();
        files[`${base}-p${padPage(page, pdf.pageCount)}.pdf`] = new Uint8Array(bytes);
      }

      const zipped = zipSync(files, { level: 6 });
      const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      setZipUrl(url);
      setZipName(`${base}.pages.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errExtractFailed);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <ToolPageLayout toolSlug="pdf-page-extractor" maxWidthClassName="max-w-5xl">
      {({ config }) => {
        const ui: Ui = { ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) };
        return (
          <div className="w-full px-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.hint}</div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                {ui.pick}
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {ui.clear}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {pdf ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-medium text-slate-900">{pdf.name}</div>
                <div className="text-xs text-slate-500">
                  {formatSize(pdf.size)} · {pdf.pageCount} {ui.pageUnit}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="grid gap-2">
                  <div className="text-xs font-medium text-slate-700">{ui.mode}</div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="mode" checked={mode === "single"} onChange={() => setMode("single")} />
                      <span>{ui.single}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="mode" checked={mode === "per-page"} onChange={() => setMode("per-page")} />
                      <span>{ui.perPage}</span>
                    </label>
                  </div>
                </div>

                <label className="grid gap-1">
                  <span className="text-xs text-slate-600">{ui.pages}</span>
                  <input
                    value={pagesInput}
                    onChange={(e) => setPagesInput(e.target.value)}
                    placeholder={ui.pagesPlaceholder}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void run(ui)}
                    disabled={!pdf || isWorking}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isWorking ? ui.working : ui.start}
                  </button>
                </div>

                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                ) : null}
              </div>

              <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-700">{ui.result}</div>
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
                  {!downloadUrl && !zipUrl ? <div className="text-sm text-slate-500">{ui.noOutput}</div> : null}
                </div>
              </div>
            </div>
          </div>
        );
      }}
    </ToolPageLayout>
  );
}

type Ui = {
  hint: string;
  pick: string;
  clear: string;
  pageUnit: string;
  mode: string;
  single: string;
  perPage: string;
  pages: string;
  pagesPlaceholder: string;
  start: string;
  working: string;
  result: string;
  downloadPdf: string;
  downloadZip: string;
  noOutput: string;
  errParseFailed: string;
  errNoValidPages: string;
  errExtractFailed: string;
};

const DEFAULT_UI: Ui = {
  hint: "提取 PDF 指定页面，全程本地处理，不上传文件。",
  pick: "选择 PDF",
  clear: "清空",
  pageUnit: "页",
  mode: "模式",
  single: "提取为一个新 PDF",
  perPage: "每页单独导出（ZIP）",
  pages: "页码",
  pagesPlaceholder: "例如：1-3,5,10-",
  start: "开始提取",
  working: "处理中…",
  result: "输出结果",
  downloadPdf: "下载 PDF",
  downloadZip: "下载 ZIP",
  noOutput: "暂无输出。",
  errParseFailed: "PDF 解析失败。",
  errNoValidPages: "未选择有效页码。",
  errExtractFailed: "提取失败。",
};
