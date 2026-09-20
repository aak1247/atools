"use client";

import type { ChangeEvent, FC } from "react";
import { useEffect, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type IcoIconSize = {
  width: number;
  height: number;
  bpp: number; // bits per pixel: 1, 4, 8, 24, 32
  description: string;
};

const DEFAULT_UI = {
  step1Title: "第一步：选择一张基础图片",
  step1Desc: "推荐使用尺寸不小于 256×256 的正方形 PNG 或 JPG，背景透明的图标图片效果更佳。",
  localBadge: "本工具完全在浏览器本地运行",
  dropHint: "拖拽图片到此处，或点击选择文件",
  dropHintReplace: "拖拽新图片到此处，或点击替换图片",
  dropFormats: "支持 PNG、JPG、WebP 等格式，单张图片建议不超过 30MB。",
  supportReplaceNotice: "已支持点击替换和拖拽替换。",
  selectedLabel: "已选择：",
  resolutionLabel: "分辨率",
  step2Title: "第二步：预览图片并选择尺寸",
  step2Desc: "选择要生成的 ICO 图标尺寸（一次生成一个尺寸的 ICO 文件）。",
  previewBadge: "原始图片预览",
  selectedSizePrefix: "已选择",
  selectIconSize: "选择图标尺寸",
  step3Title: "第三步：生成 ICO 文件",
  step3Desc: "点击下方按钮后，浏览器会在本地对图片进行绘制并打包成 ICO 图标文件，生成完成后可直接下载使用。",
  willGeneratePrefix: "将生成以下尺寸的 ICO 图标：",
  willGenerateDetails: "像素，32 位 RGBA PNG 格式嵌入到一个 ICO 文件中。",
  reselectImage: "重新选择图片",
  generate: "生成 ICO 图标文件",
  generating: "生成中...",
  successNotice: "已生成 ICO 文件，可点击右侧按钮下载到本地。",
  icoTip: "提示：ICO 文件可直接用于 Windows 应用图标或网站 favicon。",
  download: "下载 ICO 文件",
  errSelectImage: "请先选择一张用于生成图标的图片。",
  errSelectSize: "请至少选择一个图标尺寸。",
  errFileType: "请选择 PNG / JPG / WebP 等图片文件。",
  errFileSize: "单张图片建议不超过 30MB，以免浏览器内存占用过高。",
  errGenerateFailed: "生成 ICO 文件失败，请稍后重试。",
  errCanvasContext: "无法创建画布上下文",
  errPngFailed: "生成 PNG 失败",
  errPngRead: "读取 PNG 数据失败",
} as const;

function normalizeIcoSizes(sizes: IcoIconSize[]): IcoIconSize[] {
  return Array.from(
    new Map(sizes.map((size) => [`${size.width}x${size.height}`, size])).values(),
  ).sort((a, b) => b.width - a.width || b.height - a.height);
}

// ICO format standard sizes and configurations
const ICO_SIZES: IcoIconSize[] = [
  { width: 256, height: 256, bpp: 32, description: "256×256" },
  { width: 128, height: 128, bpp: 32, description: "128×128" },
  { width: 64, height: 64, bpp: 32, description: "64×64" },
  { width: 48, height: 48, bpp: 32, description: "48×48" },
  { width: 32, height: 32, bpp: 32, description: "32×32" },
  { width: 24, height: 24, bpp: 32, description: "24×24" },
  { width: 16, height: 16, bpp: 32, description: "16×16" },
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
  width: number,
  height: number,
  errContextMsg: string,
  errPngMsg: string,
  errReadMsg: string,
): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error(errContextMsg);
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.clearRect(0, 0, width, height);

  // Scale image to fit within the target dimensions
  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const drawWidth = Math.round(bitmap.width * scale);
  const drawHeight = Math.round(bitmap.height * scale);
  const offsetX = Math.round((width - drawWidth) / 2);
  const offsetY = Math.round((height - drawHeight) / 2);

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
          reject(new Error(errPngMsg));
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
                : new Error(errReadMsg),
            );
          });
      },
      "image/png",
      1,
    );
  });
}

