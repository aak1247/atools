"use client";

import type { ChangeEvent, FC } from "react";
import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

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

const PdfTrimClient: FC = () => {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(
    () => new Set(),
  ); // 1-based page numbers
  const [isTrimming, setIsTrimming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] =
    useState<string>("trimmed.pdf");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      return "请选择 PDF 文件（.pdf）";
    }
    if (file.size > 50 * 1024 * 1024) {
      return "单个 PDF 文件建议不超过 50MB，以免浏览器内存占用过高。";
    }
    return null;
  };

  const handleFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
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
          : "PDF 文件解析失败，请确认文件是否正常。",
      );
    }
  };

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
      setError("请先选择需要剪切的 PDF 文件。");
      return;
    }

    if (selectedPages.size === 0) {
      setError("请至少选择一页需要删除的页面。");
      return;
    }

    if (selectedPages.size >= pdf.pageCount) {
      setError("不能删除全部页面，请至少保留一页。");
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
        throw new Error("未找到需要保留的页面。");
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
          : "PDF 剪切失败，请稍后重试。",
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
    <div className="mx-auto max-w-5xl animate-fade-in-up space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          PDF 剪切工具
        </h1>
        <p className="mt-2 text-slate-500">
          上传一个 PDF，勾选需要删除的页面，浏览器会在本地生成删除这些页面后的新
          PDF，适合合同隐私页删除、说明书裁剪等场景。
        </p>
      </div>

      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              第一步：选择要剪切的 PDF
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              支持常见 A4 文档，建议文件大小不超过 50MB。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95"
            >
              选择 PDF 文件
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
            >
              清空
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
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
                <span>{pdf.pageCount} 页</span>
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
                第二步：选择要删除的页面
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                点击下方页码即可勾选要删除的页；再次点击可取消选择。
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllPages}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
              >
                全选所有页面
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
              >
                清空选择
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: pdf.pageCount }, (_, index) => {
                const pageNumber = index + 1;
                const isSelected = selectedPages.has(pageNumber);
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
                    第 {pageNumber} 页
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-xs text-slate-600">
            <div>
              <p>
                当前已选择{" "}
                <span className="font-semibold text-rose-600">
                  {selectedPages.size}
                </span>{" "}
                页，将从原 PDF 中删除。
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                提示：不会修改原文件，只会生成一个新的已删除所选页面的
                PDF 供下载。
              </p>
            </div>
            <button
              type="button"
              onClick={handleTrim}
              disabled={isTrimming || !pdf}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isTrimming ? "剪切中..." : "生成剪切后的 PDF"}
            </button>
          </div>

          {downloadUrl && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50/80 px-3 py-2 text-xs">
              <p className="text-emerald-800">
                已生成剪切后的 PDF，可点击右侧按钮下载到本地。
              </p>
              <a
                href={downloadUrl}
                download={downloadName}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
              >
                下载剪切后的 PDF
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
              小提示：本工具完全在浏览器本地内存中操作 PDF
              文件，不会上传到服务器。若需要复杂的“保留指定页”场景，也可以只勾选不需要的页并删除。
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfTrimClient;
