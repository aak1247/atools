// 图片编辑模型：旋转 / 裁剪 / 缩放（等比例或单方向）。
// 坐标约定：crop 始终定义在"旋转后"的原图坐标系中（即用户看到的方向），
// scaleX/scaleY 在裁剪之后生效，因此旋转 90° 的奇数倍时两者需要互换。

export type Rotation = 0 | 90 | 180 | 270;

export type Rect = { x: number; y: number; w: number; h: number };

export type ImageEdit = {
  rotation: Rotation;
  crop: Rect | null;
  scaleX: number;
  scaleY: number;
};

export const IDENTITY_EDIT: ImageEdit = { rotation: 0, crop: null, scaleX: 1, scaleY: 1 };

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 4;
export const MAX_BAKE_EDGE = 8192;

export const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const isIdentityEdit = (edit: ImageEdit) =>
  edit.rotation === 0 &&
  edit.crop === null &&
  Math.abs(edit.scaleX - 1) < 1e-6 &&
  Math.abs(edit.scaleY - 1) < 1e-6;

/** 单边缩放上限：避免烘焙出超大画布 */
export const maxScaleForEdge = (edgePx: number) => {
  if (!Number.isFinite(edgePx) || edgePx <= 0) return MAX_SCALE;
  return Math.min(MAX_SCALE, MAX_BAKE_EDGE / edgePx);
};

export const rotatedDims = (width: number, height: number, rotation: Rotation) =>
  rotation % 180 === 0 ? { w: width, h: height } : { w: height, h: width };

export const clampRectTo = (rect: Rect, boundW: number, boundH: number): Rect => {
  const w = clampNumber(Math.round(rect.w), 1, Math.round(boundW));
  const h = clampNumber(Math.round(rect.h), 1, Math.round(boundH));
  const x = clampNumber(Math.round(rect.x), 0, Math.round(boundW) - w);
  const y = clampNumber(Math.round(rect.y), 0, Math.round(boundH) - h);
  return { x, y, w, h };
};

/** 旋转 90° 后裁剪框随内容一起变换。dir=1 顺时针，dir=-1 逆时针。 */
export const rotateCropRect = (
  crop: Rect,
  rotatedW: number,
  rotatedH: number,
  dir: 1 | -1,
): Rect => {
  if (dir === 1) {
    // 顺时针：上边条 → 右边条
    return {
      x: rotatedH - crop.y - crop.h,
      y: crop.x,
      w: crop.h,
      h: crop.w,
    };
  }
  // 逆时针：右边条 → 上边条
  return {
    x: crop.y,
    y: rotatedW - crop.x - crop.w,
    w: crop.h,
    h: crop.w,
  };
};

export const effectiveCrop = (edit: ImageEdit, naturalW: number, naturalH: number): Rect => {
  const { w, h } = rotatedDims(naturalW, naturalH, edit.rotation);
  if (!edit.crop) return { x: 0, y: 0, w, h };
  return clampRectTo(edit.crop, w, h);
};

export const outputSize = (edit: ImageEdit, naturalW: number, naturalH: number) => {
  const crop = effectiveCrop(edit, naturalW, naturalH);
  return {
    w: Math.max(1, Math.round(crop.w * edit.scaleX)),
    h: Math.max(1, Math.round(crop.h * edit.scaleY)),
  };
};

/**
 * 把"旋转 + 裁剪"后的区域绘制到目标画布。
 * destW/destH 是最终输出像素（含缩放），view 是旋转坐标系中要显示的区域。
 */
export const drawEditedImage = (
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  naturalW: number,
  naturalH: number,
  edit: ImageEdit,
  view: Rect,
  destW: number,
  destH: number,
  background?: string,
) => {
  if (background) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, destW, destH);
  }
  const kx = destW / view.w;
  const ky = destH / view.h;
  ctx.setTransform(kx, 0, 0, ky, -view.x * kx, -view.y * ky);
  const { w: rw, h: rh } = rotatedDims(naturalW, naturalH, edit.rotation);
  if (edit.rotation === 90) {
    ctx.translate(rw, 0);
    ctx.rotate(Math.PI / 2);
  } else if (edit.rotation === 180) {
    ctx.translate(rw, rh);
    ctx.rotate(Math.PI);
  } else if (edit.rotation === 270) {
    ctx.translate(0, rh);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0);
};

/** 显式按 EXIF 方向解码，保证与系统相册/预览显示一致 */
export const loadBitmap = (file: File): Promise<ImageBitmap> =>
  createImageBitmap(file, { imageOrientation: "from-image" });

