"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export default function VideoPlayerClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoop, setIsLoop] = useState(false);
  const [volume, setVolume] = useState(1);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const pipSupported =
    typeof document !== "undefined" &&
    Boolean((document as unknown as { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled) &&
    typeof (HTMLVideoElement.prototype as unknown as { requestPictureInPicture?: unknown }).requestPictureInPicture ===
      "function";

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
  }, [volume]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (url) URL.revokeObjectURL(url);
    const next = URL.createObjectURL(selected);
    setFile(selected);
    setUrl(next);
    setCurrentTime(0);
    setDuration(0);
  };

  const clear = () => {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setFile(null);
    setCurrentTime(0);
    setDuration(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const requestPip = async () => {
    const video = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<void> }) | null;
    if (!video?.requestPictureInPicture) return;
    await video.requestPictureInPicture();
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">视频播放器</h1>
        <p className="mt-2 text-sm text-slate-500">导入本地视频播放（不上传服务器）</p>
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
              disabled={!file}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              清空
            </button>
            <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onChange} />
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl bg-black ring-1 ring-slate-200">
              <video
                ref={videoRef}
                src={url ?? undefined}
                controls
                loop={isLoop}
                className="h-auto w-full"
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">{file ? file.name : "未选择视频"}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>
              {pipSupported && (
                <button
                  type="button"
                  onClick={() => void requestPip()}
                  disabled={!file}
                  className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  画中画
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">设置</div>
              <div className="mt-4 grid gap-4">
                <label className="block text-sm text-slate-700">
                  倍速
                  <select
                    value={playbackRate}
                    onChange={(e) => setPlaybackRate(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value={0.5}>0.5×</option>
                    <option value={0.75}>0.75×</option>
                    <option value={1}>1×</option>
                    <option value={1.25}>1.25×</option>
                    <option value={1.5}>1.5×</option>
                    <option value={2}>2×</option>
                  </select>
                </label>

                <label className="block text-sm text-slate-700">
                  音量
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="mt-3 w-full"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={isLoop}
                    onChange={(e) => setIsLoop(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  循环播放
                </label>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-500">
              提示：播放能力取决于浏览器对编码格式的支持（例如 H.265/HEVC 在部分浏览器不可播放）。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
