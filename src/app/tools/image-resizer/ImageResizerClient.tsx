"use client";

import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import type { ChangeEvent, FC } from "react";
import { useEffect, useState } from "react";
import {
  exportCanvasToImageBlob,
  getImageExportExtension,
  getImageExportLabel,
  IMAGE_EXPORT_FORMATS,
  type ImageExportFormat,
} from "@/lib/image-export";
import { useFileDropzone } from "../../../hooks/useFileDropzone";

type Mode = "stretch" | "contain";
const MAX_DIMENSION = 20000;

const DEFAULT_UI = {
  title: "图片尺寸调整工具",
  subtitle: "查看原图分辨率，一键设置目标宽高，支持自动拉伸与透明背景等比填充两种模式。",
  dropTitle: "点击或拖拽图片到此处",
  dropFormats: "支持 JPG, PNG, WebP 等格式",
  originalInfo: "原图信息：",
  resolution: "分辨率",
  size: "大小",
  targetSize: "目标尺寸：",
  widthPlaceholder: "宽(px)",
  heightPlaceholder: "高(px)",
  unitPixel: "单位：像素",
  lockAspectRatioPrefix: "锁定长宽比（",
  lockAspectRatioSuffix: "）",
  modeContain: "透明填充（等比缩放）",
  modeStretch: "自动拉伸",
  exportFormat: "导出格式",
  replaceImage: "点击替换图片",
  clear: "清空",
  generate: "生成新尺寸图片",
  processing: "处理中...",
  dropHint: "支持拖拽新图片到此区域直接替换",
  original: "原图",
  adjusted: "调整后",
  noResult: "尚未生成结果，请设置好目标尺寸后点击“生成新尺寸图片”",
  targetResolutionPrefix: "目标分辨率：",
  downloadPrefix: "下载",
  errSelectImage: "请选择图片文件",
  errSelectImageFirst: "请先选择需要调整的图片文件",
  errFillDimensions: "请填写完整的目标宽高",
  errInvalidDimensions: "目标宽高需为大于 0 的整数",
  errResizeFailed: "尺寸调整失败",
  errCanvasContext: "无法创建画布上下文",
} as const;

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
};

const formatAspectRatio = (width: number | null, height: number | null): string => {
  if (!width || !height) return "-";
  const divider = gcd(width, height);
  return `${Math.round(width / divider)}:${Math.round(height / divider)}`;
};

const clampDimension = (value: number): number =>
  Math.min(MAX_DIMENSION, Math.max(1, Math.round(value)));

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

async function resizeImage(
  file: File,
  targetWidth: number,
  targetHeight: number,
  mode: Mode,
  format: ImageExportFormat,
  errDimensions: string,
  errContext: string,
): Promise<Blob> {
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error(errDimensions);
  }

  const imageBitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error(errContext);
  }

  ctx.clearRect(0, 0, targetWidth, targetHeight);

  if (mode === "stretch") {
    ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
  } else {
    const scale = Math.min(
      targetWidth / imageBitmap.width,
      targetHeight / imageBitmap.height,
    );
    const drawWidth = Math.round(imageBitmap.width * scale);
    const drawHeight = Math.round(imageBitmap.height * scale);
    const offsetX = Math.round((targetWidth - drawWidth) / 2);
    const offsetY = Math.round((targetHeight - drawHeight) / 2);

    ctx.drawImage(
      imageBitmap,
      offsetX,
      offsetY,
      drawWidth,
      drawHeight,
    );
  }

  return exportCanvasToImageBlob(canvas, format);
}

