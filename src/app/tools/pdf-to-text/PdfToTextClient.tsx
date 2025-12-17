"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { zipSync } from "fflate";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";
import { loadPdfJs, type PdfJsTextItem } from "../../../lib/pdfjs-loader";

type Scope = "all" | "custom";
type OutputMode = "single" | "per-page";
type LayoutMode = "flow" | "lines";

type LoadedPdf = {
  name: string;
  size: number;
  bytes: Uint8Array;
  pageCount: number;
};

type PageText = {
  page: number;
  text: string;
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

const extractFlowText = (items: PdfJsTextItem[]) =>
  items
    .map((it) => (typeof it.str === "string" ? it.str : ""))
    .join(" ")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

const extractLinesText = (items: PdfJsTextItem[]) => {
  const rows = new Map<number, Array<{ x: number; str: string }>>();
  const rowYs: number[] = [];
  const threshold = 2.0;

  for (const item of items) {
    const str = typeof item.str === "string" ? item.str.trim() : "";
    if (!str) continue;
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const x = typeof transform[4] === "number" ? transform[4] : 0;
    const y = typeof transform[5] === "number" ? transform[5] : 0;

    let keyY: number | null = null;
    for (const existingY of rowYs) {
      if (Math.abs(existingY - y) <= threshold) {
        keyY = existingY;
        break;
      }
    }
    if (keyY === null) {
      keyY = y;
      rowYs.push(keyY);
    }

    const list = rows.get(keyY) ?? [];
    list.push({ x, str });
    rows.set(keyY, list);
  }

  rowYs.sort((a, b) => b - a);

  const lines: string[] = [];
  for (const y of rowYs) {
    const parts = rows.get(y) ?? [];
    parts.sort((a, b) => a.x - b.x);
    const line = parts
      .map((p) => p.str)
      .join(" ")
      .replace(/\s{2,}/gu, " ")
      .trim();
    if (line) lines.push(line);
  }

  return lines.join("\n").trim();
};

const textToU8 = (text: string) => new TextEncoder().encode(text);

const copyText = async (text: string) => {
  if (!text) return;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-10000px";
  textarea.style.top = "-10000px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
};

export default function PdfToTextClient() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";

  const ui = useMemo(() => {
    if (locale === "en-us") {
      return {
        hint: "Extract text from PDFs locally (no uploads).",
        pick: "Select PDF",
        clear: "Clear",
        scope: "Scope",
        all: "All pages",
        custom: "Custom pages",
        pages: "Pages",
        pagesPlaceholder: "e.g. 1-3,5,10-",
        layout: "Layout",
        flow: "Flow (best effort)",
        lines: "Line grouping",
        output: "Output",
        single: "Single TXT",
        perPage: "Per-page TXT (ZIP)",
        includePageHeaders: "Include page headers",
        extract: "Extract",
        extracting: "Extracting…",
        copy: "Copy",
        downloadTxt: "Download TXT",
        downloadZip: "Download ZIP",
        results: "Result",
        empty: "No output yet.",
        note: "Note: scanned image-only PDFs may contain no selectable text (OCR required).",
      };
    }
    return {
      hint: "提取 PDF 文本，全程本地处理，不上传文件。",
      pick: "选择 PDF",
      clear: "清空",
      scope: "范围",
      all: "全部页面",
      custom: "指定页码",
      pages: "页码",
      pagesPlaceholder: "例如：1-3,5,10-",
      layout: "排版",
      flow: "流式（尽力还原）",
      lines: "按行分组",
      output: "输出",
      single: "合并为一个 TXT",
      perPage: "按页 TXT（ZIP）",
      includePageHeaders: "插入页码分隔",
      extract: "开始提取",
      extracting: "提取中…",
      copy: "复制",
      downloadTxt: "下载 TXT",
      downloadZip: "下载 ZIP",
      results: "提取结果",
      empty: "暂无输出。",
      note: "提示：扫描版图片 PDF 可能没有可选中文本，需要 OCR。",
    };
  }, [locale]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [pagesInput, setPagesInput] = useState("1-");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("flow");
  const [outputMode, setOutputMode] = useState<OutputMode>("single");
  const [includePageHeaders, setIncludePageHeaders] = useState(true);

  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pages, setPages] = useState<PageText[]>([]);
  const [combinedText, setCombinedText] = useState<string>("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [zipUrl, setZipUrl] = useState<string | null>(null);

  const cleanupUrls = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    if (zipUrl) URL.revokeObjectURL(zipUrl);
  };

  const resetAll = () => {
    cleanupUrls();
    setPdf(null);
    setPages([]);
    setCombinedText("");
    setError(null);
    setDownloadUrl(null);
    setZipUrl(null);
    setProgress(null);
    setScope("all");
    setPagesInput("1-");
    setLayoutMode("flow");
    setOutputMode("single");
    setIncludePageHeaders(true);
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
    setPages([]);
    setCombinedText("");
    setError(null);
    setDownloadUrl(null);
    setZipUrl(null);
    setProgress(null);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ data: bytes }).promise;
      setPdf({ name: file.name, size: file.size, bytes, pageCount: doc.numPages });
      setPagesInput("1-");
      setScope("all");
    } catch {
      setPdf(null);
      setError(locale === "en-us" ? "Failed to load PDF." : "PDF 加载失败。");
    } finally {
      event.target.value = "";
    }
  };

  const extract = async () => {
    if (!pdf) {
      setError(locale === "en-us" ? "Please select a PDF first." : "请先选择 PDF 文件。");
      return;
    }

    setIsExtracting(true);
    setError(null);
    setPages([]);
    setCombinedText("");
    cleanupUrls();
    setDownloadUrl(null);
    setZipUrl(null);

    try {
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ data: pdf.bytes }).promise;

      const selectedPages =
        scope === "all"
          ? Array.from({ length: doc.numPages }, (_, i) => i + 1)
          : Array.from(parsePagesInput(pagesInput, doc.numPages)).sort((a, b) => a - b);

      if (!selectedPages.length) throw new Error(locale === "en-us" ? "Please input pages." : "请填写页码范围。");

      setProgress({ done: 0, total: selectedPages.length });
      const out: PageText[] = [];

      for (let i = 0; i < selectedPages.length; i += 1) {
        const pageNo = selectedPages[i]!;
        const page = await doc.getPage(pageNo);
        if (!page.getTextContent) throw new Error(locale === "en-us" ? "Text extraction is unavailable." : "无法提取文本。");
        const content = await page.getTextContent({ normalizeWhitespace: true });
        const text = layoutMode === "lines" ? extractLinesText(content.items) : extractFlowText(content.items);
        out.push({ page: pageNo, text });
        setProgress({ done: i + 1, total: selectedPages.length });
      }

      setPages(out);

      if (outputMode === "single") {
        const merged = out
          .map((p) => {
            if (!includePageHeaders) return p.text;
            const header = locale === "en-us" ? `===== Page ${p.page} =====` : `===== 第 ${p.page} 页 =====`;
            return `${header}\n${p.text}`.trim();
          })
          .join("\n\n");

        setCombinedText(merged);
        const blob = new Blob([merged], { type: "text/plain;charset=utf-8" });
        setDownloadUrl(URL.createObjectURL(blob));
        return;
      }

      const zipEntries: Record<string, Uint8Array> = {};
      const padWidth = Math.max(3, String(doc.numPages).length);

      for (const p of out) {
        const prefix = includePageHeaders ? (locale === "en-us" ? `Page ${p.page}\n\n` : `第 ${p.page} 页\n\n`) : "";
        const filename = `page-${String(p.page).padStart(padWidth, "0")}.txt`;
        zipEntries[filename] = textToU8(`${prefix}${p.text}`.trimEnd() + "\n");
      }

      const zipBytes = zipSync(zipEntries, { level: 0 });
      const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
      new Uint8Array(zipBuffer).set(zipBytes);
      const blob = new Blob([zipBuffer], { type: "application/zip" });
      setZipUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : locale === "en-us" ? "Extraction failed." : "提取失败。");
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <ToolPageLayout toolSlug="pdf-to-text">
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
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.layout}</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="layout" checked={layoutMode === "flow"} onChange={() => setLayoutMode("flow")} />
                    <span>{ui.flow}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="layout" checked={layoutMode === "lines"} onChange={() => setLayoutMode("lines")} />
                    <span>{ui.lines}</span>
                  </label>
                </div>
              </div>

              <div className="grid gap-2">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.output}</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="output" checked={outputMode === "single"} onChange={() => setOutputMode("single")} />
                    <span>{ui.single}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="output" checked={outputMode === "per-page"} onChange={() => setOutputMode("per-page")} />
                    <span>{ui.perPage}</span>
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={includePageHeaders} onChange={(e) => setIncludePageHeaders(e.target.checked)} />
                  <span>{ui.includePageHeaders}</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={extract}
                  disabled={!pdf || isExtracting}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {isExtracting ? ui.extracting : ui.extract}
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
              <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.results}</div>
              {outputMode === "single" ? (
                <div className="grid gap-2">
                  <div className="flex flex-wrap gap-2">
                    {downloadUrl ? (
                      <a
                        href={downloadUrl}
                        download={`text-${pdf?.name?.replace(/\\.pdf$/iu, "") ?? "pdf"}.txt`}
                        className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                      >
                        {ui.downloadTxt}
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => copyText(combinedText)}
                      disabled={!combinedText}
                      className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      {ui.copy}
                    </button>
                  </div>
                  <textarea
                    value={combinedText}
                    readOnly
                    placeholder={ui.empty}
                    className="min-h-48 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              ) : (
                <div className="grid gap-2">
                  {zipUrl ? (
                    <a
                      href={zipUrl}
                      download={`pages-${pdf?.name?.replace(/\\.pdf$/iu, "") ?? "pdf"}.zip`}
                      className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                    >
                      {ui.downloadZip}
                    </a>
                  ) : null}
                  <div className="max-h-64 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {pages.length ? (
                      <ul className="space-y-2">
                        {pages.slice(0, 20).map((p) => (
                          <li key={p.page} className="grid gap-1">
                            <div className="text-xs font-medium">{locale === "en-us" ? `Page ${p.page}` : `第 ${p.page} 页`}</div>
                            <div className="line-clamp-3 text-xs text-slate-600 dark:text-slate-300">{p.text || "-"}</div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-slate-500 dark:text-slate-400">{ui.empty}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
