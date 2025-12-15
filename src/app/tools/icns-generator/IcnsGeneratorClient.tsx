"use client";

import type { ChangeEvent, FC } from "react";
import { useEffect, useRef, useState } from "react";

type IconResource = {
  type: string;
  size: number;
};

const ICON_RESOURCES: IconResource[] = [
  { type: "icp4", size: 16 },
  { type: "icp5", size: 32 },
  { type: "icp6", size: 64 },
  { type: "ic07", size: 128 },
  { type: "ic08", size: 256 },
  { type: "ic09", size: 512 },
  { type: "ic10", size: 1024 },
];

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

async function renderPngForSize(
  bitmap: ImageBitmap,
  targetSize: number,
): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("无法创建画布上下文");
  }

  context.clearRect(0, 0, targetSize, targetSize);

  const scale = Math.min(
    targetSize / bitmap.width,
    targetSize / bitmap.height,
  );
  const drawWidth = Math.round(bitmap.width * scale);
  const drawHeight = Math.round(bitmap.height * scale);
  const offsetX = Math.round((targetSize - drawWidth) / 2);
  const offsetY = Math.round((targetSize - drawHeight) / 2);

  context.drawImage(
    bitmap,
    offsetX,
    offsetY,
    drawWidth,
    drawHeight,
  );

  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("生成 PNG 失败"));
          return;
        }

        blob
          .arrayBuffer()
          .then((buffer) => {
            resolve(new Uint8Array(buffer));
          })
          .catch((error) => {
            reject(
              error instanceof Error
                ? error
                : new Error("读取 PNG 数据失败"),
            );
          });
      },
      "image/png",
      1,
    );
  });
}

type IcnsEntry = {
  type: string;
  data: Uint8Array;
};

function writeFourCc(target: Uint8Array, offset: number, type: string) {
  if (type.length !== 4) {
    throw new Error("ICNS 资源标识必须为 4 个字符");
  }
  for (let index = 0; index < 4; index += 1) {
    target[offset + index] = type.charCodeAt(index);
  }
}

function buildIcns(entries: IcnsEntry[]): Blob {
  let totalLength = 8;

  for (const entry of entries) {
    totalLength += 8 + entry.data.length;
  }

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  writeFourCc(bytes, 0, "icns");
  view.setUint32(4, totalLength, false);

  let offset = 8;

  for (const entry of entries) {
    const entryLength = 8 + entry.data.length;

    writeFourCc(bytes, offset, entry.type);
    view.setUint32(offset + 4, entryLength, false);
    bytes.set(entry.data, offset + 8);

    offset += entryLength;
  }

  return new Blob([buffer], { type: "image/icns" });
}

async function generateIcnsFromFile(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  try {
    const entries: IcnsEntry[] = [];

    for (const resource of ICON_RESOURCES) {
      const pngData = await renderPngForSize(bitmap, resource.size);
      entries.push({
        type: resource.type,
        data: pngData,
      });
    }

    return buildIcns(entries);
  } finally {
    if ("close" in bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }
  }
}

