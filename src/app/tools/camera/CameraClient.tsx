"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CameraState = "idle" | "starting" | "running" | "stopped" | "error";

export default function CameraClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<CameraState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("photo.png");

  const supported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  const stop = () => {
    const stream = streamRef.current;
    if (stream) for (const track of stream.getTracks()) track.stop();
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setState((prev) => (prev === "error" ? "error" : "stopped"));
  };

  useEffect(() => () => {
    stop();
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const start = async () => {
    if (!supported) {
      setError("当前浏览器不支持摄像头访问。");
      setState("error");
      return;
    }
    setError(null);
    setState("starting");
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
      setState("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法启动摄像头。");
      setState("error");
      stop();
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png", 1),
    );
    if (!blob) return;

    if (photoUrl) URL.revokeObjectURL(photoUrl);
    const url = URL.createObjectURL(blob);
    setPhotoUrl(url);
    setPhotoName(`photo-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
  };

  const canCapture = state === "running";

  const status = useMemo(() => {
    if (state === "starting") return { text: "启动中", color: "bg-amber-50 text-amber-800 ring-amber-200" };
    if (state === "running") return { text: "运行中", color: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
    if (state === "error") return { text: "错误", color: "bg-rose-50 text-rose-800 ring-rose-200" };
    if (state === "stopped") return { text: "已停止", color: "bg-slate-100 text-slate-700 ring-slate-200" };
    return { text: "未启动", color: "bg-slate-100 text-slate-700 ring-slate-200" };
  }, [state]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">相机</h1>
        <p className="mt-2 text-sm text-slate-500">使用摄像头拍照并下载 PNG（不上传服务器）</p>
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
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${status.color}`}>{status.text}</div>
              </div>

              <div className="mt-4 grid gap-4">
                <label className="block text-sm text-slate-700">
                  摄像头
                  <select
                    value={facingMode}
                    onChange={(e) => setFacingMode(e.target.value as "environment" | "user")}
                    disabled={state === "running" || state === "starting"}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                  >
                    <option value="environment">后置（environment）</option>
                    <option value="user">前置（user）</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={state === "running" || state === "starting" || !supported}
                  className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  启动相机
                </button>
                <button
                  type="button"
                  onClick={stop}
                  disabled={state !== "running" && state !== "starting"}
                  className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  停止
                </button>
                <button
                  type="button"
                  onClick={() => void capture()}
                  disabled={!canCapture}
                  className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  拍照
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">照片</div>
              {photoUrl ? (
                <div className="mt-3 space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl} alt="拍照结果" className="w-full rounded-2xl ring-1 ring-slate-200" />
                  <a
                    href={photoUrl}
                    download={photoName}
                    className="inline-flex rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    下载 PNG
                  </a>
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-500">尚未拍照。</div>
              )}
              {error && <div className="mt-3 text-sm text-rose-600">错误：{error}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

