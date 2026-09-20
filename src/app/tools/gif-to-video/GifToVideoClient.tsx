"use client";

import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFileDropzone } from "../../../hooks/useFileDropzone";
import { getFFmpegBaseURL } from "../../../lib/r2-assets";

type OutputFormat = "webm" | "mp4";

const DEFAULT_UI = {
  title: "GIF 转视频",
  subtitle: "基于 ffmpeg.wasm：GIF 转 WebM/MP4（纯本地处理）",
  dropTitle: "选择 GIF 文件",
  pickFile: "选择文件",
  replaceGif: "点击替换 GIF",
  ffmpegReady: "FFmpeg 已就绪",
  ffmpegLoading: "加载中...",
  ffmpegLoad: "加载 FFmpeg",
  clear: "清空",
  dropHint: "支持拖拽新 GIF 到此区域直接替换",
  mp4Tip: "提示：MP4 输出需要浏览器内置的 ffmpeg.wasm 编码器支持；如失败，建议选择 WebM 输出。",
  settings: "设置",
  outputFormat: "输出格式",
  webmRecommend: "WebM（推荐）",
  mp4Notice: "MP4（可能失败）",
  fps: "帧率（FPS）",
  width: "宽度（px）",
  startConvert: "开始转换",
  converting: "转换中...",
  download: "下载",
  progress: "进度",
  ffmpegLogs: "FFmpeg 日志",
  logsPlaceholder: "日志会显示在这里…",
  errFfmpegLoad: "FFmpeg 加载失败。",
  errConvertFailed: "转换失败（可能是所选输出编码器未内置）。建议改用 WebM 输出。",
} as const;

// 动态获取 FFmpeg 基础 URL（支持本地和 R2）
const CORE_BASE = getFFmpegBaseURL();

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const pickMime = (format: OutputFormat): string => (format === "mp4" ? "video/mp4" : "video/webm");

