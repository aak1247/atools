"use client";

import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { useEffect, useRef, useState } from "react";
import { useFileDropzone } from "../../../hooks/useFileDropzone";

const DEFAULT_UI = {
  title: "视频播放器",
  subtitle: "导入本地视频播放（不上传服务器）",
  pickTitle: "选择视频文件",
  pickFile: "选择文件",
  replaceFile: "点击替换视频",
  clear: "清空",
  dropReplaceHint: "支持拖拽新视频到此区域直接替换",
  noFile: "未选择视频",
  pip: "画中画",
  settingsTitle: "设置",
  speedLabel: "倍速",
  volumeLabel: "音量",
  loopLabel: "循环播放",
  hint: "提示：播放能力取决于浏览器对编码格式的支持（例如 H.265/HEVC 在部分浏览器不可播放）。",
} as const;

type VideoPlayerUi = typeof DEFAULT_UI;

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export default function VideoPlayerClient() {
  return (
    <ToolPageLayout toolSlug="video-player" maxWidthClassName="max-w-5xl">
      <VideoPlayerInner />
    </ToolPageLayout>
  );
}

function VideoPlayerInner() {
  const config = useOptionalToolConfig("video-player");
  const ui: VideoPlayerUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<VideoPlayerUi>) };

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

  const handlePick = (selected: File) => {
    if (url) URL.revokeObjectURL(url);
    const next = URL.createObjectURL(selected);
    setFile(selected);
    setUrl(next);
    setCurrentTime(0);
    setDuration(0);
  };

  const { inputRef, isDragging, handleInputChange, handleDrop, handleDragOver, handleDragLeave, openFilePicker } = useFileDropzone({
    onFile: handlePick,
  });

  const clear = () => {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setFile(null);
    setCurrentTime(0);
    setDuration(0);
  };

  const requestPip = async () => {
    const video = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<void> }) | null;
    if (!video?.requestPictureInPicture) return;
    await video.requestPictureInPicture();
  };

  return (
    <div className="space-y-8">

      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed p-4 transition ${
            isDragging
              ? "border-slate-400 bg-slate-50/60"
              : "border-slate-200 bg-slate-50/80"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="text-sm font-semibold text-slate-900">{ui.pickTitle}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openFilePicker}
              className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {file ? ui.replaceFile : ui.pickFile}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={!file}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {ui.clear}
            </button>
            <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={handleInputChange} />
          </div>
          <div className="w-full text-[11px] text-slate-500">{ui.dropReplaceHint}</div>
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
                <div className="font-semibold text-slate-900 truncate">{file ? file.name : ui.noFile}</div>
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
                  {ui.pip}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.settingsTitle}</div>
              <div className="mt-4 grid gap-4">
                <label className="block text-sm text-slate-700">
                  {ui.speedLabel}
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
                  {ui.volumeLabel}
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
                  {ui.loopLabel}
                </label>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-500">
              {ui.hint}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
