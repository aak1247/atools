"use client";

import type { ChangeEvent } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type OutputFormat = "mp4" | "webm" | "mkv" | "mov" | "avi";
type ScalePreset = "keep" | "720p" | "1080p";
type FpsChoice = "keep" | 24 | 30 | 60;

type Ui = {
  hint: string;
  pick: string;
  clear: string;
  loadFfmpeg: string;
  ffmpegLoading: string;
  ffmpegReady: string;
  file: string;
  outputFormat: string;
  scale: string;
  keep: string;
  fps: string;
  crf: string;
  preset: string;
  audioBitrate: string;
  start: string;
  working: string;
  download: string;
  progress: string;
  logs: string;
  logsPlaceholder: string;
  errPickVideo: string;
  errFfmpegLoadFailed: string;
  errTranscodeFailed: string;
  note: string;
};

const DEFAULT_UI: Ui = {
  hint: "视频格式转换：MP4/WebM/MKV/MOV/AVI 转换，支持分辨率/帧率/CRF 等基础参数（纯前端本地处理不上传）。首次需加载 ffmpeg.wasm。",
  pick: "选择视频文件",
  clear: "清空",
  loadFfmpeg: "加载 FFmpeg",
  ffmpegLoading: "加载中…",
  ffmpegReady: "FFmpeg 已就绪",
  file: "文件",
  outputFormat: "输出格式",
  scale: "分辨率",
  keep: "保持原始",
  fps: "帧率",
  crf: "质量(CRF)",
  preset: "编码速度",
  audioBitrate: "音频码率(kbps)",
  start: "开始转换",
  working: "处理中…",
  download: "下载",
  progress: "进度",
  logs: "FFmpeg 日志",
  logsPlaceholder: "日志会显示在这里…",
  errPickVideo: "请先选择一个视频文件。",
  errFfmpegLoadFailed: "FFmpeg 加载失败。",
  errTranscodeFailed: "转换失败（可能输出编码器未内置或浏览器资源不足）。",
  note: "提示：不同浏览器/ffmpeg.wasm 构建的编码器支持不同，若失败可换输出格式或降低参数。",
};

const CORE_BASE = "/vendor/ffmpeg/core/";

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(value)));

const pickMime = (format: OutputFormat): string => {
  if (format === "mp4" || format === "mov") return "video/mp4";
  if (format === "webm") return "video/webm";
  if (format === "mkv") return "video/x-matroska";
  return "video/x-msvideo";
};

export default function VideoFormatConverterClient() {
  return (
    <ToolPageLayout toolSlug="video-format-converter" maxWidthClassName="max-w-6xl">
      {({ config }) => <Inner ui={{ ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) }} />}
    </ToolPageLayout>
  );
}

