import jsQR from "jsqr";

export type QrPoint = { x: number; y: number };

export type QrDecodeLocation = {
  topLeftCorner: QrPoint;
  topRightCorner: QrPoint;
  bottomRightCorner: QrPoint;
  bottomLeftCorner: QrPoint;
};

export type QrDecodeResult =
  | {
      ok: true;
      data: string;
      format?: string;
      ecLevel?: string;
      engine?: "jsqr" | "zxing";
      pipeline?: string;
      location: QrDecodeLocation;
    }
  | {
      ok: false;
      error: string;
    };

export type InversionAttempts = "attemptBoth" | "dontInvert" | "onlyInvert" | "invertFirst";

export interface QrDecodeOptions {
  inversionAttempts?: InversionAttempts;
  maxDimension?: number;
}

/**
 * Compute Otsu's optimal threshold for grayscale image data
 */
function computeOtsuThreshold(gray: Float32Array): number {
  const hist = new Int32Array(256);
  const total = gray.length;
  for (let i = 0; i < total; i++) {
    hist[Math.min(255, Math.max(0, Math.round(gray[i])))]++;
  }

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const betweenVar = wB * wF * (mB - mF) * (mB - mF);

    if (betweenVar > maxVar) {
      maxVar = betweenVar;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Perform adaptive thresholding on grayscale buffer
 */
function applyAdaptiveThreshold(
  gray: Float32Array,
  width: number,
  height: number,
  blockSize: number,
  C: number
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(width * height * 4);
  const half = Math.floor(blockSize / 2);

  // Compute 2D Integral Image for fast local box filter O(1)
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const rowOffset = y * width;
    const intOffset = (y + 1) * (width + 1);
    const prevIntOffset = y * (width + 1);
    for (let x = 0; x < width; x++) {
      rowSum += gray[rowOffset + x];
      integral[intOffset + x + 1] = integral[prevIntOffset + x + 1] + rowSum;
    }
  }

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height - 1, y + half);
    const rowOffset = y * width;

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);

      // Box sum from integral
      const a = integral[y0 * (width + 1) + x0];
      const b = integral[y0 * (width + 1) + (x1 + 1)];
      const c = integral[(y1 + 1) * (width + 1) + x0];
      const d = integral[(y1 + 1) * (width + 1) + (x1 + 1)];
      const sumRegion = d - b - c + a;
      const mean = sumRegion / count;

      const val = gray[rowOffset + x] <= mean - C ? 0 : 255;
      const outIdx = (rowOffset + x) * 4;
      output[outIdx] = val;
      output[outIdx + 1] = val;
      output[outIdx + 2] = val;
      output[outIdx + 3] = 255;
    }
  }

  return output;
}

/**
 * Universal multi-stage QR decoder engine
 * Works in all modern browsers without server round-trip
 */
