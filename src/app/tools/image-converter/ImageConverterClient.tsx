"use client";

import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import type { FC } from "react";
import { useEffect, useState } from "react";
import {
  exportCanvasToImageBlob,
  getImageExportExtension,
  getImageExportLabel,
  IMAGE_EXPORT_FORMATS,
  type ImageExportFormat,
} from "@/lib/image-export";
import { useFileDropzone } from "../../../hooks/useFileDropzone";

const DEFAULT_UI = {
  title: "图片格式转换工具",
  subtitle: "支持在 JPG、PNG、WebP、BMP、ICO、GIF 等常见格式之间转换，完全在浏览器本地完成。",
  notice: "注意：BMP、ICO、GIF 等部分格式是否可导出取决于当前浏览器的编码支持，如遇失败可尝试换用 PNG/JPG 或更换浏览器。",
  dropTitle: "点击或拖拽图片到此处",
  dropFormats: "支持 JPG、PNG、WebP、GIF、SVG 等常见格式（SVG 将被栅格化为位图处理）",
  originalInfo: "原图信息：",
  resolution: "分辨率",
  size: "大小",
  targetFormat: "目标格式",
  replaceImage: "点击替换图片",
  clear: "清空",
  startConvert: "开始转换",
  converting: "转换中...",
  dropHint: "支持拖拽新图片到此区域直接替换",
  original: "原图",
  convertedPrefix: "转换后",
  noResult: "尚未生成结果，请选择目标格式后点击“开始转换”",
  sizeChange: "体积变化：",
  downloadPrefix: "下载",
  errSelectImage: "请选择图片文件",
  errReadDimensions: "无法读取图片尺寸",
  errSelectImageFirst: "请先选择需要转换的图片文件",
  errConvertFailed: "格式转换失败",
  errCanvasContext: "无法创建画布上下文",
  errSvgLoad: "SVG 加载失败",
} as const;

const formatSize = (bytes: number | null): string => {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatResolution = (
  width: number | null,
  height: number | null,
): string => {
  if (!width || !height) return "-";
  return `${width} × ${height}`;
};

const isSvgFile = (file: File): boolean =>
  file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");

const parseSvgNumber = (value: string | null): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([0-9.]+)(?:px)?$/i);
  const num = Number(match ? match[1] : trimmed);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const getSvgDimensions = (svgContent: string): { width: number; height: number } => {
  try {
    const doc = new DOMParser().parseFromString(svgContent, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) return { width: 512, height: 512 };

    const widthAttr = parseSvgNumber(svg.getAttribute("width"));
    const heightAttr = parseSvgNumber(svg.getAttribute("height"));
    if (widthAttr && heightAttr) return { width: Math.round(widthAttr), height: Math.round(heightAttr) };

    const viewBox = svg.getAttribute("viewBox");
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/).map((v) => Number(v));
      if (parts.length === 4 && parts.every((v) => Number.isFinite(v))) {
        const width = parts[2]!;
        const height = parts[3]!;
        if (width > 0 && height > 0) return { width: Math.round(width), height: Math.round(height) };
      }
    }
  } catch {
    // ignore
  }
  return { width: 512, height: 512 };
};

const loadSvgImage = async (svgContent: string, errMessage: string): Promise<HTMLImageElement> => {
  const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new window.Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(errMessage));
      img.src = svgUrl;
    });
    return img;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
};

async function convertImage(
  file: File,
  format: ImageExportFormat,
  errContext: string,
  errSvg: string,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error(errContext);
  }

  if (isSvgFile(file)) {
    const svgContent = await file.text();
    const { width, height } = getSvgDimensions(svgContent);
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const img = await loadSvgImage(svgContent, errSvg);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } else {
    const imageBitmap = await createImageBitmap(file);
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageBitmap, 0, 0);
  }

  return exportCanvasToImageBlob(canvas, format);
}

