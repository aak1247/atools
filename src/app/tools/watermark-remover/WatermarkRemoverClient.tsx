"use client";

import type { ChangeEvent, FC } from "react";
import { useEffect, useRef, useState } from "react";

type Method = "classic" | "dip";

const OPENCV_URL = "https://docs.opencv.org/4.9.0/opencv.js";

declare global {
  interface Window {
    cv?: any;
  }
}

type TfModule = typeof import("@tensorflow/tfjs");

const formatSize = (bytes: number | null): string => {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

let opencvPromise: Promise<any> | null = null;

async function loadOpenCv(): Promise<any> {
  if (typeof window === "undefined") {
    throw new Error("仅在浏览器环境中支持 OpenCV");
  }

  if (window.cv && window.cv.Mat) {
    return window.cv;
  }

  if (!opencvPromise) {
    opencvPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${OPENCV_URL}"]`,
      );
      if (existing && window.cv && window.cv.Mat) {
        resolve(window.cv);
        return;
      }

      const script = document.createElement("script");
      script.src = OPENCV_URL;
      script.async = true;
      script.onload = () => {
        const cv = window.cv;
        if (cv && cv.Mat) {
          resolve(cv);
        } else if (cv) {
          cv["onRuntimeInitialized"] = () => resolve(cv);
        } else {
          reject(new Error("OpenCV 加载失败"));
        }
      };
      script.onerror = () => reject(new Error("OpenCV 脚本加载失败"));
      document.body.appendChild(script);
    });
  }

  return opencvPromise;
}

let tfPromise: Promise<TfModule> | null = null;

async function loadTf(): Promise<TfModule> {
  if (tfPromise) return tfPromise;

  tfPromise = (async () => {
    const tf = await import("@tensorflow/tfjs");
    await tf.setBackend("cpu");
    await tf.ready();
    return tf;
  })();

  return tfPromise;
}

async function removeWatermarkClassic(
  file: File,
  threshold: number,
): Promise<Blob> {
  const cv = await loadOpenCv();
  const bitmap = await createImageBitmap(file);

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建画布上下文");
  }
  ctx.drawImage(bitmap, 0, 0);

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const mask = new cv.Mat();
  cv.threshold(gray, mask, threshold, 255, cv.THRESH_BINARY);

  const kernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(3, 3),
  );
  cv.dilate(mask, mask, kernel, new cv.Point(-1, -1), 2);

  const dst = new cv.Mat();
  cv.inpaint(src, mask, dst, 3, cv.INPAINT_NS);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = canvas.width;
  outCanvas.height = canvas.height;
  cv.imshow(outCanvas, dst);

  src.delete();
  gray.delete();
  mask.delete();
  kernel.delete();
  dst.delete();

  return new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("生成结果失败"));
      },
      "image/png",
      1,
    );
  });
}

async function fileToImageData(
  file: File,
  maxSize = 512,
): Promise<{ imageData: ImageData; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const maxDim = Math.max(bitmap.width, bitmap.height);
  const scale = maxDim > maxSize ? maxSize / maxDim : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建画布上下文");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return { imageData, width, height };
}

async function removeWatermarkDip(
  file: File,
  brightnessThreshold: number,
  iterations: number,
): Promise<Blob> {
  const tf = await loadTf();
  const { imageData, width, height } = await fileToImageData(file, 512);

  const target = tf.tidy(() =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    (tf.browser as any)
      .fromPixels(imageData, 3)
      .toFloat()
      .div(255)
      .expandDims(0),
  );

  const maskArray = new Float32Array(width * height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;
    maskArray[i / 4] = brightness >= brightnessThreshold ? 1 : 0;
  }

  const mask = tf.tidy(() =>
    (tf.tensor(maskArray, [1, height, width, 1]) as any).toFloat(),
  );

  // 轻量网络结构
  const model = tf.sequential();
  model.add(
    tf.layers.conv2d({
      filters: 64,
      kernelSize: 3,
      padding: "same",
      activation: "relu",
      inputShape: [height, width, 3],
    }),
  );
  model.add(
    tf.layers.conv2d({
      filters: 64,
      kernelSize: 3,
      padding: "same",
      activation: "relu",
    }),
  );
  model.add(
    tf.layers.conv2d({
      filters: 3,
      kernelSize: 1,
      padding: "same",
      activation: "sigmoid",
    }),
  );

  const input = tf.variable(
    tf.randomNormal([1, height, width, 3], 0, 0.1),
  );
  const optimizer = tf.train.adam(0.01);

  for (let i = 0; i < iterations; i += 1) {
    await optimizer.minimize(() => {
      const output = model.apply(input) as any;
      const diff = tf.mul(mask, tf.sub(output, target));
      const loss = tf.mean(tf.square(diff));
      return loss as any;
    }, true);

    if (i % 5 === 0) {
      // 让浏览器有机会渲染，避免长时间卡顿
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await (tf as any).nextFrame();
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const outputTensor = tf.tidy(() => {
    const output = model.apply(input) as any;
    const squeezed = tf.squeeze(output, [0]) as any;
    const clipped = tf
      .clipByValue(squeezed, 0, 1)
      .mul(255)
      .asType("int32");
    return clipped;
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  await (tf.browser as any).toPixels(outputTensor, canvas);

  tf.dispose([target, mask, input, outputTensor]);
  model.dispose();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("生成结果失败"));
      },
      "image/png",
      1,
    );
  });
}

