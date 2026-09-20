"use client";

import type { ChangeEvent, DragEvent } from "react";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString } from "pdf-lib";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { loadPdfJs, type PdfJsTextItem } from "../../../lib/pdfjs-loader";

type TocItem = { title: string; page: number; level: number };

type TocStyle = {
  titleFont: string;
  titleColor: string;
  titleSize: number;
  itemFont: string;
  itemColor: string;
  itemSize: number;
};

type TocRenderPage = {
  isFirstPage: boolean;
  title: string;
  entries: Array<{
    title: string;
    pageNumberText: string;
    targetPageIndex: number;
    level: number;
    y: number;
  }>;
};

const DEFAULT_UI = {
  selectPdf: "选择 PDF",
  replacePdf: "点击替换 PDF",
  clear: "清空",
  dropReplaceHint: "支持拖拽新 PDF 到此区域直接替换",
  pageCount: "页数：",
  generating: "生成中…",
  generateTocPage: "生成带目录PDF",
  parseChapters: "解析章节",
  parsingChapters: "解析中…",
  tocContent: "目录内容",
  tocFormatHint: "每行格式：页码 TAB 标题。可用 #/##/### 标记左侧书签层级。",
  parsedItems: "已解析 {count} 条。",
  importStatusIdle: "上传 PDF 后会优先自动读取已有左侧书签。",
  importStatusFound: "已从 PDF 左侧书签读取 {count} 条章节，可继续人工修改。",
  importStatusNone: "未发现可读取的左侧书签。可点击“解析章节”从正文尝试识别，或直接人工填写。",
  importStatusFoundWithTocPages: "已从 PDF 左侧书签读取 {count} 条章节，并检测到开头 {pages} 页旧目录页；生成时将默认覆盖。",
  importStatusParsed: "已从正文启发式解析 {count} 条章节，请检查后再生成。",
  importStatusParseNone: "没有从正文识别到章节。可能是扫描件、无文本 PDF，或标题格式不明显，请人工填写。",
  settings: "设置",
  tocTitle: "目录标题",
  insertAtBeginning: "插入到 PDF 首页",
  shiftPageNumbers: "目录页码按插入后自动 +1（仅在插入首页时生效）",
  addClickableLinks: "生成可点击目录页",
  addBookmarks: "生成 PDF 左侧书签",
  replaceExistingTocPages: "检测到旧目录页时覆盖",
  titleFont: "标题字体",
  titleColor: "标题颜色",
  titleSize: "标题字号",
  itemFont: "目录项字体",
  itemColor: "目录项颜色",
  itemSize: "目录项字号",
  output: "输出",
  download: "下载 {filename}",
  tip: "提示：此工具不会自动识别 PDF 标题层级（纯前端限制）。推荐先用目录大纲/书签信息手动整理页码与标题，再生成目录页插入。",
  parseError: "PDF 解析失败（可能是加密 PDF 或文件损坏）。",
  buildError: "生成失败",
  defaultOutline: "1\t封面\n2\t前言\n5\t第一章 标题\n",
  defaultTitle: "目录",
  defaultTocText: "目录",
  fontSansChinese: "系统黑体",
  fontSerifChinese: "系统宋体",
  fontSans: "无衬线",
  fontMono: "等宽",
  errCanvasContext: "当前浏览器无法创建目录页画布。",
  errCanvasExport: "当前浏览器无法导出目录页图片。",
} as const;

type PdfTocGeneratorUi = typeof DEFAULT_UI;

const parseOutline = (text: string): TocItem[] => {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out: TocItem[] = [];
  for (const line of lines) {
    const m = line.match(/^(\d+)\s*[:\t|]\s*(.+)$/);
    if (m) {
      const page = Number(m[1]);
      const { title, level } = parseEditableTitle(m[2]);
      if (Number.isFinite(page) && page > 0 && title) out.push({ page, title, level });
      continue;
    }
    const m2 = line.match(/^(.+?)\s+(\d+)$/);
    if (m2) {
      const { title, level } = parseEditableTitle(m2[1]);
      const page = Number(m2[2]);
      if (Number.isFinite(page) && page > 0 && title) out.push({ page, title, level });
    }
  }
  return out;
};

