"use client";

import type { FC, ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ExtractMode = "auto" | "keepRed";

type CropRect = { x: number; y: number; width: number; height: number };
type ChannelChoice = "auto" | "r" | "g" | "b";

const formatSize = (bytes: number | null): string => {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const hexToRgb = (hex: string): [number, number, number] | null => {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b))
    return null;
  return [r, g, b];
};

const hueDistance = (a: number, b: number) => {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
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
  targetColor: string;
  tolerance: number;
  graySaturationCutoff: number;
  channelRatioChannel: ChannelChoice;
  channelRatioMinPercent: number;
  cropRect: CropRect | null;
  holeFillThreshold: number;
}

const getImageFromUrl = async (url: string): Promise<HTMLImageElement> => {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return img;
};

function fillSmallTransparentHoles(
  imageData: ImageData,
  maxHoleSizePx: number,
) {
  if (!Number.isFinite(maxHoleSizePx) || maxHoleSizePx <= 0) return;

  const threshold = Math.max(1, Math.floor(maxHoleSizePx));
  const { data, width, height } = imageData;
  const size = width * height;
  if (size <= 0) return;

  const outside = new Uint8Array(size);

  let queue: Int32Array | null = null;
  try {
    queue = new Int32Array(size);
  } catch {
    return;
  }

  let head = 0;
  let tail = 0;

  const alphaAt = (pixelIdx: number) => data[pixelIdx * 4 + 3];

  const pushOutside = (idx: number) => {
    outside[idx] = 1;
    queue![tail] = idx;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    const top = x;
    const bottom = (height - 1) * width + x;
    if (alphaAt(top) === 0 && outside[top] === 0) pushOutside(top);
    if (alphaAt(bottom) === 0 && outside[bottom] === 0) pushOutside(bottom);
  }

  for (let y = 0; y < height; y += 1) {
    const left = y * width;
    const right = y * width + (width - 1);
    if (alphaAt(left) === 0 && outside[left] === 0) pushOutside(left);
    if (alphaAt(right) === 0 && outside[right] === 0) pushOutside(right);
  }

  while (head < tail) {
    const idx = queue[head];
    head += 1;

    const y = Math.floor(idx / width);
    const x = idx - y * width;

    const left = x > 0 ? idx - 1 : -1;
    const right = x < width - 1 ? idx + 1 : -1;
    const up = y > 0 ? idx - width : -1;
    const down = y < height - 1 ? idx + width : -1;

    if (
      left >= 0 &&
      outside[left] === 0 &&
      alphaAt(left) === 0
    ) {
      pushOutside(left);
    }
    if (
      right >= 0 &&
      outside[right] === 0 &&
      alphaAt(right) === 0
    ) {
      pushOutside(right);
    }
    if (
      up >= 0 &&
      outside[up] === 0 &&
      alphaAt(up) === 0
    ) {
      pushOutside(up);
    }
    if (
      down >= 0 &&
      outside[down] === 0 &&
      alphaAt(down) === 0
    ) {
      pushOutside(down);
    }
  }

  const visited = new Uint8Array(size);
  const component: number[] = [];

  const inpaintComponent = (
    indices: number[],
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ) => {
    const localW = maxX - minX + 1;
    const localH = maxY - minY + 1;
    if (localW <= 0 || localH <= 0) return;

    const localSize = localW * localH;
    const holeMask = new Uint8Array(localSize);

    for (const pixelIdx of indices) {
      const py = Math.floor(pixelIdx / width);
      const px = pixelIdx - py * width;
      const lx = px - minX;
      const ly = py - minY;
      holeMask[ly * localW + lx] = 1;
    }

    const currR = new Float32Array(localSize);
    const currG = new Float32Array(localSize);
    const currB = new Float32Array(localSize);
    const nextR = new Float32Array(localSize);
    const nextG = new Float32Array(localSize);
    const nextB = new Float32Array(localSize);

    for (let ly = 0; ly < localH; ly += 1) {
      for (let lx = 0; lx < localW; lx += 1) {
        const globalIdx = (minY + ly) * width + (minX + lx);
        const offset = globalIdx * 4;
        const localIdx = ly * localW + lx;
        currR[localIdx] = data[offset];
        currG[localIdx] = data[offset + 1];
        currB[localIdx] = data[offset + 2];
      }
    }

    for (let ly = 0; ly < localH; ly += 1) {
      for (let lx = 0; lx < localW; lx += 1) {
        const localIdx = ly * localW + lx;
        if (holeMask[localIdx] === 0) continue;

        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let count = 0;

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = lx + dx;
            const ny = ly + dy;
            if (nx < 0 || nx >= localW || ny < 0 || ny >= localH) continue;
            const nLocalIdx = ny * localW + nx;
            if (holeMask[nLocalIdx] === 1) continue;

            const gIdx = (minY + ny) * width + (minX + nx);
            if (alphaAt(gIdx) === 0) continue;

            sumR += currR[nLocalIdx];
            sumG += currG[nLocalIdx];
            sumB += currB[nLocalIdx];
            count += 1;
          }
        }

        if (count > 0) {
          currR[localIdx] = sumR / count;
          currG[localIdx] = sumG / count;
          currB[localIdx] = sumB / count;
        }
      }
    }

    const iters = clamp(Math.floor(Math.max(12, threshold * 4)), 12, 60);

    for (let iter = 0; iter < iters; iter += 1) {
      for (let ly = 0; ly < localH; ly += 1) {
        for (let lx = 0; lx < localW; lx += 1) {
          const localIdx = ly * localW + lx;
          if (holeMask[localIdx] === 0) {
            nextR[localIdx] = currR[localIdx];
            nextG[localIdx] = currG[localIdx];
            nextB[localIdx] = currB[localIdx];
            continue;
          }

          const left = lx > 0 ? localIdx - 1 : localIdx;
          const right = lx < localW - 1 ? localIdx + 1 : localIdx;
          const up = ly > 0 ? localIdx - localW : localIdx;
          const down = ly < localH - 1 ? localIdx + localW : localIdx;

          nextR[localIdx] =
            (currR[left] + currR[right] + currR[up] + currR[down]) / 4;
          nextG[localIdx] =
            (currG[left] + currG[right] + currG[up] + currG[down]) / 4;
          nextB[localIdx] =
            (currB[left] + currB[right] + currB[up] + currB[down]) / 4;
        }
      }

      currR.set(nextR);
      currG.set(nextG);
      currB.set(nextB);
    }

    for (let ly = 0; ly < localH; ly += 1) {
      for (let lx = 0; lx < localW; lx += 1) {
        const localIdx = ly * localW + lx;
        if (holeMask[localIdx] === 0) continue;
        const globalIdx = (minY + ly) * width + (minX + lx);
        const offset = globalIdx * 4;
        data[offset] = clamp(Math.round(currR[localIdx]), 0, 255);
        data[offset + 1] = clamp(Math.round(currG[localIdx]), 0, 255);
        data[offset + 2] = clamp(Math.round(currB[localIdx]), 0, 255);
        data[offset + 3] = 255;
      }
    }
  };

  for (let i = 0; i < size; i += 1) {
    if (visited[i] === 1) continue;
    if (alphaAt(i) !== 0) continue;
    if (outside[i] === 1) continue;

    component.length = 0;
    head = 0;
    tail = 0;
    queue[tail] = i;
    tail += 1;
    visited[i] = 1;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (head < tail) {
      const idx = queue[head];
      head += 1;
      component.push(idx);

      const y = Math.floor(idx / width);
      const x = idx - y * width;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const left = x > 0 ? idx - 1 : -1;
      const right = x < width - 1 ? idx + 1 : -1;
      const up = y > 0 ? idx - width : -1;
      const down = y < height - 1 ? idx + width : -1;

      if (
        left >= 0 &&
        visited[left] === 0 &&
        outside[left] === 0 &&
        alphaAt(left) === 0
      ) {
        visited[left] = 1;
        queue[tail] = left;
        tail += 1;
      }
      if (
        right >= 0 &&
        visited[right] === 0 &&
        outside[right] === 0 &&
        alphaAt(right) === 0
      ) {
        visited[right] = 1;
        queue[tail] = right;
        tail += 1;
      }
      if (
        up >= 0 &&
        visited[up] === 0 &&
        outside[up] === 0 &&
        alphaAt(up) === 0
      ) {
        visited[up] = 1;
        queue[tail] = up;
        tail += 1;
      }
      if (
        down >= 0 &&
        visited[down] === 0 &&
        outside[down] === 0 &&
        alphaAt(down) === 0
      ) {
        visited[down] = 1;
        queue[tail] = down;
        tail += 1;
      }
    }

    if (maxX < 0 || maxY < 0) continue;
    const bboxW = maxX - minX + 1;
    const bboxH = maxY - minY + 1;
    if (Math.max(bboxW, bboxH) <= threshold) {
      inpaintComponent(component, minX, minY, maxX, maxY);
    }
  }
}

