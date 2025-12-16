"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Point = { x: number; y: number };
type DragTarget = "a" | "b" | "both" | null;
type Mode = "measure" | "calibrate";

const STORAGE_KEY = "screen-ruler:calibration:v1";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const roundToStep = (value: number, step: number) =>
  step <= 1 ? value : Math.round(value / step) * step;

const formatNumber = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return "-";
  const fixed = value.toFixed(digits);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
};

const readStoredPxPerMm = (): number | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed &&
      "pxPerMm" in parsed &&
      typeof (parsed as { pxPerMm: unknown }).pxPerMm === "number"
    ) {
      const value = (parsed as { pxPerMm: number }).pxPerMm;
      if (Number.isFinite(value) && value > 0) return value;
    }
    return null;
  } catch {
    return null;
  }
};

const storePxPerMm = (pxPerMm: number | null) => {
  try {
    if (pxPerMm == null) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pxPerMm }));
  } catch {
    // ignore
  }
};

function drawRuler(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.fillStyle = "rgba(241, 245, 249, 0.95)";
  ctx.fillRect(0, 0, width, 28);
  ctx.fillRect(0, 0, 28, height);

  ctx.strokeStyle = "rgba(15, 23, 42, 0.12)";
  ctx.beginPath();
  ctx.moveTo(28, 0);
  ctx.lineTo(28, height);
  ctx.moveTo(0, 28);
  ctx.lineTo(width, 28);
  ctx.stroke();

  ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
  ctx.font = "10px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";

  const step = 10;
  const major = 50;

  for (let x = 28; x <= width; x += step) {
    const rel = x - 28;
    const isMajor = rel % major === 0;
    ctx.strokeStyle = isMajor ? "rgba(15, 23, 42, 0.28)" : "rgba(15, 23, 42, 0.18)";
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 28);
    ctx.lineTo(x + 0.5, isMajor ? 8 : 14);
    ctx.stroke();
    if (isMajor) ctx.fillText(String(rel), x + 2, 10);
  }

  for (let y = 28; y <= height; y += step) {
    const rel = y - 28;
    const isMajor = rel % major === 0;
    ctx.strokeStyle = isMajor ? "rgba(15, 23, 42, 0.28)" : "rgba(15, 23, 42, 0.18)";
    ctx.beginPath();
    ctx.moveTo(28, y + 0.5);
    ctx.lineTo(isMajor ? 8 : 14, y + 0.5);
    ctx.stroke();
    if (isMajor) ctx.fillText(String(rel), 2, y + 10);
  }

  ctx.restore();
}

