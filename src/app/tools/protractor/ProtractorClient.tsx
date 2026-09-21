"use client";

import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  RefreshCw,
  Pause,
  Play,
  ArrowLeftRight,
  Copy,
  Check,
  RotateCcw,
} from "lucide-react";

type DragTarget = "a" | "b" | null;

const DEFAULT_UI = {
  dragHint: "拖动端点调整角度",
  resultTitle: "测量结果",
  reflexAnglePrefix: "对侧角：",
  copyAngle: "复制角度",
  copied: "已复制",
  settings: "设置",
  rayLength: "射线长度",
  tip: "提示：本工具用于屏幕或实景中角度测量，支持开启摄像头直接对准现实物体测量角度。",
  cameraOpen: "开启摄像头",
  cameraClose: "关闭摄像头",
  cameraFlip: "切换镜头",
  cameraFreeze: "定格画面",
  cameraResume: "恢复画面",
  flipSide: "切换对侧角",
  dialOpacity: "表盘不透明度",
  showSector: "显示角区域填充",
  unitLabel: "角度单位",
  unitDegree: "度数 (°)",
  unitRadian: "弧度 (rad)",
  oppositeSwitch: "(点击切换)",
  permissionDenied: "摄像头权限被拒绝，请在浏览器中允许摄像头访问",
  noCameraFound: "未检测到可用摄像头",
  cameraBusy: "摄像头可能被其他应用占用",
  insecureContext: "摄像头功能需要 HTTPS 或本地安全环境",
  unableStart: "无法启动摄像头",
} as const;

type Ui = typeof DEFAULT_UI;

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

const formatRad = (rad: number): string => {
  if (!Number.isFinite(rad)) return "-";
  const piRatio = rad / Math.PI;
  if (Math.abs(piRatio) < 0.001) return "0 rad";
  if (Math.abs(piRatio - 0.5) < 0.001) return `π/2 (${rad.toFixed(4)} rad)`;
  if (Math.abs(piRatio - 1) < 0.001) return `π (${rad.toFixed(4)} rad)`;
  if (Math.abs(piRatio - 1.5) < 0.001) return `3π/2 (${rad.toFixed(4)} rad)`;
  if (Math.abs(piRatio - 2) < 0.001) return `2π (${rad.toFixed(4)} rad)`;
  return `${rad.toFixed(4)} rad`;
};

function getErrorName(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const maybeName = (error as { name?: unknown }).name;
  return typeof maybeName === "string" ? maybeName : null;
}

function shouldRetryWithFallback(error: unknown): boolean {
  const name = getErrorName(error);
  return (
    name === "OverconstrainedError" ||
    name === "ConstraintNotSatisfiedError" ||
    name === "NotFoundError"
  );
}

function formatCameraError(error: unknown, ui: Ui): string {
  const name = getErrorName(error);
  if (name === "NotAllowedError" || name === "SecurityError") return ui.permissionDenied;
  if (name === "NotFoundError") return ui.noCameraFound;
  if (name === "NotReadableError" || name === "TrackStartError") return ui.cameraBusy;
  if (name === "NotSupportedError") return ui.insecureContext;
  return ui.unableStart;
}

async function requestCameraStream(facingMode: "environment" | "user"): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: { exact: facingMode } }, audio: false },
    { video: { facingMode }, audio: false },
    { video: true, audio: false },
  ];

  let lastError: unknown = null;
  for (let index = 0; index < attempts.length; index += 1) {
    try {
      return await navigator.mediaDevices.getUserMedia(attempts[index]);
    } catch (error) {
      lastError = error;
      if (!shouldRetryWithFallback(error) || index === attempts.length - 1) throw error;
    }
  }
  throw lastError ?? new Error("camera_start_failed");
}

function stopMediaTracks(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // ignore
    }
  }
}

export default function ProtractorClient() {
  return (
    <ToolPageLayout toolSlug="protractor" maxWidthClassName="max-w-5xl">
      <ProtractorInner />
    </ToolPageLayout>
  );
}

