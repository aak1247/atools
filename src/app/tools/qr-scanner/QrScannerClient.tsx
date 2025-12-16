"use client";

import jsQR from "jsqr";
import { useEffect, useMemo, useRef, useState } from "react";

type ScanState = "idle" | "starting" | "scanning" | "stopped" | "error";

export default function QrScannerClient() {
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
      setError("无法创建画布上下文。");
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
      setError("当前浏览器不支持摄像头访问。");
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
        setError("视频元素未初始化。");
        setState("error");
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setState("scanning");
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法启动摄像头。");
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
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">二维码扫描器</h1>
        <p className="mt-2 text-sm text-slate-500">使用摄像头扫描二维码（不上传服务器）</p>
      </div>

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
                <div className="text-sm font-semibold text-slate-900">控制</div>
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
                    ? "未启动"
                    : state === "starting"
                      ? "启动中"
                      : state === "scanning"
                        ? "扫描中"
                        : state === "stopped"
                          ? "已停止"
                          : "错误"}
                </div>
              </div>

              <div className="mt-4 grid gap-4">
                <label className="block text-sm text-slate-700">
                  摄像头
                  <select
                    value={facingMode}
                    onChange={(e) => setFacingMode(e.target.value as "environment" | "user")}
                    disabled={state === "scanning" || state === "starting"}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                  >
                    <option value="environment">后置（environment）</option>
                    <option value="user">前置（user）</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoStopOnFound}
                    onChange={(e) => setAutoStopOnFound(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  识别到结果后自动停止
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={state === "scanning" || state === "starting" || !canScan}
                  className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  开始扫描
                </button>
                <button
                  type="button"
                  onClick={stop}
                  disabled={state !== "scanning" && state !== "starting"}
                  className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  停止
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">识别结果</div>
                <button
                  type="button"
                  onClick={() => void copy()}
                  disabled={!result}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  复制
                </button>
              </div>
              <textarea
                value={result}
                readOnly
                placeholder="等待识别结果…"
                className="mt-3 h-32 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
              {isUrl && (
                <a
                  href={result}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2"
                >
                  打开链接
                </a>
              )}
              {error && <div className="mt-3 text-sm text-rose-600">错误：{error}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

