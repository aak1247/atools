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

type MergeOrder = "A-B" | "B-A";

const formatSize = (bytes: number | null): string => {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const PdfMergeClient: FC = () => {
  const [pdfA, setPdfA] = useState<LoadedPdf | null>(null);
  const [pdfB, setPdfB] = useState<LoadedPdf | null>(null);
  const [mergeOrder, setMergeOrder] = useState<MergeOrder>("A-B");
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("merged.pdf");

  const inputARef = useRef<HTMLInputElement | null>(null);
  const inputBRef = useRef<HTMLInputElement | null>(null);

  const cleanupDownloadUrl = () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
  };

  const resetAll = () => {
    cleanupDownloadUrl();
    setPdfA(null);
    setPdfB(null);
    setError(null);
    setDownloadUrl(null);
    setDownloadName("merged.pdf");
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

  const handlePdfChange =
    (target: "A" | "B") => async (event: ChangeEvent<HTMLInputElement>) => {
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

        if (target === "A") {
          setPdfA(loaded);
        } else {
          setPdfB(loaded);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "PDF 文件解析失败，请确认文件是否正常。",
        );
      }
    };

  const handleMerge = async () => {
    if (!pdfA || !pdfB) {
      setError("请先选择两个需要拼接的 PDF 文件。");
      return;
    }

    setIsMerging(true);
    setError(null);
    cleanupDownloadUrl();
    setDownloadUrl(null);

    const stripExt = (name: string) => name.replace(/\.pdf$/i, "");

    try {
      const merged = await PDFDocument.create();

      const appendFrom = async (source: LoadedPdf) => {
        const srcDoc = await PDFDocument.load(source.bytes);
        const indices = srcDoc.getPageIndices();
        const copied = await merged.copyPages(srcDoc, indices);
        copied.forEach((page) => merged.addPage(page));
      };

      const sources =
        mergeOrder === "A-B" ? [pdfA, pdfB] : [pdfB, pdfA];

      for (const src of sources) {
        // eslint-disable-next-line no-await-in-loop
        await appendFrom(src);
      }

      const mergedBytes = await merged.save();
      const blob = new Blob([mergedBytes], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);

      const nameBase =
        mergeOrder === "A-B"
          ? `${stripExt(pdfA.name)}+${stripExt(pdfB.name)}`
          : `${stripExt(pdfB.name)}+${stripExt(pdfA.name)}`;

      setDownloadUrl(url);
      setDownloadName(`merged-${nameBase}.pdf`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "PDF 拼接失败，请稍后重试。",
      );
    } finally {
      setIsMerging(false);
    }
  };

  useEffect(
    () => () => {
      cleanupDownloadUrl();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const totalPages =
    (pdfA?.pageCount ?? 0) + (pdfB?.pageCount ?? 0);

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          PDF 拼接工具
        </h1>
        <p className="mt-2 text-slate-500">
          将两个 PDF 文件按顺序合并为一个新的 PDF，完全在浏览器本地处理，不上传服务器，适合合同、多页资料整理等场景。
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                第一步：选择第一个 PDF
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                作为合并后的前半部分，例如合同正文。
              </p>
            </div>
            <button
              type="button"
              onClick={() => inputARef.current?.click()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95"
            >
              选择 PDF 1
            </button>
            <input
              ref={inputARef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handlePdfChange("A")}
            />
          </div>
          {pdfA && (
            <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span className="truncate" title={pdfA.name}>
                  {pdfA.name}
                </span>
                <span className="ml-2 whitespace-nowrap">
                  {formatSize(pdfA.size)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                页数：{pdfA.pageCount} 页
              </p>
            </div>
          )}
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                第二步：选择第二个 PDF
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                作为合并后的后半部分，例如附件或补充条款。
              </p>
            </div>
            <button
              type="button"
              onClick={() => inputBRef.current?.click()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95"
            >
              选择 PDF 2
            </button>
            <input
              ref={inputBRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handlePdfChange("B")}
            />
          </div>
          {pdfB && (
            <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span className="truncate" title={pdfB.name}>
                  {pdfB.name}
                </span>
                <span className="ml-2 whitespace-nowrap">
                  {formatSize(pdfB.size)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                页数：{pdfB.pageCount} 页
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              第三步：设置合并顺序并生成
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              选择拼接顺序后点击下方按钮，浏览器会在本地将两个 PDF 合并生成新文件。
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setMergeOrder("A-B")}
              className={`rounded-md border px-3 py-1 transition ${
                mergeOrder === "A-B"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              先 PDF 1 再 PDF 2
            </button>
            <button
              type="button"
              onClick={() => setMergeOrder("B-A")}
              className={`rounded-md border px-3 py-1 transition ${
                mergeOrder === "B-A"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              先 PDF 2 再 PDF 1
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-xs text-slate-600">
          <div>
            <p>
              当前已选择：{" "}
              <span className="font-medium">
                {pdfA ? `${pdfA.pageCount} 页` : "0 页"}
              </span>{" "}
              +{" "}
              <span className="font-medium">
                {pdfB ? `${pdfB.pageCount} 页` : "0 页"}
              </span>{" "}
              共{" "}
              <span className="font-semibold text-slate-900">
                {totalPages} 页
              </span>
              。
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              提示：合并大体积或页数较多的 PDF 时，生成过程可能需要数秒时间，请耐心等待。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={resetAll}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
            >
              清空选择
            </button>
            <button
              type="button"
              onClick={handleMerge}
              disabled={isMerging || !pdfA || !pdfB}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isMerging ? "拼接中..." : "生成合并后的 PDF"}
            </button>
          </div>
        </div>

        {downloadUrl && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50/80 px-3 py-2 text-xs">
            <p className="text-emerald-800">
              已生成合并后的 PDF，可点击右侧按钮下载到本地。
            </p>
            <a
              href={downloadUrl}
              download={downloadName}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
            >
              下载合并后的 PDF
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
            文件，不会上传到服务器。若需要合并超过两个 PDF，可先用本工具将部分文件合并，再与其他文件继续拼接。
          </p>
        </div>
      </div>
    </div>
  );
};

export default PdfMergeClient;