function Inner({ ui }: { ui: Ui }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const logRef = useRef<string[]>([]);

  const [ffmpegState, setFfmpegState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [logs, setLogs] = useState("");
  const [progress, setProgress] = useState<number | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp4");
  const [scale, setScale] = useState<ScalePreset>("keep");
  const [fps, setFps] = useState<FpsChoice>("keep");
  const [crf, setCrf] = useState(23);
  const [preset, setPreset] = useState<"ultrafast" | "fast" | "medium" | "slow">("fast");
  const [audioBitrate, setAudioBitrate] = useState(128);

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("output.mp4");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const inputName = useMemo(() => {
    if (!file) return null;
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]+/g, "");
    return `input.${ext || "mp4"}`;
  }, [file]);

  const ensureLoaded = async () => {
    if (ffmpegState === "ready" || ffmpegState === "loading") return;
    setFfmpegState("loading");
    setFfmpegError(null);
    setError(null);
    setProgress(null);
    logRef.current = [];
    setLogs("");

    try {
      const ffmpeg = new FFmpeg();
      ffmpeg.on("log", ({ message }) => {
        logRef.current.push(message);
        if (logRef.current.length > 800) logRef.current.splice(0, logRef.current.length - 800);
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
      setFfmpegError(e instanceof Error ? e.message : ui.errFfmpegLoadFailed);
    }
  };

  const pickFile = (selected: File) => {
    setFile(selected);
    setError(null);
    setProgress(null);
    logRef.current = [];
    setLogs("");
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    const base = selected.name.replace(/\.[^.]+$/u, "") || "output";
    setDownloadName(`${base}.${outputFormat}`);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pickFile(selected);
    e.target.value = "";
  };

  const clear = () => {
    setFile(null);
    setError(null);
    setProgress(null);
    logRef.current = [];
    setLogs("");
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    setDownloadName("output.mp4");
  };

  const transcode = async () => {
    if (!file || !inputName) {
      setError(ui.errPickVideo);
      return;
    }
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

    const outName = `output.${outputFormat}`;
    const args: string[] = ["-hide_banner", "-y", "-i", inputName];

    if (scale !== "keep") {
      const targetH = scale === "720p" ? 720 : 1080;
      args.push("-vf", `scale=-2:${targetH}`);
    }
    if (fps !== "keep") args.push("-r", String(fps));

    const safeCrf = clampInt(crf, 16, 35);
    const safeAb = clampInt(audioBitrate, 64, 320);

    if (outputFormat === "webm") {
      args.push("-c:v", "libvpx-vp9", "-b:v", "0", "-crf", String(safeCrf), "-c:a", "libopus", "-b:a", `${safeAb}k`);
    } else if (outputFormat === "avi") {
      args.push("-c:v", "mpeg4", "-q:v", "5", "-c:a", "mp3", "-b:a", `${safeAb}k`);
    } else {
      args.push("-c:v", "libx264", "-preset", preset, "-crf", String(safeCrf), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", `${safeAb}k`);
    }

    args.push(outName);

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec(args);
      const data = (await ffmpeg.readFile(outName)) as Uint8Array;
      const blob = new Blob([toArrayBuffer(data)], { type: pickMime(outputFormat) });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      const base = file.name.replace(/\.[^.]+$/u, "") || "output";
      setDownloadName(`${base}.${outputFormat}`);
      setProgress(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errTranscodeFailed);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.hint}</div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            {ui.pick}
          </button>
          <button type="button" onClick={clear} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {ui.clear}
          </button>
          <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onChange} />

          <div className="ml-auto flex items-center gap-2 text-xs text-slate-600">
            {ffmpegState === "ready" ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-200">{ui.ffmpegReady}</span>
            ) : (
              <button
                type="button"
                onClick={() => void ensureLoaded()}
                disabled={ffmpegState === "loading"}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {ffmpegState === "loading" ? ui.ffmpegLoading : ui.loadFfmpeg}
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.file}</div>
            <div className="mt-2 text-xs text-slate-600 break-all">{file ? file.name : "-"}</div>

            <div className="mt-5 grid gap-3">
              <label className="block text-sm text-slate-700">
                {ui.outputFormat}
                <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value as OutputFormat)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30">
                  <option value="mp4">MP4 (H.264)</option>
                  <option value="webm">WebM (VP9)</option>
                  <option value="mkv">MKV</option>
                  <option value="mov">MOV</option>
                  <option value="avi">AVI</option>
                </select>
              </label>

              <label className="block text-sm text-slate-700">
                {ui.scale}
                <select value={scale} onChange={(e) => setScale(e.target.value as ScalePreset)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30">
                  <option value="keep">{ui.keep}</option>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                </select>
              </label>

              <label className="block text-sm text-slate-700">
                {ui.fps}
                <select value={fps} onChange={(e) => setFps(e.target.value === "keep" ? "keep" : (Number(e.target.value) as 24 | 30 | 60))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30">
                  <option value="keep">{ui.keep}</option>
                  <option value={24}>24</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                </select>
              </label>

              <label className="block text-sm text-slate-700">
                {ui.crf} <span className="text-xs text-slate-500">(16-35)</span>
                <input type="number" min={16} max={35} value={crf} onChange={(e) => setCrf(clampInt(Number(e.target.value), 16, 35))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30" />
              </label>

              <label className="block text-sm text-slate-700">
                {ui.preset}
                <select value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30">
                  <option value="ultrafast">ultrafast</option>
                  <option value="fast">fast</option>
                  <option value="medium">medium</option>
                  <option value="slow">slow</option>
                </select>
              </label>

              <label className="block text-sm text-slate-700">
                {ui.audioBitrate}
                <input type="number" min={64} max={320} step={16} value={audioBitrate} onChange={(e) => setAudioBitrate(clampInt(Number(e.target.value), 64, 320))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30" />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void transcode()} disabled={ffmpegState !== "ready" || isWorking} className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                {isWorking ? ui.working : ui.start}
              </button>
              {downloadUrl ? (
                <a href={downloadUrl} download={downloadName} className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                  {ui.download} {downloadName}
                </a>
              ) : null}
            </div>

            {progress != null ? (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>{ui.progress}</span>
                  <span>{Math.round(progress * 100)}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              </div>
            ) : null}

            {ffmpegError ? <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">{ffmpegError}</div> : null}
            {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}
            <div className="mt-4 text-xs text-slate-500">{ui.note}</div>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.logs}</div>
            <textarea value={logs} readOnly placeholder={ui.logsPlaceholder} className="mt-3 h-[520px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

