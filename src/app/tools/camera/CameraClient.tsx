"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type CameraState = "idle" | "starting" | "running" | "stopped" | "error";

type CameraUi = {
  controls: string;
  camera: string;
  rear: string;
  front: string;
  start: string;
  stop: string;
  capture: string;
  photo: string;
  capturedAlt: string;
  downloadPng: string;
  noPhoto: string;
  errorPrefix: string;
  unsupported: string;
  videoNotReady: string;
  unableStart: string;
  statusStarting: string;
  statusRunning: string;
  statusError: string;
  statusStopped: string;
  statusIdle: string;
};

const DEFAULT_UI: CameraUi = {
  controls: "控制",
  camera: "摄像头",
  rear: "后置（environment）",
  front: "前置（user）",
  start: "启动相机",
  stop: "停止",
  capture: "拍照",
  photo: "照片",
  capturedAlt: "拍照结果",
  downloadPng: "下载 PNG",
  noPhoto: "尚未拍照。",
  errorPrefix: "错误：",
  unsupported: "当前浏览器不支持摄像头访问。",
  videoNotReady: "视频元素未初始化。",
  unableStart: "无法启动摄像头。",
  statusStarting: "启动中",
  statusRunning: "运行中",
  statusError: "错误",
  statusStopped: "已停止",
  statusIdle: "未启动",
};

function CameraInner({ ui }: { ui: CameraUi }) {
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
      setError(ui.unsupported);
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
        setError(ui.videoNotReady);
        setState("error");
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setState("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.unableStart);
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
    if (state === "starting")
      return { text: ui.statusStarting, color: "bg-amber-50 text-amber-800 ring-amber-200" };
    if (state === "running")
      return { text: ui.statusRunning, color: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
    if (state === "error") return { text: ui.statusError, color: "bg-rose-50 text-rose-800 ring-rose-200" };
    if (state === "stopped")
      return { text: ui.statusStopped, color: "bg-slate-100 text-slate-700 ring-slate-200" };
    return { text: ui.statusIdle, color: "bg-slate-100 text-slate-700 ring-slate-200" };
  }, [state, ui]);

  return (
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
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${status.color}`}>{status.text}</div>
            </div>

            <div className="mt-4 grid gap-4">
              <label className="block text-sm text-slate-700">
                {ui.camera}
                <select
                  value={facingMode}
                  onChange={(e) => setFacingMode(e.target.value as "environment" | "user")}
                  disabled={state === "running" || state === "starting"}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                >
                  <option value="environment">{ui.rear}</option>
                  <option value="user">{ui.front}</option>
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
                {ui.start}
              </button>
              <button
                type="button"
                onClick={stop}
                disabled={state !== "running" && state !== "starting"}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                {ui.stop}
              </button>
              <button
                type="button"
                onClick={() => void capture()}
                disabled={!canCapture}
                className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {ui.capture}
              </button>
            </div>
          </div>

          <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.photo}</div>
            {photoUrl ? (
              <div className="mt-3 space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt={ui.capturedAlt} className="w-full rounded-2xl ring-1 ring-slate-200" />
                <a
                  href={photoUrl}
                  download={photoName}
                  className="inline-flex rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {ui.downloadPng}
                </a>
              </div>
            ) : (
              <div className="mt-3 text-sm text-slate-500">{ui.noPhoto}</div>
            )}
            {error && <div className="mt-3 text-sm text-rose-600">{ui.errorPrefix}{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CameraClient() {
  return (
    <ToolPageLayout toolSlug="camera">
      {({ config }) => <CameraInner ui={{ ...DEFAULT_UI, ...(config.ui as Partial<CameraUi> | undefined) }} />}
    </ToolPageLayout>
  );
}