const IcnsGeneratorClient: FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [imageWidth, setImageWidth] = useState<number | null>(null);
  const [imageHeight, setImageHeight] = useState<number | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("icon.icns");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const cleanupUrls = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
  };

  const readImageDimensions = async (selected: File) => {
    const bitmap = await createImageBitmap(selected);
    try {
      setImageWidth(bitmap.width);
      setImageHeight(bitmap.height);
    } finally {
      if ("close" in bitmap && typeof bitmap.close === "function") {
        bitmap.close();
      }
    }
  };

  const validateImageFile = (selected: File): string | null => {
    const isImageType = selected.type.startsWith("image/");
    const lowerName = selected.name.toLowerCase();
    const isImageExt = /\.(png|jpe?g|webp|bmp|tiff?)$/.test(lowerName);

    if (!isImageType && !isImageExt) {
      return "请选择 PNG / JPG / WebP 等图片文件。";
    }

    const maxSizeBytes = 30 * 1024 * 1024;
    if (selected.size > maxSizeBytes) {
      return "单张图片建议不超过 30MB，以免浏览器内存占用过高。";
    }

    return null;
  };

  const processFile = async (selected: File) => {
    const validationError = validateImageFile(selected);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    cleanupUrls();

    setFile(selected);
    setFileSize(selected.size);
    setDownloadUrl(null);

    const objectUrl = URL.createObjectURL(selected);
    setPreviewUrl(objectUrl);

    setImageWidth(null);
    setImageHeight(null);
    await readImageDimensions(selected);

    const baseName = selected.name.replace(/\.[^.]+$/, "") || "icon";
    setDownloadName(`${baseName}.icns`);
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

  const handleGenerate = async () => {
    if (!file) {
      setError("请先选择一张用于生成图标的图片。");
      return;
    }

    setIsProcessing(true);
    setError(null);

    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    try {
      const icnsBlob = await generateIcnsFromFile(file);
      const url = URL.createObjectURL(icnsBlob);
      setDownloadUrl(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "生成 ICNS 文件失败，请稍后重试。",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    cleanupUrls();
    setFile(null);
    setPreviewUrl(null);
    setFileSize(null);
    setImageWidth(null);
    setImageHeight(null);
    setDownloadUrl(null);
    setError(null);
    setDownloadName("icon.icns");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(
    () => () => {
      cleanupUrls();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const hasImage = Boolean(file);

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          ICNS 图标生成工具
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          上传一张图片，浏览器会在本地生成包含多尺寸图标资源的苹果
          ICNS 文件，可直接用于 macOS 应用、Dock 图标等场景，全程本地处理，不上传服务器。
        </p>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              第一步：选择一张基础图片
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              推荐使用尺寸不小于 1024×1024 的正方形 PNG 或
              JPG，背景透明的图标图片效果更佳。
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex h-6 items-center rounded-full bg-emerald-50 px-2 font-medium text-emerald-700">
              本工具完全在浏览器本地运行
            </span>
          </div>
        </div>

        <div
          className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-10 text-center transition ${
            isDragging
              ? "border-emerald-500 bg-emerald-50/50"
              : "border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-50"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg">
            <span className="text-xl"></span>
          </div>
          <p className="text-sm font-medium text-slate-900">
            拖拽图片到此处，或点击选择文件
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            支持 PNG、JPG、WebP 等格式，单张图片建议不超过 30MB。
          </p>
          {file && (
            <p className="mt-3 text-xs text-slate-600">
              已选择：{" "}
              <span className="font-medium">{file.name}</span>（
              {formatSize(fileSize)}，分辨率{" "}
              {formatResolution(imageWidth, imageHeight)}）
            </p>
          )}
        </div>

        {hasImage && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-900">
                第二步：预览图片并确认效果
              </h2>
              <p className="text-xs text-slate-500">
                生成 ICNS 时会自动输出多个尺寸的 PNG 图标资源，并以透明背景居中铺放在正方形画布上。
              </p>
              <div className="group relative overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
                <div className="absolute left-4 top-4 z-10 rounded-lg bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
                  原始图片预览
                </div>
                <div className="aspect-square w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl ?? ""}
                    alt="原始图片预览"
                    className="h-full w-full object-contain bg-white p-4"
                  />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-white/90 px-4 py-3 backdrop-blur-sm">
                  <p className="text-sm font-medium text-slate-900">
                    {formatSize(fileSize)} ·{" "}
                    {formatResolution(imageWidth, imageHeight)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    输出 ICNS 中将包含 16、32、64、128、256、512、1024
                    像素等多个尺寸的图标资源。
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-900">
                第三步：生成 ICNS 文件
              </h2>
              <p className="text-xs text-slate-500">
                点击下方按钮后，浏览器会在本地对图片进行多尺寸绘制并打包成
                ICNS 图标文件，生成完成后可直接下载使用。
              </p>

              <div className="flex flex-col gap-2 text-xs text-slate-600">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="font-medium text-slate-900">
                    将生成以下尺寸的图标：
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    16×16、32×32、64×64、128×128、256×256、512×512、1024×1024
                    像素，均为 PNG 格式嵌入在一个 ICNS 文件中。
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
                >
                  重新选择图片
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isProcessing}
                  className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isProcessing ? "生成中..." : "生成 ICNS 图标文件"}
                </button>
              </div>

              {downloadUrl && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50/80 px-3 py-2 text-xs">
                  <div className="space-y-1">
                    <p className="font-medium text-emerald-800">
                      已生成 ICNS 文件，可点击右侧按钮下载到本地。
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      提示：如需在 macOS 上预览，可直接在 Finder 中选中文件后按空格键快速预览。
                    </p>
                  </div>
                  <a
                    href={downloadUrl}
                    download={downloadName}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
                  >
                    下载 ICNS 文件
                  </a>
                </div>
              )}
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

export default IcnsGeneratorClient;
