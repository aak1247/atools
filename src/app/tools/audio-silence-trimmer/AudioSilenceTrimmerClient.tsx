"use client";

import type { ChangeEvent } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type OutputFormat = "wav" | "mp3";
type TrimMode = "start-end" | "all";

const CORE_BASE = "/vendor/ffmpeg/core/";

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const pickMime = (format: OutputFormat): string => (format === "wav" ? "audio/wav" : "audio/mpeg");

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const buildSilenceFilter = (mode: TrimMode, thresholdDb: number, minSilenceSec: number) => {
  const t = clamp(Math.round(thresholdDb), -80, -5);
  const d = clamp(minSilenceSec, 0.05, 10);
  const base = `silenceremove=start_periods=1:start_duration=${d}:start_threshold=${t}dB`;
  if (mode === "all") {
    // also remove silence segments after audio starts
    return `silenceremove=start_periods=1:start_duration=${d}:start_threshold=${t}dB:stop_periods=-1:stop_duration=${d}:stop_threshold=${t}dB`;
  }
  // trim start and end only: forward + reverse + forward
  return `${base},areverse,${base},areverse`;
};

export default function AudioSilenceTrimmerClient() {
  return (
    <ToolPageLayout toolSlug="audio-silence-trimmer" maxWidthClassName="max-w-6xl">
      <AudioSilenceTrimmerInner />
    </ToolPageLayout>
  );
}

function AudioSilenceTrimmerInner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const logRef = useRef<string[]>([]);

  const [ffmpegState, setFfmpegState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<TrimMode>("start-end");
  const [thresholdDb, setThresholdDb] = useState(-35);
  const [minSilenceSec, setMinSilenceSec] = useState(0.2);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("wav");

  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [logs, setLogs] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("trimmed.wav");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const inputName = useMemo(() => {
    if (!file) return null;
    const ext = (file.name.split(".").pop() || "audio").replace(/[^a-z0-9]+/gi, "");
    return `input.${ext || "audio"}`;
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
    setError(null);
    setProgress(null);
    logRef.current = [];
    setLogs("");
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    const base = selected.name.replace(/\.[^.]+$/, "") || "trimmed";
    setDownloadName(`${base}.trim.${outputFormat}`);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pick(selected);
  };

  useEffect(() => {
    if (!file) return;
    const base = file.name.replace(/\.[^.]+$/, "") || "trimmed";
    setDownloadName(`${base}.trim.${outputFormat}`);
  }, [file, outputFormat]);

  const run = async () => {
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

    const outName = outputFormat === "wav" ? "output.wav" : "output.mp3";
    const filter = buildSilenceFilter(mode, thresholdDb, minSilenceSec);
    const args: string[] = ["-hide_banner", "-y", "-i", inputName, "-af", filter];
    if (outputFormat === "wav") args.push("-c:a", "pcm_s16le", outName);
    else args.push("-c:a", "libmp3lame", "-b:a", "192k", outName);

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec(args);
      const data = (await ffmpeg.readFile(outName)) as Uint8Array;
      const blob = new Blob([toArrayBuffer(data)], { type: pickMime(outputFormat) });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "处理失败（可能浏览器资源不足或编码器不支持）。");
      setFfmpegState("error");
    } finally {
      setIsWorking(false);
    }
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
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">音频自动剪静音</div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                ffmpegState === "ready"
                  ? "bg-emerald-50 text-emerald-800"
                  : ffmpegState === "loading"
                    ? "bg-amber-50 text-amber-800"
                    : "bg-slate-100 text-slate-700"
              }`}
            >
              {ffmpegState === "ready" ? "FFmpeg 已就绪" : ffmpegState === "loading" ? "加载中…" : "FFmpeg"}
            </span>
            <button
              type="button"
              onClick={() => void ensureLoaded()}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              加载 FFmpeg
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          提示：此工具基于 ffmpeg.wasm 的 `silenceremove` 过滤器自动剪除静音。全程本地处理，不上传音频。
        </div>

        <div className="mt-6">
          <input ref={inputRef} type="file" accept="audio/*,video/*" className="hidden" onChange={onChange} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              选择文件
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              清空
            </button>
            {file && (
              <div className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{file.name}</span>{" "}
                <span className="text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            )}
          </div>
        </div>

        {file && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">设置</div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    模式
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as TrimMode)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="start-end">仅去开头/结尾静音</option>
                      <option value="all">移除全部静音片段（可能影响停顿）</option>
                    </select>
                  </label>
                  <label className="block text-sm text-slate-700">
                    输出格式
                    <select
                      value={outputFormat}
                      onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="wav">WAV（推荐）</option>
                      <option value="mp3">MP3</option>
                    </select>
                  </label>
                  <label className="block text-sm text-slate-700 sm:col-span-2">
                    静音阈值（dB）：{thresholdDb}dB
                    <input
                      type="range"
                      min={-80}
                      max={-5}
                      step={1}
                      value={thresholdDb}
                      onChange={(e) => setThresholdDb(Number(e.target.value))}
                      className="mt-3 w-full accent-emerald-600"
                    />
                  </label>
                  <label className="block text-sm text-slate-700 sm:col-span-2">
                    最小静音时长（秒）
                    <input
                      type="number"
                      min={0.05}
                      max={10}
                      step={0.05}
                      value={minSilenceSec}
                      onChange={(e) => setMinSilenceSec(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                    <div className="mt-1 text-xs text-slate-500 font-mono">{buildSilenceFilter(mode, thresholdDb, minSilenceSec)}</div>
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void run()}
                    disabled={ffmpegState !== "ready" || isWorking}
                    className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isWorking ? "处理中…" : "开始处理"}
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

                {downloadUrl && (
                  <div className="mt-4 rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="text-sm font-semibold text-slate-900">试听预览</div>
                    <audio controls className="mt-3 w-full" src={downloadUrl} />
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