/**
 * 解析 JPEG EXIF Orientation（0x0112）。无 EXIF 或解析失败返回 1。
 * 仅用于判断是否需要重新编码；实际方向由 loadBitmap 应用。
 */
export const parseJpegOrientation = (bytes: Uint8Array): number => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return 1;
    const marker = view.getUint8(offset + 1);
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const size = view.getUint16(offset + 2);
    if (size < 2) return 1;
    if (marker === 0xe1) {
      const tiff = offset + 10;
      // APP1 载荷结构：size(2) + "Exif\0\0"(6) + TIFF 头
      if (
        tiff + 8 > view.byteLength ||
        view.getUint32(offset + 4) !== 0x45786966 || // "Exif"
        view.getUint16(offset + 8) !== 0
      ) {
        return 1;
      }
      const little = view.getUint16(tiff, false) === 0x4949;
      if (view.getUint16(tiff + 2, little) !== 0x2a) return 1;
      const ifd0 = tiff + view.getUint32(tiff + 4, little);
      if (ifd0 + 2 > view.byteLength) return 1;
      const entryCount = view.getUint16(ifd0, little);
      for (let i = 0; i < entryCount; i += 1) {
        const entry = ifd0 + 2 + i * 12;
        if (entry + 12 > view.byteLength) return 1;
        if (view.getUint16(entry, little) === 0x0112) {
          const orientation = view.getUint16(entry + 8, little);
          return orientation >= 1 && orientation <= 8 ? orientation : 1;
        }
      }
      return 1;
    }
    offset += 2 + size;
  }
  return 1;
};

export type BakeFormat = "png" | "jpeg";

export type BakeResult = {
  bytes: Uint8Array;
  width: number;
  height: number;
  format: BakeFormat;
};

const canvasToBytes = (canvas: HTMLCanvasElement, format: BakeFormat, quality?: number) =>
  new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode image"));
          return;
        }
        void blob
          .arrayBuffer()
          .then((buffer) => resolve(new Uint8Array(buffer)))
          .catch(reject);
      },
      format === "jpeg" ? "image/jpeg" : "image/png",
      quality,
    );
  });

/**
 * 按编辑参数把文件烘焙为 PNG/JPEG 字节。
 * JPEG 会先铺 background（避免透明区域变黑）。
 */
export const bakeImageToBytes = async (
  file: File,
  edit: ImageEdit,
  options: { format?: BakeFormat; quality?: number; maxEdge?: number; background?: string } = {},
): Promise<BakeResult> => {
  const bitmap = await loadBitmap(file);
  try {
    const format = options.format ?? "png";
    const crop = effectiveCrop(edit, bitmap.width, bitmap.height);
    const out = outputSize(edit, bitmap.width, bitmap.height);
    const k = options.maxEdge ? Math.min(1, options.maxEdge / Math.max(out.w, out.h)) : 1;
    const destW = Math.max(1, Math.round(out.w * k));
    const destH = Math.max(1, Math.round(out.h * k));
    const canvas = document.createElement("canvas");
    canvas.width = destW;
    canvas.height = destH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    drawEditedImage(
      ctx,
      bitmap,
      bitmap.width,
      bitmap.height,
      edit,
      crop,
      destW,
      destH,
      format === "jpeg" ? (options.background ?? "#FFFFFF") : options.background,
    );
    const bytes = await canvasToBytes(canvas, format, options.quality);
    return { bytes, width: out.w, height: out.h, format };
  } finally {
    bitmap.close();
  }
};

/** 用已解码的 bitmap 生成页面预览图 dataURL（JPEG，白底） */
export const bakePreviewFromBitmap = (
  bitmap: ImageBitmap,
  edit: ImageEdit,
  maxEdge: number,
): string => {
  const crop = effectiveCrop(edit, bitmap.width, bitmap.height);
  const out = outputSize(edit, bitmap.width, bitmap.height);
  const k = Math.min(1, maxEdge / Math.max(out.w, out.h));
  const destW = Math.max(1, Math.round(out.w * k));
  const destH = Math.max(1, Math.round(out.h * k));
  const canvas = document.createElement("canvas");
  canvas.width = destW;
  canvas.height = destH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  drawEditedImage(ctx, bitmap, bitmap.width, bitmap.height, edit, crop, destW, destH, "#FFFFFF");
  return canvas.toDataURL("image/jpeg", 0.85);
};
