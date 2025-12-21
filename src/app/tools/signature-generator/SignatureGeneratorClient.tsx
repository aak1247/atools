"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { ClipboardCopy, Download, Trash2, Undo2 } from "lucide-react";

type SignaturePoint = {
  x: number; // 0..1
  y: number; // 0..1
  pressure: number; // 0..1
};

type SignatureStroke = {
  points: SignaturePoint[];
  color: string;
  baseWidthPx: number;
  createdCanvasWidthPx: number;
  usePressure: boolean;
};

type CanvasSize = {
  width: number;
  height: number;
};

const DEFAULT_UI = {
  strokeSettings: "签名设置",
  strokeColor: "笔迹颜色",
  strokeWidth: "笔迹粗细",
  usePressure: "启用笔压（手写笔）",
  clear: "清空",
  undo: "撤销",
  export: "导出",
  background: "导出背景",
  transparent: "透明",
  white: "白色",
  autoTrim: "自动裁切空白",
  padding: "留白",
  exportWidth: "导出宽度",
  downloadPng: "下载 PNG",
  copyPng: "复制 PNG",
  preview: "预览",
  initCanvasError: "画布初始化失败。",
  exportFailed: "导出失败，请重试。",
  emptyError: "请先在画布上签名。",
  clipboardNotSupported: "当前浏览器不支持复制图片到剪贴板。",
  hint: "提示：导出透明 PNG 后，可在「PDF 电子盖章」工具中作为印章/签名使用。",
} as const;

type SignatureGeneratorUi = typeof DEFAULT_UI;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const isClipboardImageSupported = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.clipboard?.write === "function" &&
  typeof window !== "undefined" &&
  typeof (window as unknown as { ClipboardItem?: unknown }).ClipboardItem !== "undefined";

function getNormalizedPoint(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const x = rect.width ? (event.clientX - rect.left) / rect.width : 0;
  const y = rect.height ? (event.clientY - rect.top) / rect.height : 0;

  const pressure =
    event.pointerType === "pen"
      ? clamp(event.pressure || 0.5, 0.05, 1)
      : 1;

  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    pressure,
  } satisfies SignaturePoint;
}

function drawStrokeDot(
  ctx: CanvasRenderingContext2D,
  stroke: SignatureStroke,
  point: SignaturePoint,
  canvasSize: CanvasSize,
  widthScale: number,
  offset: { x: number; y: number },
) {
  const x = point.x * canvasSize.width + offset.x;
  const y = point.y * canvasSize.height + offset.y;
  const width = stroke.baseWidthPx * widthScale * (stroke.usePressure ? point.pressure : 1);
  const radius = Math.max(0.5, width / 2);
  ctx.fillStyle = stroke.color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawStrokeSegment(
  ctx: CanvasRenderingContext2D,
  stroke: SignatureStroke,
  prev: SignaturePoint,
  curr: SignaturePoint,
  canvasSize: CanvasSize,
  widthScale: number,
  offset: { x: number; y: number },
) {
  const prevX = prev.x * canvasSize.width + offset.x;
  const prevY = prev.y * canvasSize.height + offset.y;
  const currX = curr.x * canvasSize.width + offset.x;
  const currY = curr.y * canvasSize.height + offset.y;

  const width =
    stroke.baseWidthPx * widthScale * (stroke.usePressure ? curr.pressure : 1);

  ctx.strokeStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(0.5, width);
  ctx.beginPath();
  ctx.moveTo(prevX, prevY);
  ctx.lineTo(currX, currY);
  ctx.stroke();
}

function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: SignatureStroke,
  canvasSize: CanvasSize,
  offset: { x: number; y: number } = { x: 0, y: 0 },
) {
  if (stroke.points.length === 0) return;
  const widthScale = stroke.createdCanvasWidthPx
    ? canvasSize.width / stroke.createdCanvasWidthPx
    : 1;

  drawStrokeDot(ctx, stroke, stroke.points[0], canvasSize, widthScale, offset);
  for (let index = 1; index < stroke.points.length; index++) {
    const prev = stroke.points[index - 1]!;
    const curr = stroke.points[index]!;
    drawStrokeSegment(ctx, stroke, prev, curr, canvasSize, widthScale, offset);
  }
}

function computeStrokeWidthPx(stroke: SignatureStroke, targetWidthPx: number) {
  const widthScale = stroke.createdCanvasWidthPx ? targetWidthPx / stroke.createdCanvasWidthPx : 1;
  return Math.max(0.5, stroke.baseWidthPx * widthScale);
}

