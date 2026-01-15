"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { zip } from "fflate";

type Rect = { x: number; y: number; w: number; h: number };
type CropRegion = { id: string; rect: Rect };
type CropResult = { id: string; url: string; size: number; filename: string };
type Viewport = { zoom: number; panX: number; panY: number };

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(value)));

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeRect = (rect: Rect) => {
  const x1 = Math.min(rect.x, rect.x + rect.w);
  const y1 = Math.min(rect.y, rect.y + rect.h);
  const x2 = Math.max(rect.x, rect.x + rect.w);
  const y2 = Math.max(rect.y, rect.y + rect.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
};

const MAX_DISPLAY = 900;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

export default function ImageCropperClient() {
  const [file, setFile] = useState<File | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [mode, setMode] = useState<"select" | "pan">("select");

  const [selection, setSelection] = useState<Rect | null>(null); // original pixels (current/draft)
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [regions, setRegions] = useState<CropRegion[]>([]);

  const [results, setResults] = useState<CropResult[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [zipSize, setZipSize] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayRectRef = useRef<Rect | null>(null); // view rect during selection
  const dragStartRef = useRef<{ x: number; y: number } | null>(null); // view point during selection
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const rafPendingRef = useRef(false);

  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 });
  const viewportRef = useRef<Viewport>(viewport);
  viewportRef.current = viewport;

  const displaySize = useMemo(() => {
    if (!bitmap) return null;
    const scale = Math.min(1, MAX_DISPLAY / Math.max(bitmap.width, bitmap.height));
    return {
      width: Math.max(1, Math.round(bitmap.width * scale)),
      height: Math.max(1, Math.round(bitmap.height * scale)),
    };
  }, [bitmap]);

  const activeRegion = useMemo(() => {
    if (!activeRegionId) return null;
    return regions.find((r) => r.id === activeRegionId) ?? null;
  }, [regions, activeRegionId]);

  const resultsRef = useRef<CropResult[]>([]);
  const zipUrlRef = useRef<string | null>(null);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    zipUrlRef.current = zipUrl;
  }, [zipUrl]);

  const cleanupResults = () => {
    for (const item of resultsRef.current) URL.revokeObjectURL(item.url);
    resultsRef.current = [];
    setResults([]);
    const currentZip = zipUrlRef.current;
    if (currentZip) URL.revokeObjectURL(currentZip);
    zipUrlRef.current = null;
    setZipUrl(null);
    setZipSize(null);
  };

  useEffect(() => {
    return () => {
      cleanupResults();
    };
  }, []);

  const clampViewport = (next: Viewport) => {
    if (!displaySize) return next;
    const zoom = clampNumber(next.zoom, MIN_ZOOM, MAX_ZOOM);
    const imageW = displaySize.width * zoom;
    const imageH = displaySize.height * zoom;
    const panX =
      imageW <= displaySize.width
        ? (displaySize.width - imageW) / 2
        : clampNumber(next.panX, displaySize.width - imageW, 0);
    const panY =
      imageH <= displaySize.height
        ? (displaySize.height - imageH) / 2
        : clampNumber(next.panY, displaySize.height - imageH, 0);
    return { zoom, panX, panY };
  };

  const updateZoom = (nextZoom: number, anchor: { x: number; y: number } | null) => {
    if (!displaySize) return;
    setViewport((prev) => {
      const zoom = clampNumber(nextZoom, MIN_ZOOM, MAX_ZOOM);
      if (!anchor) return clampViewport({ ...prev, zoom });
      const uX = (anchor.x - prev.panX) / prev.zoom;
      const uY = (anchor.y - prev.panY) / prev.zoom;
      return clampViewport({
        zoom,
        panX: anchor.x - uX * zoom,
        panY: anchor.y - uY * zoom,
      });
    });
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
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, displaySize.width, displaySize.height);
    ctx.save();
    ctx.translate(viewportRef.current.panX, viewportRef.current.panY);
    ctx.scale(viewportRef.current.zoom, viewportRef.current.zoom);
    ctx.drawImage(bitmap, 0, 0, displaySize.width, displaySize.height);
    ctx.restore();
  };

  const originalToViewRect = (rect: Rect): Rect | null => {
    if (!bitmap || !displaySize) return null;
    const scaleX = displaySize.width / bitmap.width;
    const scaleY = displaySize.height / bitmap.height;
    const { zoom, panX, panY } = viewportRef.current;
    return {
      x: rect.x * scaleX * zoom + panX,
      y: rect.y * scaleY * zoom + panY,
      w: rect.w * scaleX * zoom,
      h: rect.h * scaleY * zoom,
    };
  };

  const viewToOriginalRect = (rect: Rect): Rect | null => {
    if (!bitmap || !displaySize) return null;
    const normalized = normalizeRect(rect);
    const { zoom, panX, panY } = viewportRef.current;
    const invScaleX = bitmap.width / displaySize.width;
    const invScaleY = bitmap.height / displaySize.height;

    const x1 = ((normalized.x - panX) / zoom) * invScaleX;
    const y1 = ((normalized.y - panY) / zoom) * invScaleY;
    const x2 = ((normalized.x + normalized.w - panX) / zoom) * invScaleX;
    const y2 = ((normalized.y + normalized.h - panY) / zoom) * invScaleY;

    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const maxX = Math.max(x1, x2);
    const maxY = Math.max(y1, y2);

    if (maxX <= 0 || maxY <= 0 || minX >= bitmap.width || minY >= bitmap.height) return null;

    const clampedX1 = clampNumber(minX, 0, bitmap.width);
    const clampedY1 = clampNumber(minY, 0, bitmap.height);
    const clampedX2 = clampNumber(maxX, 0, bitmap.width);
    const clampedY2 = clampNumber(maxY, 0, bitmap.height);

    const x = clampInt(clampedX1, 0, bitmap.width - 1);
    const y = clampInt(clampedY1, 0, bitmap.height - 1);
    const w = clampInt(clampedX2 - clampedX1, 1, bitmap.width - x);
    const h = clampInt(clampedY2 - clampedY1, 1, bitmap.height - y);
    return { x, y, w, h };
  };

  const drawOverlay = (highlight: Rect | null) => {
    if (!displaySize) return;
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displaySize.width, displaySize.height);

    for (const region of regions) {
      const viewRect = originalToViewRect(region.rect);
      if (!viewRect) continue;
      const normalized = normalizeRect(viewRect);
      if (normalized.w < 1 || normalized.h < 1) continue;
      ctx.save();
      ctx.strokeStyle = region.id === activeRegionId ? "#1d4ed8" : "#2563eb";
      ctx.lineWidth = region.id === activeRegionId ? 2.5 : 1.5;
      ctx.strokeRect(normalized.x + 0.5, normalized.y + 0.5, normalized.w, normalized.h);
      ctx.restore();
    }

    if (!highlight || highlight.w < 1 || highlight.h < 1) return;
    const normalized = normalizeRect(highlight);
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
    ctx.fillRect(0, 0, displaySize.width, displaySize.height);
    ctx.clearRect(normalized.x, normalized.y, normalized.w, normalized.h);
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.strokeRect(normalized.x + 0.5, normalized.y + 0.5, normalized.w, normalized.h);
    ctx.restore();
  };

  useEffect(() => {
    return () => {
      if (bitmap) bitmap.close();
    };
  }, [bitmap]);

  useEffect(() => {
    if (!bitmap || !displaySize) return;
    drawBase();
    const highlight =
      isSelecting && displayRectRef.current
        ? displayRectRef.current
        : selection
          ? originalToViewRect(selection)
          : activeRegion
            ? originalToViewRect(activeRegion.rect)
            : null;
    drawOverlay(highlight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap, displaySize, viewport, selection, regions, activeRegionId, isSelecting]);

  useEffect(() => {
    if (!displaySize) return;
    setViewport((prev) => clampViewport(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySize]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !displaySize) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = clampNumber(event.clientX - rect.left, 0, rect.width);
      const y = clampNumber(event.clientY - rect.top, 0, rect.height);
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      setViewport((prev) => {
        const zoom = clampNumber(prev.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        const uX = (x - prev.panX) / prev.zoom;
        const uY = (y - prev.panY) / prev.zoom;
        return clampViewport({
          zoom,
          panX: x - uX * zoom,
          panY: y - uY * zoom,
        });
      });
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySize]);

  const processFile = async (selected: File) => {
    if (!selected.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    setError(null);
    setFile(selected);
    cleanupResults();
    setSelection(null);
    setActiveRegionId(null);
    setRegions([]);
    setViewport({ zoom: 1, panX: 0, panY: 0 });
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

  const toViewPoint = (event: React.PointerEvent) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x: Math.max(0, Math.min(rect.width, x)), y: Math.max(0, Math.min(rect.height, y)) };
  };

  const requestSelectionUpdate = (viewRect: Rect) => {
    displayRectRef.current = viewRect;
    drawOverlay(viewRect);
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      const current = displayRectRef.current;
      if (!current) return;
      const next = viewToOriginalRect(current);
      setSelection(next);
    });
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!bitmap || !displaySize) return;
    const point = toViewPoint(event);
    if (!point) return;
    cleanupResults();

    const shouldPan = mode === "pan" || event.button === 1 || event.button === 2;
    if (shouldPan) {
      setIsPanning(true);
      panStartRef.current = {
        x: point.x,
        y: point.y,
        panX: viewportRef.current.panX,
        panY: viewportRef.current.panY,
      };
      overlayCanvasRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;

    setIsSelecting(true);
    setActiveRegionId(null);
    dragStartRef.current = point;
    const rect = { x: point.x, y: point.y, w: 0, h: 0 };
    requestSelectionUpdate(rect);
    overlayCanvasRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (isPanning) {
      const start = panStartRef.current;
      const point = toViewPoint(event);
      if (!start || !point) return;
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      setViewport((prev) =>
        clampViewport({ ...prev, panX: start.panX + dx, panY: start.panY + dy }),
      );
      return;
    }

    if (!isSelecting) return;
    const start = dragStartRef.current;
    const point = toViewPoint(event);
    if (!start || !point) return;
    const rect = { x: start.x, y: start.y, w: point.x - start.x, h: point.y - start.y };
    requestSelectionUpdate(rect);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      overlayCanvasRef.current?.releasePointerCapture(event.pointerId);
      return;
    }
    if (!isSelecting) return;
    setIsSelecting(false);
    dragStartRef.current = null;
    overlayCanvasRef.current?.releasePointerCapture(event.pointerId);
    if (displayRectRef.current) {
      const next = viewToOriginalRect(displayRectRef.current);
      setSelection(next);
    }
    displayRectRef.current = null;
  };

  const cropRectToPngBlob = async (rect: Rect) => {
    if (!bitmap) return null;
    const normalized = normalizeRect(rect);
    if (normalized.w < 1 || normalized.h < 1) return null;
    const x = clampInt(normalized.x, 0, bitmap.width - 1);
    const y = clampInt(normalized.y, 0, bitmap.height - 1);
    const w = clampInt(normalized.w, 1, bitmap.width - x);
    const h = clampInt(normalized.h, 1, bitmap.height - y);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
    return blob;
  };

  const exportCurrent = async () => {
    if (!bitmap || !selection || selection.w < 1 || selection.h < 1) {
      setError("请先选择裁剪区域");
      return;
    }
    setError(null);
    cleanupResults();
    const blob = await cropRectToPngBlob(selection);
    if (!blob) {
      setError("导出失败");
      return;
    }
    const url = URL.createObjectURL(blob);
    const baseName = file ? file.name.replace(/\\.[^.]+$/, "") : "image";
    setResults([{ id: createId(), url, size: blob.size, filename: `cropped-${baseName}.png` }]);
  };

  const exportAll = async () => {
    if (!bitmap || regions.length === 0) {
      setError("请先添加至少一个裁剪区域");
      return;
    }
    setError(null);
    cleanupResults();
    const baseName = file ? file.name.replace(/\\.[^.]+$/, "") : "image";
    const nextResults: CropResult[] = [];
    for (let index = 0; index < regions.length; index += 1) {
      const region = regions[index];
      const blob = await cropRectToPngBlob(region.rect);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      nextResults.push({
        id: region.id,
        url,
        size: blob.size,
        filename: `cropped-${baseName}-${index + 1}.png`,
      });
    }
    if (nextResults.length === 0) {
      setError("导出失败");
      return;
    }
    setResults(nextResults);
  };

  const exportZip = async () => {
    if (results.length < 2) return;
    setError(null);
    const currentZip = zipUrlRef.current;
    if (currentZip) URL.revokeObjectURL(currentZip);
    zipUrlRef.current = null;
    setZipUrl(null);
    setZipSize(null);

    const files: Record<string, Uint8Array> = {};
    for (const item of results) {
      const resp = await fetch(item.url);
      const buffer = await resp.arrayBuffer();
      files[item.filename] = new Uint8Array(buffer);
    }

    await new Promise<void>((resolve, reject) => {
      zip(files, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        const zipBytes = new Uint8Array(data.byteLength);
        zipBytes.set(data);
        const blob = new Blob([zipBytes], { type: "application/zip" });
        setZipSize(blob.size);
        const url = URL.createObjectURL(blob);
        zipUrlRef.current = url;
        setZipUrl(url);
        resolve();
      });
    });
  };

  const clearCurrentSelection = () => {
    setSelection(null);
    setActiveRegionId(null);
    displayRectRef.current = null;
    drawOverlay(null);
  };

  const addRegion = () => {
    if (!selection || selection.w < 1 || selection.h < 1) {
      setError("请先选择一个有效区域");
      return;
    }
    setError(null);
    const next: CropRegion = { id: createId(), rect: selection };
    setRegions((prev) => [...prev, next]);
    setSelection(null);
    setActiveRegionId(null);
    displayRectRef.current = null;
  };

  const updateActiveRegion = () => {
    if (!activeRegionId || !selection) return;
    setRegions((prev) => prev.map((r) => (r.id === activeRegionId ? { ...r, rect: selection } : r)));
  };

  const removeRegion = (id: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== id));
    if (activeRegionId === id) {
      setActiveRegionId(null);
      setSelection(null);
    }
  };

  const clearAllRegions = () => {
    setRegions([]);
    setActiveRegionId(null);
    setSelection(null);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearCurrentSelection();
        return;
      }
      if (event.key === "Enter") {
        if (event.isComposing) return;
        if (activeRegionId) updateActiveRegion();
        else addRegion();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (activeRegionId) removeRegion(activeRegionId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRegionId, selection, regions]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">图片裁剪工具</h1>
        <p className="mt-2 text-sm text-slate-500">放大缩小 + 移动视角 + 批量裁剪，纯本地运行</p>
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
                  setError(null);
                  cleanupResults();
                  setActiveRegionId(null);
                  setRegions([]);
                  setViewport({ zoom: 1, panX: 0, panY: 0 });
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">选择裁剪区域</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-xl bg-slate-100 p-1">
                      <button
                        type="button"
                        onClick={() => setMode("select")}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          mode === "select"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-800"
                        }`}
                      >
                        框选
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("pan")}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          mode === "pan"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-800"
                        }`}
                      >
                        移动
                      </button>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => updateZoom(viewport.zoom / 1.2, displaySize ? { x: displaySize.width / 2, y: displaySize.height / 2 } : null)}
                        className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-95"
                        title="缩小"
                      >
                        −
                      </button>
                      <input
                        type="range"
                        min={MIN_ZOOM}
                        max={MAX_ZOOM}
                        step={0.05}
                        value={viewport.zoom}
                        onChange={(e) => updateZoom(Number(e.target.value), null)}
                        className="w-28"
                        aria-label="缩放"
                      />
                      <button
                        type="button"
                        onClick={() => updateZoom(viewport.zoom * 1.2, displaySize ? { x: displaySize.width / 2, y: displaySize.height / 2 } : null)}
                        className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-95"
                        title="放大"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewport({ zoom: 1, panX: 0, panY: 0 })}
                        className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-95"
                        title="重置视角"
                      >
                        适合
                      </button>
                      <div className="text-[11px] font-medium text-slate-600 tabular-nums">
                        {(viewport.zoom * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 overflow-auto rounded-2xl bg-slate-50 p-4">
                  <div className="relative inline-block">
                    <canvas ref={baseCanvasRef} className="block rounded-xl shadow-sm" />
                    <canvas
                      ref={overlayCanvasRef}
                      className={`absolute left-0 top-0 block rounded-xl ${
                        mode === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
                      }`}
                      style={{ touchAction: "none" }}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      onContextMenu={(e) => e.preventDefault()}
                    />
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  提示：滚轮缩放；“框选”模式拖拽选择；“移动”模式拖拽平移。按 Enter 添加区域，按 Esc 取消当前选择。
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">裁剪参数（原图像素）</div>
                    <div className="text-xs text-slate-500">
                      {activeRegion ? "正在编辑：已添加区域" : selection ? "正在编辑：当前选择" : "未选择"}
                    </div>
                  </div>
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
                            if (activeRegionId) {
                              setRegions((prev) =>
                                prev.map((r) =>
                                  r.id === activeRegionId ? { ...r, rect: { x, y, w, h } } : r,
                                ),
                              );
                            }
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void exportCurrent()}
                      className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-[0.99]"
                    >
                      生成当前结果
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportAll()}
                      disabled={regions.length === 0}
                      className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition active:scale-[0.99] ${
                        regions.length === 0
                          ? "cursor-not-allowed bg-slate-100 text-slate-400"
                          : "bg-slate-900 text-white hover:bg-slate-950"
                      }`}
                    >
                      批量生成
                    </button>
                    <button
                      type="button"
                      onClick={addRegion}
                      disabled={!selection}
                      className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition active:scale-[0.99] ${
                        !selection
                          ? "cursor-not-allowed text-slate-400"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      添加区域
                    </button>
                    <button
                      type="button"
                      onClick={updateActiveRegion}
                      disabled={!selection || !activeRegionId}
                      className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition active:scale-[0.99] ${
                        !selection || !activeRegionId
                          ? "cursor-not-allowed text-slate-400"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      更新区域
                    </button>
                    <button
                      type="button"
                      onClick={clearCurrentSelection}
                      className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.99]"
                    >
                      取消当前
                    </button>
                    <button
                      type="button"
                      onClick={cleanupResults}
                      disabled={results.length === 0 && !zipUrl}
                      className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition active:scale-[0.99] ${
                        results.length === 0 && !zipUrl
                          ? "cursor-not-allowed text-slate-400"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      清空结果
                    </button>
                  </div>
                  {error && <div className="mt-3 text-sm text-rose-600">错误：{error}</div>}
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">裁剪区域列表</div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-slate-500">共 {regions.length} 个</div>
                      <button
                        type="button"
                        onClick={clearAllRegions}
                        disabled={regions.length === 0}
                        className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                          regions.length === 0
                            ? "cursor-not-allowed bg-slate-100 text-slate-400"
                            : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                        }`}
                      >
                        清空全部
                      </button>
                    </div>
                  </div>
                  {regions.length === 0 ? (
                    <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">
                      先在画布上框选一个区域，然后点击“添加区域”。
                    </div>
                  ) : (
                    <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
                      {regions.map((region, index) => (
                        <div
                          key={region.id}
                          className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 transition ${
                            region.id === activeRegionId
                              ? "border-blue-300 bg-blue-50/60"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveRegionId(region.id);
                              setSelection(region.rect);
                              displayRectRef.current = null;
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-xs font-semibold text-slate-800">
                              区域 {index + 1}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500 tabular-nums">
                              x={region.rect.x}, y={region.rect.y}, w={region.rect.w}, h={region.rect.h}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRegion(region.id)}
                            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 active:scale-95"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">裁剪结果</div>
                    <div className="flex items-center gap-2">
                      {results.length > 0 && (
                        <div className="text-xs text-slate-500">共 {results.length} 个</div>
                      )}
                      {results.length >= 2 && (
                        <button
                          type="button"
                          onClick={() => void exportZip()}
                          className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                        >
                          生成 ZIP
                        </button>
                      )}
                      {zipUrl && file && (
                        <a
                          href={zipUrl}
                          download={`cropped-${file.name.replace(/\.[^.]+$/, "")}.zip`}
                          className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                        >
                          下载 ZIP
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 overflow-hidden rounded-2xl bg-slate-50">
                    {results.length > 0 ? (
                      <div className="grid gap-3 p-4 sm:grid-cols-2">
                        {results.map((item, index) => (
                          <div
                            key={item.id}
                            className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                              <div className="min-w-0 truncate text-xs font-semibold text-slate-800">
                                结果 {index + 1}
                              </div>
                              <a
                                href={item.url}
                                download={item.filename}
                                className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-800 transition hover:bg-slate-200"
                              >
                                下载
                              </a>
                            </div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.url}
                              alt="裁剪结果"
                              className="h-40 w-full bg-slate-50 object-contain p-2"
                            />
                            <div className="px-3 pb-2 text-[11px] text-slate-500">
                              {item.size.toLocaleString()} 字节
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-64 items-center justify-center text-xs text-slate-400">
                        尚未生成结果
                      </div>
                    )}
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    {zipSize ? `ZIP 大小：${zipSize.toLocaleString()} 字节` : "导出格式：PNG（可批量生成并打包 ZIP）"}
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