function ProtractorInner() {
  const config = useOptionalToolConfig("protractor");
  const ui: Ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<Ui>) };

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTokenRef = useRef(0);

  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [copied, setCopied] = useState(false);

  // Default angles: ray A at 20 deg, ray B at 120 deg (100 deg angle)
  const [angleA, setAngleA] = useState(() => (20 * Math.PI) / 180);
  const [angleB, setAngleB] = useState(() => (120 * Math.PI) / 180);
  const [radiusRatio, setRadiusRatio] = useState(0.85);
  const [unit, setUnit] = useState<"deg" | "rad">("deg");

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [freezeFrame, setFreezeFrame] = useState(false);
  const [frozenImage, setFrozenImage] = useState<string | null>(null);
  const [dialOpacity, setDialOpacity] = useState(0.25);
  const [showSector, setShowSector] = useState(true);

  const isCameraSupported =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  // Stop camera tracks cleanly
  const stopCameraStream = useCallback(() => {
    startTokenRef.current += 1;
    stopMediaTracks(streamRef.current);
    streamRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    setCameraActive(false);
    setCameraStarting(false);
    setFreezeFrame(false);
    setFrozenImage(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // Start or switch camera
  const startCamera = async (targetFacing: "environment" | "user") => {
    if (!isCameraSupported) {
      setCameraError(ui.unableStart);
      return;
    }

    const currentToken = (startTokenRef.current += 1);
    stopMediaTracks(streamRef.current);
    streamRef.current = null;

    setCameraStarting(true);
    setCameraError(null);
    setFreezeFrame(false);
    setFrozenImage(null);

    try {
      const stream = await requestCameraStream(targetFacing);
      if (startTokenRef.current !== currentToken) {
        stopMediaTracks(stream);
        return;
      }

      streamRef.current = stream;
      setFacingMode(targetFacing);
      setCameraActive(true);
      setCameraStarting(false);

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.play().catch(() => {
          // ignore auto-play interruption
        });
      }
    } catch (err) {
      if (startTokenRef.current !== currentToken) return;
      setCameraStarting(false);
      setCameraActive(false);
      setCameraError(formatCameraError(err, ui));
    }
  };

  const toggleCamera = () => {
    if (cameraActive || cameraStarting) {
      stopCameraStream();
    } else {
      startCamera(facingMode);
    }
  };

  const flipCamera = () => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    startCamera(nextFacing);
  };

  const toggleFreezeFrame = () => {
    if (!cameraActive) return;
    if (freezeFrame) {
      setFreezeFrame(false);
      setFrozenImage(null);
      const video = videoRef.current;
      if (video) {
        video.play().catch(() => {});
      }
    } else {
      const video = videoRef.current;
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
          setFrozenImage(dataUrl);
          setFreezeFrame(true);
          video.pause();
        }
      }
    }
  };

  // Fixed side angle calculation: from Ray A clockwise to Ray B
  const normalized = useMemo(() => {
    const a = normalizeAngleRad(angleA);
    const b = normalizeAngleRad(angleB);
    const sweep = normalizeAngleRad(b - a);
    const sweepDeg = radToDeg(sweep);
    const reflexSweep = normalizeAngleRad(a - b);
    const reflexDeg = (360 - sweepDeg) % 360;
    return {
      a,
      b,
      sweep,
      sweepDeg,
      reflexSweep,
      reflexDeg,
    };
  }, [angleA, angleB]);

  // Swap rays A and B to measure the opposite angle
  const swapRays = () => {
    const tempA = angleA;
    setAngleA(angleB);
    setAngleB(tempA);
  };

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
    const textToCopy =
      unit === "deg"
        ? normalized.sweepDeg.toFixed(2)
        : normalized.sweep.toFixed(4);
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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

  // Calculate arc and sector covering the entire sweep from Ray A to Ray B
  const { arcPath, sectorPath, isFullCircle } = useMemo(() => {
    const sweep = normalized.sweep;
    if (sweep <= 0.0001) {
      return { arcPath: "", sectorPath: "", isFullCircle: false };
    }
    if (sweep >= Math.PI * 2 - 0.0001) {
      return { arcPath: "", sectorPath: "", isFullCircle: true };
    }
    const largeArcFlag = sweep > Math.PI ? 1 : 0;
    const p1 = point(normalized.a);
    const p2 = point(normalized.b);
    const arc = `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y}`;
    const sector = `M ${center} ${center} L ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y} Z`;
    return { arcPath: arc, sectorPath: sector, isFullCircle: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized.a, normalized.b, normalized.sweep, radius]);

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            {/* Protractor Interactive Stage */}
            <div
              ref={containerRef}
              className="relative mx-auto aspect-square w-full max-w-[560px] rounded-3xl bg-slate-900 ring-1 ring-slate-200 overflow-hidden select-none"
            >
              {/* Camera background video stream */}
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                  cameraActive && !freezeFrame ? "opacity-100" : "opacity-0"
                }`}
              />

              {/* Frozen camera snapshot overlay */}
              {freezeFrame && frozenImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frozenImage}
                  alt="Camera snapshot"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}

              {/* Protractor SVG Overlay */}
              <svg viewBox={viewBox} className="relative z-10 h-full w-full">
                <defs>
                  <radialGradient id="protractor-bg" cx="50%" cy="50%" r="55%">
                    <stop offset="0%" stopColor="#f8fafc" />
                    <stop offset="100%" stopColor="#eef2ff" />
                  </radialGradient>
                  <filter id="protractor-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#ffffff" floodOpacity="0.9" />
                  </filter>
                </defs>

                {/* Dial background disc */}
                <rect
                  x="0"
                  y="0"
                  width={size}
                  height={size}
                  fill="url(#protractor-bg)"
                  opacity={cameraActive ? dialOpacity : 1}
                  className="transition-opacity duration-300"
                />

                {/* Outer guide ring */}
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={cameraActive ? "#ffffff" : "#e2e8f0"}
                  strokeWidth="10"
                  opacity={cameraActive ? 0.7 : 1}
                />

                {/* Ticks around dial */}
                {Array.from({ length: 72 }).map((_, i) => {
                  const deg = i * 5;
                  const ang = (deg * Math.PI) / 180;
                  const inner = radius - (deg % 30 === 0 ? 26 : deg % 10 === 0 ? 18 : 12);
                  const x1 = center + Math.cos(ang) * inner;
                  const y1 = center + Math.sin(ang) * inner;
                  const x2 = center + Math.cos(ang) * radius;
                  const y2 = center + Math.sin(ang) * radius;
                  const isMajor = deg % 30 === 0;
                  return (
                    <g key={deg}>
                      {cameraActive && (
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="#ffffff"
                          strokeWidth={isMajor ? 4.5 : 3}
                          strokeLinecap="round"
                          opacity={0.8}
                        />
                      )}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={isMajor ? (cameraActive ? "#0f172a" : "#64748b") : cameraActive ? "#334155" : "#94a3b8"}
                        strokeWidth={isMajor ? 3 : 2}
                        strokeLinecap="round"
                      />
                    </g>
                  );
                })}

                {/* Angle filled sector (fills entire angle region) */}
                {showSector && (
                  <>
                    {isFullCircle ? (
                      <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="rgba(16, 185, 129, 0.18)"
                      />
                    ) : (
                      sectorPath && (
                        <path
                          d={sectorPath}
                          fill="rgba(16, 185, 129, 0.18)"
                          stroke="none"
                        />
                      )
                    )}
                  </>
                )}

                {/* Green arc line covering the entire sweep */}
                {isFullCircle ? (
                  <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="10"
                    strokeLinecap="round"
                  />
                ) : (
                  arcPath && (
                    <path
                      d={arcPath}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="10"
                      strokeLinecap="round"
                    />
                  )
                )}

                {/* Ray white halo lines for clear contrast on camera */}
                <line
                  x1={center}
                  y1={center}
                  x2={a.x}
                  y2={a.y}
                  stroke="#ffffff"
                  strokeWidth="8"
                  strokeLinecap="round"
                  opacity={0.85}
                />
                <line
                  x1={center}
                  y1={center}
                  x2={b.x}
                  y2={b.y}
                  stroke="#ffffff"
                  strokeWidth="8"
                  strokeLinecap="round"
                  opacity={0.85}
                />

                {/* Rays */}
                <line
                  x1={center}
                  y1={center}
                  x2={a.x}
                  y2={a.y}
                  stroke="#2563eb"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <line
                  x1={center}
                  y1={center}
                  x2={b.x}
                  y2={b.y}
                  stroke="#059669"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />

                {/* Center vertex O */}
                <circle cx={center} cy={center} r="10" fill="#ffffff" stroke="#0f172a" strokeWidth="3" />
                <circle cx={center} cy={center} r="4" fill="#0f172a" />

                {/* Drag handles with labels A and B */}
                <g>
                  {/* Handle A */}
                  <circle
                    cx={a.x}
                    cy={a.y}
                    r="15"
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth="3"
                    className="filter drop-shadow-md"
                  />
                  <text
                    x={a.x}
                    y={a.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#ffffff"
                    fontSize="12"
                    fontWeight="bold"
                    pointerEvents="none"
                  >
                    A
                  </text>
                  <circle
                    cx={a.x}
                    cy={a.y}
                    r="26"
                    fill="transparent"
                    onPointerDown={onPointerDownHandle("a")}
                    style={{ cursor: "grab" }}
                  />

                  {/* Handle B */}
                  <circle
                    cx={b.x}
                    cy={b.y}
                    r="15"
                    fill="#059669"
                    stroke="#ffffff"
                    strokeWidth="3"
                    className="filter drop-shadow-md"
                  />
                  <text
                    x={b.x}
                    y={b.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#ffffff"
                    fontSize="12"
                    fontWeight="bold"
                    pointerEvents="none"
                  >
                    B
                  </text>
                  <circle
                    cx={b.x}
                    cy={b.y}
                    r="26"
                    fill="transparent"
                    onPointerDown={onPointerDownHandle("b")}
                    style={{ cursor: "grab" }}
                  />
                </g>
              </svg>

              {/* Status and Hint badges on top of canvas */}
              <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-1.5">
                <div className="rounded-xl bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur">
                  {ui.dragHint}
                </div>
                {cameraActive && (
                  <div className="flex items-center gap-1.5 rounded-xl bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-white shadow backdrop-blur">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        freezeFrame ? "bg-amber-400" : "animate-pulse bg-emerald-400"
                      }`}
                    />
                    <span>{freezeFrame ? ui.cameraFreeze : ui.cameraResume}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Camera action toolbar */}
            {isCameraSupported && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={toggleCamera}
                  disabled={cameraStarting}
                  className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition shadow-sm ${
                    cameraActive
                      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {cameraActive ? (
                    <>
                      <CameraOff className="h-4 w-4" />
                      {ui.cameraClose}
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4" />
                      {cameraStarting ? "..." : ui.cameraOpen}
                    </>
                  )}
                </button>

                {cameraActive && (
                  <>
                    <button
                      type="button"
                      onClick={flipCamera}
                      title={ui.cameraFlip}
                      className="flex items-center gap-1.5 rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 ring-1 ring-slate-200"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>{ui.cameraFlip}</span>
                    </button>

                    <button
                      type="button"
                      onClick={toggleFreezeFrame}
                      title={freezeFrame ? ui.cameraResume : ui.cameraFreeze}
                      className={`flex items-center gap-1.5 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition ring-1 ${
                        freezeFrame
                          ? "bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100"
                          : "bg-slate-100 text-slate-800 ring-slate-200 hover:bg-slate-200"
                      }`}
                    >
                      {freezeFrame ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      <span>{freezeFrame ? ui.cameraResume : ui.cameraFreeze}</span>
                    </button>
                  </>
                )}
              </div>
            )}

            {cameraError && (
              <div className="rounded-2xl bg-rose-50 p-3 text-center text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                {cameraError}
              </div>
            )}

            {/* Quick preset angle buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setAngleA(0);
                  setAngleB(unit === "deg" ? (60 * Math.PI) / 180 : Math.PI / 3);
                }}
                className="rounded-2xl bg-slate-100 px-3.5 py-1.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                {unit === "deg" ? "60°" : "π/3"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAngleA(0);
                  setAngleB(unit === "deg" ? (90 * Math.PI) / 180 : Math.PI / 2);
                }}
                className="rounded-2xl bg-slate-100 px-3.5 py-1.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                {unit === "deg" ? "90°" : "π/2"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAngleA(0);
                  setAngleB(Math.PI);
                }}
                className="rounded-2xl bg-slate-100 px-3.5 py-1.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                {unit === "deg" ? "180°" : "π"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAngleA(0);
                  setAngleB(unit === "deg" ? (270 * Math.PI) / 180 : (3 * Math.PI) / 2);
                }}
                className="rounded-2xl bg-slate-100 px-3.5 py-1.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                {unit === "deg" ? "270°" : "3π/2"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAngleA((20 * Math.PI) / 180);
                  setAngleB((120 * Math.PI) / 180);
                }}
                title="重置"
                className="flex items-center gap-1 rounded-2xl bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Right sidebar: Result and Settings */}
          <div className="space-y-4">
            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">{ui.resultTitle}</div>
                <button
                  type="button"
                  onClick={swapRays}
                  className="flex items-center gap-1 rounded-xl bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100"
                  title={ui.flipSide}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{ui.flipSide}</span>
                </button>
              </div>

              <div className="mt-4 flex items-baseline justify-between gap-4">
                <div>
                  <div className="text-4xl font-bold tracking-tight text-slate-900">
                    {unit === "deg"
                      ? formatDeg(normalized.sweepDeg)
                      : formatRad(normalized.sweep)}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                    <span>
                      {ui.reflexAnglePrefix}
                      {unit === "deg"
                        ? formatDeg(normalized.reflexDeg)
                        : formatRad(normalized.reflexSweep)}
                    </span>
                    <button
                      type="button"
                      onClick={swapRays}
                      className="text-blue-600 hover:underline"
                    >
                      {ui.oppositeSwitch}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copy}
                  className="flex items-center gap-1.5 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 shadow-sm"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  <span>{copied ? ui.copied : ui.copyAngle}</span>
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 space-y-4">
              <div className="text-sm font-semibold text-slate-900">{ui.settings}</div>

              {/* Unit Switcher: Degrees vs Radians */}
              <div className="block text-sm text-slate-700">
                <div className="mb-2 text-sm font-medium text-slate-700">{ui.unitLabel}</div>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl ring-1 ring-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setUnit("deg")}
                    className={`py-2 px-3 text-xs font-semibold rounded-xl transition ${
                      unit === "deg"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {ui.unitDegree}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnit("rad")}
                    className={`py-2 px-3 text-xs font-semibold rounded-xl transition ${
                      unit === "rad"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {ui.unitRadian}
                  </button>
                </div>
              </div>

              {/* Ray length */}
              <label className="block text-sm text-slate-700">
                <div className="flex justify-between">
                  <span>{ui.rayLength}</span>
                  <span className="text-xs text-slate-500">{Math.round(radiusRatio * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.55}
                  max={0.95}
                  step={0.01}
                  value={radiusRatio}
                  onChange={(e) => setRadiusRatio(Number(e.target.value))}
                  className="mt-2 w-full accent-blue-600"
                />
              </label>

              {/* Dial Opacity when camera is active */}
              {cameraActive && (
                <label className="block text-sm text-slate-700">
                  <div className="flex justify-between">
                    <span>{ui.dialOpacity}</span>
                    <span className="text-xs text-slate-500">{Math.round(dialOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.8}
                    step={0.05}
                    value={dialOpacity}
                    onChange={(e) => setDialOpacity(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-600"
                  />
                </label>
              )}

              {/* Show Sector Toggle */}
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showSector}
                  onChange={(e) => setShowSector(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>{ui.showSector}</span>
              </label>

              <div className="pt-2 text-xs leading-relaxed text-slate-500 border-t border-slate-100">
                {ui.tip}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
