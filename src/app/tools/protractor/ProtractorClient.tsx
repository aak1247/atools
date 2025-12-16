"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type DragTarget = "a" | "b" | null;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const normalizeAngleRad = (value: number): number => {
  const twoPi = Math.PI * 2;
  const mod = value % twoPi;
  return mod < 0 ? mod + twoPi : mod;
};

const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

const formatDeg = (deg: number): string => {
  if (!Number.isFinite(deg)) return "-";
  return `${deg.toFixed(2)}°`;
};

export default function ProtractorClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);

  const [angleA, setAngleA] = useState(() => (20 * Math.PI) / 180);
  const [angleB, setAngleB] = useState(() => (120 * Math.PI) / 180);
  const [radiusRatio, setRadiusRatio] = useState(0.85);

  const normalized = useMemo(() => {
    const a = normalizeAngleRad(angleA);
    const b = normalizeAngleRad(angleB);
    const diff = normalizeAngleRad(b - a);
    const small = diff > Math.PI ? Math.PI * 2 - diff : diff;
    return {
      a,
      b,
      diff,
      small,
      smallDeg: radToDeg(small),
      reflexDeg: radToDeg(Math.PI * 2 - small),
    };
  }, [angleA, angleB]);

  const onPointerDownHandle =
    (target: DragTarget) => (event: ReactPointerEvent<SVGCircleElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragTarget(target);
  };

  const updateAngleFromPointer = (event: PointerEvent) => {
    if (!dragTarget) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    if (dx === 0 && dy === 0) return;

    const next = Math.atan2(dy, dx);
    const normalizedNext = normalizeAngleRad(next);
    if (dragTarget === "a") setAngleA(normalizedNext);
    if (dragTarget === "b") setAngleB(normalizedNext);
  };

  useEffect(() => {
    if (!dragTarget) return;

    const onMove = (event: PointerEvent) => {
      updateAngleFromPointer(event);
    };
    const onUp = () => setDragTarget(null);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragTarget]);

  const copy = async () => {
    await navigator.clipboard.writeText(normalized.smallDeg.toFixed(2));
  };

  const size = 520;
  const viewBox = `0 0 ${size} ${size}`;
  const center = size / 2;
  const radius = (size / 2) * clamp01(radiusRatio);

  const point = (angle: number) => ({
    x: center + Math.cos(angle) * radius,
    y: center + Math.sin(angle) * radius,
  });

  const a = point(normalized.a);
  const b = point(normalized.b);

  const arc = useMemo(() => {
    const start = normalized.a;
    const end = normalizeAngleRad(normalized.a + normalized.small);
    const p1 = point(start);
    const p2 = point(end);
    const largeArcFlag = normalized.small > Math.PI ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized.a, normalized.small, radius]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">量角器</h1>
        <p className="mt-2 text-sm text-slate-500">拖动两条射线的端点，测量夹角（0–180°）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div
              ref={containerRef}
              className="relative mx-auto aspect-square w-full max-w-[560px] rounded-3xl bg-white ring-1 ring-slate-200 overflow-hidden select-none"
            >
              <svg viewBox={viewBox} className="h-full w-full">
                <defs>
                  <radialGradient id="protractor-bg" cx="50%" cy="50%" r="55%">
                    <stop offset="0%" stopColor="#f8fafc" />
                    <stop offset="100%" stopColor="#eef2ff" />
                  </radialGradient>
                </defs>

                <rect x="0" y="0" width={size} height={size} fill="url(#protractor-bg)" />

                {/* outer ring */}
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="10"
                />

                {/* ticks */}
                {Array.from({ length: 72 }).map((_, i) => {
                  const deg = i * 5;
                  const ang = (deg * Math.PI) / 180;
                  const inner = radius - (deg % 30 === 0 ? 26 : deg % 10 === 0 ? 18 : 12);
                  const x1 = center + Math.cos(ang) * inner;
                  const y1 = center + Math.sin(ang) * inner;
                  const x2 = center + Math.cos(ang) * radius;
                  const y2 = center + Math.sin(ang) * radius;
                  return (
                    <line
                      key={deg}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={deg % 30 === 0 ? "#94a3b8" : "#cbd5e1"}
                      strokeWidth={deg % 30 === 0 ? 3 : 2}
                      strokeLinecap="round"
                    />
                  );
                })}

                {/* arc for measured angle */}
                <path d={arc} fill="none" stroke="#10b981" strokeWidth="10" strokeLinecap="round" />

                {/* rays */}
                <line x1={center} y1={center} x2={a.x} y2={a.y} stroke="#0f172a" strokeWidth="5" strokeLinecap="round" />
                <line x1={center} y1={center} x2={b.x} y2={b.y} stroke="#0f172a" strokeWidth="5" strokeLinecap="round" />

                {/* center */}
                <circle cx={center} cy={center} r="8" fill="#0f172a" />

                {/* handles */}
                <g>
                  <circle cx={a.x} cy={a.y} r="14" fill="#fff" stroke="#0f172a" strokeWidth="3" />
                  <circle cx={b.x} cy={b.y} r="14" fill="#fff" stroke="#0f172a" strokeWidth="3" />
                  <circle
                    cx={a.x}
                    cy={a.y}
                    r="20"
                    fill="transparent"
                    onPointerDown={onPointerDownHandle("a")}
                    style={{ cursor: "grab" }}
                  />
                  <circle
                    cx={b.x}
                    cy={b.y}
                    r="20"
                    fill="transparent"
                    onPointerDown={onPointerDownHandle("b")}
                    style={{ cursor: "grab" }}
                  />
                </g>
              </svg>

              <div className="pointer-events-none absolute left-4 top-4 rounded-2xl bg-white/90 px-4 py-2 text-xs text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur">
                拖动端点调整角度
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAngleA((0 * Math.PI) / 180);
                  setAngleB((90 * Math.PI) / 180);
                }}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                90°
              </button>
              <button
                type="button"
                onClick={() => {
                  setAngleA((0 * Math.PI) / 180);
                  setAngleB((60 * Math.PI) / 180);
                }}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                60°
              </button>
              <button
                type="button"
                onClick={() => {
                  setAngleA((0 * Math.PI) / 180);
                  setAngleB((180 * Math.PI) / 180);
                }}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                180°
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">测量结果</div>
              <div className="mt-3 flex items-baseline justify-between gap-4">
                <div>
                  <div className="text-3xl font-bold tracking-tight text-slate-900">
                    {formatDeg(normalized.smallDeg)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    反角：{formatDeg(normalized.reflexDeg)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copy}
                  className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  复制角度
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">设置</div>
              <label className="mt-4 block text-sm text-slate-700">
                射线长度
                <input
                  type="range"
                  min={0.55}
                  max={0.95}
                  step={0.01}
                  value={radiusRatio}
                  onChange={(e) => setRadiusRatio(Number(e.target.value))}
                  className="mt-2 w-full"
                />
              </label>
              <div className="mt-4 text-xs text-slate-500">
                提示：本工具用于屏幕上角度测量，不保证与物理尺规完全一致（不同屏幕缩放会影响实际长度，但角度不受影响）。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
