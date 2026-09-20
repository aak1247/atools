import { unzipSync, zipSync, unzlibSync, zlibSync } from "fflate";

export type MediaCompressionMode = "lossy" | "lossless" | "repackOnly";

export interface OfficeCompressOptions {
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  mode?: MediaCompressionMode; // 默认 "lossy"
  imageQuality?: number; // 0.1 to 1.0 (default 0.75)
  maxImageDimension?: number; // e.g. 1920 (default 1920, 0 or Infinity means keep original)
  convertPngToJpeg?: boolean; // 有损模式下，无透明通道的 PNG 是否转为 JPEG (default true)
  stripThumbnail?: boolean; // 是否清理幻灯片缩略图缓存 (default false)
  onProgress?: (info: { current: number; total: number; filename: string }) => void;
}

export interface OfficeMediaInfo {
  totalImageCount: number;
  totalImageBytes: number;
  imageBreakdown: {
    png: number;
    jpeg: number;
    webp: number;
    bmp: number;
    other: number;
  };
  videoAudioCount: number;
  videoAudioBytes: number;
  hasThumbnail: boolean;
  thumbnailBytes: number;
}

export interface OfficeCompressResult {
  outputBytes: Uint8Array;
  imageCount: number;
  compressedImageCount: number;
  originalImageBytes: number;
  newImageBytes: number;
  videoAudioCount: number;
  videoAudioBytes: number;
  savedThumbnailBytes: number;
}

// CRC32 table & function for lossless PNG rebuilding
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf: Uint8Array, offset: number, length: number): number {
  let c = 0xffffffff;
  for (let i = offset; i < offset + length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 针对 PNG 图像执行 100% 绝对逐像素无损优化：
 * 1. 过滤掉无用的元数据辅助块（tEXt, iTXt, zTXt, eXIf, pHYs, cHRM 等），只保留 IHDR, PLTE, tRNS, IDAT, IEND；
 * 2. 解压 IDAT 扫描线，并使用最高压缩等级 (fflate level 9) 重新 zlib 压缩；
 * 3. 重新计算 CRC32 并封装。保证原始像素绝对不变。
 */
export function optimizePngLossless(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== sig[i]) return null;
  }

  let offset = 8;
  const idatParts: Uint8Array[] = [];
  const keptChunks: { type: string; data: Uint8Array }[] = [];

  while (offset + 8 <= bytes.length) {
    const len =
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0;
    offset += 4;
    const type = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    offset += 4;
    if (offset + len + 4 > bytes.length) return null;
    const data = bytes.subarray(offset, offset + len);
    offset += len + 4; // skip data and crc

    if (type === "IDAT") {
      idatParts.push(data);
    } else if (
      type === "IHDR" ||
      type === "PLTE" ||
      type === "tRNS" ||
      type === "IEND"
    ) {
      keptChunks.push({ type, data });
    }
  }

  if (idatParts.length === 0) return null;

  try {
    const totalIdatLen = idatParts.reduce((acc, p) => acc + p.length, 0);
    const combinedIdat = new Uint8Array(totalIdatLen);
    let pos = 0;
    for (const part of idatParts) {
      combinedIdat.set(part, pos);
      pos += part.length;
    }

    // Unzlib raw scanlines
    const rawScanlines = unzlibSync(combinedIdat);
    // Rezlib with level 9
    const recompressedIdat = zlibSync(rawScanlines, { level: 9 });

    // Calculate total size: 8 (sig) + keptChunks + new IDAT + IEND
    let newSize = 8;
    for (const chunk of keptChunks) {
      if (chunk.type === "IEND") continue;
      newSize += 12 + chunk.data.length;
    }
    newSize += 12 + recompressedIdat.length;
    newSize += 12; // IEND

    const out = new Uint8Array(newSize);
    out.set(sig, 0);
    let writePos = 8;

    const writeChunk = (type: string, data: Uint8Array) => {
      const len = data.length;
      out[writePos] = (len >>> 24) & 0xff;
      out[writePos + 1] = (len >>> 16) & 0xff;
      out[writePos + 2] = (len >>> 8) & 0xff;
      out[writePos + 3] = len & 0xff;
      writePos += 4;

      const typePos = writePos;
      for (let i = 0; i < 4; i++) {
        out[writePos++] = type.charCodeAt(i);
      }
      out.set(data, writePos);
      writePos += len;

      const chunkCrc = crc32(out, typePos, 4 + len);
      out[writePos] = (chunkCrc >>> 24) & 0xff;
      out[writePos + 1] = (chunkCrc >>> 16) & 0xff;
      out[writePos + 2] = (chunkCrc >>> 8) & 0xff;
      out[writePos + 3] = chunkCrc & 0xff;
      writePos += 4;
    };

    for (const chunk of keptChunks) {
      if (chunk.type === "IEND") continue;
      writeChunk(chunk.type, chunk.data);
    }
    writeChunk("IDAT", recompressedIdat);
    writeChunk("IEND", new Uint8Array(0));

    if (out.byteLength < bytes.byteLength) {
      return out;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 针对 JPEG 执行无损瘦身：
 * 剥离无用的 APP1-APP15 (EXIF, XMP, 缩略图等) 和 COM 注释段，保持核心 DCT 熵编码流完全不变。
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const chunks: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  let offset = 2;
  let totalLength = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    offset += 2;

    if (marker === 0xda) {
      // SOS (Start of Scan) - remainder is compressed entropy stream until EOI
      const rest = bytes.subarray(offset - 2);
      chunks.push(rest);
      totalLength += rest.length;
      break;
    }

    // Standalone markers: RST0-RST7, SOI, EOI
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8 || marker === 0xd9) {
      chunks.push(new Uint8Array([0xff, marker]));
      totalLength += 2;
      continue;
    }

    if (offset + 2 > bytes.length) return null;
    const len = (bytes[offset] << 8) | bytes[offset + 1];
    const segment = bytes.subarray(offset - 2, offset + len);
    offset += len;

    // Filter out: APP1-APP15 (0xe1-0xef) and COM (0xfe). Keep APP0 (0xe0 / JFIF).
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) {
      chunks.push(segment);
      totalLength += segment.length;
    }
  }

  if (totalLength < bytes.byteLength) {
    const out = new Uint8Array(totalLength);
    let p = 0;
    for (const c of chunks) {
      out.set(c, p);
      p += c.length;
    }
    return out;
  }
  return null;
}