async function extractSealFromFile(
  file: File,
  options: ExtractOptions,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const crop = options.cropRect;

  const sourceX = crop ? clamp(Math.floor(crop.x), 0, bitmap.width - 1) : 0;
  const sourceY = crop ? clamp(Math.floor(crop.y), 0, bitmap.height - 1) : 0;
  const sourceW = crop
    ? clamp(Math.floor(crop.width), 1, bitmap.width - sourceX)
    : bitmap.width;
  const sourceH = crop
    ? clamp(Math.floor(crop.height), 1, bitmap.height - sourceY)
    : bitmap.height;

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = sourceW;
  baseCanvas.height = sourceH;
  const ctx = baseCanvas.getContext("2d", {
    willReadFrequently: true,
  } as CanvasRenderingContext2DSettings);

  if (!ctx) {
    throw new Error("无法创建画布上下文");
  }

  ctx.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceW,
    sourceH,
    0,
    0,
    sourceW,
    sourceH,
  );
  const imageData = ctx.getImageData(0, 0, baseCanvas.width, baseCanvas.height);
  const { data, width, height } = imageData;

  const sensitivity = options.sensitivity; // 0 - 100
  const minSaturation = 0.4 - (sensitivity / 100) * 0.2; // 敏感度越高，允许的饱和度越低
  const minValue = 0.25 - (sensitivity / 100) * 0.1;
  const targetRgb = hexToRgb(options.targetColor) ?? [209, 28, 36];
  const [targetHue] = rgbToHsv(targetRgb[0], targetRgb[1], targetRgb[2]);
  const tolerance = clamp(Math.floor(options.tolerance), 0, 180);
  const grayCutoff = clamp(options.graySaturationCutoff, 0, 1);
  const channelRatioMin = clamp(options.channelRatioMinPercent / 100, 0, 1);
  const useChannelRatioGate = channelRatioMin > 0;

  let channelForRatio: 0 | 1 | 2 = 0;
  if (options.channelRatioChannel === "r") channelForRatio = 0;
  else if (options.channelRatioChannel === "g") channelForRatio = 1;
  else if (options.channelRatioChannel === "b") channelForRatio = 2;
  else {
    if (targetRgb[1] >= targetRgb[0] && targetRgb[1] >= targetRgb[2]) {
      channelForRatio = 1;
    } else if (targetRgb[2] >= targetRgb[0] && targetRgb[2] >= targetRgb[1]) {
      channelForRatio = 2;
    }
  }

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

      const isTargetHue = hueDistance(h, targetHue) <= tolerance;
      const sum = r + g + b;
      const channelValue =
        channelForRatio === 0 ? r : channelForRatio === 1 ? g : b;
      const channelRatio = sum > 0 ? channelValue / sum : 0;
      const hasChannelRatio =
        useChannelRatioGate && channelRatio >= channelRatioMin;
      const passesGrayGate = s >= grayCutoff || hasChannelRatio;
      const isStrong =
        v >= minValue && (s >= minSaturation || hasChannelRatio);

      const isSealPixel =
        options.mode === "keepRed"
          ? r > 120 && r > g * 1.1 && r > b * 1.1
          : isTargetHue && passesGrayGate && isStrong;

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

  fillSmallTransparentHoles(imageData, options.holeFillThreshold);
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
  const [targetColor, setTargetColor] = useState<string>("#d11c24");
  const [tolerance, setTolerance] = useState<number>(30);
  const [graySaturationCutoff, setGraySaturationCutoff] =
    useState<number>(0.06);
  const [channelRatioChannel, setChannelRatioChannel] =
    useState<ChannelChoice>("auto");
  const [channelRatioMinPercent, setChannelRatioMinPercent] =
    useState<number>(38);
  const [cropEnabled, setCropEnabled] = useState<boolean>(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState<boolean>(false);
  const [holeFillThreshold, setHoleFillThreshold] = useState<number>(10);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const extractSeqRef = useRef(0);
  const extractDebounceRef = useRef<number | null>(null);
  const cropDraftRef = useRef<CropRect | null>(null);
  const cropPointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const previewTransformRef = useRef<{
    naturalWidth: number;
    naturalHeight: number;
    offsetX: number;
    offsetY: number;
    drawWidth: number;
    drawHeight: number;
  } | null>(null);

  const replaceResultUrl = useCallback((nextUrl: string | null) => {
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });
  }, []);

  const replaceCroppedPreviewUrl = useCallback((nextUrl: string | null) => {
    setCroppedPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });
  }, []);

  const cleanupUrls = useCallback(() => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    replaceResultUrl(null);
    replaceCroppedPreviewUrl(null);
  }, [originalUrl, replaceCroppedPreviewUrl, replaceResultUrl]);

  const currentExtractOptions = useMemo<ExtractOptions>(
    () => ({
      sensitivity,
      mode,
      targetColor,
      tolerance,
      graySaturationCutoff,
      channelRatioChannel,
      channelRatioMinPercent,
      cropRect: cropEnabled ? cropRect : null,
      holeFillThreshold,
    }),
    [
      cropEnabled,
      cropRect,
      channelRatioChannel,
      channelRatioMinPercent,
      graySaturationCutoff,
      holeFillThreshold,
      mode,
      sensitivity,
      targetColor,
      tolerance,
    ],
  );

  const handleExtract = useCallback(
    async (targetFile: File, options: ExtractOptions) => {
      const seq = (extractSeqRef.current += 1);
      setIsProcessing(true);
      setError(null);
      try {
        const blob = await extractSealFromFile(targetFile, options);
        if (seq !== extractSeqRef.current) return;
        setResultSize(blob.size);
        const url = URL.createObjectURL(blob);
        replaceResultUrl(url);
      } catch (err) {
        if (seq !== extractSeqRef.current) return;
        setError(
          err instanceof Error ? err.message : "印章提取失败，请稍后重试",
        );
      } finally {
        if (seq === extractSeqRef.current) {
          setIsProcessing(false);
        }
      }
    },
    [replaceResultUrl],
  );

  const scheduleExtract = useCallback(
    (targetFile: File, options: ExtractOptions, delayMs = 180) => {
      if (extractDebounceRef.current) {
        window.clearTimeout(extractDebounceRef.current);
      }
      extractDebounceRef.current = window.setTimeout(() => {
        extractDebounceRef.current = null;
        void handleExtract(targetFile, options);
      }, delayMs);
    },
    [handleExtract],
  );

  const redrawPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const host = previewHostRef.current;
    const img = originalImageRef.current;
    if (!canvas || !host || !img) return;

    const rect = host.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;
    const pixelW = Math.max(1, Math.floor(cssW * dpr));
    const pixelH = Math.max(1, Math.floor(cssH * dpr));

    if (canvas.width !== pixelW) canvas.width = pixelW;
    if (canvas.height !== pixelH) canvas.height = pixelH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const scale = Math.min(cssW / img.naturalWidth, cssH / img.naturalHeight);
    const drawWidth = img.naturalWidth * scale;
    const drawHeight = img.naturalHeight * scale;
    const offsetX = (cssW - drawWidth) / 2;
    const offsetY = (cssH - drawHeight) / 2;

    previewTransformRef.current = {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      offsetX,
      offsetY,
      drawWidth,
      drawHeight,
    };

    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

    if (!cropEnabled) return;
    const activeRect = cropDraftRef.current ?? cropRect;
    if (!activeRect) return;

    const rx = (activeRect.x / img.naturalWidth) * drawWidth + offsetX;
    const ry = (activeRect.y / img.naturalHeight) * drawHeight + offsetY;
    const rw = (activeRect.width / img.naturalWidth) * drawWidth;
    const rh = (activeRect.height / img.naturalHeight) * drawHeight;

	    ctx.save();
	    ctx.fillStyle = "rgba(0,0,0,0.35)";
	    ctx.fillRect(offsetX, offsetY, drawWidth, drawHeight);
	    ctx.fillStyle = "rgba(255,255,255,0.12)";
	    ctx.fillRect(rx, ry, rw, rh);

	    ctx.strokeStyle = "rgba(244,63,94,0.95)";
	    ctx.lineWidth = 2;
    ctx.strokeRect(rx + 1, ry + 1, Math.max(0, rw - 2), Math.max(0, rh - 2));

    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeRect(rx + 1, ry + 1, Math.max(0, rw - 2), Math.max(0, rh - 2));
    ctx.restore();
  }, [cropEnabled, cropRect]);

  const canvasPointToNatural = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = previewCanvasRef.current;
      const t = previewTransformRef.current;
      if (!canvas || !t) return null;

      const rect = canvas.getBoundingClientRect();
      const xCss = clientX - rect.left;
      const yCss = clientY - rect.top;

      const nx = (xCss - t.offsetX) / t.drawWidth;
      const ny = (yCss - t.offsetY) / t.drawHeight;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;

      return {
        x: clamp(nx * t.naturalWidth, 0, t.naturalWidth),
        y: clamp(ny * t.naturalHeight, 0, t.naturalHeight),
      };
    },
    [],
  );

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
    setCropRect(null);
    cropDraftRef.current = null;
    cropPointerRef.current = null;
	    setCropEnabled(false);
	    replaceCroppedPreviewUrl(null);
	    setIsCropModalOpen(false);
		    await handleExtract(selected, {
		      sensitivity,
		      mode,
		      targetColor,
		      tolerance,
		      graySaturationCutoff,
		      channelRatioChannel,
		      channelRatioMinPercent,
		      cropRect: null,
		      holeFillThreshold,
		    });
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
      scheduleExtract(file, { ...currentExtractOptions, sensitivity: value });
    }
  };

  const handleModeChange = (newMode: ExtractMode) => {
    setMode(newMode);
    if (file) {
      void handleExtract(file, { ...currentExtractOptions, mode: newMode });
    }
  };

  const handleTargetColorChange = (next: string) => {
    setTargetColor(next);
    if (file) {
      scheduleExtract(file, { ...currentExtractOptions, targetColor: next });
    }
  };

  const handleToleranceChange = (next: number) => {
    const value = clamp(Math.floor(next), 0, 180);
    setTolerance(value);
    if (file) {
      scheduleExtract(file, { ...currentExtractOptions, tolerance: value });
    }
  };

  const handleGraySaturationCutoffChange = (next: number) => {
    const value = Math.round(clamp(next, 0, 1) * 100) / 100;
    setGraySaturationCutoff(value);
    if (file) {
      scheduleExtract(file, {
        ...currentExtractOptions,
        graySaturationCutoff: value,
      });
    }
  };

  const handleChannelRatioChannelChange = (next: ChannelChoice) => {
    setChannelRatioChannel(next);
    if (file) {
      scheduleExtract(file, {
        ...currentExtractOptions,
        channelRatioChannel: next,
      });
    }
  };

  const handleChannelRatioMinPercentChange = (next: number) => {
    const value = clamp(Math.floor(next), 0, 100);
    setChannelRatioMinPercent(value);
    if (file) {
      scheduleExtract(file, {
        ...currentExtractOptions,
        channelRatioMinPercent: value,
      });
    }
  };

  const handleHoleFillThresholdChange = (next: number) => {
    const value = clamp(Math.floor(next), 0, 50);
    setHoleFillThreshold(value);
    if (file) {
      scheduleExtract(file, {
        ...currentExtractOptions,
        holeFillThreshold: value,
      });
    }
  };

  const handleCropEnabledChange = (next: boolean) => {
    cropDraftRef.current = null;
    cropPointerRef.current = null;
    if (!next) {
      setCropEnabled(false);
      setIsCropModalOpen(false);
      if (file) {
        void handleExtract(file, { ...currentExtractOptions, cropRect: null });
      }
      return;
    }
    openCropModal();
  };

  const clearCrop = () => {
    setCropRect(null);
    cropDraftRef.current = null;
    cropPointerRef.current = null;
    replaceCroppedPreviewUrl(null);
    if (isCropModalOpen) redrawPreview();
    if (file) {
      void handleExtract(file, { ...currentExtractOptions, cropRect: null });
    }
  };

  const openCropModal = () => {
    if (!file) return;
    setError(null);
    setCropEnabled(true);
    cropDraftRef.current = cropRect;
    cropPointerRef.current = null;
    setIsCropModalOpen(true);
    requestAnimationFrame(() => redrawPreview());
  };

  const cancelCropModal = () => {
    cropDraftRef.current = null;
    cropPointerRef.current = null;
    setIsCropModalOpen(false);
  };

  const applyCropModal = () => {
    const rect = cropDraftRef.current ?? cropRect;
    if (!rect) {
      setError("请先拖拽选择截取区域");
      return;
    }
    setCropRect(rect);
    cropDraftRef.current = null;
    cropPointerRef.current = null;
    setIsCropModalOpen(false);
    if (file) {
      void handleExtract(file, { ...currentExtractOptions, cropRect: rect });
    }
  };

  const handleCropPointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (!cropEnabled) return;
    const point = canvasPointToNatural(event.clientX, event.clientY);
    if (!point) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    cropPointerRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
    };
    cropDraftRef.current = {
      x: Math.floor(point.x),
      y: Math.floor(point.y),
      width: 1,
      height: 1,
    };
    redrawPreview();
  };

  const handleCropPointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const pointer = cropPointerRef.current;
    if (!cropEnabled || !pointer || pointer.pointerId !== event.pointerId) return;
    const point = canvasPointToNatural(event.clientX, event.clientY);
    if (!point) return;

    const left = Math.min(pointer.startX, point.x);
    const top = Math.min(pointer.startY, point.y);
    const right = Math.max(pointer.startX, point.x);
    const bottom = Math.max(pointer.startY, point.y);

    cropDraftRef.current = {
      x: Math.floor(left),
      y: Math.floor(top),
      width: Math.max(1, Math.floor(right - left)),
      height: Math.max(1, Math.floor(bottom - top)),
    };
    redrawPreview();
  };

  const handleCropPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = cropPointerRef.current;
    if (!cropEnabled || !pointer || pointer.pointerId !== event.pointerId) return;
    cropPointerRef.current = null;

    const draft = cropDraftRef.current;
    if (!draft) {
      redrawPreview();
      return;
    }

    const minSize = 8;
    const rect = {
      x: draft.x,
      y: draft.y,
      width: Math.max(minSize, draft.width),
      height: Math.max(minSize, draft.height),
    };
    cropDraftRef.current = rect;
    redrawPreview();
  };

  useEffect(() => {
    if (!originalUrl) {
      originalImageRef.current = null;
      previewTransformRef.current = null;
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const img = await getImageFromUrl(originalUrl);
        if (cancelled) return;
        originalImageRef.current = img;
        redrawPreview();
      } catch {
        if (cancelled) return;
        originalImageRef.current = null;
        previewTransformRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [originalUrl, redrawPreview]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    if (!isCropModalOpen) return;
    const host = previewHostRef.current;
    if (!host) return;
    const obs = new ResizeObserver(() => redrawPreview());
    obs.observe(host);
    return () => obs.disconnect();
  }, [isCropModalOpen, redrawPreview]);

  useEffect(() => {
    redrawPreview();
  }, [cropEnabled, cropRect, isCropModalOpen, redrawPreview]);

  useEffect(() => {
    if (!file || !cropEnabled || !cropRect) {
      replaceCroppedPreviewUrl(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const bitmap = await createImageBitmap(file);
        const sx = clamp(Math.floor(cropRect.x), 0, bitmap.width - 1);
        const sy = clamp(Math.floor(cropRect.y), 0, bitmap.height - 1);
        const sw = clamp(Math.floor(cropRect.width), 1, bitmap.width - sx);
        const sh = clamp(Math.floor(cropRect.height), 1, bitmap.height - sy);

        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
	        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

	        const blob = await new Promise<Blob>((resolve, reject) => {
	          canvas.toBlob(
	            (b) =>
	              b ? resolve(b) : reject(new Error("预览生成失败")),
	            "image/png",
	            1,
	          );
	        });
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        replaceCroppedPreviewUrl(url);
      } catch {
        if (cancelled) return;
        replaceCroppedPreviewUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cropEnabled, cropRect, file, replaceCroppedPreviewUrl]);

  useEffect(
    () => () => {
      if (extractDebounceRef.current) {
        window.clearTimeout(extractDebounceRef.current);
        extractDebounceRef.current = null;
      }
      cleanupUrls();
    },
    [cleanupUrls],
  );

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up space-y-8">
	      <div className="text-center">
	        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
	          印章提取工具
	        </h1>
	        <p className="mt-2 text-slate-500">
	          从扫描件/图片中自动提取印章区域，支持自定义颜色与容差，生成透明背景电子章，全程浏览器本地处理。
	        </p>
	      </div>

	      {isCropModalOpen && (
	        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
	          <div
	            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
	            onClick={cancelCropModal}
	          />
	          <div
	            className="relative w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl"
	            onClick={(e) => e.stopPropagation()}
	          >
	            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
	              <div>
	                <p className="text-sm font-semibold text-slate-900">截取区域</p>
	                <p className="mt-0.5 text-xs text-slate-500">
	                  在大图上拖拽框选需要处理的区域
	                </p>
	              </div>
	              <button
	                type="button"
	                onClick={cancelCropModal}
	                className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
	              >
	                关闭
	              </button>
	            </div>

	            <div className="space-y-4 p-5">
	              <div
	                ref={previewHostRef}
	                className="relative h-[70vh] w-full overflow-hidden rounded-xl bg-slate-100"
	              >
	                <canvas
	                  ref={previewCanvasRef}
	                  className="h-full w-full touch-none select-none cursor-crosshair"
	                  onPointerDown={handleCropPointerDown}
	                  onPointerMove={handleCropPointerMove}
	                  onPointerUp={handleCropPointerUp}
	                  onPointerCancel={handleCropPointerUp}
	                />
	              </div>

	              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	                <p className="text-xs text-slate-500">
	                  提示：截取能显著提升识别稳定性；框选完成后点击“应用截取”。
	                </p>
	                <div className="flex items-center justify-end gap-2">
	                  <button
	                    type="button"
	                    onClick={() => {
	                      cropDraftRef.current = null;
	                      cropPointerRef.current = null;
	                      redrawPreview();
	                    }}
	                    className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
	                  >
	                    清除选择框
	                  </button>
	                  <button
	                    type="button"
	                    onClick={cancelCropModal}
	                    className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
	                  >
	                    取消
	                  </button>
	                  <button
	                    type="button"
	                    onClick={applyCropModal}
	                    className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-rose-700"
	                  >
	                    应用截取
	                  </button>
	                </div>
	              </div>
	            </div>
	          </div>
	        </div>
	      )}

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
		                    replaceResultUrl(null);
		                    replaceCroppedPreviewUrl(null);
		                    setIsCropModalOpen(false);
		                    setOriginalSize(null);
		                    setResultSize(null);
		                    setCropRect(null);
	                    cropDraftRef.current = null;
	                    cropPointerRef.current = null;
	                    setCropEnabled(false);
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
		                <div className="h-6 w-px bg-slate-200" />
			                <div className="flex items-center gap-2 text-sm">
			                  <span className="text-slate-500">目标颜色：</span>
			                  <input
			                    type="color"
			                    value={targetColor}
			                    onChange={(e) =>
			                      handleTargetColorChange(e.target.value)
			                    }
			                    className="h-8 w-10 rounded-lg border border-slate-200 bg-white shadow-sm"
			                    title="选择印章颜色"
			                  />
			                  <span className="text-slate-500">容差：</span>
			                  <div className="flex items-center gap-2">
			                    <input
			                      type="range"
			                      min={0}
			                      max={90}
			                      step={1}
			                      value={tolerance}
			                      onChange={(e) =>
			                        handleToleranceChange(Number(e.target.value))
			                      }
			                      className="h-2 w-24 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-rose-500"
			                    />
			                    <input
			                      type="number"
			                      min={0}
			                      max={180}
			                      value={tolerance}
			                      onChange={(e) =>
			                        handleToleranceChange(Number(e.target.value))
			                      }
			                      className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm"
			                    />
			                    <span className="text-xs text-slate-400">°</span>
			                  </div>
			                  <span className="text-slate-500">灰度过滤：</span>
			                  <div className="flex items-center gap-2">
			                    <input
			                      type="range"
			                      min={0}
			                      max={1}
			                      step={0.01}
			                      value={graySaturationCutoff}
			                      onChange={(e) =>
			                        handleGraySaturationCutoffChange(
			                          Number(e.target.value),
			                        )
			                      }
			                      className="h-2 w-24 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-rose-500"
			                    />
			                    <input
			                      type="number"
			                      min={0}
			                      max={1}
			                      step={0.01}
			                      value={graySaturationCutoff}
			                      onChange={(e) =>
			                        handleGraySaturationCutoffChange(
			                          Number(e.target.value),
			                        )
			                      }
			                      className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm"
			                    />
			                    <span className="text-xs text-slate-400">S</span>
			                  </div>
				                  <span className="text-slate-500">通道占比：</span>
				                  <div className="inline-flex rounded-full bg-white p-1 shadow-sm">
				                    <button
				                      type="button"
				                      onClick={() => handleChannelRatioChannelChange("auto")}
				                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
				                        channelRatioChannel === "auto"
				                          ? "bg-rose-500 text-white shadow-sm"
				                          : "text-slate-600 hover:bg-slate-50"
				                      }`}
				                    >
				                      自动
				                    </button>
				                    <button
				                      type="button"
				                      onClick={() => handleChannelRatioChannelChange("r")}
				                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
				                        channelRatioChannel === "r"
				                          ? "bg-rose-500 text-white shadow-sm"
				                          : "text-slate-600 hover:bg-slate-50"
				                      }`}
				                    >
				                      R
				                    </button>
				                    <button
				                      type="button"
				                      onClick={() => handleChannelRatioChannelChange("g")}
				                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
				                        channelRatioChannel === "g"
				                          ? "bg-rose-500 text-white shadow-sm"
				                          : "text-slate-600 hover:bg-slate-50"
				                      }`}
				                    >
				                      G
				                    </button>
				                    <button
				                      type="button"
				                      onClick={() => handleChannelRatioChannelChange("b")}
				                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
				                        channelRatioChannel === "b"
				                          ? "bg-rose-500 text-white shadow-sm"
				                          : "text-slate-600 hover:bg-slate-50"
				                      }`}
				                    >
				                      B
				                    </button>
				                  </div>
				                  <div className="flex items-center gap-2">
				                    <input
				                      type="range"
				                      min={0}
				                      max={100}
				                      step={1}
				                      value={channelRatioMinPercent}
				                      onChange={(e) =>
				                        handleChannelRatioMinPercentChange(
				                          Number(e.target.value),
				                        )
				                      }
				                      className="h-2 w-24 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-rose-500"
				                    />
				                    <input
				                      type="number"
				                      min={0}
				                      max={100}
				                      step={1}
				                      value={channelRatioMinPercent}
				                      onChange={(e) =>
				                        handleChannelRatioMinPercentChange(
				                          Number(e.target.value),
				                        )
				                      }
				                      className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm"
				                    />
				                    <span className="text-xs text-slate-400">%</span>
				                  </div>
			                  {mode !== "auto" && (
			                    <span className="text-xs text-slate-400">
			                      （仅智能识别生效）
			                    </span>
			                  )}
			                </div>
		                <div className="h-6 w-px bg-slate-200" />
		                <div className="flex items-center gap-2 text-sm">
		                  <span className="text-slate-500">截取区域：</span>
	                  <div className="inline-flex rounded-full bg-white p-1 shadow-sm">
	                    <button
	                      type="button"
	                      onClick={() => handleCropEnabledChange(true)}
	                      className={`rounded-full px-3 py-1 text-xs font-medium ${
	                        cropEnabled
	                          ? "bg-rose-500 text-white shadow-sm"
	                          : "text-slate-600 hover:bg-slate-50"
	                      }`}
	                    >
	                      开启
	                    </button>
	                    <button
	                      type="button"
	                      onClick={() => handleCropEnabledChange(false)}
	                      className={`rounded-full px-3 py-1 text-xs font-medium ${
	                        !cropEnabled
	                          ? "bg-slate-800 text-white shadow-sm"
	                          : "text-slate-600 hover:bg-slate-50"
	                      }`}
	                    >
	                      全图
	                    </button>
	                  </div>
		                  {cropEnabled && cropRect && (
		                    <button
		                      type="button"
		                      onClick={clearCrop}
		                      className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
		                    >
		                      清除
		                    </button>
		                  )}
		                  {cropEnabled && (
		                    <>
		                      <button
		                        type="button"
		                        onClick={openCropModal}
		                        className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
		                      >
		                        {cropRect ? "重新截取" : "开始截取"}
		                      </button>
		                      <span className="text-xs text-slate-400">
		                        弹窗大图框选
		                      </span>
		                    </>
		                  )}
		                </div>
	                <div className="h-6 w-px bg-slate-200" />
	                <div className="flex items-center gap-2 text-sm">
	                  <span className="text-slate-500">智能填充：</span>
	                  <div className="flex items-center gap-2">
	                    <input
	                      type="range"
	                      min={0}
	                      max={30}
	                      step={1}
	                      value={holeFillThreshold}
	                      onChange={(e) =>
	                        handleHoleFillThresholdChange(Number(e.target.value))
	                      }
	                      className="h-2 w-28 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-rose-500"
	                    />
	                    <input
	                      type="number"
	                      min={0}
	                      max={50}
	                      value={holeFillThreshold}
	                      onChange={(e) =>
	                        handleHoleFillThresholdChange(Number(e.target.value))
	                      }
	                      className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm"
	                    />
	                    <span className="text-xs text-slate-400">px</span>
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
	                  {cropEnabled && cropRect ? "截取预览" : "原图"}
	                </div>
		                <div className="aspect-[4/3] w-full overflow-hidden">
		                  {cropEnabled && cropRect ? (
		                    croppedPreviewUrl ? (
		                      // eslint-disable-next-line @next/next/no-img-element
		                      <img
		                        src={croppedPreviewUrl}
		                        alt="截取预览"
		                        className="h-full w-full object-contain p-4"
		                      />
		                    ) : (
		                      <div className="flex h-full items-center justify-center p-4 text-xs text-slate-400">
		                        正在生成截取预览…
		                      </div>
		                    )
		                  ) : (
		                    // eslint-disable-next-line @next/next/no-img-element
		                    <img
		                      src={originalUrl ?? ""}
		                      alt="原始图片"
		                      className="h-full w-full object-contain p-4"
		                    />
		                  )}
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
	          可先截取印章所在区域提升识别稳定性；智能填充会按阈值自动修补小空洞并平滑过渡。
	        </p>
      </div>
    </div>
  );
};

export default SealExtractorClient;
