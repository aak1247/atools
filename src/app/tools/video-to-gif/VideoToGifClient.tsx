"use client";

import type { ChangeEvent } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useEffect, useMemo, useRef, useState } from "react";
import { getFFmpegBaseURL } from "../../../lib/r2-assets";

// 动态获取 FFmpeg 基础 URL（支持本地和 R2）
const CORE_BASE = getFFmpegBaseURL();

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const formatSeconds = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0";
  return seconds.toFixed(2).replace(/\.00$/, "");
};

export default function VideoToGifClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const logRef = useRef<string[]>([]);

  const [ffmpegState, setFfmpegState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [startSec, setStartSec] = useState(0);
  const [durationSec, setDurationSec] = useState(5);
  const [fps, setFps] = useState(15);
  const [width, setWidth] = useState(480);
  const [loop, setLoop] = useState(true);

  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [logs, setLogs] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("output.gif");

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
      setError(e instanceof Error ? e.message : "FFmpeg 加载失败。");
    }
  };

  const pick = (selected: File) => {
    setFile(selected);
    setStartSec(0);
    setDurationSec(5);
    logRef.current = [];
    setLogs("");
    setProgress(null);
    setError(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    const base = selected.name.replace(/\.[^.]+$/, "") || "output";
    setDownloadName(`${base}.gif`);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pick(selected);
  };

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

    const outName = "output.gif";
    const safeFps = Math.max(1, Math.min(60, Math.round(fps)));
    const safeWidth = Math.max(64, Math.min(2048, Math.round(width)));
    const safeStart = Math.max(0, startSec);
    const safeDuration = Math.max(0.1, durationSec);

    const filter = [
      `[0:v]`,
      `fps=${safeFps}`,
      `scale=${safeWidth}:-1:flags=lanczos`,
      `split[s0][s1];`,
      `[s0]palettegen[p];`,
      `[s1][p]paletteuse`,
    ].join(",");

    const args: string[] = [
      "-hide_banner",
      "-y",
      "-ss",
      formatSeconds(safeStart),
      "-t",
      formatSeconds(safeDuration),
      "-i",
      inputName,
      "-filter_complex",
      filter,
      "-loop",
      loop ? "0" : "-1",
      outName,
    ];

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec(args);
      const data = (await ffmpeg.readFile(outName)) as Uint8Array;
      const blob = new Blob([toArrayBuffer(data)], { type: "image/gif" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "转换失败，请稍后重试。");
      setFfmpegState("error");
    } finally {
      setIsWorking(false);
    }
  };

  const clear = () => {
    setFile(null);
    setStartSec(0);
    setDurationSec(5);
    setFps(15);
    setWidth(480);
    setLoop(true);
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
    <div className="mx-auto w-full max-w-6xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">视频转 GIF</h1>
        <p className="mt-2 text-sm text-slate-500">基于 ffmpeg.wasm：截取片段并转为 GIF（纯本地处理）</p>
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
              onClick={() => void ensureLoaded()}
              disabled={ffmpegState === "ready" || ffmpegState === "loading"}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {ffmpegState === "ready" ? "FFmpeg 已就绪" : ffmpegState === "loading" ? "加载中..." : "加载 FFmpeg"}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={!file && ffmpegState === "idle"}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              清空
            </button>
            <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onChange} />
          </div>
        </div>

        <div className="mt-4 rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-600">
          提示：首次加载 ffmpeg.wasm 需要下载核心文件（较大），可能耗时；全程在浏览器本地处理，不上传服务器。
        </div>

        {file && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">设置</div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    开始时间（秒）
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={startSec}
                      onChange={(e) => setStartSec(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                  <label className="block text-sm text-slate-700">
                    截取时长（秒）
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={durationSec}
                      onChange={(e) => setDurationSec(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                  <label className="block text-sm text-slate-700">
                    帧率（FPS）
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
                  <label className="block text-sm text-slate-700">
                    宽度（px）
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
                <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={loop}
                    onChange={(e) => setLoop(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  循环播放（GIF loop=0）
                </label>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void convert()}
                    disabled={ffmpegState !== "ready" || isWorking}
                    className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isWorking ? "转换中..." : "开始转换"}
                  </button>
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      download={downloadName}
                      className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      下载 {downloadName}
                    </a>
                  )}
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

                {error && (
                  <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                    {error}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">FFmpeg 日志</div>
                <textarea
                  value={logs}
                  readOnly
                  placeholder="日志会显示在这里…"
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