export async function decodeQrImage(
  source: ImageBitmap | HTMLImageElement | HTMLCanvasElement,
  options: QrDecodeOptions = {}
): Promise<QrDecodeResult> {
  const maxDim = options.maxDimension ?? 2000;
  const inversion = options.inversionAttempts ?? "attemptBoth";

  const srcWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcHeight = "naturalHeight" in source ? source.naturalHeight : source.height;

  if (!srcWidth || !srcHeight) {
    return { ok: false, error: "图片尺寸无效" };
  }

  // Helper to safely create an offscreen canvas
  const createCanvas = (w: number, h: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return { canvas, ctx };
  };

  // --- STAGE 1: Standard Scale Pass (jsQR) ---
  const standardScale = Math.min(1, maxDim / Math.max(srcWidth, srcHeight));
  const stdW = Math.max(1, Math.round(srcWidth * standardScale));
  const stdH = Math.max(1, Math.round(srcHeight * standardScale));

  const { ctx: stdCtx } = createCanvas(stdW, stdH);
  if (!stdCtx) {
    return { ok: false, error: "无法创建画布上下文" };
  }

  stdCtx.imageSmoothingEnabled = true;
  stdCtx.imageSmoothingQuality = "high";
  stdCtx.drawImage(source, 0, 0, stdW, stdH);
  const stdImgData = stdCtx.getImageData(0, 0, stdW, stdH);

  // Fast jsQR check
  const fastQr = jsQR(stdImgData.data, stdW, stdH, { inversionAttempts: inversion });
  if (fastQr?.data) {
    const invScale = 1 / standardScale;
    return {
      ok: true,
      data: fastQr.data,
      engine: "jsqr",
      pipeline: "standard-jsqr",
      location: {
        topLeftCorner: { x: fastQr.location.topLeftCorner.x * invScale, y: fastQr.location.topLeftCorner.y * invScale },
        topRightCorner: { x: fastQr.location.topRightCorner.x * invScale, y: fastQr.location.topRightCorner.y * invScale },
        bottomRightCorner: { x: fastQr.location.bottomRightCorner.x * invScale, y: fastQr.location.bottomRightCorner.y * invScale },
        bottomLeftCorner: { x: fastQr.location.bottomLeftCorner.x * invScale, y: fastQr.location.bottomLeftCorner.y * invScale },
      },
    };
  }

  // --- STAGE 2: ZXing-WASM Direct Pass ---
  let zxingWasmReader: typeof import("zxing-wasm/reader") | null = null;
  try {
    zxingWasmReader = await import("zxing-wasm/reader");
  } catch (err) {
    console.warn("Failed to load zxing-wasm reader", err);
  }

  if (zxingWasmReader) {
    const directResults = await zxingWasmReader.readBarcodesFromImageData(stdImgData, {
      formats: ["QRCode"],
      tryHarder: true,
      tryRotate: true,
      tryInvert: inversion === "attemptBoth" || inversion === "onlyInvert" || inversion === "invertFirst",
    });

    if (directResults.length > 0 && directResults[0].text) {
      const b = directResults[0];
      const invScale = 1 / standardScale;
      return {
        ok: true,
        data: b.text,
        format: b.format,
        ecLevel: b.ecLevel,
        engine: "zxing",
        pipeline: "zxing-direct",
        location: {
          topLeftCorner: { x: b.position.topLeft.x * invScale, y: b.position.topLeft.y * invScale },
          topRightCorner: { x: b.position.topRight.x * invScale, y: b.position.topRight.y * invScale },
          bottomRightCorner: { x: b.position.bottomRight.x * invScale, y: b.position.bottomRight.y * invScale },
          bottomLeftCorner: { x: b.position.bottomLeft.x * invScale, y: b.position.bottomLeft.y * invScale },
        },
      };
    }
  }

  // --- STAGE 3: Advanced Super-Sampling & Binarization Preprocessing ---
  // Ideal for low-resolution, blurry, low-contrast, or masked QR codes
  if (zxingWasmReader) {
    // Generate scaling candidates (e.g. 2x, 3x, 4x depending on original resolution)
    const scaleFactors: number[] = [];
    const minDim = Math.min(srcWidth, srcHeight);
    if (minDim < 200) {
      scaleFactors.push(3, 4, 2);
    } else if (minDim < 400) {
      scaleFactors.push(2, 3);
    } else {
      scaleFactors.push(1.5, 2);
    }

    for (const scale of scaleFactors) {
      const targetW = Math.max(1, Math.round(srcWidth * scale));
      const targetH = Math.max(1, Math.round(srcHeight * scale));
      if (targetW > 2400 || targetH > 2400) continue;

      const { ctx: procCtx } = createCanvas(targetW, targetH);
      if (!procCtx) continue;

      procCtx.imageSmoothingEnabled = true;
      procCtx.imageSmoothingQuality = "high";
      procCtx.drawImage(source, 0, 0, targetW, targetH);

      const procImgData = procCtx.getImageData(0, 0, targetW, targetH);
      const data = procImgData.data;
      const numPixels = targetW * targetH;
      const gray = new Float32Array(numPixels);

      for (let i = 0; i < numPixels; i++) {
        const px = i * 4;
        gray[i] = 0.299 * data[px] + 0.587 * data[px + 1] + 0.114 * data[px + 2];
      }

      // 3.1 Otsu Global Thresholding
      const otsuThresh = computeOtsuThreshold(gray);
      for (let i = 0; i < numPixels; i++) {
        const v = gray[i] > otsuThresh ? 255 : 0;
        const px = i * 4;
        data[px] = v;
        data[px + 1] = v;
        data[px + 2] = v;
        data[px + 3] = 255;
      }

      const otsuResults = await zxingWasmReader.readBarcodesFromImageData(
        procImgData,
        { formats: ["QRCode"], tryHarder: true, tryRotate: true, tryInvert: true }
      );

      if (otsuResults.length > 0 && otsuResults[0].text) {
        const b = otsuResults[0];
        const invScale = 1 / scale;
        return {
          ok: true,
          data: b.text,
          format: b.format,
          ecLevel: b.ecLevel,
          engine: "zxing",
          pipeline: `enhanced-otsu-${scale}x`,
          location: {
            topLeftCorner: { x: b.position.topLeft.x * invScale, y: b.position.topLeft.y * invScale },
            topRightCorner: { x: b.position.topRight.x * invScale, y: b.position.topRight.y * invScale },
            bottomRightCorner: { x: b.position.bottomRight.x * invScale, y: b.position.bottomRight.y * invScale },
            bottomLeftCorner: { x: b.position.bottomLeft.x * invScale, y: b.position.bottomLeft.y * invScale },
          },
        };
      }

      // 3.2 Adaptive Local Thresholding
      for (const blockSize of [25, 45]) {
        for (const C of [5, 10]) {
          const adaptData = applyAdaptiveThreshold(gray, targetW, targetH, blockSize, C);
          for (let i = 0; i < data.length; i++) {
            data[i] = adaptData[i];
          }

          const adaptResults = await zxingWasmReader.readBarcodesFromImageData(
            procImgData,
            { formats: ["QRCode"], tryHarder: true, tryRotate: true, tryInvert: true }
          );

          if (adaptResults.length > 0 && adaptResults[0].text) {
            const b = adaptResults[0];
            const invScale = 1 / scale;
            return {
              ok: true,
              data: b.text,
              format: b.format,
              ecLevel: b.ecLevel,
              engine: "zxing",
              pipeline: `enhanced-adaptive-${scale}x`,
              location: {
                topLeftCorner: { x: b.position.topLeft.x * invScale, y: b.position.topLeft.y * invScale },
                topRightCorner: { x: b.position.topRight.x * invScale, y: b.position.topRight.y * invScale },
                bottomRightCorner: { x: b.position.bottomRight.x * invScale, y: b.position.bottomRight.y * invScale },
                bottomLeftCorner: { x: b.position.bottomLeft.x * invScale, y: b.position.bottomLeft.y * invScale },
              },
            };
          }
        }
      }
    }
  }

  return { ok: false, error: "未识别到二维码" };
}
