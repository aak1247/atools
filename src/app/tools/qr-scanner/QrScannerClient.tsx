"use client";

import jsQR from "jsqr";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";

type ScanState = "idle" | "starting" | "scanning" | "stopped" | "error";

export default function QrScannerClient() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";
  const ui =
    locale === "en-us"
      ? {
          errCanvasContext: "Unable to create canvas context.",
          errNoCameraSupport: "This browser does not support camera access.",
          errVideoNotReady: "Video element is not initialized.",
          errStartCamera: "Unable to start camera.",
          controls: "Controls",
          statusIdle: "Idle",
          statusStarting: "Starting",
          statusScanning: "Scanning",
          statusStopped: "Stopped",
          statusError: "Error",
          camera: "Camera",
          rear: "Rear (environment)",
          front: "Front (user)",
          autoStop: "Auto stop when a code is found",
          start: "Start scanning",
          stop: "Stop",
          result: "Result",
          copy: "Copy",
          waiting: "Waiting for result...",
          openLink: "Open link",
          errorPrefix: "Error:",
        }
      : {
          errCanvasContext: "无法创建画布上下文。",
          errNoCameraSupport: "当前浏览器不支持摄像头访问。",
          errVideoNotReady: "视频元素未初始化。",
          errStartCamera: "无法启动摄像头。",
          controls: "控制",
          statusIdle: "未启动",
          statusStarting: "启动中",
          statusScanning: "扫描中",
          statusStopped: "已停止",
          statusError: "错误",
          camera: "摄像头",
          rear: "后置（environment）",
          front: "前置（user）",
          autoStop: "识别到结果后自动停止",
          start: "开始扫描",
          stop: "停止",
          result: "识别结果",
          copy: "复制",
          waiting: "等待识别结果…",
          openLink: "打开链接",
          errorPrefix: "错误：",
        };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [autoStopOnFound, setAutoStopOnFound] = useState(true);

  const canScan = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  const stop = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setState((prev) => (prev === "error" ? "error" : "stopped"));
  };

  useEffect(() => () => stop(), []);

  const scanLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError(ui.errCanvasContext);
      setState("error");
      stop();
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);

    const code = jsQR(imageData.data, width, height, {
      inversionAttempts: "attemptBoth",
    });

    if (code?.data) {
      setResult(code.data);
      if (autoStopOnFound) {
        stop();
        return;
      }
    }

    rafRef.current = requestAnimationFrame(scanLoop);
  };

  const start = async () => {
    if (!canScan) {
      setError(ui.errNoCameraSupport);
      setState("error");
      return;
    }
    setError(null);
    setState("starting");
    setResult("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        setError(ui.errVideoNotReady);
        setState("error");
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setState("scanning");
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errStartCamera);
      setState("error");
      stop();
    }
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
  };

  const isUrl = useMemo(() => {
    if (!result) return false;
    try {
      const u = new URL(result);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, [result]);

  return (
    <ToolPageLayout toolSlug="qr-scanner" maxWidthClassName="max-w-5xl">
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl bg-black ring-1 ring-slate-200">
              <video ref={videoRef} className="h-auto w-full" playsInline muted />
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{ui.controls}</div>
                <div
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                    state === "scanning"
                      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                    : state === "error"
                      ? "bg-rose-50 text-rose-800 ring-rose-200"
                      : "bg-slate-100 text-slate-700 ring-slate-200"
                  }`}
                >
                  {state === "idle"
                    ? ui.statusIdle
                    : state === "starting"
                      ? ui.statusStarting
                      : state === "scanning"
                        ? ui.statusScanning
                        : state === "stopped"
                          ? ui.statusStopped
                          : ui.statusError}
                </div>
              </div>

              <div className="mt-4 grid gap-4">
                <label className="block text-sm text-slate-700">
                  {ui.camera}
                  <select
                    value={facingMode}
                    onChange={(e) => setFacingMode(e.target.value as "environment" | "user")}
                    disabled={state === "scanning" || state === "starting"}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                  >
                    <option value="environment">{ui.rear}</option>
                    <option value="user">{ui.front}</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoStopOnFound}
                    onChange={(e) => setAutoStopOnFound(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {ui.autoStop}
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={state === "scanning" || state === "starting" || !canScan}
                  className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {ui.start}
                </button>
                <button
                  type="button"
                  onClick={stop}
                  disabled={state !== "scanning" && state !== "starting"}
                  className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  {ui.stop}
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{ui.result}</div>
                <button
                  type="button"
                  onClick={() => void copy()}
                  disabled={!result}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {ui.copy}
                </button>
              </div>
              <textarea
                value={result}
                readOnly
                placeholder={ui.waiting}
                className="mt-3 h-32 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
              {isUrl && (
                <a
                  href={result}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2"
                >
                  {ui.openLink}
                </a>
              )}
              {error && (
                <div className="mt-3 text-sm text-rose-600">
                  {ui.errorPrefix}
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
