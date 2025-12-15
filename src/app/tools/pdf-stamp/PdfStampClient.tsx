"use client";

import type { ChangeEvent, FC } from "react";
import { useEffect, useRef, useState } from "react";
import { PDFDocument, degrees } from "pdf-lib";
import * as fabric from "fabric";
import {
  FileUp,
  ImagePlus,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  MousePointerClick,
  FileText,
  Save,
} from "lucide-react";

const PDFJS_URL =
  "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js";
const PDFJS_WORKER_URL =
  "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

declare global {
  interface Window {
    pdfjsLib?: unknown;
  }
}

type PdfJsViewport = {
  width: number;
  height: number;
};

type PdfJsRenderTask = {
  promise: Promise<void>;
};

type PdfJsPage = {
  getViewport: (options: { scale: number }) => PdfJsViewport;
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfJsViewport;
  }) => PdfJsRenderTask;
};

type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
};

type PdfJsLoadingTask = {
  promise: Promise<PdfJsDocument>;
};

type PdfJsLib = {
  getDocument: (options: { data: Uint8Array }) => PdfJsLoadingTask;
  GlobalWorkerOptions?: {
    workerSrc: string;
  };
  disableWorker?: boolean;
};

type StampTagged = { isStamp?: boolean };

const getPdfJsLibFromWindow = (): PdfJsLib | null => {
  if (typeof window === "undefined") return null;
  const candidate = window.pdfjsLib;
  if (!candidate || typeof candidate !== "object") return null;
  const lib = candidate as Partial<PdfJsLib>;
  if (typeof lib.getDocument !== "function") return null;
  return lib as PdfJsLib;
};

type LoadedPdf = {
  bytes: Uint8Array;
  pageCount: number;
};

type PdfViewportInfo = {
  width: number;
  height: number;
};

let pdfjsPromise: Promise<PdfJsLib> | null = null;

async function loadPdfJs(): Promise<PdfJsLib> {
  if (typeof window === "undefined") {
    throw new Error("PDF 预览仅在浏览器环境中可用");
  }

  const existingLib = getPdfJsLibFromWindow();
  if (existingLib) {
    const pdfjsLib = existingLib;
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    }
    if (typeof pdfjsLib.disableWorker !== "undefined") {
      // 在部分环境下跨域加载 worker 可能失败，这里强制使用 fake worker（主线程执行）
      pdfjsLib.disableWorker = true;
    }
    return pdfjsLib;
  }

  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${PDFJS_URL}"]`,
      );
      const preloadedLib = getPdfJsLibFromWindow();
      if (existing && preloadedLib) {
        const pdfjsLib = preloadedLib;
        if (pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        }
        if (typeof pdfjsLib.disableWorker !== "undefined") {
          pdfjsLib.disableWorker = true;
        }
        resolve(pdfjsLib);
        return;
      }

      const script = document.createElement("script");
      script.src = PDFJS_URL;
      script.async = true;
      script.onload = () => {
        const loadedLib = getPdfJsLibFromWindow();
        if (loadedLib) {
          const pdfjsLib = loadedLib;
          if (pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
          }
          if (typeof pdfjsLib.disableWorker !== "undefined") {
            pdfjsLib.disableWorker = true;
          }
          resolve(pdfjsLib);
        } else {
          reject(new Error("pdf.js 加载失败"));
        }
      };
      script.onerror = () => reject(new Error("pdf.js 脚本加载失败"));
      document.body.appendChild(script);
    });
  }

  return pdfjsPromise;
}