const WatermarkRemoverClient: FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [resultSize, setResultSize] = useState<number | null>(null);
  const [method, setMethod] = useState<Method>("classic");
  const [threshold, setThreshold] = useState<number>(235);
  const [iterations, setIterations] = useState<number>(40);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cleanupUrls = () => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  };

  const processWithCurrentSettings = async (targetFile: File) => {
    setIsProcessing(true);
    setError(null);
    try {
      let blob: Blob;
      if (method === "classic") {
        blob = await removeWatermarkClassic(targetFile, threshold);
      } else {
        blob = await removeWatermarkDip(
          targetFile,
          threshold,
          iterations,
        );
      }
      setResultSize(blob.size);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "去水印处理失败，请稍后重试",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelected = async (targetFile: File) => {
    if (!targetFile.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    cleanupUrls();
    setFile(targetFile);
    setOriginalSize(targetFile.size);
    const url = URL.createObjectURL(targetFile);
    setOriginalUrl(url);
    await processWithCurrentSettings(targetFile);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) {
      void handleFileSelected(selected);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) {
      void handleFileSelected(selected);
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

  const handleMethodChange = (value: Method) => {
    setMethod(value);
    if (file) {
      void processWithCurrentSettings(file);
    }
  };

  const handleThresholdChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setThreshold(value);
    if (file) {
      void processWithCurrentSettings(file);
    }
  };

  const handleIterationsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setIterations(value);
    if (file && method === "dip") {
      void processWithCurrentSettings(file);
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
          图片去水印工具
        </h1>
        <p className="mt-2 text-slate-500">
          支持传统算法和轻量深度学习双模式，纯前端本地处理，适合文字水印和简单 Logo
          场景。
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
                  d="M9 12l2 2 4-4m-7 9h8a2 2 0 002-2V7a2 2 0 00-2-2h-1.5L14 3.5A1.5 1.5 0 0012.879 3H11.12A1.5 1.5 0 009.999 3.5L8.5 5H7a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-lg font-medium text-slate-700">
              点击或拖拽图片到此处
            </p>
            <p className="mt-1 text-sm text-slate-500">
              建议上传带有文字水印的图片，支持 JPG/PNG/WebP 等格式
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col gap-4 rounded-xl bg-slate-50/80 p-4 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
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
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">处理模式：</span>
                  <div className="inline-flex rounded-full bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => handleMethodChange("classic")}
                      className={`rounded-full px-3 py-1 font-medium ${
                        method === "classic"
                          ? "bg-emerald-500 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      传统算法（推荐）
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMethodChange("dip")}
                      className={`rounded-full px-3 py-1 font-medium ${
                        method === "dip"
                          ? "bg-emerald-500 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      深度图像先验（实验）
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-3 md:max-w-md">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="range"
                      min={210}
                      max={255}
                      step={5}
                      value={threshold}
                      onChange={handleThresholdChange}
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-emerald-500"
                    />
                  </div>
                  <div className="w-28 text-right text-xs text-slate-500">
                    亮度阈值：{" "}
                    <span className="font-semibold text-emerald-600">
                      {threshold}
                    </span>
                  </div>
                </div>
                {method === "dip" && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <input
                        type="range"
                        min={20}
                        max={80}
                        step={10}
                        value={iterations}
                        onChange={handleIterationsChange}
                        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-emerald-500"
                      />
                    </div>
                    <div className="w-28 text-right text-xs text-slate-500">
                      迭代次数：{" "}
                      <span className="font-semibold text-emerald-600">
                        {iterations}
                      </span>
                    </div>
                  </div>
                )}
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

              <div className="group relative overflow-hidden rounded-2xl bg-slate-100 ring-2 ring-emerald-500 ring-offset-2">
                <div className="absolute left-4 top-4 z-10 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white shadow-lg">
                  去水印结果
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
                      alt="去水印结果"
                      className="h-full w-full object-contain p-4"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">
                      暂未生成结果，可尝试调整阈值或切换模式后重新处理
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
                        当前结果已转换为 PNG 格式，体积约为原图的{" "}
                        {((resultSize / originalSize) * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                  {resultUrl && file && (
                    <a
                      href={resultUrl}
                      download={`dewatermark-${file.name.replace(
                        /\.[^.]+$/,
                        "",
                      )}.png`}
                      className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-md transition-transform hover:scale-105 hover:bg-emerald-700 active:scale-95"
                    >
                      下载去水印图片
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-4xl space-y-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-500">
        <p>
          小提示：传统算法模式基于 OpenCV.js 的 inpaint
          算法，对亮度较高、半透明文字水印效果最佳；深度图像先验模式会将图片缩放到最长边约
          512 像素，并通过小型网络自适应修复，耗时更长，适合对结果有更高要求时使用。
        </p>
        <p>
          为获得更好效果，建议在上传前尽量裁剪出包含水印的区域，并根据实际图片适当调整亮度阈值和迭代次数。
        </p>
      </div>
    </div>
  );
};

export default WatermarkRemoverClient;