export default function ScreenRulerClient() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<{ a: Point; b: Point }>({
    a: { x: 140, y: 160 },
    b: { x: 520, y: 360 },
  });

  const [mode, setMode] = useState<Mode>("measure");
  const [showGrid, setShowGrid] = useState(true);
  const [showRuler, setShowRuler] = useState(true);
  const [snapStep, setSnapStep] = useState(1);
  const [dragging, setDragging] = useState<DragTarget>(null);

  const [calibrationMm, setCalibrationMm] = useState(85.6);
  const [pxPerMm, setPxPerMm] = useState<number | null>(() => (typeof window === "undefined" ? null : readStoredPxPerMm()));

  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setViewport({
        width: Math.max(0, Math.floor(width)),
        height: Math.max(0, Math.floor(height)),
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const measurement = useMemo(() => {
    const { a, b } = points;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const w = Math.abs(dx);
    const h = Math.abs(dy);
    const d = Math.hypot(dx, dy);
    const mm = pxPerMm ? d / pxPerMm : null;
    const cm = mm != null ? mm / 10 : null;
    const inch = mm != null ? mm / 25.4 : null;
    return { dx, dy, w, h, d, mm, cm, inch };
  }, [points, pxPerMm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = Math.max(0, viewport.width);
    const height = Math.max(0, viewport.height);
    if (width === 0 || height === 0) return;

    const deviceRatio = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
    canvas.width = Math.floor(width * deviceRatio);
    canvas.height = Math.floor(height * deviceRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);

    if (showGrid) {
      ctx.save();
      ctx.translate(28, 28);
      const gridWidth = Math.max(0, width - 28);
      const gridHeight = Math.max(0, height - 28);

      ctx.strokeStyle = "rgba(15, 23, 42, 0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= gridWidth; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, gridHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= gridHeight; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(gridWidth, y + 0.5);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(15, 23, 42, 0.10)";
      for (let x = 0; x <= gridWidth; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, gridHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= gridHeight; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(gridWidth, y + 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (showRuler) drawRuler(ctx, width, height);

    const { a, b } = points;

    ctx.save();
    ctx.translate(28, 28);
    const localA: Point = { x: a.x - 28, y: a.y - 28 };
    const localB: Point = { x: b.x - 28, y: b.y - 28 };

    ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(localA.x, localA.y);
    ctx.lineTo(localB.x, localB.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const left = Math.min(localA.x, localB.x);
    const top = Math.min(localA.y, localB.y);
    const rectW = Math.abs(localB.x - localA.x);
    const rectH = Math.abs(localB.y - localA.y);
    ctx.strokeStyle = "rgba(59, 130, 246, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(left, top, rectW, rectH);

    const drawHandle = (p: Point, label: string) => {
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText(label, p.x + 10, p.y - 10);
    };

    drawHandle(localA, "A");
    drawHandle(localB, "B");
    ctx.restore();
  }, [points, showGrid, showRuler, viewport.height, viewport.width]);

  const toCanvasPoint = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const hitTest = (p: Point) => {
    const { a, b } = points;
    const da = Math.hypot(p.x - a.x, p.y - a.y);
    const db = Math.hypot(p.x - b.x, p.y - b.y);
    const radius = 14;
    if (da <= radius && db <= radius) return "both" as const;
    if (da <= radius) return "a" as const;
    if (db <= radius) return "b" as const;
    return null;
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = toCanvasPoint(event);
    const target = hitTest(p);
    setDragging(target);
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(null);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const p = toCanvasPoint(event);
    const width = Math.max(0, viewport.width);
    const height = Math.max(0, viewport.height);
    if (width === 0 || height === 0) return;

    const bounded: Point = {
      x: clamp(roundToStep(p.x, snapStep), 28, Math.max(28, width - 1)),
      y: clamp(roundToStep(p.y, snapStep), 28, Math.max(28, height - 1)),
    };

    setPoints((prev) => {
      if (dragging === "a") return { ...prev, a: bounded };
      if (dragging === "b") return { ...prev, b: bounded };
      const dx = bounded.x - prev.a.x;
      const dy = bounded.y - prev.a.y;
      return {
        a: bounded,
        b: {
          x: clamp(prev.b.x + dx, 28, Math.max(28, width - 1)),
          y: clamp(prev.b.y + dy, 28, Math.max(28, height - 1)),
        },
      };
    });
  };

  const resetPoints = () => {
    const width = Math.max(0, viewport.width);
    const height = Math.max(0, viewport.height);
    const baseA: Point = { x: 28 + Math.min(140, width - 29), y: 28 + Math.min(160, height - 29) };
    const baseB: Point = { x: 28 + Math.min(520, width - 29), y: 28 + Math.min(360, height - 29) };
    setPoints({ a: baseA, b: baseB });
  };

  const applyCalibration = () => {
    const lengthPx = measurement.d;
    const mm = Math.max(0.1, calibrationMm);
    const next = lengthPx / mm;
    setPxPerMm(next);
    storePxPerMm(next);
  };

  const clearCalibration = () => {
    setPxPerMm(null);
    storePxPerMm(null);
  };

  const toggleFullscreen = async () => {
    const el = hostRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  return (
    <ToolPageLayout toolSlug="screen-ruler">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-2xl bg-slate-100/60 p-1">
              <button
                type="button"
                onClick={() => setMode("measure")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  mode === "measure" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                测量
              </button>
              <button
                type="button"
                onClick={() => setMode("calibrate")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  mode === "calibrate"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                校准
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(e) => setShowGrid(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                网格
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={showRuler}
                  onChange={(e) => setShowRuler(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                刻度尺
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                吸附
                <select
                  value={snapStep}
                  onChange={(e) => setSnapStep(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value={1}>1px</option>
                  <option value={5}>5px</option>
                  <option value={10}>10px</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200"
              >
                {isFullscreen ? "退出全屏" : "全屏"}
              </button>
              <button
                type="button"
                onClick={resetPoints}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200"
              >
                重置
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-3xl bg-white p-3 ring-1 ring-slate-200">
            <div ref={hostRef} className="relative h-[520px] w-full overflow-hidden rounded-2xl bg-white">
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className="h-full w-full touch-none select-none"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">测量结果</div>
              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <div>
                  ΔX：<span className="font-mono">{formatNumber(measurement.dx, 0)} px</span>
                </div>
                <div>
                  ΔY：<span className="font-mono">{formatNumber(measurement.dy, 0)} px</span>
                </div>
                <div>
                  宽：<span className="font-mono">{formatNumber(measurement.w, 0)} px</span>
                </div>
                <div>
                  高：<span className="font-mono">{formatNumber(measurement.h, 0)} px</span>
                </div>
                <div className="sm:col-span-2">
                  距离：<span className="font-mono">{formatNumber(measurement.d, 2)} px</span>
                </div>
                {pxPerMm ? (
                  <div className="sm:col-span-2">
                    换算：{formatNumber(measurement.cm ?? 0, 2)} cm / {formatNumber(measurement.mm ?? 0, 1)} mm /{" "}
                    {formatNumber(measurement.inch ?? 0, 2)} in
                  </div>
                ) : (
                  <div className="sm:col-span-2 text-xs text-slate-500">
                    未校准：当前仅显示像素值；切换到“校准”后可换算厘米/英寸。
                  </div>
                )}
              </div>
              <div className="mt-3 text-xs text-slate-500">
                提示：拖动 A/B 点测量；按住点同时命中可整体移动（A 与 B 重叠时）。
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">校准（可选）</div>
                {pxPerMm && (
                  <button
                    type="button"
                    onClick={clearCalibration}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-100"
                  >
                    清除校准
                  </button>
                )}
              </div>

              <div className="mt-3 text-sm text-slate-700">
                让 A 与 B 的距离对齐一段已知物理长度，然后输入该长度（毫米）并保存。
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  已知长度（mm）
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={calibrationMm}
                    onChange={(e) => setCalibrationMm(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <div className="text-sm text-slate-700">
                  当前距离
                  <div className="mt-2 rounded-2xl bg-white px-4 py-2 ring-1 ring-slate-200">
                    <span className="font-mono">{formatNumber(measurement.d, 2)} px</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={applyCalibration}
                  disabled={mode !== "calibrate" || !Number.isFinite(measurement.d) || measurement.d <= 0}
                  className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  保存校准
                </button>
                {pxPerMm && (
                  <div className="text-xs text-slate-600">
                    当前比例：<span className="font-mono">{formatNumber(pxPerMm, 3)} px/mm</span>
                  </div>
                )}
              </div>

              <div className="mt-3 text-xs text-slate-500">
                建议：用银行卡宽度（85.6mm）或尺子上的 10cm 进行校准；可切换全屏提高准确度。
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
