"use client";

import type { ChangeEvent } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { getFFmpegBaseURL } from "../../../lib/r2-assets";

type Dither = "bayer" | "floyd_steinberg" | "none";

// 动态获取 FFmpeg 基础 URL（支持本地和 R2）
const CORE_BASE = getFFmpegBaseURL();

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 2).replace(/\\.00$/, "")} ${units[index]}`;
};

export default function GifOptimizerClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const logRef = useRef<string[]>([]);

  const [ffmpegState, setFfmpegState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fps, setFps] = useState(15);
  const [width, setWidth] = useState(480);
  const [maxColors, setMaxColors] = useState(128);
  const [dither, setDither] = useState<Dither>("bayer");
  const [loop, setLoop] = useState(true);

  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [logs, setLogs] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("output.gif");
  const [outputSize, setOutputSize] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

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
        setLogs(logRef.current.join("\\n"));
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
    logRef.current = [];
    setLogs("");
    setProgress(null);
    setError(null);
    setOutputSize(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    const base = selected.name.replace(/\\.[^.]+$/, "") || "output";
    setDownloadName(`${base}.optimized.gif`);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pick(selected);
  };

  const inputName = useMemo(() => (file ? "input.gif" : null), [file]);

  const optimize = async () => {
    if (!file || !inputName) return;
    await ensureLoaded();
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) return;

    setIsWorking(true);
    setError(null);
    setProgress(0);
    logRef.current = [];
    setLogs("");
    setOutputSize(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    const safeFps = Math.max(1, Math.min(60, Math.round(fps)));
    const safeWidth = Math.max(64, Math.min(2048, Math.round(width)));
    const safeColors = Math.max(2, Math.min(256, Math.round(maxColors)));
    const outName = "output.gif";

    const filter = [
      "[0:v]",
      `fps=${safeFps}`,
      `scale=${safeWidth}:-1:flags=lanczos`,
      "split[s0][s1];",
      `[s0]palettegen=max_colors=${safeColors}[p];`,
      `[s1][p]paletteuse=dither=${dither}`,
    ].join(",");

    const args: string[] = ["-hide_banner", "-y", "-i", inputName, "-filter_complex", filter, "-loop", loop ? "0" : "-1", outName];

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec(args);
      const data = (await ffmpeg.readFile(outName)) as Uint8Array;
      setOutputSize(data.byteLength);
      const blob = new Blob([toArrayBuffer(data)], { type: "image/gif" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "优化失败，请尝试降低宽度或颜色数。");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <ToolPageLayout toolSlug="gif-optimizer">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-700">
              基于 <span className="font-mono">ffmpeg.wasm</span> 本地处理，首次使用需下载核心文件（浏览器缓存）。
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void ensureLoaded()}
                disabled={ffmpegState === "loading" || ffmpegState === "ready"}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                {ffmpegState === "ready" ? "FFmpeg 已就绪" : ffmpegState === "loading" ? "加载中..." : "加载 FFmpeg"}
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200"
              >
                选择 GIF
              </button>
              <input ref={inputRef} type="file" accept="image/gif" className="hidden" onChange={onChange} />
            </div>
          </div>

          {file && (
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                  <div className="text-sm font-semibold text-slate-900">设置</div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                    <label className="block text-sm text-slate-700">
                      最大颜色数
                      <input
                        type="number"
                        min={2}
                        max={256}
                        step={1}
                        value={maxColors}
                        onChange={(e) => setMaxColors(Number(e.target.value))}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      />
                    </label>
                    <label className="block text-sm text-slate-700">
                      抖动算法
                      <select
                        value={dither}
                        onChange={(e) => setDither(e.target.value as Dither)}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      >
                        <option value="bayer">bayer（推荐）</option>
                        <option value="floyd_steinberg">floyd_steinberg</option>
                        <option value="none">none（无抖动）</option>
                      </select>
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
                      onClick={() => void optimize()}
                      disabled={ffmpegState !== "ready" || isWorking}
                      className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isWorking ? "优化中..." : "开始优化"}
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

                  <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <div>
                      原始体积：<span className="font-mono">{formatBytes(file.size)}</span>
                    </div>
                    <div>
                      优化后体积：<span className="font-mono">{outputSize != null ? formatBytes(outputSize) : "-"}</span>
                    </div>
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

                  <div className="mt-4 text-xs text-slate-500">
                    提示：降低宽度、帧率与颜色数通常能显著减小体积；若出现色带，可尝试更换抖动算法或提高颜色数。
                  </div>
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

          {!file && (
            <div className="mt-6 rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200 text-sm text-slate-700">
              选择一个 GIF 文件后即可开始优化（建议先点击“加载 FFmpeg”）。
            </div>
          )}
        </div>
      </div>
    </ToolPageLayout>
  );
}