const PdfStampClient: FC = () => {
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfSize, setPdfSize] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isRendering, setIsRendering] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stampPreviewUrl, setStampPreviewUrl] = useState<string | null>(
    null,
  );
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const stampInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const pdfFileRef = useRef<File | null>(null);
  const loadedPdfRef = useRef<LoadedPdf | null>(null);
  const pdfJsDocRef = useRef<PdfJsDocument | null>(null);
  const pdfViewportRef = useRef<PdfViewportInfo | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const stampImageBytesRef = useRef<Uint8Array | null>(null);

  const formatSize = (bytes: number | null): string => {
    if (!bytes || bytes <= 0) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const cleanupDownloadUrl = () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
  };

  const cleanupFabricCanvas = () => {
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
      fabricCanvasRef.current = null;
    }
  };

  const renderPage = async (pageNumber: number) => {
    const loadedPdf = loadedPdfRef.current;
    const canvasElement = canvasRef.current;

    if (!loadedPdf || !canvasElement) return;

    setIsRendering(true);
    setError(null);

    try {
      const pdfjsLib = await loadPdfJs();

      let pdf = pdfJsDocRef.current;
      if (!pdf) {
        const loadingTask = pdfjsLib.getDocument({
          data: loadedPdf.bytes,
        });
        pdf = await loadingTask.promise;
        pdfJsDocRef.current = pdf;
      }

      const safePageNumber = Math.min(
        Math.max(pageNumber, 1),
        pdf.numPages,
      );

      const page = await pdf.getPage(safePageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      pdfViewportRef.current = {
        width: viewport.width,
        height: viewport.height,
      };

      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = viewport.width;
      offscreenCanvas.height = viewport.height;
      const context = offscreenCanvas.getContext("2d");
      if (!context) {
        throw new Error("无法创建 PDF 预览画布上下文");
      }

      const renderTask = page.render({
        canvasContext: context,
        viewport,
      });
      await renderTask.promise;

      cleanupFabricCanvas();

      canvasElement.width = viewport.width;
      canvasElement.height = viewport.height;

      const fabricCanvas = new fabric.Canvas(canvasElement, {
        selection: false,
      });
      fabricCanvasRef.current = fabricCanvas;

      const backgroundImage = new fabric.Image(offscreenCanvas, {
        selectable: false,
        evented: false,
      });

      const scaleX = canvasElement.width / offscreenCanvas.width;
      const scaleY = canvasElement.height / offscreenCanvas.height;
      backgroundImage.set({
        scaleX,
        scaleY,
        left: 0,
        top: 0,
      });

      fabricCanvas.add(backgroundImage);
      fabricCanvas.renderAll();

      setCurrentPage(safePageNumber);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "PDF 页面渲染失败，请稍后重试",
      );
    } finally {
      setIsRendering(false);
    }
  };

  const handlePdfChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError("请选择 PDF 文件");
      return;
    }

    setError(null);
    cleanupDownloadUrl();
    cleanupFabricCanvas();
    loadedPdfRef.current = null;
    pdfJsDocRef.current = null;
    pdfViewportRef.current = null;

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const pdfjsLib = await loadPdfJs();
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;

      loadedPdfRef.current = {
        bytes,
        pageCount: pdf.numPages,
      };
      pdfJsDocRef.current = pdf;
      pdfFileRef.current = file;

      setPdfFileName(file.name);
      setPdfSize(file.size);
      setPageCount(pdf.numPages);

      await renderPage(1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "PDF 文件解析失败，请确认文件是否正常",
      );
    }
  };

  const handleStampChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("印章文件需为图片格式，推荐使用透明 PNG");
      return;
    }

    setError(null);

    if (stampPreviewUrl) {
      URL.revokeObjectURL(stampPreviewUrl);
    }

    const buffer = await file.arrayBuffer();
    stampImageBytesRef.current = new Uint8Array(buffer);
    const preview = URL.createObjectURL(file);
    setStampPreviewUrl(preview);
  };

  const handleAddStamp = async () => {
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas) {
      setError("请先上传并加载 PDF 文件");
      return;
    }

    if (!stampPreviewUrl || !stampImageBytesRef.current) {
      setError("请先选择印章图片（建议透明 PNG）");
      return;
    }

    setError(null);

    try {
      const imageElement = new Image();
      imageElement.onload = () => {
        const img = new fabric.Image(imageElement);

        const canvasWidth = fabricCanvas.getWidth();
        const canvasHeight = fabricCanvas.getHeight();

        const baseSize = Math.min(canvasWidth, canvasHeight) / 4;
        const scale =
          img.width && img.height
            ? Math.min(baseSize / img.width, baseSize / img.height)
            : 1;

        img.set({
          left: canvasWidth / 2 - (img.width * scale) / 2,
          top: canvasHeight / 2 - (img.height * scale) / 2,
          originX: "left",
          originY: "top",
          scaleX: scale,
          scaleY: scale,
          hasRotatingPoint: true,
          cornerStyle: "circle",
          transparentCorners: false,
          borderColor: "#f97316",
          cornerColor: "#f97316",
        });

        (img as unknown as StampTagged).isStamp = true;

        fabricCanvas.add(img);
        fabricCanvas.setActiveObject(img);
        fabricCanvas.renderAll();
      };
      imageElement.onerror = () => {
        setError("印章图片加载失败，请重试或更换图片文件");
      };
      imageElement.src = stampPreviewUrl;
    } catch {
      setError("印章图片加载失败，请重试或更换图片文件");
    }
  };

  const handleClearStamps = () => {
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas) return;

    const objects = fabricCanvas.getObjects();
    const stamps = objects.filter((obj) =>
      Boolean((obj as unknown as StampTagged).isStamp),
    );

    if (stamps.length === 0) return;

    stamps.forEach((stamp) => fabricCanvas.remove(stamp));
    fabricCanvas.discardActiveObject();
    fabricCanvas.renderAll();
  };

  const handleExportPdf = async () => {
    const loadedPdf = loadedPdfRef.current;
    const fabricCanvas = fabricCanvasRef.current;
    const viewport = pdfViewportRef.current;

    if (!loadedPdf || !fabricCanvas || !viewport || !pdfFileRef.current) {
      setError("请先上传 PDF 并完成预览渲染");
      return;
    }

    if (!stampImageBytesRef.current) {
      setError("请先选择印章图片并添加到页面");
      return;
    }

    const objects = fabricCanvas.getObjects();
    const stamps = objects.filter((obj) =>
      Boolean((obj as unknown as StampTagged).isStamp),
    );

    if (stamps.length === 0) {
      setError("当前页尚未添加印章，请先拖拽盖章后再导出");
      return;
    }

    setIsExporting(true);
    setError(null);
    cleanupDownloadUrl();

    try {
      const pdfArrayBuffer = await pdfFileRef.current.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
      const pages = pdfDoc.getPages();
      const pageIndex = Math.min(
        Math.max(currentPage - 1, 0),
        pages.length - 1,
      );
      const page = pages[pageIndex];

      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();

      const stampImage = await pdfDoc.embedPng(
        stampImageBytesRef.current,
      );

      const scaleX = pageWidth / viewport.width;
      const scaleY = pageHeight / viewport.height;

      stamps.forEach((stamp) => {
        const bounds = stamp.getBoundingRect();

        const displayLeft = bounds.left;
        const displayTop = bounds.top;
        const displayWidth = bounds.width;
        const displayHeight = bounds.height;

        const pdfX = displayLeft * scaleX;
        const pdfY =
          pageHeight - (displayTop + displayHeight) * scaleY;
        const pdfWidth = displayWidth * scaleX;
        const pdfHeight = displayHeight * scaleY;

        const angle = typeof stamp.angle === "number" ? stamp.angle : 0;

        page.drawImage(stampImage, {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
          rotate: degrees(angle),
          opacity: 0.9,
        });
      });

      const modifiedBytes = await pdfDoc.save();
      const blob = new Blob([new Uint8Array(modifiedBytes)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "导出带章 PDF 失败，请稍后重试",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrevPage = () => {
    if (currentPage <= 1) return;
    void renderPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage >= pageCount) return;
    void renderPage(currentPage + 1);
  };

  useEffect(
    () => () => {
      cleanupDownloadUrl();
      cleanupFabricCanvas();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in-up space-y-6 p-4 md:p-8">
      {/* Header Section */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-3 bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
          PDF 盖章工具
        </h1>
        <p className="text-slate-500 max-w-2xl mx-auto text-sm leading-relaxed">
          纯前端安全处理，拖拽式盖章体验。
          <span className="hidden sm:inline">支持透明印章、自由缩放旋转，所见即所得。</span>
        </p>
      </div>

      {/* Main Control Bar - Unified Top Steps */}
      <div className="glass-card rounded-3xl p-2 sticky top-4 z-40 transition-all duration-300 shadow-lg shadow-slate-200/50 border border-white/60">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 lg:gap-4 p-2">
          
          {/* Step 1: Upload */}
          <div className={`flex-1 flex items-center gap-3 p-3 rounded-2xl transition-all duration-300 ${pdfFileName ? 'bg-slate-50 border border-slate-200/50' : 'bg-blue-50/50 border border-blue-100 hover:bg-blue-50'}`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${pdfFileName ? 'bg-slate-200 text-slate-600' : 'bg-blue-600 text-white shadow-md shadow-blue-200'}`}>
              <FileUp size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">步骤 1</span>
                {pdfFileName && <CheckCircle2 size={14} className="text-emerald-500" />}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => pdfInputRef.current?.click()}
                  className="text-sm font-semibold text-slate-900 hover:text-blue-600 transition-colors truncate text-left"
                >
                  {pdfFileName || "上传 PDF 文件"}
                </button>
              </div>
              {pdfFileName && (
                <div className="text-[10px] text-slate-500 truncate">
                  {formatSize(pdfSize)} • {pageCount} 页
                </div>
              )}
            </div>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handlePdfChange}
            />
          </div>

          <div className="hidden lg:block w-px h-10 bg-slate-200/60" />

          {/* Step 2: Stamp */}
          <div className={`flex-1 flex items-center gap-3 p-3 rounded-2xl transition-all duration-300 ${stampPreviewUrl ? 'bg-slate-50 border border-slate-200/50' : 'bg-rose-50/50 border border-rose-100 hover:bg-rose-50'}`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stampPreviewUrl ? 'bg-white border border-slate-100' : 'bg-rose-500 text-white shadow-md shadow-rose-200'}`}>
              {stampPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stampPreviewUrl} alt="Stamp" className="h-full w-full object-contain p-1" />
              ) : (
                <ImagePlus size={20} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">步骤 2</span>
                {stampPreviewUrl && <CheckCircle2 size={14} className="text-emerald-500" />}
              </div>
              <button
                onClick={() => stampInputRef.current?.click()}
                className="text-sm font-semibold text-slate-900 hover:text-rose-600 transition-colors truncate text-left w-full"
              >
                {stampPreviewUrl ? "更换印章" : "选择印章图片"}
              </button>
              <div className="text-[10px] text-slate-500 truncate">
                建议使用透明 PNG
              </div>
            </div>
            <input
              ref={stampInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleStampChange}
            />
          </div>

          <div className="hidden lg:block w-px h-10 bg-slate-200/60" />

          {/* Step 3: Action */}
          <div className="flex-1 flex items-center gap-3 p-3 rounded-2xl bg-slate-50/30 hover:bg-slate-50 transition-all duration-300">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <MousePointerClick size={20} />
            </div>
            <div className="flex-1 min-w-0">
               <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">步骤 3</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddStamp}
                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!pdfFileName || !stampPreviewUrl}
                >
                  添加印章
                </button>
                <button
                  onClick={handleClearStamps}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-rose-600 active:scale-95 disabled:opacity-50"
                  title="清除本页印章"
                  disabled={!fabricCanvasRef.current}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="hidden lg:block w-px h-10 bg-slate-200/60" />

          {/* Step 4: Export */}
          <div className="flex-1 flex items-center gap-3 p-3 rounded-2xl bg-slate-50/30 hover:bg-slate-50 transition-all duration-300">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md shadow-slate-200">
              <Save size={20} />
            </div>
            <div className="flex-1 min-w-0">
               <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">步骤 4</span>
              </div>
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  download={`stamped-${(pdfFileName ?? "document").replace(/\.pdf$/i, "")}.pdf`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95"
                >
                  <Download size={14} />
                  下载文件
                </a>
              ) : (
                <button
                  onClick={handleExportPdf}
                  className="w-full rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isExporting || !loadedPdfRef.current}
                >
                  {isExporting ? "处理中..." : "导出 PDF"}
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-auto max-w-2xl rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 flex items-center gap-2 animate-fade-in-up">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* PDF Preview Area */}
      <div className="glass-card relative flex min-h-[600px] flex-col overflow-hidden rounded-3xl border border-white/60 shadow-xl shadow-slate-200/40">
        {/* Toolbar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-slate-900/90 p-1.5 px-4 text-white shadow-lg backdrop-blur-md transition-all hover:bg-slate-900">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || isRendering}
            className="rounded-full p-1.5 hover:bg-white/20 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[80px] text-center text-xs font-medium font-mono">
            {pageCount > 0 ? `${currentPage} / ${pageCount}` : "0 / 0"}
          </span>
          <button
            onClick={handleNextPage}
            disabled={currentPage >= pageCount || isRendering}
            className="rounded-full p-1.5 hover:bg-white/20 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Canvas Container */}
        <div className="flex-1 overflow-auto bg-slate-100/50 p-8 flex items-center justify-center min-h-[600px]">
          {isRendering && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-slate-200 border-t-slate-900 mb-3" />
              <span className="text-sm font-medium text-slate-600">正在渲染页面...</span>
            </div>
          )}
          
          {!loadedPdfRef.current && !isRendering && (
            <div className="flex flex-col items-center justify-center text-slate-400 gap-4">
              <div className="h-20 w-20 rounded-3xl bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center">
                <FileText size={32} className="opacity-50" />
              </div>
              <p className="text-sm">请先上传 PDF 文件开始操作</p>
            </div>
          )}

          <div className={`relative shadow-2xl transition-opacity duration-300 ${isRendering ? 'opacity-0' : 'opacity-100'}`}>
             <canvas ref={canvasRef} className="rounded-sm" />
          </div>
        </div>

        {/* Bottom Info */}
        <div className="absolute bottom-4 right-4 z-20">
           <div className="rounded-full bg-white/80 backdrop-blur px-3 py-1 text-[10px] font-medium text-slate-500 shadow-sm border border-white/50">
              {loadedPdfRef.current ? "可拖拽、缩放、旋转印章" : "等待文件上传"}
           </div>
        </div>
      </div>
    </div>
  );
};

export default PdfStampClient;