const ImageConverterInner: FC = () => {
  const config = useOptionalToolConfig("image-converter");
  const ui = {
    ...DEFAULT_UI,
    ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>),
  };

  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [convertedSize, setConvertedSize] = useState<number | null>(
    null,
  );
  const [originalWidth, setOriginalWidth] = useState<number | null>(
    null,
  );
  const [originalHeight, setOriginalHeight] =
    useState<number | null>(null);
  const [targetFormat, setTargetFormat] =
    useState<ImageExportFormat>("png");
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanupUrls = () => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (convertedUrl) URL.revokeObjectURL(convertedUrl);
  };

  const computeDimensions = async (selected: File) => {
    if (isSvgFile(selected)) {
      const svgContent = await selected.text();
      const { width, height } = getSvgDimensions(svgContent);
      setOriginalWidth(width);
      setOriginalHeight(height);
      return;
    }

    const imageBitmap = await createImageBitmap(selected);
    setOriginalWidth(imageBitmap.width);
    setOriginalHeight(imageBitmap.height);
  };

  const processFile = async (selected: File) => {
    if (!selected.type.startsWith("image/")) {
      setError(ui.errSelectImage);
      return;
    }
    setError(null);
    cleanupUrls();
    setFile(selected);
    setOriginalSize(selected.size);
    const url = URL.createObjectURL(selected);
    setOriginalUrl(url);
    setConvertedUrl(null);
    setConvertedSize(null);
    try {
      await computeDimensions(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.errReadDimensions);
      setOriginalWidth(null);
      setOriginalHeight(null);
    }
  };

  const { inputRef: fileInputRef, isDragging, handleInputChange, handleDrop, handleDragOver, handleDragLeave, openFilePicker } =
    useFileDropzone({
      onFile: (selected) => {
        void processFile(selected);
      },
    });

  const handleFormatChange = (format: ImageExportFormat) => {
    setTargetFormat(format);
    if (convertedUrl) {
      URL.revokeObjectURL(convertedUrl);
      setConvertedUrl(null);
      setConvertedSize(null);
    }
  };

  const handleConvert = async () => {
    if (!file) {
      setError(ui.errSelectImageFirst);
      return;
    }

    setIsConverting(true);
    setError(null);
    if (convertedUrl) {
      URL.revokeObjectURL(convertedUrl);
      setConvertedUrl(null);
    }

    try {
      const blob = await convertImage(file, targetFormat, ui.errCanvasContext, ui.errSvgLoad);
      setConvertedSize(blob.size);
      const url = URL.createObjectURL(blob);
      setConvertedUrl(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ui.errConvertFailed,
      );
    } finally {
      setIsConverting(false);
    }
  };

  const handleReset = () => {
    cleanupUrls();
    setFile(null);
    setOriginalUrl(null);
    setConvertedUrl(null);
    setOriginalSize(null);
    setConvertedSize(null);
    setOriginalWidth(null);
    setOriginalHeight(null);
    setTargetFormat("png");
    setError(null);
  };

  useEffect(
    () => () => {
      cleanupUrls();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="space-y-8">

      <div className="glass-card overflow-hidden rounded-3xl p-8 shadow-xl">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleInputChange}
        />
        {!file ? (
          <div
            className={`relative flex h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 ${
              isDragging
                ? "border-indigo-500 bg-indigo-50/50 scale-[1.02]"
                : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/50"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={openFilePicker}
          >
            <div className="mb-4 rounded-full bg-indigo-50 p-4">
              <svg
                className="h-8 w-8 text-indigo-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m0 0l2-2m-2 2l2 2M4 8h16"
                />
              </svg>
            </div>
            <p className="text-lg font-medium text-slate-700">
              {ui.dropTitle}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {ui.dropFormats}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <div
              className={`flex flex-col gap-6 rounded-xl border-2 border-dashed p-6 backdrop-blur-sm transition sm:flex-row sm:items-center sm:justify-between ${
                isDragging
                  ? "border-indigo-400 bg-indigo-50/50"
                  : "border-slate-200 bg-slate-50/80"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-slate-600">
                  <span className="font-medium text-slate-900">
                    {ui.originalInfo}
                  </span>
                  <span className="truncate" title={file.name}>
                    {file.name}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-slate-600">
                  <span>
                    {ui.resolution}{" "}
                    <span className="font-mono">
                      {formatResolution(
                        originalWidth,
                        originalHeight,
                      )}
                    </span>
                  </span>
                  <span className="text-slate-400">·</span>
                  <span>{ui.size} {formatSize(originalSize)}</span>
                </div>
              </div>
              <div className="flex flex-col items-stretch gap-3 text-xs sm:items-end">
                <div className="inline-flex flex-wrap items-center gap-2 rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm">
                  <span className="px-2 text-[11px] text-slate-500">
                    {ui.targetFormat}
                  </span>
                  {(
                    IMAGE_EXPORT_FORMATS
                  ).map(
                    (format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => handleFormatChange(format)}
                        className={`rounded-full px-3 py-1 transition ${
                          targetFormat === format
                            ? "bg-indigo-500 text-white shadow"
                            : "hover:bg-slate-100"
                        }`}
                      >
                        {getImageExportLabel(format)}
                      </button>
                    ),
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
                  >
                    {ui.replaceImage}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
                  >
                    {ui.clear}
                  </button>
                  <button
                    type="button"
                    onClick={handleConvert}
                    disabled={isConverting}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isConverting ? ui.converting : ui.startConvert}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  {ui.dropHint}
                </p>
              </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <div className="group relative overflow-hidden rounded-2xl bg-slate-100">
                <div className="absolute left-4 top-4 z-10 rounded-lg bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
                  {ui.original}
                </div>
                <div className="aspect-[4/3] w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={originalUrl ?? ""}
                    alt="原始图片"
                    className="h-full w-full object-contain p-4"
                  />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-white/90 px-4 py-3 backdrop-blur-sm">
                  <p className="text-sm font-medium text-slate-900">
                    {formatSize(originalSize)} ·{" "}
                    {formatResolution(originalWidth, originalHeight)}
                  </p>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-2xl bg-slate-100 ring-2 ring-indigo-500 ring-offset-2">
                <div className="absolute left-4 top-4 z-10 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white shadow-lg">
                  {ui.convertedPrefix}（{getImageExportLabel(targetFormat)}）
                </div>
                <div className="aspect-[4/3] w-full overflow-hidden">
                  {isConverting ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                    </div>
                  ) : convertedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={convertedUrl}
                      alt="转换后图片"
                      className="h-full w-full object-contain bg-white p-4"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">
                      {ui.noResult}
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-white/90 px-4 py-3 backdrop-blur-sm">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {formatSize(convertedSize)}
                    </p>
                    {convertedSize &&
                      originalSize &&
                      convertedSize !== originalSize && (
                        <p className="text-xs text-emerald-600">
                          {ui.sizeChange}{" "}
                          {(
                            (convertedSize / originalSize) *
                            100
                          ).toFixed(1)}
                          %
                        </p>
                      )}
                  </div>
                  {convertedUrl && file && (
                    <a
                      href={convertedUrl}
                      download={`converted-${file.name.replace(
                        /\.[^.]+$/,
                        "",
                      )}.${getImageExportExtension(targetFormat)}`}
                      className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white shadow-md transition-transform hover:scale-105 hover:bg-indigo-700 active:scale-95"
                    >
                      {ui.downloadPrefix} {getImageExportLabel(targetFormat)}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-auto max-w-md rounded-lg bg-rose-50 p-4 text-center text-sm text-rose-600 animate-fade-in-up">
          {error}
        </div>
      )}
    </div>
  );
};

const ImageConverterClient: FC = () => {
  return (
    <ToolPageLayout toolSlug="image-converter" maxWidthClassName="max-w-4xl">
      <ImageConverterInner />
    </ToolPageLayout>
  );
};

export default ImageConverterClient;
