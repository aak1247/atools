"use client";

import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import type { ChangeEvent, DragEvent, FC } from "react";
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

async function loadPdfJs(errMsgs?: { browserOnly?: string; loadFailed?: string; scriptFailed?: string }): Promise<PdfJsLib> {
  if (typeof window === "undefined") {
    throw new Error(errMsgs?.browserOnly ?? "PDF 预览仅在浏览器环境中可用");
  }

  const existingLib = getPdfJsLibFromWindow();
  if (existingLib) {
    const pdfjsLib = existingLib;
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    }
    if (typeof pdfjsLib.disableWorker !== "undefined") {
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
          reject(new Error(errMsgs?.loadFailed ?? "pdf.js 加载失败"));
        }
      };
      script.onerror = () => reject(new Error(errMsgs?.scriptFailed ?? "pdf.js 脚本加载失败"));
      document.body.appendChild(script);
    });
  }

  return pdfjsPromise;
}

const DEFAULT_UI = {
  title: "PDF 盖章工具",
  descriptionPrefix: "纯前端安全处理，拖拽式盖章体验。",
  descriptionSuffix: "支持透明印章、自由缩放旋转，所见即所得。",
  step1: "步骤 1",
  step2: "步骤 2",
  step3: "步骤 3",
  step4: "步骤 4",
  uploadPdf: "上传 PDF 文件",
  replacePdf: "更换 PDF 文件",
  pdfDropHint: "支持拖拽上传/替换 PDF",
  pageCountSuffix: "页",
  selectStamp: "选择印章图片",
  replaceStamp: "更换印章",
  stampDropHint: "建议使用透明 PNG，支持拖拽上传/替换",
  addStamp: "添加印章",
  clearStamps: "清除本页印章",
  downloadFile: "下载文件",
  exportPdf: "导出 PDF",
  exporting: "处理中...",
  rendering: "正在渲染页面...",
  uploadPrompt: "请先上传 PDF 文件开始操作",
  stampGuide: "可拖拽、缩放、旋转印章",
  waitingUpload: "等待文件上传",
  errBrowserOnly: "PDF 预览仅在浏览器环境中可用",
  errPdfJsLoad: "pdf.js 加载失败",
  errPdfJsScript: "pdf.js 脚本加载失败",
  errCanvasContext: "无法创建 PDF 预览画布上下文",
  errRenderFailed: "PDF 页面渲染失败，请稍后重试",
  errSelectPdf: "请选择 PDF 文件",
  errParsePdf: "PDF 文件解析失败，请确认文件是否正常",
  errStampImageOnly: "印章文件需为图片格式，推荐使用透明 PNG",
  errUploadPdfFirst: "请先上传并加载 PDF 文件",
  errSelectStampFirst: "请先选择印章图片（建议透明 PNG）",
  errStampLoadFailed: "印章图片加载失败，请重试或更换图片文件",
  errPreviewFirst: "请先上传 PDF 并完成预览渲染",
  errAddStampToPageFirst: "请先选择印章图片并添加到页面",
  errNoStampOnCurrentPage: "当前页尚未添加印章，请先拖拽盖章后再导出",
  errExportFailed: "导出带章 PDF 失败，请稍后重试",
} as const;

export default function PdfStampClient() {
  return (
    <ToolPageLayout toolSlug="pdf-stamp" maxWidthClassName="max-w-[1400px]">
      <PdfStampInner />
    </ToolPageLayout>
  );
}