function GifToVideoInner() {
  const config = useOptionalToolConfig("gif-to-video");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const logRef = useRef<string[]>([]);

  const [ffmpegState, setFfmpegState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("webm");
  const [fps, setFps] = useState(30);
  const [width, setWidth] = useState(720);

  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [logs, setLogs] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("output.webm");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const inputName = useMemo(() => (file ? "input.gif" : null), [file]);

  const ensureLoaded = async () => {
    if (ffmpegState === "ready" || ffmpegState === "loading") return;
    setFfmpegState("loading");
    setError(null);
    setProgress(null);

    try {
      const ffmpeg = new FFmpeg();
      ffmpeg.on("log", ({ message }) => {
        logRef.current.push(message);
        if (logRef.current.length > 500) logRef.current.splice(0, logRef.current.length - 500);
        setLogs(logRef.current.join("\n"));
      });
      ffmpeg.on("progress", ({ progress: p }) => {
        if (typeof p === "number" && Number.isFinite(p)) setProgress(Math.max(0, Math.min(1, p)));
      });

      const coreURL = await toBlobURL(`${CORE_BASE}ffmpeg-core.js`, "text/javascript");
      const wasmURL = await toBlobURL(`${CORE_BASE}ffmpeg-core.wasm`, "application/wasm");
      await ffmpeg.load({ coreURL, wasmURL });

      ffmpegRef.current = ffmpeg;
      setFfmpegState("ready");
    } catch (e) {
      setFfmpegState("error");
      setError(e instanceof Error ? e.message : ui.errFfmpegLoad);
    }
  };

  const pick = (selected: File) => {
    setFile(selected);
    logRef.current = [];
    setLogs("");
    setProgress(null);
    setError(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    const base = selected.name.replace(/\.[^.]+$/, "") || "output";
    setDownloadName(`${base}.${outputFormat}`);
  };

  const { inputRef, isDragging, handleInputChange, handleDrop, handleDragOver, handleDragLeave, openFilePicker } = useFileDropzone({
    onFile: pick,
  });

  useEffect(() => {
    if (!file) return;
    const base = file.name.replace(/\.[^.]+$/, "") || "output";
    setDownloadName(`${base}.${outputFormat}`);
  }, [file, outputFormat]);

  const convert = async () => {
    if (!file || !inputName) return;
    await ensureLoaded();
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) return;

    setIsWorking(true);
    setError(null);
    setProgress(0);
    logRef.current = [];
    setLogs("");
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    const safeFps = Math.max(1, Math.min(60, Math.round(fps)));
    const safeWidth = Math.max(64, Math.min(2048, Math.round(width)));
    const outName = outputFormat === "mp4" ? "output.mp4" : "output.webm";

    const args: string[] = ["-hide_banner", "-y", "-i", inputName, "-vf", `fps=${safeFps},scale=${safeWidth}:-2:flags=lanczos`];

    if (outputFormat === "webm") {
      // 兼容性优先：vp8 + yuv420p
      args.push("-c:v", "libvpx", "-pix_fmt", "yuv420p", "-crf", "20", "-b:v", "0", outName);
    } else {
      // mp4 需要编码器支持（通常为 libx264 或 mpeg4），这里优先尝试 libx264
      args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", outName);
    }

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec(args);
      const data = (await ffmpeg.readFile(outName)) as Uint8Array;
      const blob = new Blob([toArrayBuffer(data)], { type: pickMime(outputFormat) });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(1);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : ui.errConvertFailed,
      );
      setFfmpegState("error");
    } finally {
      setIsWorking(false);
    }
  };

  const clear = () => {
    setFile(null);
    setOutputFormat("webm");
    setFps(30);
    setWidth(720);
    logRef.current = [];
    setLogs("");
    setProgress(null);
    setError(null);
    setFfmpegState("idle");
    ffmpegRef.current = null;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">{ui.title}</h2>
        <p className="mt-2 text-sm text-slate-500">{ui.subtitle}</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
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
          <div className="text-sm font-semibold text-slate-900">{ui.dropTitle}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openFilePicker}
              className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {file ? ui.replaceGif : ui.pickFile}
            </button>
            <button
              type="button"
              onClick={() => void ensureLoaded()}
              disabled={ffmpegState === "ready" || ffmpegState === "loading"}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {ffmpegState === "ready" ? ui.ffmpegReady : ffmpegState === "loading" ? ui.ffmpegLoading : ui.ffmpegLoad}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={!file && ffmpegState === "idle"}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {ui.clear}
            </button>
            <input ref={inputRef} type="file" accept="image/gif" className="hidden" onChange={handleInputChange} />
          </div>
          <div className="w-full text-[11px] text-slate-500">{ui.dropHint}</div>
        </div>

        <div className="mt-4 rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-600">
          {ui.mp4Tip}
        </div>

        {file && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.settings}</div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    {ui.outputFormat}
                    <select
                      value={outputFormat}
                      onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="webm">{ui.webmRecommend}</option>
                      <option value="mp4">{ui.mp4Notice}</option>
                    </select>
                  </label>
                  <label className="block text-sm text-slate-700">
                    {ui.fps}
                    <input
                      type="number"
                      min={1}
                      max={60}
                      step={1}
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                  <label className="block text-sm text-slate-700 sm:col-span-2">
                    {ui.width}
                    <input
                      type="number"
                      min={64}
                      max={2048}
                      step={16}
                      value={width}
                      onChange={(e) => setWidth(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void convert()}
                    disabled={ffmpegState !== "ready" || isWorking}
                    className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isWorking ? ui.converting : ui.startConvert}
                  </button>
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      download={downloadName}
                      className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      {ui.download} {downloadName}
                    </a>
                  )}
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

                {error && (
                  <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                    {error}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.ffmpegLogs}</div>
                <textarea
                  value={logs}
                  readOnly
                  placeholder={ui.logsPlaceholder}
                  className="mt-3 h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GifToVideoClient() {
  return (
    <ToolPageLayout toolSlug="gif-to-video" maxWidthClassName="max-w-6xl">
      <GifToVideoInner />
    </ToolPageLayout>
  );
}