const ImageResizerInner: FC = () => {
  const config = useOptionalToolConfig("image-resizer");
  const ui = {
    ...DEFAULT_UI,
    ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>),
  };

  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [resultSize, setResultSize] = useState<number | null>(null);
  const [originalWidth, setOriginalWidth] = useState<number | null>(null);
  const [originalHeight, setOriginalHeight] =
    useState<number | null>(null);
  const [targetWidth, setTargetWidth] = useState<number | "">("");
  const [targetHeight, setTargetHeight] = useState<number | "">("");
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [targetFormat, setTargetFormat] = useState<ImageExportFormat>("png");
  const [mode, setMode] = useState<Mode>("contain");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computeDimensions = async (selected: File) => {
    const imageBitmap = await createImageBitmap(selected);
    setOriginalWidth(imageBitmap.width);
    setOriginalHeight(imageBitmap.height);
    if (targetWidth === "" && targetHeight === "") {
      setTargetWidth(imageBitmap.width);
      setTargetHeight(imageBitmap.height);
    }
  };

  const processFile = async (selected: File) => {
    if (!selected.type.startsWith("image/")) {
      setError(ui.errSelectImage);
      return;
    }
    setError(null);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(selected);
    setOriginalSize(selected.size);
    const url = URL.createObjectURL(selected);
    setOriginalUrl(url);
    setResultUrl(null);
    setResultSize(null);
    await computeDimensions(selected);
  };

  const { inputRef: fileInputRef, isDragging, handleInputChange, handleDrop, handleDragOver, handleDragLeave, openFilePicker } =
    useFileDropzone({
      onFile: (selected) => {
        void processFile(selected);
      },
    });

  const handleTargetWidthChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const value = event.target.value;
    if (value === "") {
      setTargetWidth("");
      if (lockAspectRatio) setTargetHeight("");
      return;
    }
    const num = Number(value);
    if (!Number.isNaN(num) && num > 0 && num <= MAX_DIMENSION) {
      const rounded = clampDimension(num);
      setTargetWidth(rounded);
      if (lockAspectRatio && originalWidth && originalHeight) {
        const ratio = originalWidth / originalHeight;
        setTargetHeight(clampDimension(rounded / ratio));
      }
    }
  };

  const handleTargetHeightChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const value = event.target.value;
    if (value === "") {
      setTargetHeight("");
      if (lockAspectRatio) setTargetWidth("");
      return;
    }
    const num = Number(value);
    if (!Number.isNaN(num) && num > 0 && num <= MAX_DIMENSION) {
      const rounded = clampDimension(num);
      setTargetHeight(rounded);
      if (lockAspectRatio && originalWidth && originalHeight) {
        const ratio = originalWidth / originalHeight;
        setTargetWidth(clampDimension(rounded * ratio));
      }
    }
  };

  const handleModeChange = (next: Mode) => {
    setMode(next);
  };

  const handleFormatChange = (next: ImageExportFormat) => {
    setTargetFormat(next);
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
      setResultSize(null);
    }
  };

  const handleLockAspectRatioChange = (event: ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setLockAspectRatio(checked);
    if (!checked || !originalWidth || !originalHeight) return;
    const ratio = originalWidth / originalHeight;
    if (targetWidth !== "") {
      setTargetHeight(clampDimension(targetWidth / ratio));
      return;
    }
    if (targetHeight !== "") {
      setTargetWidth(clampDimension(targetHeight * ratio));
    }
  };

  const handleResize = async () => {
    if (!file) {
      setError(ui.errSelectImageFirst);
      return;
    }

    if (targetWidth === "" || targetHeight === "") {
      setError(ui.errFillDimensions);
      return;
    }

    if (targetWidth <= 0 || targetHeight <= 0) {
      setError(ui.errInvalidDimensions);
      return;
    }

    setIsProcessing(true);
    setError(null);
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }

    try {
      const blob = await resizeImage(
        file,
        targetWidth,
        targetHeight,
        mode,
        targetFormat,
        ui.errInvalidDimensions,
        ui.errCanvasContext,
      );
      setResultSize(blob.size);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ui.errResizeFailed,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setOriginalUrl(null);
    setResultUrl(null);
    setOriginalSize(null);
    setResultSize(null);
    setOriginalWidth(null);
    setOriginalHeight(null);
    setTargetWidth("");
    setTargetHeight("");
    setLockAspectRatio(true);
    setTargetFormat("png");
    setError(null);
  };

  useEffect(
    () => () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          {ui.title}
        </h2>
        <p className="mt-2 text-slate-500">
          {ui.subtitle}
        </p>
      </div>

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
                ? "border-emerald-500 bg-emerald-50/50 scale-[1.02]"
                : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/50"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={openFilePicker}
          >
            <div className="mb-4 rounded-full bg-emerald-50 p-4">
              <svg
                className="h-8 w-8 text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8h4M4 4h8m4 0h4M4 12h4m-4 4h4m4 0h4m0-4h4m0 4h4M8 4v4m0 4v4m4-8h4m0 0V4m0 4v4"
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
                  ? "border-emerald-400 bg-emerald-50/50"
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
                <div className="flex flex-wrap items-center gap-2 text-slate-600">
                  <span className="font-medium text-slate-900">
                    {ui.targetSize}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={MAX_DIMENSION}
                      value={targetWidth}
                      onChange={handleTargetWidthChange}
                      className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder={ui.widthPlaceholder}
                    />
                    <span>×</span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_DIMENSION}
                      value={targetHeight}
                      onChange={handleTargetHeightChange}
                      className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder={ui.heightPlaceholder}
                    />
                    <span className="text-[11px] text-slate-400">
                      {ui.unitPixel}
                    </span>
                    <label className="ml-2 inline-flex items-center gap-1 text-[11px] text-slate-500">
                      <input
                        type="checkbox"
                        checked={lockAspectRatio}
                        onChange={handleLockAspectRatioChange}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      {ui.lockAspectRatioPrefix}{formatAspectRatio(originalWidth, originalHeight)}{ui.lockAspectRatioSuffix}
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-stretch gap-3 text-xs sm:items-end">
                <div className="inline-flex rounded-full bg-white p-1 text-xs font-medium text-slate-600 shadow-sm">
                  <button
                    type="button"
                    onClick={() => handleModeChange("contain")}
                    className={`rounded-full px-3 py-1 transition ${
                      mode === "contain"
                        ? "bg-emerald-500 text-white shadow"
                        : "hover:bg-slate-100"
                    }`}
                  >
                    {ui.modeContain}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange("stretch")}
                    className={`rounded-full px-3 py-1 transition ${
                      mode === "stretch"
                        ? "bg-emerald-500 text-white shadow"
                        : "hover:bg-slate-100"
                    }`}
                  >
                    {ui.modeStretch}
                  </button>
                </div>
                <div className="inline-flex flex-wrap items-center gap-2 rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm">
                  <span className="px-2 text-[11px] text-slate-500">{ui.exportFormat}</span>
                  {IMAGE_EXPORT_FORMATS.map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => handleFormatChange(format)}
                      className={`rounded-full px-3 py-1 transition ${
                        targetFormat === format
                          ? "bg-emerald-500 text-white shadow"
                          : "hover:bg-slate-100"
                      }`}
                    >
                      {getImageExportLabel(format)}
                    </button>
                  ))}
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
                    onClick={handleResize}
                    disabled={isProcessing}
                    className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isProcessing ? ui.processing : ui.generate}
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

              <div className="group relative overflow-hidden rounded-2xl bg-slate-100 ring-2 ring-emerald-500 ring-offset-2">
                <div className="absolute left-4 top-4 z-10 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white shadow-lg">
                  {ui.adjusted}
                </div>
                <div className="aspect-[4/3] w-full overflow-hidden">
                  {isProcessing ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
                    </div>
                  ) : resultUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resultUrl}
                      alt="调整后图片"
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
                      {formatSize(resultSize)}
                    </p>
                    {targetWidth !== "" &&
                      targetHeight !== "" && (
                        <p className="text-xs text-emerald-600">
                          {ui.targetResolutionPrefix}{targetWidth} × {targetHeight}
                        </p>
                      )}
                  </div>
                  {resultUrl && file && (
                    <a
                      href={resultUrl}
                      download={`resized-${file.name.replace(
                        /\.[^.]+$/,
                        "",
                      )}.${getImageExportExtension(targetFormat)}`}
                      className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-md transition-transform hover:scale-105 hover:bg-emerald-700 active:scale-95"
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

const ImageResizerClient: FC = () => {
  return (
    <ToolPageLayout toolSlug="image-resizer" maxWidthClassName="max-w-4xl">
      <ImageResizerInner />
    </ToolPageLayout>
  );
};

export default ImageResizerClient;