const parseEditableTitle = (value: string) => {
  const normalized = value.trim();
  const markdown = normalized.match(/^(#{1,6})\s+(.+)$/);
  if (markdown) return { title: markdown[2].trim(), level: Math.min(5, markdown[1].length) };
  return { title: normalized, level: Math.min(5, getOutlineLevel(normalized)) };
};

const serializeTocItems = (items: TocItem[]) =>
  items
    .map((item) => {
      const marker = item.level > 1 ? `${"#".repeat(Math.min(5, item.level))} ` : "";
      return `${item.page}\t${marker}${item.title}`;
    })
    .join("\n");

const FONT_OPTIONS = [
  { label: "系统黑体", value: `"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", Arial, sans-serif` },
  { label: "系统宋体", value: `"Songti SC", SimSun, "Noto Serif CJK SC", serif` },
  { label: "无衬线", value: `Arial, "Helvetica Neue", sans-serif` },
  { label: "等宽", value: `"SFMono-Regular", Consolas, "Liberation Mono", monospace` },
];

const TOC_LAYOUT = {
  marginX: 54,
  rightPadding: 54,
  marginBottom: 54,
  titleTopGap: 72,
  titleGap: 34,
  renderScale: 2,
  levelIndent: 18,
};

const DEFAULT_TOC_STYLE: TocStyle = {
  titleFont: FONT_OPTIONS[0].value,
  titleColor: "#0f172a",
  titleSize: 20,
  itemFont: FONT_OPTIONS[0].value,
  itemColor: "#26384f",
  itemSize: 11,
};

export default function PdfTocGeneratorClient() {
  return (
    <ToolPageLayout toolSlug="pdf-toc-generator" maxWidthClassName="max-w-6xl">
      <PdfTocGeneratorInner />
    </ToolPageLayout>
  );
}

function PdfTocGeneratorInner() {
  const config = useOptionalToolConfig("pdf-toc-generator");
  const ui: PdfTocGeneratorUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<PdfTocGeneratorUi>) };

  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [outline, setOutline] = useState<string>(ui.defaultOutline);
  const [title, setTitle] = useState<string>(ui.defaultTitle);
  const [insertAtBeginning, setInsertAtBeginning] = useState(true);
  const [shiftPageNumbers, setShiftPageNumbers] = useState(true);
  const [addClickableLinks, setAddClickableLinks] = useState(true);
  const [addBookmarks, setAddBookmarks] = useState(true);
  const [replaceExistingTocPages, setReplaceExistingTocPages] = useState(true);
  const [detectedTocPageCount, setDetectedTocPageCount] = useState(0);
  const [tocStyle, setTocStyle] = useState<TocStyle>(DEFAULT_TOC_STYLE);
  const [isDragging, setIsDragging] = useState(false);
  const [importStatus, setImportStatus] = useState<string>(ui.importStatusIdle);
  const [isParsingChapters, setIsParsingChapters] = useState(false);

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("with-toc.pdf");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  useEffect(() => {
    if (!insertAtBeginning) setShiftPageNumbers(false);
  }, [insertAtBeginning]);

  const items = useMemo(() => parseOutline(outline), [outline]);

  const fontOptions = useMemo(
    () => [
      { label: ui.fontSansChinese, value: `"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", Arial, sans-serif` },
      { label: ui.fontSerifChinese, value: `"Songti SC", SimSun, "Noto Serif CJK SC", serif` },
      { label: ui.fontSans, value: `Arial, "Helvetica Neue", sans-serif` },
      { label: ui.fontMono, value: `"SFMono-Regular", Consolas, "Liberation Mono", monospace` },
    ],
    [ui.fontSansChinese, ui.fontSerifChinese, ui.fontSans, ui.fontMono],
  );

  const pick = async (selected: File) => {
    setFile(selected);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setDetectedTocPageCount(0);
    const base = selected.name.replace(/\.pdf$/i, "") || "document";
    setDownloadName(`${base}.toc.pdf`);
    setImportStatus(ui.importStatusIdle);
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
      setPageCount(doc.getPageCount());
      const importedItems = extractExistingPdfBookmarks(doc);
      if (importedItems.length > 0) {
        setOutline(serializeTocItems(importedItems));
        const oldTocPages = await detectExistingTocPageCount(selected, importedItems);
        setDetectedTocPageCount(oldTocPages);
        setImportStatus(
          oldTocPages > 0
            ? ui.importStatusFoundWithTocPages
                .replace("{count}", importedItems.length.toString())
                .replace("{pages}", oldTocPages.toString())
            : ui.importStatusFound.replace("{count}", importedItems.length.toString()),
        );
      } else {
        setOutline("");
        setImportStatus(ui.importStatusNone);
      }
    } catch (e) {
      setPageCount(null);
      setError(e instanceof Error ? e.message : ui.parseError);
      setImportStatus(ui.importStatusNone);
    }
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) void pick(selected);
  };

  const openFilePicker = () => {
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) void pick(selected);
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const parseChaptersFromFile = async () => {
    if (!file) return;
    setIsParsingChapters(true);
    setError(null);
    try {
      const parsedItems = await parsePdfChaptersFromText(file);
      if (parsedItems.length > 0) {
        setOutline(serializeTocItems(parsedItems));
        setImportStatus(ui.importStatusParsed.replace("{count}", parsedItems.length.toString()));
      } else {
        setImportStatus(ui.importStatusParseNone);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.parseError);
      setImportStatus(ui.importStatusParseNone);
    } finally {
      setIsParsingChapters(false);
    }
  };

  const build = async () => {
    if (!file) return;
    setIsWorking(true);
    setError(null);
    setImportStatus(ui.importStatusIdle);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    try {
      const srcBytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(srcBytes, { ignoreEncryption: false });
      const originalPageCount = doc.getPageCount();
      const pages = doc.getPages();

      const refPage = pages[0];
      const size = refPage.getSize();
      const titleY = size.height - TOC_LAYOUT.titleTopGap;
      const layout = getTocLayout(tocStyle);
      const removedTocPageCount =
        replaceExistingTocPages && detectedTocPageCount > 0
          ? Math.min(detectedTocPageCount, Math.max(0, originalPageCount - 1))
          : 0;

      const safeItems = items
        .map((it) => ({ ...it, page: clampPage(it.page, originalPageCount) }))
        .filter((it) => it.title && it.page > removedTocPageCount);

      const tocPageCount = estimateTocPageCount(safeItems.length, titleY, layout.lineHeight);
      const generatedPageOffset = (insertAtBeginning ? tocPageCount : 0) - removedTocPageCount;
      const tocRenderPagesWithNumbers = paginateTocItems({
        items: safeItems,
        title: title || ui.defaultTocText,
        titleY,
        tocPageCount,
        lineHeight: layout.lineHeight,
        shiftPagesBy: shiftPageNumbers ? generatedPageOffset : null,
        targetPageOffset: generatedPageOffset,
      });

      for (let i = 0; i < removedTocPageCount; i += 1) doc.removePage(0);

      const tocPages = [];
      if (insertAtBeginning) {
        for (let i = 0; i < tocPageCount; i += 1) tocPages.push(doc.insertPage(i, [size.width, size.height]));
      } else {
        for (let i = 0; i < tocPageCount; i += 1) tocPages.push(doc.addPage([size.width, size.height]));
      }

      for (let i = 0; i < tocPages.length; i += 1) {
        const page = tocPages[i];
        const pngBytes = await renderTocPagePngBytes(tocRenderPagesWithNumbers[i], size.width, size.height, tocStyle, ui);
        const image = await doc.embedPng(pngBytes);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: size.width,
          height: size.height,
        });
        if (addClickableLinks) addTocPageLinks(doc, page, tocRenderPagesWithNumbers[i], size.width, layout.lineHeight);
      }

      if (addBookmarks) addPdfBookmarks(doc, tocRenderPagesWithNumbers.flatMap((tocPage) => tocPage.entries));

      const out = await doc.save();
      const url = URL.createObjectURL(new Blob([new Uint8Array(out)], { type: "application/pdf" }));
      const base = file.name.replace(/\.pdf$/i, "") || "document";
      setDownloadName(`${base}.toc.${formatTimestampForFilename(new Date())}.pdf`);
      setDownloadUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.buildError);
    } finally {
      setIsWorking(false);
    }
  };

  const clear = () => {
    setFile(null);
    setPageCount(null);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setDetectedTocPageCount(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const updateTocStyle = <K extends keyof TocStyle>(key: K, value: TocStyle[K]) => {
    setTocStyle((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed p-4 transition ${
            isDragging
              ? "border-slate-400 bg-slate-50/60"
              : "border-slate-200 bg-slate-50/80"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onChange} />
            <button
              type="button"
              onClick={openFilePicker}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {file ? ui.replacePdf : ui.selectPdf}
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {ui.clear}
            </button>
            {file && (
              <div className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{file.name}</span>
                {pageCount != null && <span className="ml-2 text-slate-500">{ui.pageCount}{pageCount}</span>}
              </div>
            )}
          </div>
          <div className="w-full text-[11px] text-slate-500">{ui.dropReplaceHint}</div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">{ui.tocContent}</div>
              <button
                type="button"
                onClick={() => void parseChaptersFromFile()}
                disabled={!file || isParsingChapters || isWorking}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isParsingChapters ? ui.parsingChapters : ui.parseChapters}
              </button>
            </div>
            <div className="mt-3 text-xs text-slate-500">{ui.tocFormatHint}</div>
            <div className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
              {importStatus}
            </div>
            <textarea
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              className="mt-3 h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">{ui.parsedItems.replace('{count}', items.length.toString())}</div>
              <button
                type="button"
                onClick={() => void build()}
                disabled={!file || isWorking || items.length === 0}
                className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {isWorking ? ui.generating : ui.generateTocPage}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.settings}</div>
              <div className="mt-4 grid gap-4">
                <label className="block text-sm text-slate-700">
                  {ui.tocTitle}
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={insertAtBeginning}
                    onChange={(e) => setInsertAtBeginning(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {ui.insertAtBeginning}
                </label>
                <label className={`flex items-center gap-2 text-sm text-slate-700 ${insertAtBeginning ? "" : "opacity-60"}`}>
                  <input
                    type="checkbox"
                    checked={shiftPageNumbers}
                    onChange={(e) => setShiftPageNumbers(e.target.checked)}
                    disabled={!insertAtBeginning}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {ui.shiftPageNumbers}
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={addClickableLinks}
                    onChange={(e) => setAddClickableLinks(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {ui.addClickableLinks}
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={addBookmarks}
                    onChange={(e) => setAddBookmarks(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {ui.addBookmarks}
                </label>
                <label className={`flex items-center gap-2 text-sm text-slate-700 ${detectedTocPageCount > 0 ? "" : "opacity-60"}`}>
                  <input
                    type="checkbox"
                    checked={replaceExistingTocPages}
                    onChange={(e) => setReplaceExistingTocPages(e.target.checked)}
                    disabled={detectedTocPageCount === 0}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {ui.replaceExistingTocPages}
                </label>
                <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-3">
                  <label className="text-xs font-medium text-slate-600">
                    {ui.titleFont}
                    <select
                      value={tocStyle.titleFont}
                      onChange={(e) => updateTocStyle("titleFont", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      {fontOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    {ui.titleColor}
                    <input
                      type="color"
                      value={tocStyle.titleColor}
                      onChange={(e) => updateTocStyle("titleColor", e.target.value)}
                      className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-1 py-1"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    {ui.titleSize}
                    <input
                      type="number"
                      min={12}
                      max={40}
                      value={tocStyle.titleSize}
                      onChange={(e) => updateTocStyle("titleSize", clampNumber(Number(e.target.value), 12, 40))}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    {ui.itemFont}
                    <select
                      value={tocStyle.itemFont}
                      onChange={(e) => updateTocStyle("itemFont", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      {fontOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    {ui.itemColor}
                    <input
                      type="color"
                      value={tocStyle.itemColor}
                      onChange={(e) => updateTocStyle("itemColor", e.target.value)}
                      className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-1 py-1"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    {ui.itemSize}
                    <input
                      type="number"
                      min={8}
                      max={24}
                      value={tocStyle.itemSize}
                      onChange={(e) => updateTocStyle("itemSize", clampNumber(Number(e.target.value), 8, 24))}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{ui.output}</div>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={downloadName}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    {ui.download.replace('{filename}', downloadName)}
                  </a>
                )}
              </div>
              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                {ui.tip}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const clampPage = (page: number, pageCount: number) => {
  if (!Number.isFinite(page) || page <= 0) return 1;
  if (!Number.isFinite(pageCount) || pageCount <= 0) return Math.max(1, Math.round(page));
  return Math.min(pageCount, Math.max(1, Math.round(page)));
};

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
};

const getTocLayout = (style: TocStyle) => ({
  lineHeight: Math.max(14, Math.ceil(style.itemSize * 1.45)),
});

const getOutlineLevel = (title: string) => {
  const normalized = title.trim();
  const numbered = normalized.match(/^(\d+(?:[.．]\d+)*)(?:[.．、\s]|$)/);
  if (numbered) return Math.min(5, numbered[1].split(/[.．]/).filter(Boolean).length);
  const markdown = normalized.match(/^(#{1,6})\s+/);
  if (markdown) return Math.min(5, markdown[1].length);
  return 1;
};

const formatTimestampForFilename = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
};

const estimateTocPageCount = (itemCount: number, titleY: number, lineHeight: number) => {
  const firstCapacity = countLinesThatFit(titleY - TOC_LAYOUT.titleGap, lineHeight);
  const nextCapacity = countLinesThatFit(titleY - lineHeight * 2, lineHeight);
  if (itemCount <= firstCapacity) return 1;
  if (nextCapacity <= 0) return 1;
  return 1 + Math.ceil((itemCount - firstCapacity) / nextCapacity);
};

const countLinesThatFit = (firstLineY: number, lineHeight: number) => {
  const lastLineLimit = TOC_LAYOUT.marginBottom + lineHeight;
  if (firstLineY <= lastLineLimit) return 0;
  return Math.floor((firstLineY - lastLineLimit) / lineHeight) + 1;
};

const decodePdfText = (value: unknown) => {
  if (value instanceof PDFHexString || value instanceof PDFString) return value.decodeText();
  if (value instanceof PDFName) return value.asString().replace(/^\//, "");
  return value ? String(value) : "";
};

const lookupPdfObject = (doc: PDFDocument, value: unknown): unknown => {
  if (value instanceof PDFRef) return doc.context.lookup(value);
  return value;
};

const collectNamedDestinations = (doc: PDFDocument) => {
  const destinations = new Map<string, unknown>();
  const readDestinationNameTree = (tree: PDFDict | undefined) => {
    if (!tree) return;
    const names = tree.lookupMaybe(pdfName("Names"), PDFArray);
    if (names) {
      for (let i = 0; i + 1 < names.size(); i += 2) {
        destinations.set(decodePdfText(names.get(i)), names.get(i + 1));
      }
    }
    const kids = tree.lookupMaybe(pdfName("Kids"), PDFArray);
    if (!kids) return;
    for (let i = 0; i < kids.size(); i += 1) {
      const child = lookupPdfObject(doc, kids.get(i));
      if (child instanceof PDFDict) readDestinationNameTree(child);
    }
  };

  const catalogDests = doc.catalog.lookupMaybe(pdfName("Dests"), PDFDict);
  if (catalogDests) {
    for (const key of catalogDests.keys()) destinations.set(decodePdfText(key), catalogDests.get(key));
  }

  const names = doc.catalog.lookupMaybe(pdfName("Names"), PDFDict);
  const destTree = names?.lookupMaybe(pdfName("Dests"), PDFDict);
  readDestinationNameTree(destTree);
  return destinations;
};

const destinationPageNumber = (
  doc: PDFDocument,
  destination: unknown,
  pageNumberByRef: Map<string, number>,
  namedDestinations: Map<string, unknown>,
): number | null => {
  const resolved = lookupPdfObject(doc, destination);
  if (resolved instanceof PDFArray) {
    const target = resolved.get(0);
    return pageNumberByRef.get(String(target)) ?? null;
  }
  const destinationName = decodePdfText(resolved);
  if (destinationName && namedDestinations.has(destinationName)) {
    return destinationPageNumber(doc, namedDestinations.get(destinationName), pageNumberByRef, namedDestinations);
  }
  return null;
};

const actionPageNumber = (
  doc: PDFDocument,
  action: unknown,
  pageNumberByRef: Map<string, number>,
  namedDestinations: Map<string, unknown>,
) => {
  const actionDict = lookupPdfObject(doc, action);
  if (!(actionDict instanceof PDFDict)) return null;
  return destinationPageNumber(doc, actionDict.get(pdfName("D")), pageNumberByRef, namedDestinations);
};

const extractExistingPdfBookmarks = (doc: PDFDocument): TocItem[] => {
  const outlineRoot = doc.catalog.lookupMaybe(pdfName("Outlines"), PDFDict);
  if (!outlineRoot) return [];

  const pageNumberByRef = new Map<string, number>();
  doc.getPages().forEach((page, index) => pageNumberByRef.set(String(page.ref), index + 1));
  const namedDestinations = collectNamedDestinations(doc);
  const importedItems: TocItem[] = [];
  const seenRefs = new Set<string>();

  const walkNode = (nodeRef: unknown, level: number) => {
    let currentRef = nodeRef;
    while (currentRef) {
      const refKey = String(currentRef);
      if (seenRefs.has(refKey)) return;
      seenRefs.add(refKey);

      const node = lookupPdfObject(doc, currentRef);
      if (!(node instanceof PDFDict)) return;

      const title = decodePdfText(node.get(pdfName("Title"))).trim();
      const page =
        destinationPageNumber(doc, node.get(pdfName("Dest")), pageNumberByRef, namedDestinations) ??
        actionPageNumber(doc, node.get(pdfName("A")), pageNumberByRef, namedDestinations);
      if (title && page) importedItems.push({ title, page, level: Math.min(5, Math.max(1, level)) });

      const first = node.get(pdfName("First"));
      if (first) walkNode(first, level + 1);

      currentRef = node.get(pdfName("Next"));
    }
  };

  walkNode(outlineRoot.get(pdfName("First")), 1);
  return importedItems;
};

const normalizePdfLine = (value: string) => value.replace(/\s+/g, " ").trim();

const getHeadingLevel = (line: string) => {
  if (line.length < 2 || line.length > 90) return null;
  if (/^第[一二三四五六七八九十百千万\d]+[章节篇部分]\s*\S*/.test(line)) return 1;
  if (/^[一二三四五六七八九十]+[、.．]\S+/.test(line)) return 1;
  if (/^（[一二三四五六七八九十]+）\S+/.test(line) || /^\([一二三四五六七八九十]+\)\S+/.test(line)) return 2;
  const numbered = line.match(/^(\d+(?:[.．]\d+){0,5})(?:[、.．\s]+)\S+/);
  if (numbered) return Math.min(5, numbered[1].split(/[.．]/).filter(Boolean).length);
  const markdown = line.match(/^(#{1,6})\s+\S+/);
  if (markdown) return Math.min(5, markdown[1].length);
  return null;
};

const textItemsToLines = (items: PdfJsTextItem[]) => {
  const positioned = items
    .map((item) => ({
      text: item.str ?? "",
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
    }))
    .filter((item) => item.text.trim());

  positioned.sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x));

  const lines: Array<{ y: number; text: string }> = [];
  for (const item of positioned) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= 2) {
      last.text = normalizePdfLine(`${last.text} ${item.text}`);
    } else {
      lines.push({ y: item.y, text: normalizePdfLine(item.text) });
    }
  }
  return lines.map((line) => line.text).filter(Boolean);
};

const parsePdfChaptersFromText = async (file: File): Promise<TocItem[]> => {
  const pdfjs = await loadPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const chapters: TocItem[] = [];
  const seen = new Set<string>();
  const maxPages = Math.min(doc.numPages, 120);

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    if (!page.getTextContent) continue;
    const content = await page.getTextContent();
    for (const line of textItemsToLines(content.items)) {
      const normalized = normalizePdfLine(line.replace(/^\s*\d+\s*$/, ""));
      const level = getHeadingLevel(normalized);
      if (!level) continue;
      const key = `${pageNumber}:${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chapters.push({ title: normalized, page: pageNumber, level });
      if (chapters.length >= 300) return chapters;
    }
  }

  return chapters;
};

const detectExistingTocPageCount = async (file: File, importedItems: TocItem[]) => {
  const firstContentPage = Math.min(...importedItems.map((item) => item.page).filter((page) => page > 0));
  if (!Number.isFinite(firstContentPage) || firstContentPage <= 1) return 0;

  try {
    const pdfjs = await loadPdfJs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const maxCandidatePage = Math.min(doc.numPages, firstContentPage - 1, 5);
    let detected = 0;

    for (let pageNumber = 1; pageNumber <= maxCandidatePage; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      if (!page.getTextContent) continue;
      const content = await page.getTextContent();
      const text = normalizePdfLine(content.items.map((item) => item.str ?? "").join(" "));
      const compactText = text.replace(/\s+/g, "");
      if (/目录|目錄|contents/i.test(compactText)) detected = pageNumber;
    }

    return detected;
  } catch {
    return 0;
  }
};

const paginateTocItems = ({
  items,
  title,
  titleY,
  tocPageCount,
  lineHeight,
  shiftPagesBy,
  targetPageOffset,
}: {
  items: TocItem[];
  title: string;
  titleY: number;
  tocPageCount: number;
  lineHeight: number;
  shiftPagesBy: number | null;
  targetPageOffset: number;
}): TocRenderPage[] => {
  const renderPages: TocRenderPage[] = Array.from({ length: Math.max(1, tocPageCount) }, (_, index) => ({
    isFirstPage: index === 0,
    title,
    entries: [],
  }));

  let pageIndex = 0;
  let y = titleY - TOC_LAYOUT.titleGap;
  for (const item of items) {
    if (y <= TOC_LAYOUT.marginBottom + lineHeight) {
      pageIndex = Math.min(renderPages.length - 1, pageIndex + 1);
      y = pageIndex === 0 ? titleY - TOC_LAYOUT.titleGap : titleY - lineHeight * 2;
    }

    renderPages[pageIndex].entries.push({
      title: item.title,
      pageNumberText: String(shiftPagesBy == null ? item.page : item.page + shiftPagesBy),
      targetPageIndex: item.page - 1 + targetPageOffset,
      level: Math.min(5, Math.max(1, item.level)),
      y,
    });
    y -= lineHeight;
  }

  return renderPages;
};

const addTocPageLinks = (
  doc: PDFDocument,
  page: ReturnType<PDFDocument["getPage"]>,
  renderPage: TocRenderPage,
  pageWidth: number,
  lineHeight: number,
) => {
  for (const entry of renderPage.entries) {
    const rectBottom = Math.max(0, entry.y - 2);
    const rectTop = rectBottom + lineHeight;
    const targetPage = doc.getPage(entry.targetPageIndex);
    const annotationRef = doc.context.register(
      doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [TOC_LAYOUT.marginX, rectBottom, pageWidth - TOC_LAYOUT.rightPadding, rectTop],
        Border: [0, 0, 0],
        A: {
          Type: "Action",
          S: "GoTo",
          D: [targetPage.ref, "Fit"],
        },
      }),
    );
    page.node.addAnnot(annotationRef);
  }
};

const pdfName = (value: string) => PDFName.of(value);

const createGoToFitAction = (doc: PDFDocument, targetPageIndex: number) => {
  const targetPage = doc.getPage(targetPageIndex);
  const destination = PDFArray.withContext(doc.context);
  destination.push(targetPage.ref);
  destination.push(pdfName("Fit"));

  const action = PDFDict.withContext(doc.context);
  action.set(pdfName("Type"), pdfName("Action"));
  action.set(pdfName("S"), pdfName("GoTo"));
  action.set(pdfName("D"), destination);
  return action;
};

const clearExistingNavigation = (doc: PDFDocument) => {
  doc.catalog.delete(pdfName("Outlines"));
  doc.catalog.delete(pdfName("Dests"));

  const names = doc.catalog.lookupMaybe(pdfName("Names"), PDFDict);
  if (!names) return;

  names.delete(pdfName("Dests"));
  if (Array.from(names.keys()).length === 0) doc.catalog.delete(pdfName("Names"));
};

const addPdfBookmarks = (doc: PDFDocument, entries: TocRenderPage["entries"]) => {
  if (entries.length === 0) return;

  type OutlineRef = ReturnType<typeof doc.context.nextRef>;
  type OutlineNode = TocRenderPage["entries"][number] & {
    ref: OutlineRef;
    children: OutlineNode[];
    parent?: OutlineNode;
  };

  const nodes: OutlineNode[] = entries.map((entry) => ({
    ...entry,
    ref: doc.context.nextRef(),
    children: [],
  }));
  const rootNodes: OutlineNode[] = [];
  const stack: OutlineNode[] = [];

  for (const node of nodes) {
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
      node.parent = parent;
    } else {
      rootNodes.push(node);
    }
    stack.push(node);
  }

  const countOpenDescendants = (node: OutlineNode): number =>
    node.children.reduce((count, child) => count + 1 + countOpenDescendants(child), 0);

  const assignNode = (node: OutlineNode, parentRef: OutlineRef) => {
    const siblings = node.parent ? node.parent.children : rootNodes;
    const siblingIndex = siblings.indexOf(node);
    const dict = PDFDict.withContext(doc.context);
    dict.set(pdfName("Title"), PDFHexString.fromText(node.title));
    dict.set(pdfName("Parent"), parentRef);
    if (siblingIndex > 0) dict.set(pdfName("Prev"), siblings[siblingIndex - 1].ref);
    if (siblingIndex < siblings.length - 1) dict.set(pdfName("Next"), siblings[siblingIndex + 1].ref);
    if (node.children[0]) dict.set(pdfName("First"), node.children[0].ref);
    if (node.children[node.children.length - 1]) dict.set(pdfName("Last"), node.children[node.children.length - 1].ref);
    if (node.children.length > 0) dict.set(pdfName("Count"), PDFNumber.of(countOpenDescendants(node)));
    dict.set(pdfName("A"), createGoToFitAction(doc, node.targetPageIndex));
    doc.context.assign(node.ref, dict);
    for (const child of node.children) assignNode(child, node.ref);
  };

  const outlineRootRef = doc.context.nextRef();
  for (const rootNode of rootNodes) assignNode(rootNode, outlineRootRef);

  const outlineRoot = PDFDict.withContext(doc.context);
  outlineRoot.set(pdfName("Type"), pdfName("Outlines"));
  outlineRoot.set(pdfName("First"), rootNodes[0].ref);
  outlineRoot.set(pdfName("Last"), rootNodes[rootNodes.length - 1].ref);
  outlineRoot.set(pdfName("Count"), PDFNumber.of(entries.length));
  doc.context.assign(outlineRootRef, outlineRoot);

  clearExistingNavigation(doc);
  doc.catalog.set(pdfName("Outlines"), outlineRootRef);
  doc.catalog.set(pdfName("PageMode"), pdfName("UseOutlines"));
};

const renderTocPagePngBytes = (
  renderPage: TocRenderPage,
  pageWidth: number,
  pageHeight: number,
  style: TocStyle,
  ui: PdfTocGeneratorUi,
): Promise<Uint8Array> => {
  const canvas = document.createElement("canvas");
  const scale = TOC_LAYOUT.renderScale;
  canvas.width = Math.ceil(pageWidth * scale);
  canvas.height = Math.ceil(pageHeight * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(ui.errCanvasContext);

  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  ctx.textBaseline = "alphabetic";

  const titleSize = renderPage.isFirstPage ? style.titleSize : Math.max(10, Math.round(style.titleSize * 0.72));
  ctx.font = `600 ${titleSize}px ${style.titleFont}`;
  ctx.fillStyle = style.titleColor;
  ctx.fillText(
    renderPage.title,
    TOC_LAYOUT.marginX,
    TOC_LAYOUT.titleTopGap,
    pageWidth - TOC_LAYOUT.marginX - TOC_LAYOUT.rightPadding,
  );

  ctx.fillStyle = style.itemColor;

  for (const entry of renderPage.entries) {
    const level = Math.min(5, Math.max(1, entry.level));
    const levelIndent = (level - 1) * TOC_LAYOUT.levelIndent;
    const levelSize = Math.max(8, style.itemSize - Math.max(0, level - 3));
    const fontWeight = level === 1 ? 600 : level === 2 ? 500 : 400;
    const canvasY = pageHeight - entry.y;
    ctx.font = `${fontWeight} ${levelSize}px ${style.itemFont}`;
    const pageNumberWidth = ctx.measureText(entry.pageNumberText).width;
    const pageNumberX = pageWidth - TOC_LAYOUT.rightPadding - pageNumberWidth;
    const titleX = TOC_LAYOUT.marginX + levelIndent;
    const titleMaxWidth = Math.max(80, pageNumberX - titleX - 12);
    ctx.fillText(entry.title, titleX, canvasY, titleMaxWidth);
    ctx.fillText(entry.pageNumberText, pageNumberX, canvasY);
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(ui.errCanvasExport));
        return;
      }
      blob
        .arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject);
    }, "image/png");
  });
};