function computeSignatureBounds(strokes: SignatureStroke[], canvasSize: CanvasSize) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxStrokeWidth = 0;

  for (const stroke of strokes) {
    maxStrokeWidth = Math.max(maxStrokeWidth, computeStrokeWidthPx(stroke, canvasSize.width));
    for (const point of stroke.points) {
      const x = point.x * canvasSize.width;
      const y = point.y * canvasSize.height;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, minY, maxX, maxY, maxStrokeWidth };
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) throw new Error("Failed to export PNG");
  return blob;
}

export default function SignatureGeneratorClient() {
  const config = useOptionalToolConfig("signature-generator");
  const ui: SignatureGeneratorUi = useMemo(
    () => ({ ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<SignatureGeneratorUi>) }),
    [config?.ui],
  );

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const activeStrokeRef = useRef<SignatureStroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const canvasSizeRef = useRef<CanvasSize>({ width: 0, height: 0 });

  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);

  const [strokeColor, setStrokeColor] = useState("#111827");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [usePressure, setUsePressure] = useState(true);

  const [exportBackground, setExportBackground] = useState<"transparent" | "white">("transparent");
  const [autoTrim, setAutoTrim] = useState(true);
  const [padding, setPadding] = useState(24);
  const [exportWidthPx, setExportWidthPx] = useState(1200);

  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const clipboardSupported = useMemo(() => isClipboardImageSupported(), []);

  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const updateSize = () => {
      const width = Math.max(280, Math.round(wrapper.clientWidth));
      const height = clamp(Math.round(width / 3), 180, 320);
      setCanvasSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };

    updateSize();

    const ro = new ResizeObserver(() => updateSize());
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.max(1, Math.round(canvasSize.width * dpr));
    canvas.height = Math.max(1, Math.round(canvasSize.height * dpr));
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    ctxRef.current = ctx;

    for (const stroke of strokes) {
      renderStroke(ctx, stroke, canvasSize);
    }
  }, [canvasSize, strokes]);

  const clearAll = () => {
    setError(null);
    setStrokes([]);
    const ctx = ctxRef.current;
    const size = canvasSizeRef.current;
    if (ctx && size.width > 0 && size.height > 0) {
      ctx.clearRect(0, 0, size.width, size.height);
    }
  };

  const undo = () => {
    setError(null);
    setStrokes((prev) => prev.slice(0, -1));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    setError(null);
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    if (activePointerIdRef.current !== null) return;

    const size = canvasSizeRef.current;
    if (size.width <= 0 || size.height <= 0) return;

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;

    const stroke: SignatureStroke = {
      points: [],
      color: strokeColor,
      baseWidthPx: strokeWidth,
      createdCanvasWidthPx: size.width,
      usePressure,
    };

    const point = getNormalizedPoint(event, canvas);
    stroke.points.push(point);
    activeStrokeRef.current = stroke;

    drawStrokeDot(ctx, stroke, point, size, 1, { x: 0, y: 0 });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const stroke = activeStrokeRef.current;
    if (!canvas || !ctx || !stroke) return;
    if (activePointerIdRef.current !== event.pointerId) return;

    const size = canvasSizeRef.current;
    if (size.width <= 0 || size.height <= 0) return;

    event.preventDefault();
    const point = getNormalizedPoint(event, canvas);
    const prev = stroke.points[stroke.points.length - 1];
    if (prev) {
      stroke.points.push(point);
      drawStrokeSegment(ctx, stroke, prev, point, size, 1, { x: 0, y: 0 });
    }
  };

  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (activePointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;

    if (stroke && stroke.points.length > 0) {
      setStrokes((prev) => [...prev, stroke]);
    }
  };

  const exportPng = async (mode: "download" | "copy") => {
    setError(null);
    try {
      const canvasRatio =
        canvasSize.width > 0 && canvasSize.height > 0
          ? canvasSize.height / canvasSize.width
          : 1 / 3;

      if (strokes.length === 0) {
        setError(ui.emptyError);
        return;
      }

      const baseWidth = clamp(exportWidthPx, 320, 6000);
      const baseHeight = Math.max(1, Math.round(baseWidth * canvasRatio));
      const baseSize: CanvasSize = { width: baseWidth, height: baseHeight };

      const bounds = computeSignatureBounds(strokes, baseSize);
      if (!bounds) {
        setError(ui.emptyError);
        return;
      }

      const halfStroke = bounds.maxStrokeWidth / 2;
      const pad = clamp(padding, 0, 500);

      const left = autoTrim
        ? Math.floor(clamp(bounds.minX - halfStroke - pad, 0, baseSize.width))
        : 0;
      const top = autoTrim
        ? Math.floor(clamp(bounds.minY - halfStroke - pad, 0, baseSize.height))
        : 0;
      const right = autoTrim
        ? Math.ceil(clamp(bounds.maxX + halfStroke + pad, 0, baseSize.width))
        : baseSize.width;
      const bottom = autoTrim
        ? Math.ceil(clamp(bounds.maxY + halfStroke + pad, 0, baseSize.height))
        : baseSize.height;

      const outWidth = Math.max(1, right - left);
      const outHeight = Math.max(1, bottom - top);

      const outCanvas = document.createElement("canvas");
      outCanvas.width = outWidth;
      outCanvas.height = outHeight;
      const outCtx = outCanvas.getContext("2d");
      if (!outCtx) {
        setError(ui.initCanvasError);
        return;
      }

      if (exportBackground === "white") {
        outCtx.fillStyle = "#ffffff";
        outCtx.fillRect(0, 0, outWidth, outHeight);
      } else {
        outCtx.clearRect(0, 0, outWidth, outHeight);
      }

      const offset = { x: -left, y: -top };
      for (const stroke of strokes) {
        renderStroke(outCtx, stroke, baseSize, offset);
      }

      const blob = await canvasToPngBlob(outCanvas);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });

      if (mode === "download") {
        downloadBlob("signature.png", blob);
        return;
      }

      if (!clipboardSupported) {
        setError(ui.clipboardNotSupported);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ClipboardItemCtor = (window as any).ClipboardItem as any;
      await navigator.clipboard.write([new ClipboardItemCtor({ "image/png": blob })]);
    } catch (err) {
      console.error(err);
      setError(ui.exportFailed);
    }
  };

  return (
    <ToolPageLayout toolSlug="signature-generator" maxWidthClassName="max-w-5xl">
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div
              ref={wrapperRef}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="relative overflow-hidden rounded-xl bg-[linear-gradient(45deg,#eef2ff_25%,transparent_25%,transparent_50%,#eef2ff_50%,#eef2ff_75%,transparent_75%,transparent)] bg-[length:16px_16px]">
                <canvas
                  ref={canvasRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endStroke}
                  onPointerCancel={endStroke}
                  className="block w-full touch-none rounded-xl bg-transparent"
                  aria-label="Signature canvas"
                />
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-500">{ui.hint}</div>
            {error && (
              <div className="mt-2 text-xs text-rose-600" aria-live="polite">
                {error}
              </div>
            )}
          </div>

          <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">{ui.strokeSettings}</div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  {ui.strokeColor}
                  <input
                    type="color"
                    value={strokeColor}
                    onChange={(e) => setStrokeColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                  />
                </label>

                <label className="flex flex-1 items-center gap-3 text-sm text-slate-700">
                  <input
                    type="range"
                    min={1}
                    max={16}
                    step={1}
                    value={strokeWidth}
                    onChange={(e) => setStrokeWidth(Number(e.target.value))}
                    className="w-full"
                  />
                  <span className="w-10 text-right tabular-nums text-slate-600">
                    {strokeWidth}px
                  </span>
                </label>
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={usePressure}
                  onChange={(e) => setUsePressure(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {ui.usePressure}
              </label>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={undo}
                  disabled={strokes.length === 0}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60 active:scale-[0.99]"
                >
                  <Undo2 className="h-4 w-4" />
                  {ui.undo}
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={strokes.length === 0}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60 active:scale-[0.99]"
                >
                  <Trash2 className="h-4 w-4" />
                  {ui.clear}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">{ui.export}</div>

              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <div className="mb-2">{ui.background}</div>
                  <select
                    value={exportBackground}
                    onChange={(e) =>
                      setExportBackground(e.target.value === "white" ? "white" : "transparent")
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value="transparent">{ui.transparent}</option>
                    <option value="white">{ui.white}</option>
                  </select>
                </label>

                <label className="text-sm text-slate-700">
                  <div className="mb-2">{ui.exportWidth}</div>
                  <select
                    value={exportWidthPx}
                    onChange={(e) => setExportWidthPx(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value={800}>800px</option>
                    <option value={1200}>1200px</option>
                    <option value={1600}>1600px</option>
                    <option value={2400}>2400px</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoTrim}
                    onChange={(e) => setAutoTrim(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {ui.autoTrim}
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  {ui.padding}
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={padding}
                    onChange={(e) => setPadding(Number(e.target.value) || 0)}
                    className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                  <span className="text-xs text-slate-500">px</span>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportPng("download")}
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-[0.99]"
                >
                  <Download className="h-4 w-4" />
                  {ui.downloadPng}
                </button>

                <button
                  type="button"
                  onClick={() => exportPng("copy")}
                  disabled={!clipboardSupported}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60 active:scale-[0.99]"
                >
                  <ClipboardCopy className="h-4 w-4" />
                  {ui.copyPng}
                </button>
              </div>

              {previewUrl && (
                <div className="mt-5">
                  <div className="mb-2 text-sm font-semibold text-slate-900">{ui.preview}</div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Signature preview"
                      className="max-h-32 max-w-full"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