/**
 * 快速检测 ImageData 中是否存在半透明或全透明像素
 */
function checkHasAlpha(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;
    // 检查 alpha 通道（每 4 字节的第 4 字节）
    for (let i = 3; i < len; i += 4) {
      if (data[i] < 255) {
        return true;
      }
    }
    return false;
  } catch {
    return true; // 无法读取时保守判定为有透明
  }
}

/**
 * 预检 Office 文档内部的媒体资源情况
 */
export function inspectOfficeMedia(inputBytes: Uint8Array): OfficeMediaInfo {
  const files = unzipSync(inputBytes);
  const mediaKeys = Object.keys(files).filter((k) =>
    /^(?:word|ppt|xl)\/media\/[^/]+$/i.test(k)
  );

  let totalImageCount = 0;
  let totalImageBytes = 0;
  const imageBreakdown = { png: 0, jpeg: 0, webp: 0, bmp: 0, other: 0 };

  let videoAudioCount = 0;
  let videoAudioBytes = 0;

  for (const key of mediaKeys) {
    const size = files[key].byteLength;
    if (/\.(png)$/i.test(key)) {
      totalImageCount++;
      totalImageBytes += size;
      imageBreakdown.png++;
    } else if (/\.(jpe?g)$/i.test(key)) {
      totalImageCount++;
      totalImageBytes += size;
      imageBreakdown.jpeg++;
    } else if (/\.(webp)$/i.test(key)) {
      totalImageCount++;
      totalImageBytes += size;
      imageBreakdown.webp++;
    } else if (/\.(bmp|tiff?)$/i.test(key)) {
      totalImageCount++;
      totalImageBytes += size;
      imageBreakdown.bmp++;
    } else if (/\.(gif|svg|ico)$/i.test(key)) {
      totalImageCount++;
      totalImageBytes += size;
      imageBreakdown.other++;
    } else if (/\.(mp4|m4v|mov|avi|wmv|mkv|webm|mp3|wav|m4a|aac|wma|flac)$/i.test(key)) {
      videoAudioCount++;
      videoAudioBytes += size;
    }
  }

  const hasThumbnail = "docProps/thumbnail.jpeg" in files;
  const thumbnailBytes = hasThumbnail ? files["docProps/thumbnail.jpeg"].byteLength : 0;

  return {
    totalImageCount,
    totalImageBytes,
    imageBreakdown,
    videoAudioCount,
    videoAudioBytes,
    hasThumbnail,
    thumbnailBytes,
  };
}

