"use client";

import type { FC } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import geomagnetism from "geomagnetism";
import { Compass, Info, LocateFixed, Navigation, Shield } from "lucide-react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type PermissionStateLite = "prompt" | "granted" | "denied" | "unsupported";

type HeadingSource = "webkitCompassHeading" | "absolute-alpha" | "alpha" | "unknown";

type CompassState = {
  isListening: boolean;
  sensorPermission: PermissionStateLite;
  locationPermission: PermissionStateLite;
  error: string | null;
  headingSource: HeadingSource;
  magneticHeading: number | null;
  trueHeading: number | null;
  declinationDeg: number | null;
  latitude: number | null;
  longitude: number | null;
  useTrueNorth: boolean;
  smoothing: number;
};

const DEFAULT_UI = {
  dash: "—",
  trueNorth: "真北",
  magneticNorth: "磁北",
  needleAriaLabel: "指南针指针",
  sourcePrefix: "来源：",
  sourceIos: "iOS 指南针",
  sourceAbsolute: "绝对方位",
  sourceRelative: "相对方位",
  controls: "控制",
  statusRunning: "运行中",
  statusIdle: "未开始",
  startCompass: "启动指南针",
  stop: "停止",
  enableTrueNorth: "启用真北",
  smoothing: "平滑",
  smoothingAriaLabel: "平滑系数",
  smoothingHint: "平滑越高越跟手，越低越稳定。",
  trueNorthInfo: "真北信息",
  enabled: "已启用",
  disabled: "未启用",
  declination: "磁偏角",
  location: "定位",
  trueNorthExplain: "真北为：磁北 + 磁偏角（基于 WMM 模型估算，精度受设备磁力计与环境干扰影响）。",
  insecureContextHint:
    "当前页面不是安全上下文，浏览器可能会禁止传感器/定位。请使用 HTTPS 或在本机通过 localhost 访问。",
  tipsTitle: "使用提示",
  tipSensorPermission:
    "iPhone 首次使用需要点击“启动指南针”并允许“动作与方向”权限；若指南针不稳定，远离金属物体并做“8 字”校准动作。",
  tipTrueNorth: "“启用真北”会请求定位权限，用于估算磁偏角；拒绝定位仍可使用磁北。",
  errNeedSecureContext: "需要在 HTTPS 或 localhost 环境下使用方向传感器。",
  errSensorPermissionDenied: "无法获取方向传感器权限，请在浏览器设置中允许访问“动作与方向”。",
  errLocationPermissionDenied: "无法获取定位权限，已切换为磁北显示。",
  errDeclinationUnavailable: "已获取定位，但无法计算磁偏角，已切换为磁北显示。",
} as const;

type CompassUi = typeof DEFAULT_UI;

const normalizeDegrees = (deg: number) => {
  const value = ((deg % 360) + 360) % 360;
  return value === 360 ? 0 : value;
};

const degreesToCardinal = (deg: number) => {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  const index = Math.round(deg / 45) % 8;
  return directions[index];
};

