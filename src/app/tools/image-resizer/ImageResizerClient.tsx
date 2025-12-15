"use client";

import type { ChangeEvent, FC } from "react";
import { useEffect, useRef, useState } from "react";

type Mode = "stretch" | "contain";

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
): Promise<Blob> {
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error("目标宽高需为大于 0 的整数");
  }

  const imageBitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建画布上下文");
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

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error("生成结果失败"));
      },
      "image/png",
      1,
    );
  });
}

const ImageResizerClient: FC = () => {
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
  const [mode, setMode] = useState<Mode>("contain");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setError("请选择图片文件");
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

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) {
      void processFile(selected);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) {
      void processFile(selected);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleTargetWidthChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const value = event.target.value;
    if (value === "") {
      setTargetWidth("");
      return;
    }
    const num = Number(value);
    if (!Number.isNaN(num) && num > 0 && num <= 20000) {
      setTargetWidth(Math.round(num));
    }
  };

  const handleTargetHeightChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const value = event.target.value;
    if (value === "") {
      setTargetHeight("");
      return;
    }
    const num = Number(value);
    if (!Number.isNaN(num) && num > 0 && num <= 20000) {
      setTargetHeight(Math.round(num));
    }
  };

  const handleModeChange = (next: Mode) => {
    setMode(next);
  };

  const handleResize = async () => {
    if (!file) {
      setError("请先选择需要调整的图片文件");
      return;
    }

    if (targetWidth === "" || targetHeight === "") {
      setError("请填写完整的目标宽高");
      return;
    }

    if (targetWidth <= 0 || targetHeight <= 0) {
      setError("目标宽高需为大于 0 的整数");
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
      );
      setResultSize(blob.size);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "尺寸调整失败",
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
    <div className="mx-auto max-w-4xl animate-fade-in-up space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          图片尺寸调整工具
        </h1>
        <p className="mt-2 text-slate-500">
          查看原图分辨率，一键设置目标宽高，支持自动拉伸与透明背景等比填充两种模式。
        </p>
      </div>

      <div className="glass-card overflow-hidden rounded-3xl p-8 shadow-xl">
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
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
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
              点击或拖拽图片到此处
            </p>
            <p className="mt-1 text-sm text-slate-500">
              支持 JPG, PNG, WebP 等格式
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col gap-6 rounded-xl bg-slate-50/80 p-6 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-slate-600">
                  <span className="font-medium text-slate-900">
                    原图信息：
                  </span>
                  <span>
                    分辨率{" "}
                    <span className="font-mono">
                      {formatResolution(
                        originalWidth,
                        originalHeight,
                      )}
                    </span>
                  </span>
                  <span className="text-slate-400">·</span>
                  <span>大小 {formatSize(originalSize)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-slate-600">
                  <span className="font-medium text-slate-900">
                    目标尺寸：
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={20000}
                      value={targetWidth}
                      onChange={handleTargetWidthChange}
                      className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder="宽(px)"
                    />
                    <span>×</span>
                    <input
                      type="number"
                      min={1}
                      max={20000}
                      value={targetHeight}
                      onChange={handleTargetHeightChange}
                      className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder="高(px)"
                    />
                    <span className="text-[11px] text-slate-400">
                      单位：像素
                    </span>
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
                    透明填充（等比缩放）
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
                    自动拉伸
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
                  >
                    重新选择图片
                  </button>
                  <button
                    type="button"
                    onClick={handleResize}
                    disabled={isProcessing}
                    className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isProcessing ? "处理中..." : "生成新尺寸图片"}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <div className="group relative overflow-hidden rounded-2xl bg-slate-100">
                <div className="absolute left-4 top-4 z-10 rounded-lg bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
                  原图
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
                  调整后
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
                      尚未生成结果，请设置好目标尺寸后点击“生成新尺寸图片”
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
                          目标分辨率：{targetWidth} × {targetHeight}
                        </p>
                      )}
                  </div>
                  {resultUrl && file && (
                    <a
                      href={resultUrl}
                      download={`resized-${file.name.replace(
                        /\.[^.]+$/,
                        "",
                      )}.png`}
                      className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-md transition-transform hover:scale-105 hover:bg-emerald-700 active:scale-95"
                    >
                      下载 PNG
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

export default ImageResizerClient;