/**
 * 有损压缩与图片转换处理
 */
async function compressImageBytesLossy(
  bytes: Uint8Array,
  filename: string,
  quality: number,
  maxDimension: number,
  convertPngToJpeg: boolean
): Promise<{ newBytes: Uint8Array; newFilename?: string } | null> {
  if (typeof window === "undefined") return null;

  const isJpeg = /\.(jpe?g)$/i.test(filename);
  const isPng = /\.png$/i.test(filename);
  const isWebp = /\.webp$/i.test(filename);
  const isBmp = /\.(bmp|tiff?)$/i.test(filename);

  if (!isJpeg && !isPng && !isWebp && !isBmp) return null;

  try {
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

    // 缩放计算
    let targetWidth = width;
    let targetHeight = height;
    if (maxDimension > 0 && (width > maxDimension || height > maxDimension)) {
      if (width >= height) {
        targetWidth = maxDimension;
        targetHeight = Math.max(1, Math.round((height * maxDimension) / width));
      } else {
        targetHeight = maxDimension;
        targetWidth = Math.max(1, Math.round((width * maxDimension) / height));
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    // 检查透明度（若为 PNG 或 BMP）
    let hasTransparency = false;
    if (isPng || isBmp) {
      ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);
      hasTransparency = checkHasAlpha(ctx, targetWidth, targetHeight);
    }

    let targetMime: string;
    let suggestedExtension: string | undefined;

    if (isJpeg) {
      targetMime = "image/jpeg";
    } else if (isWebp) {
      targetMime = "image/webp";
    } else if (isBmp) {
      if (!hasTransparency) {
        targetMime = "image/jpeg";
        suggestedExtension = ".jpg";
      } else {
        targetMime = "image/png";
        suggestedExtension = ".png";
      }
    } else if (isPng) {
      if (!hasTransparency && convertPngToJpeg) {
        // 无透明通道的 PNG，转为 JPEG 大幅减小体积！
        targetMime = "image/jpeg";
        suggestedExtension = ".jpg";
        // 重新填充白色底色，防止边缘杂色
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);
      } else {
        // 包含透明通道，保持 PNG
        targetMime = "image/png";
      }
    } else {
      targetMime = "image/jpeg";
    }

    if (targetMime !== "image/png" || isBmp || (isPng && !suggestedExtension)) {
      ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);
    }

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, targetMime, quality);
    });

    if (!compressedBlob) return null;

    const compressedBuf = await compressedBlob.arrayBuffer();
    let compressedBytes: Uint8Array = new Uint8Array(compressedBuf);

    // 如果导出的是 PNG，额外用 level 9 无损优化
    if (targetMime === "image/png") {
      const optPng = optimizePngLossless(compressedBytes);
      if (optPng && optPng.byteLength < compressedBytes.byteLength) {
        compressedBytes = optPng;
      }
    }

    if (compressedBytes.byteLength < bytes.byteLength) {
      if (suggestedExtension) {
        const newFilename = filename.replace(/\.[^.]+$/, suggestedExtension);
        return { newBytes: compressedBytes, newFilename };
      }
      return { newBytes: compressedBytes };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 在 Office 文档的全部 .rels 文件中，将旧引用的文件名安全替换为新文件名
 */
function updateDocumentRelationships(
  files: Record<string, Uint8Array>,
  oldFilename: string,
  newFilename: string
) {
  const oldBase = oldFilename.split("/").pop() || oldFilename;
  const newBase = newFilename.split("/").pop() || newFilename;
  if (oldBase === newBase) return;

  const relsKeys = Object.keys(files).filter((k) => k.endsWith(".rels"));
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  for (const relsKey of relsKeys) {
    const text = decoder.decode(files[relsKey]);
    if (text.includes(oldBase)) {
      const updatedText = text.replaceAll(oldBase, newBase);
      files[relsKey] = encoder.encode(updatedText);
    }
  }

  // 确保 [Content_Types].xml 包含新扩展名的 MIME 声明
  const ctKey = "[Content_Types].xml";
  if (files[ctKey]) {
    const ctText = decoder.decode(files[ctKey]);
    const ext = newBase.split(".").pop()?.toLowerCase();
    if (ext && !ctText.includes(`Extension="${ext}"`)) {
      const mime =
        ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "png"
          ? "image/png"
          : ext === "webp"
          ? "image/webp"
          : null;
      if (mime) {
        const insertTag = `<Default Extension="${ext}" ContentType="${mime}"/>`;
        const updatedCt = ctText.replace("</Types>", `${insertTag}</Types>`);
        files[ctKey] = encoder.encode(updatedCt);
      }
    }
  }
}

export async function compressOfficeDocument(
  inputBytes: Uint8Array,
  options: OfficeCompressOptions = {}
): Promise<OfficeCompressResult> {
  const level = (options.level ?? 9) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  const mode = options.mode ?? "lossy";
  const quality = options.imageQuality ?? 0.75;
  const maxDim = options.maxImageDimension ?? 1920;
  const convertPngToJpeg = options.convertPngToJpeg ?? true;
  const stripThumbnail = options.stripThumbnail ?? false;

  const files = unzipSync(inputBytes);

  // 统计嵌入的音视频
  let videoAudioCount = 0;
  let videoAudioBytes = 0;
  for (const key of Object.keys(files)) {
    if (
      /^(?:word|ppt|xl)\/media\/[^/]+\.(mp4|m4v|mov|avi|wmv|mkv|webm|mp3|wav|m4a|aac|wma|flac)$/i.test(
        key
      )
    ) {
      videoAudioCount++;
      videoAudioBytes += files[key].byteLength;
    }
  }

  // 找到需要优化的图片
  const mediaKeys = Object.keys(files).filter((k) =>
    /^(?:word|ppt|xl)\/media\/[^/]+\.(png|jpe?g|webp|bmp|tiff?)$/i.test(k)
  );

  let originalImageBytes = 0;
  let newImageBytes = 0;
  let compressedImageCount = 0;

  if (mode !== "repackOnly") {
    for (let i = 0; i < mediaKeys.length; i++) {
      const key = mediaKeys[i];
      const original = files[key];
      originalImageBytes += original.byteLength;

      options.onProgress?.({
        current: i + 1,
        total: mediaKeys.length,
        filename: key.split("/").pop() || key,
      });

      if (mode === "lossless") {
        // 极致无损模式：100% 原始像素不变
        let optimized: Uint8Array | null = null;
        if (/\.png$/i.test(key)) {
          optimized = optimizePngLossless(original);
        } else if (/\.(jpe?g)$/i.test(key)) {
          optimized = stripJpegMetadata(original);
        }

        if (optimized && optimized.byteLength < original.byteLength) {
          files[key] = optimized;
          newImageBytes += optimized.byteLength;
          compressedImageCount++;
        } else {
          newImageBytes += original.byteLength;
        }
      } else {
        // 有损优化模式
        const result = await compressImageBytesLossy(
          original,
          key,
          quality,
          maxDim,
          convertPngToJpeg
        );

        if (result && result.newBytes.byteLength < original.byteLength) {
          if (result.newFilename && result.newFilename !== key) {
            delete files[key];
            files[result.newFilename] = result.newBytes;
            updateDocumentRelationships(files, key, result.newFilename);
          } else {
            files[key] = result.newBytes;
          }
          newImageBytes += result.newBytes.byteLength;
          compressedImageCount++;
        } else {
          newImageBytes += original.byteLength;
        }
      }
    }
  } else {
    // 仅重打包容器
    for (const key of mediaKeys) {
      originalImageBytes += files[key].byteLength;
      newImageBytes += files[key].byteLength;
    }
  }

  // 清理缩略图
  let savedThumbnailBytes = 0;
  if (stripThumbnail && files["docProps/thumbnail.jpeg"]) {
    savedThumbnailBytes = files["docProps/thumbnail.jpeg"].byteLength;
    delete files["docProps/thumbnail.jpeg"];

    // 从 _rels/.rels 移除关系引用（若有）
    if (files["_rels/.rels"]) {
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      const relsText = decoder.decode(files["_rels/.rels"]);
      const updatedRels = relsText.replace(
        /<Relationship[^>]*Target="docProps\/thumbnail\.jpeg"[^>]*\/>/g,
        ""
      );
      files["_rels/.rels"] = encoder.encode(updatedRels);
    }
  }

  const outputBytes = zipSync(files, { level });

  return {
    outputBytes,
    imageCount: mediaKeys.length,
    compressedImageCount,
    originalImageBytes,
    newImageBytes,
    videoAudioCount,
    videoAudioBytes,
    savedThumbnailBytes,
  };
}
