"use client";

import type { FC, ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";

type ExtractMode = "auto" | "keepRed";

const formatSize = (bytes: number | null): string => {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return [h, s, v];
}

interface ExtractOptions {
  sensitivity: number;
  mode: ExtractMode;
}

async function extractSealFromFile(
  file: File,
  options: ExtractOptions,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = bitmap.width;
  baseCanvas.height = bitmap.height;
  const ctx = baseCanvas.getContext("2d", {
    willReadFrequently: true,
  } as CanvasRenderingContext2DSettings);

  if (!ctx) {
    throw new Error("无法创建画布上下文");
  }

  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, baseCanvas.width, baseCanvas.height);
  const { data, width, height } = imageData;

  const sensitivity = options.sensitivity; // 0 - 100
  const hueRange = 15 + (sensitivity / 100) * 20; // 红色区间范围
  const minSaturation = 0.4 - (sensitivity / 100) * 0.2; // 敏感度越高，允许的饱和度越低
  const minValue = 0.25 - (sensitivity / 100) * 0.1;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const [h, s, v] = rgbToHsv(r, g, b);

      const isRedHue =
        h <= hueRange || h >= 360 - hueRange || (h >= 345 && h <= 360);
      const isStrong = s >= minSaturation && v >= minValue;

      const isSealPixel =
        options.mode === "keepRed"
          ? r > 120 && r > g * 1.1 && r > b * 1.1
          : isRedHue && isStrong;

      if (isSealPixel) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      } else {
        data[idx + 3] = 0;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const hasSeal = maxX >= 0 && maxY >= 0;

  let outputCanvas = baseCanvas;
  if (hasSeal) {
    const padding = 16;
    const cropMinX = Math.max(minX - padding, 0);
    const cropMinY = Math.max(minY - padding, 0);
    const cropMaxX = Math.min(maxX + padding, width - 1);
    const cropMaxY = Math.min(maxY + padding, height - 1);

    const cropWidth = cropMaxX - cropMinX + 1;
    const cropHeight = cropMaxY - cropMinY + 1;

    const sealCanvas = document.createElement("canvas");
    sealCanvas.width = cropWidth;
    sealCanvas.height = cropHeight;
    const sealCtx = sealCanvas.getContext("2d");
    if (!sealCtx) {
      throw new Error("无法创建输出画布");
    }

    sealCtx.putImageData(imageData, -cropMinX, -cropMinY);
    outputCanvas = sealCanvas;
  }

  return new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("生成结果失败"));
      },
      "image/png",
      1,
    );
  });
}

const SealExtractorClient: FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [resultSize, setResultSize] = useState<number | null>(null);
  const [sensitivity, setSensitivity] = useState<number>(70);
  const [mode, setMode] = useState<ExtractMode>("auto");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cleanupUrls = () => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  };

  const handleExtract = async (targetFile: File, options: ExtractOptions) => {
    setIsProcessing(true);
    setError(null);
    try {
      const blob = await extractSealFromFile(targetFile, options);
      setResultSize(blob.size);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "印章提取失败，请稍后重试",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const processFile = async (selected: File) => {
    if (!selected.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    cleanupUrls();
    setFile(selected);
    setOriginalSize(selected.size);
    const url = URL.createObjectURL(selected);
    setOriginalUrl(url);
    await handleExtract(selected, { sensitivity, mode });
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

  const handleSensitivityChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setSensitivity(value);
    if (file) {
      void handleExtract(file, { sensitivity: value, mode });
    }
  };

  const handleModeChange = (newMode: ExtractMode) => {
    setMode(newMode);
    if (file) {
      void handleExtract(file, { sensitivity, mode: newMode });
    }
  };

  useEffect(
    () => () => {
      cleanupUrls();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          印章提取工具
        </h1>
        <p className="mt-2 text-slate-500">
          从扫描件中自动提取红色公章，生成透明背景电子章，整个过程在浏览器本地完成。
        </p>
      </div>

      <div className="glass-card overflow-hidden rounded-3xl p-8 shadow-xl">
        {!file ? (
          <div
            className={`relative flex h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 ${
              isDragging
                ? "border-rose-500 bg-rose-50/50 scale-[1.02]"
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
            <div className="mb-4 rounded-full bg-rose-50 p-4">
              <svg
                className="h-8 w-8 text-rose-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3a4 4 0 00-4 4c0 1.313.633 2.474 1.605 3.2C8.09 11.194 7 12.91 7 15v1h10v-1c0-2.09-1.09-3.806-2.605-4.8A3.999 3.999 0 0016 7a4 4 0 00-4-4zM5 19h14"
                />
              </svg>
            </div>
            <p className="text-lg font-medium text-slate-700">
              点击或拖拽印章图片到此处
            </p>
            <p className="mt-1 text-sm text-slate-500">
              建议上传扫描件或拍照图片，支持 JPG/PNG 等格式
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col gap-4 rounded-xl bg-slate-50/80 p-4 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    cleanupUrls();
                    setFile(null);
                    setOriginalUrl(null);
                    setResultUrl(null);
                    setOriginalSize(null);
                    setResultSize(null);
                    setError(null);
                  }}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  重新选择图片
                </button>
                <div className="h-6 w-px bg-slate-200" />
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">提取模式：</span>
                  <div className="inline-flex rounded-full bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => handleModeChange("auto")}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        mode === "auto"
                          ? "bg-rose-500 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      智能识别
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange("keepRed")}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        mode === "keepRed"
                          ? "bg-rose-500 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      仅保留红色
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 items-center gap-3 md:max-w-sm">
                <div className="flex-1">
                  <input
                    type="range"
                    min={20}
                    max={100}
                    step={5}
                    value={sensitivity}
                    onChange={handleSensitivityChange}
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-rose-500"
                  />
                </div>
                <div className="w-24 text-right text-xs text-slate-500">
                  灵敏度：{" "}
                  <span className="font-semibold text-rose-500">
                    {sensitivity}%
                  </span>
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
                    {formatSize(originalSize)}
                  </p>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-2xl bg-slate-100 ring-2 ring-rose-500 ring-offset-2">
                <div className="absolute left-4 top-4 z-10 rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white shadow-lg">
                  提取结果
                </div>
                <div className="aspect-[4/3] w-full overflow-hidden">
                  {isProcessing ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-200 border-t-rose-600" />
                    </div>
                  ) : resultUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resultUrl}
                      alt="印章提取结果"
                      className="h-full w-full object-contain p-4"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">
                      未检测到明显印章区域，可尝试提高灵敏度或切换模式
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-white/90 px-4 py-3 backdrop-blur-sm">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {formatSize(resultSize)}
                    </p>
                    {originalSize && resultSize && (
                      <p className="text-xs text-emerald-600">
                        透明背景 PNG，体积约为原图的{" "}
                        {((resultSize / originalSize) * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                  {resultUrl && file && (
                    <a
                      href={resultUrl}
                      download={`seal-${file.name.replace(/\.[^.]+$/, "")}.png`}
                      className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-medium text-white shadow-md transition-transform hover:scale-105 hover:bg-rose-700 active:scale-95"
                    >
                      下载电子章
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

      <div className="mx-auto max-w-4xl rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-500">
        <p>
          小提示：本工具采用纯前端像素级处理算法，通过识别红色区域并透明化其他像素来完成印章提取。
          为获得更好效果，建议使用背景相对干净、噪点较少的扫描图片。
        </p>
      </div>
    </div>
  );
};

export default SealExtractorClient;

