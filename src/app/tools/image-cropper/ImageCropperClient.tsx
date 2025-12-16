"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Rect = { x: number; y: number; w: number; h: number };

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(value)));

const normalizeRect = (rect: Rect) => {
  const x1 = Math.min(rect.x, rect.x + rect.w);
  const y1 = Math.min(rect.y, rect.y + rect.h);
  const x2 = Math.max(rect.x, rect.x + rect.w);
  const y2 = Math.max(rect.y, rect.y + rect.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
};

const MAX_DISPLAY = 900;

export default function ImageCropperClient() {
  const [file, setFile] = useState<File | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<Rect | null>(null); // original pixels

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayRectRef = useRef<Rect | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const rafPendingRef = useRef(false);

  const displaySize = useMemo(() => {
    if (!bitmap) return null;
    const scale = Math.min(1, MAX_DISPLAY / Math.max(bitmap.width, bitmap.height));
    return {
      width: Math.max(1, Math.round(bitmap.width * scale)),
      height: Math.max(1, Math.round(bitmap.height * scale)),
    };
  }, [bitmap]);

  const cleanupResult = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultSize(null);
  };

  const drawBase = () => {
    if (!bitmap || !displaySize) return;
    const canvas = baseCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!canvas || !overlay) return;

    const dpr = window.devicePixelRatio || 1;
    for (const c of [canvas, overlay]) {
      c.style.width = `${displaySize.width}px`;
      c.style.height = `${displaySize.height}px`;
      c.width = Math.max(1, Math.floor(displaySize.width * dpr));
      c.height = Math.max(1, Math.floor(displaySize.height * dpr));
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, displaySize.width, displaySize.height);
    ctx.drawImage(bitmap, 0, 0, displaySize.width, displaySize.height);
  };

  const drawOverlay = (rect: Rect | null) => {
    if (!displaySize) return;
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displaySize.width, displaySize.height);

    if (!rect || rect.w < 1 || rect.h < 1) return;
    const normalized = normalizeRect(rect);
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
    ctx.fillRect(0, 0, displaySize.width, displaySize.height);
    ctx.clearRect(normalized.x, normalized.y, normalized.w, normalized.h);
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.strokeRect(normalized.x + 0.5, normalized.y + 0.5, normalized.w, normalized.h);
    ctx.restore();
  };

  useEffect(() => {
    drawBase();
    drawOverlay(displayRectRef.current);
    return () => {
      if (bitmap) bitmap.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap]);

  useEffect(() => {
    if (!bitmap || !displaySize) return;
    if (!selection) {
      displayRectRef.current = null;
      drawOverlay(null);
      return;
    }
    const scaleX = displaySize.width / bitmap.width;
    const scaleY = displaySize.height / bitmap.height;
    const rect = {
      x: selection.x * scaleX,
      y: selection.y * scaleY,
      w: selection.w * scaleX,
      h: selection.h * scaleY,
    };
    displayRectRef.current = rect;
    drawOverlay(rect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, bitmap, displaySize]);

  const processFile = async (selected: File) => {
    if (!selected.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    setError(null);
    setFile(selected);
    cleanupResult();
    setSelection(null);
    const next = await createImageBitmap(selected);
    setBitmap((prev) => {
      if (prev) prev.close();
      return next;
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) void processFile(selected);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) void processFile(selected);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const toDisplayPoint = (event: React.PointerEvent) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x: Math.max(0, Math.min(rect.width, x)), y: Math.max(0, Math.min(rect.height, y)) };
  };

  const setSelectionFromDisplay = (displayRect: Rect) => {
    if (!bitmap || !displaySize) return;
    const normalized = normalizeRect(displayRect);
    const scaleX = bitmap.width / displaySize.width;
    const scaleY = bitmap.height / displaySize.height;
    const x = clampInt(normalized.x * scaleX, 0, bitmap.width - 1);
    const y = clampInt(normalized.y * scaleY, 0, bitmap.height - 1);
    const w = clampInt(normalized.w * scaleX, 1, bitmap.width - x);
    const h = clampInt(normalized.h * scaleY, 1, bitmap.height - y);
    setSelection({ x, y, w, h });
  };

  const requestSelectionUpdate = (displayRect: Rect) => {
    displayRectRef.current = displayRect;
    drawOverlay(displayRect);
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      if (displayRectRef.current) setSelectionFromDisplay(displayRectRef.current);
    });
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!bitmap || !displaySize) return;
    const point = toDisplayPoint(event);
    if (!point) return;
    cleanupResult();
    setIsSelecting(true);
    dragStartRef.current = point;
    const rect = { x: point.x, y: point.y, w: 0, h: 0 };
    requestSelectionUpdate(rect);
    overlayCanvasRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!isSelecting) return;
    const start = dragStartRef.current;
    const point = toDisplayPoint(event);
    if (!start || !point) return;
    const rect = { x: start.x, y: start.y, w: point.x - start.x, h: point.y - start.y };
    requestSelectionUpdate(rect);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!isSelecting) return;
    setIsSelecting(false);
    dragStartRef.current = null;
    overlayCanvasRef.current?.releasePointerCapture(event.pointerId);
    if (displayRectRef.current) setSelectionFromDisplay(displayRectRef.current);
  };

  const crop = async () => {
    if (!bitmap || !selection || selection.w < 1 || selection.h < 1) {
      setError("请先拖拽选择裁剪区域");
      return;
    }
    setError(null);
    cleanupResult();

    const canvas = document.createElement("canvas");
    canvas.width = selection.w;
    canvas.height = selection.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("无法创建画布上下文");
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      bitmap,
      selection.x,
      selection.y,
      selection.w,
      selection.h,
      0,
      0,
      selection.w,
      selection.h,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png", 1),
    );
    if (!blob) {
      setError("导出失败");
      return;
    }
    setResultSize(blob.size);
    const url = URL.createObjectURL(blob);
    setResultUrl(url);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">图片裁剪工具</h1>
        <p className="mt-2 text-sm text-slate-500">拖拽选择裁剪框，导出 PNG，纯本地运行</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        {!file ? (
          <div
            className={`relative flex h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 ${
              isDragging
                ? "border-blue-500 bg-blue-50/50 scale-[1.01]"
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
            <div className="text-sm font-medium text-slate-700">点击或拖拽图片到此处</div>
            <div className="mt-1 text-xs text-slate-500">支持常见图片格式</div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/80 p-4">
              <div className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">当前图片：</span>
                {file.name}
                {bitmap && (
                  <span className="ml-2 text-xs text-slate-500">
                    {bitmap.width} × {bitmap.height}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setSelection(null);
                  cleanupResult();
                  setError(null);
                  setBitmap((prev) => {
                    if (prev) prev.close();
                    return null;
                  });
                }}
                className="rounded-xl bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
              >
                重新选择
              </button>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">选择裁剪区域</div>
                <div className="mt-4 overflow-auto rounded-2xl bg-slate-50 p-4">
                  <div className="relative inline-block">
                    <canvas ref={baseCanvasRef} className="block rounded-xl shadow-sm" />
                    <canvas
                      ref={overlayCanvasRef}
                      className="absolute left-0 top-0 block cursor-crosshair rounded-xl"
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    />
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  提示：在图片上按下鼠标并拖拽即可绘制裁剪框。
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
                  <div className="text-sm font-semibold text-slate-900">裁剪参数（原图像素）</div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {(["x", "y", "w", "h"] as const).map((key) => (
                      <label key={key} className="block">
                        <div className="text-xs text-slate-500">{key.toUpperCase()}</div>
                        <input
                          type="number"
                          value={selection ? selection[key] : ""}
                          onChange={(e) => {
                            if (!bitmap) return;
                            const next = Number(e.target.value);
                            const current = selection ?? { x: 0, y: 0, w: Math.min(200, bitmap.width), h: Math.min(200, bitmap.height) };
                            const updated = { ...current, [key]: Number.isFinite(next) ? Math.trunc(next) : 0 } as Rect;
                            const x = clampInt(updated.x, 0, bitmap.width - 1);
                            const y = clampInt(updated.y, 0, bitmap.height - 1);
                            const w = clampInt(updated.w, 1, bitmap.width - x);
                            const h = clampInt(updated.h, 1, bitmap.height - y);
                            setSelection({ x, y, w, h });
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={crop}
                      className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-[0.99]"
                    >
                      生成裁剪结果
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        cleanupResult();
                        setSelection(null);
                        displayRectRef.current = null;
                        drawOverlay(null);
                      }}
                      className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.99]"
                    >
                      清空选择
                    </button>
                  </div>
                  {error && <div className="mt-3 text-sm text-rose-600">错误：{error}</div>}
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">裁剪结果</div>
                    {resultUrl && (
                      <a
                        href={resultUrl}
                        download={`cropped-${file.name.replace(/\.[^.]+$/, "")}.png`}
                        className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                      >
                        下载 PNG
                      </a>
                    )}
                  </div>
                  <div className="mt-3 overflow-hidden rounded-2xl bg-slate-50">
                    {resultUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resultUrl} alt="裁剪结果" className="h-64 w-full object-contain p-4" />
                    ) : (
                      <div className="flex h-64 items-center justify-center text-xs text-slate-400">
                        尚未生成结果
                      </div>
                    )}
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    {resultSize ? `文件大小：${resultSize.toLocaleString()} 字节` : "导出格式：PNG"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