const PdfStampInner: FC = () => {
  const config = useOptionalToolConfig("pdf-stamp");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfSize, setPdfSize] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isRendering, setIsRendering] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPdfDragging, setIsPdfDragging] = useState(false);
  const [isStampDragging, setIsStampDragging] = useState(false);
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
      const pdfjsLib = await loadPdfJs({
        browserOnly: ui.errBrowserOnly,
        loadFailed: ui.errPdfJsLoad,
        scriptFailed: ui.errPdfJsScript,
      });

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
        throw new Error(ui.errCanvasContext);
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
          : ui.errRenderFailed,
      );
    } finally {
      setIsRendering(false);
    }
  };

  const handlePdfFile = async (file: File) => {
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError(ui.errSelectPdf);
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

      const pdfjsLib = await loadPdfJs({
        browserOnly: ui.errBrowserOnly,
        loadFailed: ui.errPdfJsLoad,
        scriptFailed: ui.errPdfJsScript,
      });
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
          : ui.errParsePdf,
      );
    }
  };

  const handlePdfChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handlePdfFile(file);
    event.target.value = "";
  };

  const handlePdfDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsPdfDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void handlePdfFile(file);
  };

  const handlePdfDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsPdfDragging(true);
  };

  const handlePdfDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsPdfDragging(false);
  };

  const handleStampFile = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError(ui.errStampImageOnly);
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

  const handleStampChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleStampFile(file);
    event.target.value = "";
  };

  const handleStampDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsStampDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void handleStampFile(file);
  };

  const handleStampDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsStampDragging(true);
  };

  const handleStampDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsStampDragging(false);
  };

  const handleAddStamp = async () => {
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas) {
      setError(ui.errUploadPdfFirst);
      return;
    }

    if (!stampPreviewUrl || !stampImageBytesRef.current) {
      setError(ui.errSelectStampFirst);
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
        setError(ui.errStampLoadFailed);
      };
      imageElement.src = stampPreviewUrl;
    } catch {
      setError(ui.errStampLoadFailed);
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
      setError(ui.errPreviewFirst);
      return;
    }

    if (!stampImageBytesRef.current) {
      setError(ui.errAddStampToPageFirst);
      return;
    }

    const objects = fabricCanvas.getObjects();
    const stamps = objects.filter((obj) =>
      Boolean((obj as unknown as StampTagged).isStamp),
    );

    if (stamps.length === 0) {
      setError(ui.errNoStampOnCurrentPage);
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
          : ui.errExportFailed,
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
    <div className="space-y-8">
      {/* Header Section */}
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold tracking-tight text-slate-900 mb-3 bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
          {ui.title}
        </h2>
        <p className="text-slate-500 max-w-2xl mx-auto text-sm leading-relaxed">
          {ui.descriptionPrefix}
          <span className="hidden sm:inline">{ui.descriptionSuffix}</span>
        </p>
      </div>

      {/* Main Control Bar - Unified Top Steps */}
      <div className="glass-card rounded-3xl p-2 sticky top-4 z-40 transition-all duration-300 shadow-lg shadow-slate-200/50 border border-white/60">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 lg:gap-4 p-2">
          
          {/* Step 1: Upload */}
          <div
            className={`flex-1 flex items-center gap-3 rounded-2xl p-3 transition-all duration-300 ${
              isPdfDragging
                ? "border-2 border-dashed border-blue-300 bg-blue-100/70"
                : pdfFileName
                  ? "border border-slate-200/50 bg-slate-50"
                  : "border border-blue-100 bg-blue-50/50 hover:bg-blue-50"
            }`}
            onDrop={handlePdfDrop}
            onDragOver={handlePdfDragOver}
            onDragLeave={handlePdfDragLeave}
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${pdfFileName ? 'bg-slate-200 text-slate-600' : 'bg-blue-600 text-white shadow-md shadow-blue-200'}`}>
              <FileUp size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{ui.step1}</span>
                {pdfFileName && <CheckCircle2 size={14} className="text-emerald-500" />}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => pdfInputRef.current?.click()}
                  className="text-sm font-semibold text-slate-900 hover:text-blue-600 transition-colors truncate text-left"
                >
                  {pdfFileName ? ui.replacePdf : ui.uploadPdf}
                </button>
              </div>
              {pdfFileName && (
                <div className="text-[10px] text-slate-500 truncate">
                  {formatSize(pdfSize)} • {pageCount} {ui.pageCountSuffix}
                </div>
              )}
              <div className="text-[10px] text-slate-500 truncate">{ui.pdfDropHint}</div>
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
          <div
            className={`flex-1 flex items-center gap-3 rounded-2xl p-3 transition-all duration-300 ${
              isStampDragging
                ? "border-2 border-dashed border-rose-300 bg-rose-100/70"
                : stampPreviewUrl
                  ? "border border-slate-200/50 bg-slate-50"
                  : "border border-rose-100 bg-rose-50/50 hover:bg-rose-50"
            }`}
            onDrop={handleStampDrop}
            onDragOver={handleStampDragOver}
            onDragLeave={handleStampDragLeave}
          >
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
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{ui.step2}</span>
                {stampPreviewUrl && <CheckCircle2 size={14} className="text-emerald-500" />}
              </div>
              <button
                onClick={() => stampInputRef.current?.click()}
                className="text-sm font-semibold text-slate-900 hover:text-rose-600 transition-colors truncate text-left w-full"
              >
                {stampPreviewUrl ? ui.replaceStamp : ui.selectStamp}
              </button>
              <div className="text-[10px] text-slate-500 truncate">
                {ui.stampDropHint}
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
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{ui.step3}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddStamp}
                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!pdfFileName || !stampPreviewUrl}
                >
                  {ui.addStamp}
                </button>
                <button
                  onClick={handleClearStamps}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-rose-600 active:scale-95 disabled:opacity-50"
                  title={ui.clearStamps}
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
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{ui.step4}</span>
              </div>
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  download={`stamped-${(pdfFileName ?? "document").replace(/\.pdf$/i, "")}.pdf`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95"
                >
                  <Download size={14} />
                  {ui.downloadFile}
                </a>
              ) : (
                <button
                  onClick={handleExportPdf}
                  className="w-full rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isExporting || !loadedPdfRef.current}
                >
                  {isExporting ? ui.exporting : ui.exportPdf}
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
              <span className="text-sm font-medium text-slate-600">{ui.rendering}</span>
            </div>
          )}
          
          {!loadedPdfRef.current && !isRendering && (
            <div className="flex flex-col items-center justify-center text-slate-400 gap-4">
              <div className="h-20 w-20 rounded-3xl bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center">
                <FileText size={32} className="opacity-50" />
              </div>
              <p className="text-sm">{ui.uploadPrompt}</p>
            </div>
          )}

          <div className={`relative shadow-2xl transition-opacity duration-300 ${isRendering ? 'opacity-0' : 'opacity-100'}`}>
             <canvas ref={canvasRef} className="rounded-sm" />
          </div>
        </div>

        {/* Bottom Info */}
        <div className="absolute bottom-4 right-4 z-20">
           <div className="rounded-full bg-white/80 backdrop-blur px-3 py-1 text-[10px] font-medium text-slate-500 shadow-sm border border-white/50">
              {loadedPdfRef.current ? ui.stampGuide : ui.waitingUpload}
           </div>
        </div>
      </div>
    </div>
  );
};
