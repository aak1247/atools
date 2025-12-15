"use client";

import type { ChangeEvent, FC } from "react";
import { useEffect, useRef, useState } from "react";

type TargetFormat = "jpg" | "png" | "webp" | "bmp" | "ico" | "gif";

const MIME_MAP: Record<TargetFormat, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  gif: "image/gif",
};

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

async function convertImage(
  file: File,
  format: TargetFormat,
): Promise<Blob> {
  const imageBitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建画布上下文");
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imageBitmap, 0, 0);

  const mimeType = MIME_MAP[format];

  return new Promise<Blob>((resolve, reject) => {
    const quality =
      format === "jpg" || format === "webp" ? 0.92 : undefined;
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(
            new Error(
              "当前浏览器可能不支持导出该格式，请尝试其他格式或更新浏览器。",
            ),
          );
        }
      },
      mimeType,
      quality,
    );
  });
}

const formatLabel = (format: TargetFormat): string => {
  switch (format) {
    case "jpg":
      return "JPG";
    case "png":
      return "PNG";
    case "webp":
      return "WebP";
    case "bmp":
      return "BMP";
    case "ico":
      return "ICO";
    case "gif":
      return "GIF";
    default:
      return format.toUpperCase();
  }
};

const ImageConverterClient: FC = () => {
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
    useState<TargetFormat>("png");
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cleanupUrls = () => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (convertedUrl) URL.revokeObjectURL(convertedUrl);
  };

  const computeDimensions = async (selected: File) => {
    const imageBitmap = await createImageBitmap(selected);
    setOriginalWidth(imageBitmap.width);
    setOriginalHeight(imageBitmap.height);
  };

  const processFile = async (selected: File) => {
    if (!selected.type.startsWith("image/")) {
      setError("请选择图片文件");
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

  const handleFormatChange = (format: TargetFormat) => {
    setTargetFormat(format);
  };

  const handleConvert = async () => {
    if (!file) {
      setError("请先选择需要转换的图片文件");
      return;
    }

    setIsConverting(true);
    setError(null);
    if (convertedUrl) {
      URL.revokeObjectURL(convertedUrl);
      setConvertedUrl(null);
    }

    try {
      const blob = await convertImage(file, targetFormat);
      setConvertedSize(blob.size);
      const url = URL.createObjectURL(blob);
      setConvertedUrl(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "格式转换失败",
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
    <div className="mx-auto max-w-4xl animate-fade-in-up space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          图片格式转换工具
        </h1>
        <p className="mt-2 text-slate-500">
          支持在 JPG、PNG、WebP、BMP、ICO、GIF 等常见格式之间转换，完全在浏览器本地完成。
        </p>
        <p className="mt-1 text-xs text-slate-400">
          注意：BMP、ICO、GIF 等部分格式是否可导出取决于当前浏览器的编码支持，如遇失败可尝试换用
          PNG/JPG 或更换浏览器。
        </p>
      </div>

      <div className="glass-card overflow-hidden rounded-3xl p-8 shadow-xl">
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
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
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
              点击或拖拽图片到此处
            </p>
            <p className="mt-1 text-sm text-slate-500">
              支持 JPG、PNG、WebP、GIF、SVG 等常见格式（SVG 将被栅格化为位图处理）
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
                  <span className="truncate" title={file.name}>
                    {file.name}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-slate-600">
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
              </div>
              <div className="flex flex-col items-stretch gap-3 text-xs sm:items-end">
                <div className="inline-flex flex-wrap items-center gap-2 rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm">
                  <span className="px-2 text-[11px] text-slate-500">
                    目标格式
                  </span>
                  {(
                    ["jpg", "png", "webp", "bmp", "ico", "gif"] as TargetFormat[],
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
                        {formatLabel(format)}
                      </button>
                    ),
                  )}
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
                    onClick={handleConvert}
                    disabled={isConverting}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isConverting ? "转换中..." : "开始转换"}
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

              <div className="group relative overflow-hidden rounded-2xl bg-slate-100 ring-2 ring-indigo-500 ring-offset-2">
                <div className="absolute left-4 top-4 z-10 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white shadow-lg">
                  转换后（{formatLabel(targetFormat)})
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
                      尚未生成结果，请选择目标格式后点击“开始转换”
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
                          体积变化：{" "}
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
                      )}.${targetFormat}`}
                      className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white shadow-md transition-transform hover:scale-105 hover:bg-indigo-700 active:scale-95"
                    >
                      下载 {formatLabel(targetFormat)}
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

export default ImageConverterClient;