type IcoEntry = {
  width: number;
  height: number;
  data: Uint8Array; // PNG data
  offset: number;
  size: number;
};

function createIcoDirectory(entries: IcoEntry[]): Uint8Array {
  const iconCount = entries.length;
  const directorySize = 6 + 16 * iconCount; // Header (6 bytes) + Directory entries (16 bytes each)
  const buffer = new ArrayBuffer(directorySize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // ICO file header
  view.setUint16(0, 0, true); // Reserved (2 bytes) - must be 0
  view.setUint16(2, 1, true); // Type (2 bytes) - 1 for ICO
  view.setUint16(4, iconCount, true); // Image count (2 bytes)

  // Directory entries
  let offset = 6;
  for (const entry of entries) {
    bytes[offset] = entry.width === 256 ? 0 : entry.width; // Width (0 means 256)
    bytes[offset + 1] = entry.height === 256 ? 0 : entry.height; // Height (0 means 256)
    bytes[offset + 2] = 0; // Color count (1 byte) - 0 for >= 8bpp
    bytes[offset + 3] = 0; // Reserved (1 byte)
    view.setUint16(offset + 4, 1, true); // Color planes (2 bytes) - should be 1
    view.setUint16(offset + 6, 32, true); // Bits per pixel (2 bytes) - 32 for RGBA
    view.setUint32(offset + 8, entry.size, true); // Image size (4 bytes)
    view.setUint32(offset + 12, entry.offset, true); // Image offset (4 bytes)
    offset += 16;
  }

  return bytes;
}

async function createIcoFile(
  file: File,
  selectedSizes: IcoIconSize[],
  errContextMsg: string,
  errPngMsg: string,
  errReadMsg: string,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const entries: IcoEntry[] = [];

  try {
    // Generate PNG data for each selected size
    const pngData: { size: IcoIconSize; data: Uint8Array }[] = [];
    const uniqueSizes = normalizeIcoSizes(selectedSizes);
    for (const size of uniqueSizes) {
      const png = await renderPngForSize(bitmap, size.width, size.height, errContextMsg, errPngMsg, errReadMsg);
      pngData.push({ size, data: png });
    }

    // Calculate offsets for each image entry
    let currentOffset = 6 + 16 * pngData.length; // Header + directory entries
    for (const { size, data } of pngData) {
      entries.push({
        width: size.width,
        height: size.height,
        data,
        offset: currentOffset,
        size: data.length,
      });
      currentOffset += data.length;
    }

    // Create ICO directory
    const directory = createIcoDirectory(entries);

    // Combine directory and image data
    const totalSize = entries.length
      ? entries[entries.length - 1].offset + entries[entries.length - 1].size
      : directory.length;
    const icoBuffer = new ArrayBuffer(totalSize);
    const icoBytes = new Uint8Array(icoBuffer);

    // Copy directory
    icoBytes.set(directory, 0);

    // Copy image data
    for (const entry of entries) {
      icoBytes.set(entry.data, entry.offset);
    }

    return new Blob([icoBuffer], { type: "image/x-icon" });
  } finally {
    if ("close" in bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }
  }
}

function IcoGeneratorInner() {
  const config = useOptionalToolConfig("ico-generator");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [imageWidth, setImageWidth] = useState<number | null>(null);
  const [imageHeight, setImageHeight] = useState<number | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("icon.ico");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<IcoIconSize[]>([ICO_SIZES[0]]);

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
      return ui.errFileType;
    }

    const maxSizeBytes = 30 * 1024 * 1024;
    if (selected.size > maxSizeBytes) {
      return ui.errFileSize;
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
    setDownloadName(`${baseName}.ico`);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) {
      void processFile(selected);
    }
  };

  const openFilePicker = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    fileInputRef.current.click();
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

  const handleSizeSelect = (size: IcoIconSize) => {
    setSelectedSizes([size]);
  };

  const handleGenerate = async () => {
    if (!file) {
      setError(ui.errSelectImage);
      return;
    }

    if (selectedSizes.length === 0) {
      setError(ui.errSelectSize);
      return;
    }

    setIsProcessing(true);
    setError(null);

    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    try {
      const icoBlob = await createIcoFile(
        file,
        selectedSizes,
        ui.errCanvasContext,
        ui.errPngFailed,
        ui.errPngRead,
      );
      const url = URL.createObjectURL(icoBlob);
      setDownloadUrl(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : ui.errGenerateFailed,
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
    setDownloadName("icon.ico");
    setSelectedSizes([ICO_SIZES[0]]);
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
  const normalizedSizes = normalizeIcoSizes(selectedSizes);
  const selectedSize = normalizedSizes[0];

  return (
    <div className="glass-card rounded-2xl p-5 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {ui.step1Title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {ui.step1Desc}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="inline-flex h-6 items-center rounded-full bg-emerald-50 px-2 font-medium text-emerald-700">
            {ui.localBadge}
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
        onClick={openFilePicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFilePicker();
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
          <span className="text-xl">🖼️</span>
        </div>
        <p className="text-sm font-medium text-slate-900">
          {file ? ui.dropHintReplace : ui.dropHint}
        </p>
        <p className="mt-2 text-[11px] text-slate-500">
          {ui.dropFormats}
        </p>
        {file && (
          <p className="mt-1 text-[11px] text-slate-500">
            {ui.supportReplaceNotice}
          </p>
        )}
        {file && (
          <p className="mt-3 text-xs text-slate-600">
            {ui.selectedLabel}{" "}
            <span className="font-medium">{file.name}</span>（
            {formatSize(fileSize)}，{ui.resolutionLabel}{" "}
            {formatResolution(imageWidth, imageHeight)}）
          </p>
        )}
      </div>

      {hasImage && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">
              {ui.step2Title}
            </h2>
            <p className="text-xs text-slate-500">
              {ui.step2Desc}
            </p>
            <div className="group relative overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
              <div className="absolute left-4 top-4 z-10 rounded-lg bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
                {ui.previewBadge}
              </div>
              <div className="aspect-square w-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl ?? ""}
                  alt={ui.previewBadge}
                  className="h-full w-full object-contain bg-white p-4"
                />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-white/90 px-4 py-3 backdrop-blur-sm">
                <p className="text-sm font-medium text-slate-900">
                  {formatSize(fileSize)} ·{" "}
                  {formatResolution(imageWidth, imageHeight)}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {ui.selectedSizePrefix} {selectedSize?.description ?? "-"}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-slate-900">{ui.selectIconSize}</h3>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {ICO_SIZES.map((size) => {
                  const isSelected = Boolean(
                    selectedSize &&
                      selectedSize.width === size.width &&
                      selectedSize.height === size.height,
                  );
                  return (
                    <button
                      key={`${size.width}x${size.height}`}
                      type="button"
                      onClick={() => handleSizeSelect(size)}
                      className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                        isSelected
                          ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                          : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {size.description}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">
              {ui.step3Title}
            </h2>
            <p className="text-xs text-slate-500">
              {ui.step3Desc}
            </p>

            <div className="flex flex-col gap-2 text-xs text-slate-600">
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="font-medium text-slate-900">
                  {ui.willGeneratePrefix}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {selectedSize?.description ?? "-"} {ui.willGenerateDetails}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
              >
                {ui.reselectImage}
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isProcessing}
                className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isProcessing ? ui.generating : ui.generate}
              </button>
            </div>

            {downloadUrl && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50/80 px-3 py-2 text-xs">
                <div className="space-y-1">
                  <p className="font-medium text-emerald-800">
                    {ui.successNotice}
                  </p>
                  <p className="text-[11px] text-emerald-700">
                    {ui.icoTip}
                  </p>
                </div>
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
                >
                  {ui.download}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mx-auto max-w-md rounded-lg bg-rose-50 p-4 text-center text-sm text-rose-600 animate-fade-in-up">
          {error}
        </div>
      )}
    </div>
  );
}

const IcoGeneratorClient: FC = () => {
  return (
    <ToolPageLayout toolSlug="ico-generator">
      <IcoGeneratorInner />
    </ToolPageLayout>
  );
};

export default IcoGeneratorClient;
