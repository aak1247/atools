import { unzipSync, zipSync } from "fflate";

export interface OfficeCompressOptions {
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  imageQuality?: number; // 0.1 to 1.0 (default 0.75)
  maxImageDimension?: number; // e.g. 1920 (default 1920)
  onProgress?: (info: { current: number; total: number; filename: string }) => void;
}

export interface OfficeCompressResult {
  outputBytes: Uint8Array;
  imageCount: number;
  compressedImageCount: number;
  originalImageBytes: number;
  newImageBytes: number;
}

async function compressImageBytes(
  bytes: Uint8Array,
  filename: string,
  quality: number,
  maxDimension: number
): Promise<Uint8Array | null> {
  if (typeof window === "undefined") return null;

  try {
    const isJpeg = /\.(jpe?g)$/i.test(filename);
    const isPng = /\.png$/i.test(filename);
    const isWebp = /\.webp$/i.test(filename);

    if (!isJpeg && !isPng && !isWebp) return null;

    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>]);
    let width = 0;
    let height = 0;
    let imageSource: ImageBitmap | HTMLImageElement;

    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob);
      width = bitmap.width;
      height = bitmap.height;
      imageSource = bitmap;
    } else {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });
      URL.revokeObjectURL(url);
      width = img.naturalWidth || img.width;
      height = img.naturalHeight || img.height;
      imageSource = img;
    }

    if (width <= 0 || height <= 0) return null;

    // Scale down proportionally if exceeding maxDimension
    let targetWidth = width;
    let targetHeight = height;
    if (width > maxDimension || height > maxDimension) {
      if (width >= height) {
        targetWidth = maxDimension;
        targetHeight = Math.round((height * maxDimension) / width);
      } else {
        targetHeight = maxDimension;
        targetWidth = Math.round((width * maxDimension) / height);
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);

    // Keep mime type consistent with original to preserve Office relationships
    const mimeType = isJpeg ? "image/jpeg" : isPng ? "image/png" : "image/webp";

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mimeType, quality);
    });

    if (!compressedBlob) return null;

    const compressedBuf = await compressedBlob.arrayBuffer();
    const compressedBytes = new Uint8Array(compressedBuf);

    // Only accept if strictly smaller than original bytes
    if (compressedBytes.byteLength < bytes.byteLength) {
      return compressedBytes;
    }
    return null;
  } catch {
    return null;
  }
}

export async function compressOfficeDocument(
  inputBytes: Uint8Array,
  options: OfficeCompressOptions = {}
): Promise<OfficeCompressResult> {
  const level = (options.level ?? 9) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  const quality = options.imageQuality ?? 0.75;
  const maxDim = options.maxImageDimension ?? 1920;

  const files = unzipSync(inputBytes);

  // Find all embedded media images in word/media or ppt/media
  const mediaKeys = Object.keys(files).filter((k) =>
    /^(?:word|ppt|xl)\/media\/[^/]+\.(png|jpe?g|webp)$/i.test(k)
  );

  let originalImageBytes = 0;
  let newImageBytes = 0;
  let compressedImageCount = 0;

  for (let i = 0; i < mediaKeys.length; i++) {
    const key = mediaKeys[i];
    const original = files[key];
    originalImageBytes += original.byteLength;

    options.onProgress?.({
      current: i + 1,
      total: mediaKeys.length,
      filename: key.split("/").pop() || key,
    });

    const compressed = await compressImageBytes(original, key, quality, maxDim);
    if (compressed && compressed.byteLength < original.byteLength) {
      files[key] = compressed;
      newImageBytes += compressed.byteLength;
      compressedImageCount++;
    } else {
      newImageBytes += original.byteLength;
    }
  }

  const outputBytes = zipSync(files, { level });

  return {
    outputBytes,
    imageCount: mediaKeys.length,
    compressedImageCount,
    originalImageBytes,
    newImageBytes,
  };
}
