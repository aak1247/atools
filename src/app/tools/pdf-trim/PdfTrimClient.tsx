"use client";

import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import type { FC } from "react";
import { useEffect, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { useFileDropzone } from "../../../hooks/useFileDropzone";

type LoadedPdf = {
  name: string;
  size: number;
  bytes: Uint8Array;
  pageCount: number;
};

const formatSize = (bytes: number | null): string => {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const DEFAULT_UI = {
  title: "PDF 剪切工具",
  description: "上传一个 PDF，勾选需要删除的页面，浏览器会在本地生成删除这些页面后的新 PDF，适合合同隐私页删除、说明书裁剪等场景。",
  step1Title: "第一步：选择要剪切的 PDF",
  step1Hint: "支持常见 A4 文档，建议文件大小不超过 50MB。支持拖拽新 PDF 到此区域直接替换。",
  pick: "选择 PDF 文件",
  replace: "点击替换 PDF",
  clear: "清空",
  pageUnit: "页",
  step2Title: "第二步：选择要删除的页面",
  step2Hint: "点击下方页码即可勾选要删除的页；再次点击可取消选择。",
  selectAll: "全选所有页面",
  clearSelection: "清空选择",
  pagePrefix: "第",
  pageSuffix: "页",
  selectedPrefix: "当前已选择",
  selectedSuffix: "页，将从原 PDF 中删除。",
  previewNote: "提示：不会修改原文件，只会生成一个新的已删除所选页面的 PDF 供下载。",
  trimming: "剪切中...",
  startTrim: "生成剪切后的 PDF",
  successHint: "已生成剪切后的 PDF，可点击右侧按钮下载到本地。",
  download: "下载剪切后的 PDF",
  bottomTip: "小提示：本工具完全在浏览器本地内存中操作 PDF 文件，不会上传到服务器。若需要复杂的“保留指定页”场景，也可以只勾选不需要的页并删除。",
  errInvalidPdf: "请选择 PDF 文件（.pdf）",
  errSizeLimit: "单个 PDF 文件建议不超过 50MB，以免浏览器内存占用过高。",
  errParseFailed: "PDF 文件解析失败，请确认文件是否正常。",
  errNoPdf: "请先选择需要剪切的 PDF 文件。",
  errNoSelectedPages: "请至少选择一页需要删除的页面。",
  errCannotDeleteAll: "不能删除全部页面，请至少保留一页。",
  errNoPagesToKeep: "未找到需要保留的页面。",
  errTrimFailed: "PDF 剪切失败，请稍后重试。",
} as const;

type Ui = typeof DEFAULT_UI;

const PdfTrimInner: FC = () => {
  const config = useOptionalToolConfig("pdf-trim");
  const ui: Ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<Ui>) };

  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(
    () => new Set(),
  ); // 1-based page numbers
  const [isTrimming, setIsTrimming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("trimmed.pdf");

  const cleanupDownloadUrl = () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
  };

  const resetAll = () => {
    cleanupDownloadUrl();
    setPdf(null);
    setSelectedPages(new Set());
    setError(null);
    setDownloadUrl(null);
    setDownloadName("trimmed.pdf");
  };

  const validatePdfFile = (file: File): string | null => {
    const isPdfType = file.type === "application/pdf";
    const isPdfExt = file.name.toLowerCase().endsWith(".pdf");
    if (!isPdfType && !isPdfExt) {
      return ui.errInvalidPdf;
    }
    if (file.size > 50 * 1024 * 1024) {
      return ui.errSizeLimit;
    }
    return null;
  };

  const loadPdfFile = async (file: File) => {
    if (!file) return;

    const validationError = validatePdfFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    cleanupDownloadUrl();
    setDownloadUrl(null);
    setSelectedPages(new Set());

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const pdfDoc = await PDFDocument.load(bytes);

      const loaded: LoadedPdf = {
        name: file.name,
        size: file.size,
        bytes,
        pageCount: pdfDoc.getPageCount(),
      };

      setPdf(loaded);
      setDownloadName(
        `trimmed-${file.name.replace(/\.pdf$/i, "")}.pdf`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : ui.errParseFailed,
      );
    }
  };

  const { inputRef: fileInputRef, isDragging, handleInputChange, handleDrop, handleDragOver, handleDragLeave, openFilePicker } =
    useFileDropzone({
      onFile: (file) => {
        void loadPdfFile(file);
      },
    });

  const togglePageSelection = (pageNumber: number) => {
    if (!pdf) return;

    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) {
        next.delete(pageNumber);
      } else {
        next.add(pageNumber);
      }
      return next;
    });
  };

  const selectAllPages = () => {
    if (!pdf) return;
    const next = new Set<number>();
    for (let index = 1; index <= pdf.pageCount; index += 1) {
      next.add(index);
    }
    setSelectedPages(next);
  };

  const clearSelection = () => {
    setSelectedPages(new Set());
  };

  const handleTrim = async () => {
    if (!pdf) {
      setError(ui.errNoPdf);
      return;
    }

    if (selectedPages.size === 0) {
      setError(ui.errNoSelectedPages);
      return;
    }

    if (selectedPages.size >= pdf.pageCount) {
      setError(ui.errCannotDeleteAll);
      return;
    }

    setIsTrimming(true);
    setError(null);
    cleanupDownloadUrl();
    setDownloadUrl(null);

    try {
      const srcDoc = await PDFDocument.load(pdf.bytes);
      const pageCount = srcDoc.getPageCount();

      const removeIndices = new Set<number>();
      for (const pageNumber of selectedPages) {
        if (pageNumber >= 1 && pageNumber <= pageCount) {
          removeIndices.add(pageNumber - 1);
        }
      }

      const keepIndices: number[] = [];
      for (let index = 0; index < pageCount; index += 1) {
        if (!removeIndices.has(index)) {
          keepIndices.push(index);
        }
      }

      if (keepIndices.length === 0) {
        throw new Error(ui.errNoPagesToKeep);
      }

      const trimmedDoc = await PDFDocument.create();
      const copiedPages = await trimmedDoc.copyPages(
        srcDoc,
        keepIndices,
      );
      copiedPages.forEach((page) => trimmedDoc.addPage(page));

      const trimmedBytes = await trimmedDoc.save();
      const blob = new Blob([new Uint8Array(trimmedBytes)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : ui.errTrimFailed,
      );
    } finally {
      setIsTrimming(false);
    }
  };

  useEffect(
    () => () => {
      cleanupDownloadUrl();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="space-y-8">

      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div
          className={`flex flex-col gap-4 rounded-2xl border-2 border-dashed p-4 transition md:flex-row md:items-center md:justify-between ${
            isDragging
              ? "border-slate-400 bg-slate-50/60"
              : "border-slate-200 bg-slate-50/80"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {ui.step1Title}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {ui.step1Hint}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openFilePicker}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95"
            >
              {pdf ? ui.replace : ui.pick}
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
            >
              {ui.clear}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        </div>

        {pdf && (
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1 truncate" title={pdf.name}>
                {pdf.name}
              </div>
              <div className="flex items-center gap-3 whitespace-nowrap">
                <span>{formatSize(pdf.size)}</span>
                <span className="text-slate-400">·</span>
                <span>{pdf.pageCount} {ui.pageUnit}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {pdf && (
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {ui.step2Title}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {ui.step2Hint}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllPages}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
              >
                {ui.selectAll}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
              >
                {ui.clearSelection}
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: pdf.pageCount }, (_, index) => {
                const pageNumber = index + 1;
                const isSelected = selectedPages.has(pageNumber);
                const pageLabel = ui.pagePrefix
                  ? `${ui.pagePrefix} ${pageNumber} ${ui.pageSuffix}`.trim()
                  : `${pageNumber} ${ui.pageSuffix}`.trim();
                return (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => togglePageSelection(pageNumber)}
                    className={`min-w-[2.5rem] rounded-full px-2 py-1 text-xs font-medium transition ${
                      isSelected
                        ? "bg-rose-500 text-white shadow-sm"
                        : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    {pageLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-xs text-slate-600">
            <div>
              <p>
                {ui.selectedPrefix}{" "}
                <span className="font-semibold text-rose-600">
                  {selectedPages.size}
                </span>{" "}
                {ui.selectedSuffix}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {ui.previewNote}
              </p>
            </div>
            <button
              type="button"
              onClick={handleTrim}
              disabled={isTrimming || !pdf}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isTrimming ? ui.trimming : ui.startTrim}
            </button>
          </div>

          {downloadUrl && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50/80 px-3 py-2 text-xs">
              <p className="text-emerald-800">
                {ui.successHint}
              </p>
              <a
                href={downloadUrl}
                download={downloadName}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
              >
                {ui.download}
              </a>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-3 text-[11px] leading-relaxed text-slate-500">
            <p>
              {ui.bottomTip}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const PdfTrimClient: FC = () => {
  return (
    <ToolPageLayout toolSlug="pdf-trim" maxWidthClassName="max-w-5xl">
      <PdfTrimInner />
    </ToolPageLayout>
  );
};

export default PdfTrimClient;
