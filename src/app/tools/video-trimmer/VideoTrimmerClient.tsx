"use client";

import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFileDropzone } from "../../../hooks/useFileDropzone";

const DEFAULT_UI = {
  title: "视频剪辑器",
  subtitle: "设置起止时间，导出 WebM（实时转码，不上传）",
  pickTitle: "选择视频文件",
  pickFile: "选择文件",
  replaceFile: "点击替换视频",
  clear: "清空",
  dropReplaceHint: "支持拖拽新视频到此区域直接替换",
  durationTemplate: "时长：{time}（{seconds}s）",
  rangeTitle: "剪辑范围",
  startSeconds: "开始（秒）",
  endSeconds: "结束（秒）",
  selectedSegmentTemplate: "选中片段：{time}（{seconds}s）",
  exportTitle: "导出",
  exportHint: "使用 MediaRecorder 导出 WebM，转码速度≈实时播放速度。部分浏览器/编码格式可能无法导出。",
  exportWebm: "导出 WebM",
  exporting: "导出中...",
  progress: "进度",
  generated: "已生成剪辑文件：",
  download: "下载",
  errorPrefix: "错误：",
  errChooseFile: "请先选择一个视频文件。",
  errNoMediaRecorder: "当前浏览器不支持 MediaRecorder 导出 WebM。",
  errNoCaptureStream: "当前浏览器不支持 captureStream，无法在纯前端导出剪辑视频。",
  errEndAfterStart: "结束时间必须大于开始时间。",
  errExportFailed: "导出失败，请稍后重试。",
} as const;

type VideoTrimmerUi = typeof DEFAULT_UI;

const applyTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);

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
  return (
    <ToolPageLayout toolSlug="video-trimmer" maxWidthClassName="max-w-5xl">
      <VideoTrimmerInner />
    </ToolPageLayout>
  );
}

function VideoTrimmerInner() {
  const config = useOptionalToolConfig("video-trimmer");
  const ui: VideoTrimmerUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<VideoTrimmerUi>) };

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

  const handlePick = (selected: File) => {
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

  const { inputRef, isDragging, handleInputChange, handleDrop, handleDragOver, handleDragLeave, openFilePicker } = useFileDropzone({
    onFile: handlePick,
  });

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
      setError(ui.errChooseFile);
      return;
    }

    const mimeType = pickVideoMimeType();
    if (!mimeType) {
      setError(ui.errNoMediaRecorder);
      return;
    }

    const videoWithCapture = video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
    };

    if (typeof videoWithCapture.captureStream !== "function") {
      setError(ui.errNoCaptureStream);
      return;
    }

    if (!(end > start)) {
      setError(ui.errEndAfterStart);
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
      setError(e instanceof Error ? e.message : ui.errExportFailed);
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
              disabled={!file || isProcessing}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {ui.clear}
            </button>
            <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={handleInputChange} />
          </div>
          <div className="w-full text-[11px] text-slate-500">{ui.dropReplaceHint}</div>
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
                {applyTemplate(ui.durationTemplate, {
                  time: formatTime(duration),
                  seconds: duration.toFixed(2),
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.rangeTitle}</div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    {ui.startSeconds}
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
                    {ui.endSeconds}
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
                    {applyTemplate(ui.selectedSegmentTemplate, {
                      time: formatTime(Math.max(0, end - start)),
                      seconds: Math.max(0, end - start).toFixed(2),
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.exportTitle}</div>
                <p className="mt-2 text-xs text-slate-500">
                  {ui.exportHint}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={!canExport}
                    onClick={() => void exportClip()}
                    className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {isProcessing ? ui.exporting : ui.exportWebm}
                  </button>
                </div>

                {progress != null && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>{ui.progress}</span>
                      <span>{Math.round(progress * 100)}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full bg-emerald-500" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                  </div>
                )}

                {downloadUrl && (
                  <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {ui.generated}
                    <a
                      href={downloadUrl}
                      download={downloadName}
                      className="ml-2 font-semibold underline decoration-emerald-400 underline-offset-2"
                    >
                      {ui.download} {downloadName}
                    </a>
                  </div>
                )}

                {error && <div className="mt-4 text-sm text-rose-600">{ui.errorPrefix}{error}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
