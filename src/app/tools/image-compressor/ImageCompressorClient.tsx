"use client";

import type { FC, ChangeEvent } from "react";
import { useState, useRef, useEffect } from "react";

const formatSize = (bytes: number | null): string => {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

async function compressImage(file: File, quality: number): Promise<Blob> {
  const imageBitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布上下文");
  ctx.drawImage(imageBitmap, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("压缩失败"))),
      "image/jpeg",
      quality / 100
    );
  });
}

const ImageCompressorClient: FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [quality, setQuality] = useState<number>(80);
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCompress = async (targetFile: File, qualityValue: number) => {
    setIsCompressing(true);
    setError(null);
    try {
      const blob = await compressImage(targetFile, qualityValue);
      setCompressedSize(blob.size);
      const url = URL.createObjectURL(blob);
      setCompressedUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "压缩失败");
    } finally {
      setIsCompressing(false);
    }
  };

  const processFile = async (selected: File) => {
    if (!selected.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    setError(null);
    setFile(selected);
    setOriginalSize(selected.size);
    const url = URL.createObjectURL(selected);
    setOriginalUrl(url);
    await handleCompress(selected, quality);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) processFile(selected);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const selected = e.dataTransfer.files?.[0];
    if (selected) processFile(selected);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleQualityChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setQuality(value);
    if (file) await handleCompress(file, value);
  };

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (compressedUrl) URL.revokeObjectURL(compressedUrl);
    };
  }, [originalUrl, compressedUrl]);

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">图片压缩工具</h1>
        <p className="mt-2 text-slate-500">智能压缩算法 • 隐私安全 • 即刻预览</p>
      </div>

      <div className="glass-card overflow-hidden rounded-3xl p-8 shadow-xl">
        {!file ? (
          <div
            className={`
              relative flex h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300
              ${isDragging ? "border-blue-500 bg-blue-50/50 scale-[1.02]" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/50"}
            `}
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
            <div className="rounded-full bg-blue-50 p-4 mb-4">
              <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-slate-700">点击或拖拽图片到此处</p>
            <p className="mt-1 text-sm text-slate-500">支持 JPG, PNG, WebP 等格式</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Controls */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between rounded-xl bg-slate-50/80 p-6 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setFile(null);
                    setOriginalUrl(null);
                    setCompressedUrl(null);
                  }}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  重新选择
                </button>
                <div className="h-8 w-px bg-slate-200"></div>
                <div className="text-sm">
                  <span className="text-slate-500">当前质量：</span>
                  <span className="font-semibold text-blue-600">{quality}%</span>
                </div>
              </div>
              
              <div className="flex-1 sm:max-w-xs">
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={quality}
                  onChange={handleQualityChange}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600"
                />
              </div>
            </div>

            {/* Preview Area */}
            <div className="grid gap-8 md:grid-cols-2">
              {/* Original */}
              <div className="group relative overflow-hidden rounded-2xl bg-slate-100">
                <div className="absolute left-4 top-4 z-10 rounded-lg bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
                  原图
                </div>
                <div className="aspect-[4/3] w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={originalUrl!} alt="Original" className="h-full w-full object-contain p-4" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-white/90 px-4 py-3 backdrop-blur-sm">
                  <p className="text-sm font-medium text-slate-900">{formatSize(originalSize)}</p>
                </div>
              </div>

              {/* Compressed */}
              <div className="group relative overflow-hidden rounded-2xl bg-slate-100 ring-2 ring-blue-500 ring-offset-2">
                <div className="absolute left-4 top-4 z-10 rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-lg">
                  压缩后
                </div>
                <div className="aspect-[4/3] w-full overflow-hidden">
                  {isCompressing ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={compressedUrl!} alt="Compressed" className="h-full w-full object-contain p-4" />
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-white/90 px-4 py-3 backdrop-blur-sm">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{formatSize(compressedSize)}</p>
                    {originalSize && compressedSize && (
                      <p className="text-xs text-green-600">
                        节省 {((1 - compressedSize / originalSize) * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                  {compressedUrl && (
                    <a
                      href={compressedUrl}
                      download={`compressed-${file.name}`}
                      className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white shadow-md transition-transform hover:scale-105 hover:bg-blue-700 active:scale-95"
                    >
                      下载
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

export default ImageCompressorClient;