const formatSigned = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}°`;

const getHeadingFromEvent = (event: DeviceOrientationEvent): {
  headingDeg: number | null;
  source: HeadingSource;
} => {
  const anyEvent = event as DeviceOrientationEvent & {
    webkitCompassHeading?: number;
    webkitCompassAccuracy?: number;
  };

  if (typeof anyEvent.webkitCompassHeading === "number" && Number.isFinite(anyEvent.webkitCompassHeading)) {
    return {
      headingDeg: normalizeDegrees(anyEvent.webkitCompassHeading),
      source: "webkitCompassHeading",
    };
  }

  if (typeof event.alpha !== "number" || !Number.isFinite(event.alpha)) {
    return { headingDeg: null, source: "unknown" };
  }

  // alpha: device rotation around z-axis; commonly convert to compass heading by 360 - alpha
  const alphaHeading = normalizeDegrees(360 - event.alpha);
  return {
    headingDeg: alphaHeading,
    source: event.absolute ? "absolute-alpha" : "alpha",
  };
};

const estimateDeclinationDeg = (latDeg: number, lonDeg: number) => {
  try {
    const model = geomagnetism.model(new Date(), { allowOutOfBoundsModel: true });
    const info = model.point([latDeg, lonDeg]);
    return typeof info.decl === "number" && Number.isFinite(info.decl)
      ? info.decl
      : null;
  } catch {
    return null;
  }
};

const CompassInner: FC<{ ui: CompassUi }> = ({ ui }) => {
  const [state, setState] = useState<CompassState>({
    isListening: false,
    sensorPermission: "prompt",
    locationPermission: "prompt",
    error: null,
    headingSource: "unknown",
    magneticHeading: null,
    trueHeading: null,
    declinationDeg: null,
    latitude: null,
    longitude: null,
    useTrueNorth: true,
    smoothing: 0.2,
  });

  const latestMagneticHeadingRef = useRef<number | null>(null);
  const headingSourceRef = useRef<HeadingSource>("unknown");
  const rafRef = useRef<number | null>(null);
  const isListeningRef = useRef(false);
  const smoothedHeadingRef = useRef<number | null>(null);
  const declinationRef = useRef<number | null>(null);
  const smoothingRef = useRef<number>(0.2);

  const displayedHeading = useMemo(() => {
    if (state.useTrueNorth && typeof state.trueHeading === "number") return state.trueHeading;
    if (typeof state.magneticHeading === "number") return state.magneticHeading;
    return null;
  }, [state.magneticHeading, state.trueHeading, state.useTrueNorth]);

  const displayedLabel = useMemo(() => {
    if (displayedHeading == null) return ui.dash;
    const cardinal = degreesToCardinal(displayedHeading);
    return `${displayedHeading.toFixed(0)}° ${cardinal}`;
  }, [displayedHeading, ui.dash]);

  useEffect(() => {
    declinationRef.current = state.declinationDeg;
  }, [state.declinationDeg]);

  useEffect(() => {
    smoothingRef.current = state.smoothing;
  }, [state.smoothing]);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const { headingDeg, source } = getHeadingFromEvent(event);
    if (headingDeg == null) return;
    latestMagneticHeadingRef.current = headingDeg;
    headingSourceRef.current = source;
  }, []);

  const cleanup = useCallback(() => {
    isListeningRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    window.removeEventListener("deviceorientation", handleOrientation as EventListener);
    window.removeEventListener(
      "deviceorientationabsolute",
      handleOrientation as EventListener,
    );
  }, [handleOrientation]);

  const updateDerivedHeadings = useCallback(function updateDerivedHeadings() {
    if (!isListeningRef.current) return;

    const raw = latestMagneticHeadingRef.current;
    if (typeof raw === "number") {
      const prev = smoothedHeadingRef.current;
      const smoothing = smoothingRef.current;
      let next = raw;

      if (typeof prev === "number") {
        // Circular interpolation (shortest path around 360)
        const delta = ((((raw - prev) % 360) + 540) % 360) - 180;
        next = normalizeDegrees(prev + delta * smoothing);
      }
      smoothedHeadingRef.current = next;

      const decl = declinationRef.current;
      const trueHeading =
        typeof decl === "number" ? normalizeDegrees(next + decl) : null;

      setState((prevState) => ({
        ...prevState,
        headingSource: headingSourceRef.current,
        magneticHeading: next,
        trueHeading,
      }));
    }

    rafRef.current = requestAnimationFrame(updateDerivedHeadings);
  }, []);

  const attachListeners = useCallback(() => {
    window.addEventListener("deviceorientation", handleOrientation as EventListener, { passive: true });
    window.addEventListener("deviceorientationabsolute", handleOrientation as EventListener, { passive: true });
  }, [handleOrientation]);

  const requestSensorPermission = useCallback(async () => {
    if (typeof window === "undefined") return false;
    if (!("DeviceOrientationEvent" in window)) {
      setState((prev) => ({ ...prev, sensorPermission: "unsupported" }));
      return false;
    }

    const anyDeviceOrientation = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<PermissionState>;
    };

    // iOS requires user gesture + requestPermission
    if (typeof anyDeviceOrientation.requestPermission === "function") {
      try {
        const result = await anyDeviceOrientation.requestPermission();
        if (result === "granted") {
          setState((prev) => ({ ...prev, sensorPermission: "granted" }));
          return true;
        }
        setState((prev) => ({ ...prev, sensorPermission: "denied" }));
        return false;
      } catch {
        setState((prev) => ({ ...prev, sensorPermission: "denied" }));
        return false;
      }
    }

    setState((prev) => ({ ...prev, sensorPermission: "granted" }));
    return true;
  }, []);

  const requestLocation = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setState((prev) => ({ ...prev, locationPermission: "unsupported" }));
      return null;
    }

    return new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setState((prev) => ({ ...prev, locationPermission: "granted" }));
          resolve(pos);
        },
        () => {
          setState((prev) => ({ ...prev, locationPermission: "denied" }));
          resolve(null);
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 10 * 60 * 1000,
        },
      );
    });
  }, []);

  const start = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null }));

    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setState((prev) => ({ ...prev, error: ui.errNeedSecureContext }));
      return;
    }

    const ok = await requestSensorPermission();
    if (!ok) {
      setState((prev) => ({ ...prev, error: ui.errSensorPermissionDenied }));
      return;
    }

    cleanup();
    isListeningRef.current = true;
    smoothedHeadingRef.current = null;
    latestMagneticHeadingRef.current = null;
    headingSourceRef.current = "unknown";

    attachListeners();
    setState((prev) => ({ ...prev, isListening: true }));
    rafRef.current = requestAnimationFrame(updateDerivedHeadings);
  }, [
    attachListeners,
    cleanup,
    requestSensorPermission,
    ui.errNeedSecureContext,
    ui.errSensorPermissionDenied,
    updateDerivedHeadings,
  ]);

  const stop = useCallback(() => {
    cleanup();
    setState((prev) => ({ ...prev, isListening: false }));
  }, [cleanup]);

  const enableTrueNorth = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null }));
    const pos = await requestLocation();
    if (!pos) {
      setState((prev) => ({
        ...prev,
        useTrueNorth: false,
        declinationDeg: null,
        latitude: null,
        longitude: null,
        error: ui.errLocationPermissionDenied,
      }));
      return;
    }

    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const decl = estimateDeclinationDeg(lat, lon);
    if (decl == null) {
      setState((prev) => ({
        ...prev,
        useTrueNorth: false,
        declinationDeg: null,
        latitude: lat,
        longitude: lon,
        error: ui.errDeclinationUnavailable,
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      useTrueNorth: true,
      latitude: lat,
      longitude: lon,
      declinationDeg: decl,
    }));
  }, [requestLocation, ui.errDeclinationUnavailable, ui.errLocationPermissionDenied]);

  useEffect(() => () => cleanup(), [cleanup]);

  const isSecureContextHint = typeof window !== "undefined" && window.isSecureContext === false;

  const modeLabel =
    state.useTrueNorth && typeof state.declinationDeg === "number"
      ? ui.trueNorth
      : ui.magneticNorth;

  const effectiveHeadingForNeedle = displayedHeading ?? 0;

  return (
    <div className="mt-8 space-y-8">
      <div className="glass-card overflow-hidden rounded-3xl p-8 shadow-xl ring-1 ring-black/5">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div className="flex flex-col items-center">
            <div className="relative flex h-56 w-56 items-center justify-center rounded-full bg-white/60 ring-1 ring-black/5">
              <div className="absolute inset-4 rounded-full border border-slate-200/70" />
              <div className="absolute inset-10 rounded-full border border-slate-200/60" />

              <div className="absolute top-3 text-xs font-semibold text-slate-600">N</div>
              <div className="absolute bottom-3 text-xs font-semibold text-slate-600">S</div>
              <div className="absolute left-3 text-xs font-semibold text-slate-600">W</div>
              <div className="absolute right-3 text-xs font-semibold text-slate-600">E</div>

              <div
                className="absolute h-40 w-40"
                style={{ transform: `rotate(${effectiveHeadingForNeedle}deg)` }}
                aria-label={ui.needleAriaLabel}
              >
                <div className="absolute left-1/2 top-1/2 h-0 w-0 -translate-x-1/2 -translate-y-[90%]">
                  <div className="h-20 w-1.5 rounded-full bg-gradient-to-b from-rose-500 to-rose-600 shadow-sm" />
                  <div className="mx-auto -mt-1 h-3 w-3 rounded-full bg-rose-600 ring-4 ring-white/80" />
                </div>
              </div>

              <div className="absolute bottom-5 flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white shadow-lg shadow-slate-900/20">
                <Compass className="h-4 w-4" />
                {modeLabel}
              </div>
            </div>

            <div className="mt-6 text-center">
              <div className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
                {displayedLabel}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {ui.sourcePrefix}
                {state.headingSource === "webkitCompassHeading"
                  ? ui.sourceIos
                  : state.headingSource === "absolute-alpha"
                    ? ui.sourceAbsolute
                    : state.headingSource === "alpha"
                      ? ui.sourceRelative
                      : ui.dash}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-white/60 p-5 ring-1 ring-black/5">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-slate-700">{ui.controls}</div>
                <div className="text-xs text-slate-500">
                  {state.isListening ? ui.statusRunning : ui.statusIdle}
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                {!state.isListening ? (
                  <button
                    type="button"
                    onClick={start}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-700 active:scale-[0.98]"
                  >
                    <Navigation className="h-4 w-4" />
                    {ui.startCompass}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stop}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-700 active:scale-[0.98]"
                  >
                    {ui.stop}
                  </button>
                )}

                <button
                  type="button"
                  onClick={enableTrueNorth}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition-all hover:bg-slate-800 active:scale-[0.98]"
                >
                  <LocateFixed className="h-4 w-4" />
                  {ui.enableTrueNorth}
                </button>
              </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium text-slate-700">{ui.smoothing}</div>
                  <div className="text-sm font-semibold tabular-nums text-slate-900">
                    {Math.round(state.smoothing * 100)}%
                  </div>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.6}
                  step={0.05}
                  value={state.smoothing}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      smoothing: Number(e.target.value),
                    }))
                  }
                  className="mt-3 w-full accent-blue-600"
                  aria-label={ui.smoothingAriaLabel}
                />
                <div className="mt-2 text-xs text-slate-500">
                  {ui.smoothingHint}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white/60 p-5 ring-1 ring-black/5">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-slate-700">{ui.trueNorthInfo}</div>
                <div className="text-xs text-slate-500">
                  {state.declinationDeg == null ? ui.disabled : ui.enabled}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-black/5">
                  <div className="text-xs text-slate-500">{ui.declination}</div>
                  <div className="mt-1 font-semibold text-slate-900 tabular-nums">
                    {state.declinationDeg == null ? ui.dash : formatSigned(state.declinationDeg)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-black/5">
                  <div className="text-xs text-slate-500">{ui.location}</div>
                  <div className="mt-1 font-semibold text-slate-900 tabular-nums">
                    {state.latitude == null || state.longitude == null
                      ? ui.dash
                      : `${state.latitude.toFixed(3)}, ${state.longitude.toFixed(3)}`}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500">
                {ui.trueNorthExplain}
              </div>
            </div>
          </div>
        </div>
      </div>

      {state.error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          <Info className="h-5 w-5 flex-shrink-0" />
          <div className="text-sm">{state.error}</div>
        </div>
      )}

      {isSecureContextHint && (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 text-slate-700 ring-1 ring-black/5">
          <Info className="h-5 w-5 flex-shrink-0 text-slate-500" />
          <div className="text-sm">
            {ui.insecureContextHint}
          </div>
        </div>
      )}

      <div className="glass-card rounded-3xl p-6 shadow-xl ring-1 ring-black/5">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Shield className="h-5 w-5 text-slate-700" />
          {ui.tipsTitle}
        </h2>
        <div className="space-y-3 text-slate-700">
          <div className="text-sm">
            {ui.tipSensorPermission}
          </div>
          <div className="text-sm">
            {ui.tipTrueNorth}
          </div>
        </div>
      </div>
    </div>
  );
};

const CompassClient: FC = () => {
  return (
    <ToolPageLayout toolSlug="compass" maxWidthClassName="max-w-3xl">
      {({ config }) => (
        <CompassInner
          ui={{
            ...DEFAULT_UI,
            ...((config.ui as Partial<CompassUi> | undefined) ?? {}),
          }}
        />
      )}
    </ToolPageLayout>
  );
};

export default CompassClient;
