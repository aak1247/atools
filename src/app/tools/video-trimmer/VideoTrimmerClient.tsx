"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const pickVideoMimeType = (): string | null => {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
};

const waitForEvent = (target: EventTarget, name: string): Promise<void> =>
  new Promise((resolve) => {
    const handler = () => {
      target.removeEventListener(name, handler as EventListener);
      resolve();
    };
    target.addEventListener(name, handler as EventListener, { once: true });
  });

export default function VideoTrimmerClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("clip.webm");

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl, url]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setError(null);
    setProgress(null);
    if (url) URL.revokeObjectURL(url);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    const next = URL.createObjectURL(selected);
    setFile(selected);
    setUrl(next);
    setDuration(0);
    setStart(0);
    setEnd(0);
    setDownloadName(`${selected.name.replace(/\.[^.]+$/, "") || "clip"}.webm`);
  };

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    const d = Number.isFinite(video.duration) ? video.duration : 0;
    setDuration(d);
    setStart(0);
    setEnd(d);
  };

  const canExport = useMemo(() => {
    if (!file || !duration) return false;
    if (isProcessing) return false;
    if (!(end > start)) return false;
    return true;
  }, [duration, end, file, isProcessing, start]);

  const exportClip = async () => {
    const video = videoRef.current;
    if (!video || !file) {
      setError("请先选择一个视频文件。");
      return;
    }

    const mimeType = pickVideoMimeType();
    if (!mimeType) {
      setError("当前浏览器不支持 MediaRecorder 导出 WebM。");
      return;
    }

    const videoWithCapture = video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
    };

    if (typeof videoWithCapture.captureStream !== "function") {
      setError("当前浏览器不支持 captureStream，无法在纯前端导出剪辑视频。");
      return;
    }

    if (!(end > start)) {
      setError("结束时间必须大于开始时间。");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress(0);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    const stream = videoWithCapture.captureStream();
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    });

    const stopPromise = new Promise<Blob>((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          resolve(new Blob(chunks, { type: mimeType }));
        },
        { once: true },
      );
    });

    try {
      video.pause();
      video.currentTime = start;
      await waitForEvent(video, "seeked");

      recorder.start(250);
      await video.play();

      const segmentDuration = end - start;
      const tick = window.setInterval(() => {
        const t = video.currentTime;
        const p = segmentDuration > 0 ? (t - start) / segmentDuration : 0;
        setProgress(Math.max(0, Math.min(1, p)));
        if (t >= end || video.ended) {
          window.clearInterval(tick);
          video.pause();
          if (recorder.state !== "inactive") recorder.stop();
        }
      }, 100);

      const blob = await stopPromise;
      const outUrl = URL.createObjectURL(blob);
      setDownloadUrl(outUrl);
      setProgress(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败，请稍后重试。");
    } finally {
      setIsProcessing(false);
    }
  };

  const clear = () => {
    if (url) URL.revokeObjectURL(url);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setFile(null);
    setUrl(null);
    setDownloadUrl(null);
    setDuration(0);
    setStart(0);
    setEnd(0);
    setError(null);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">视频剪辑器</h1>
        <p className="mt-2 text-sm text-slate-500">设置起止时间，导出 WebM（实时转码，不上传）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">选择视频文件</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              选择文件
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={!file || isProcessing}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              清空
            </button>
            <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onChange} />
          </div>
        </div>

        {url && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="space-y-4">
              <div className="overflow-hidden rounded-3xl bg-black ring-1 ring-slate-200">
                <video
                  ref={videoRef}
                  src={url}
                  controls
                  className="h-auto w-full"
                  onLoadedMetadata={onLoadedMetadata}
                />
              </div>
              <div className="text-xs text-slate-500">
                时长：{formatTime(duration)}（{duration.toFixed(2)}s）
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">剪辑范围</div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    开始（秒）
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, duration)}
                      step={0.1}
                      value={start}
                      onChange={(e) => setStart(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                  <label className="block text-sm text-slate-700">
                    结束（秒）
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, duration)}
                      step={0.1}
                      value={end}
                      onChange={(e) => setEnd(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                </div>
                <div className="mt-4">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, duration)}
                    step={0.01}
                    value={start}
                    onChange={(e) => setStart(Number(e.target.value))}
                    className="w-full"
                  />
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, duration)}
                    step={0.01}
                    value={end}
                    onChange={(e) => setEnd(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    选中片段：{formatTime(Math.max(0, end - start))}（{Math.max(0, end - start).toFixed(2)}s）
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">导出</div>
                <p className="mt-2 text-xs text-slate-500">
                  使用 MediaRecorder 导出 WebM，转码速度≈实时播放速度。部分浏览器/编码格式可能无法导出。
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={!canExport}
                    onClick={() => void exportClip()}
                    className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {isProcessing ? "导出中..." : "导出 WebM"}
                  </button>
                </div>

                {progress != null && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>进度</span>
                      <span>{Math.round(progress * 100)}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full bg-emerald-500" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                  </div>
                )}

                {downloadUrl && (
                  <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    已生成剪辑文件：
                    <a
                      href={downloadUrl}
                      download={downloadName}
                      className="ml-2 font-semibold underline decoration-emerald-400 underline-offset-2"
                    >
                      下载 {downloadName}
                    </a>
                  </div>
                )}

                {error && <div className="mt-4 text-sm text-rose-600">错误：{error}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
