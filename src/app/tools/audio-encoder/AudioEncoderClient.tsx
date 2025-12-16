"use client";

import type { ChangeEvent } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useEffect, useMemo, useRef, useState } from "react";

type OutputFormat = "mp3" | "wav" | "m4a" | "ogg" | "flac";

type ParsedInfo = {
  container?: string;
  durationSec?: number;
  bitrateKbps?: number;
  audioCodec?: string;
  sampleRateHz?: number;
  channels?: string;
};

const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/`;

const formatSeconds = (seconds: number | undefined): string => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "-";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

const pickMime = (format: OutputFormat): string => {
  if (format === "mp3") return "audio/mpeg";
  if (format === "wav") return "audio/wav";
  if (format === "m4a") return "audio/mp4";
  if (format === "ogg") return "audio/ogg";
  return "audio/flac";
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const parseInfoFromLog = (logText: string): ParsedInfo => {
  const lines = logText.split(/\r?\n/);
  const out: ParsedInfo = {};

  for (const line of lines) {
    const input = line.match(/^Input #0,\s*(.+?),\s*from/i);
    if (input && !out.container) out.container = input[1].trim();

    const duration = line.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (duration && out.durationSec == null) {
      const hh = Number(duration[1]);
      const mm = Number(duration[2]);
      const ss = Number(duration[3]);
      out.durationSec = hh * 3600 + mm * 60 + ss;
    }

    const bitrate = line.match(/bitrate:\s*([0-9.]+)\s*kb\/s/i);
    if (bitrate && out.bitrateKbps == null) out.bitrateKbps = Number(bitrate[1]);

    const audio = line.match(/Audio:\s*([^,]+),\s*(\d+)\s*Hz,\s*([^,]+)/i);
    if (audio && !out.audioCodec) {
      out.audioCodec = audio[1].trim();
      out.sampleRateHz = Number(audio[2]);
      out.channels = audio[3].trim();
    }
  }

  return out;
};

export default function AudioEncoderClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const logRef = useRef<string[]>([]);

  const [ffmpegState, setFfmpegState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp3");
  const [bitrateKbps, setBitrateKbps] = useState(192);
  const [sampleRate, setSampleRate] = useState<"keep" | 22050 | 44100 | 48000>("keep");
  const [channels, setChannels] = useState<"keep" | 1 | 2>("keep");

  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedInfo | null>(null);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("output.mp3");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const inputName = useMemo(() => {
    if (!file) return null;
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]+/g, "");
    return `input.${ext || "bin"}`;
  }, [file]);

  const ensureLoaded = async () => {
    if (ffmpegState === "ready") return;
    if (ffmpegState === "loading") return;

    setFfmpegState("loading");
    setFfmpegError(null);
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
      const workerURL = await toBlobURL(`${CORE_BASE}ffmpeg-core.worker.js`, "text/javascript");

      await ffmpeg.load({ coreURL, wasmURL, workerURL });
      ffmpegRef.current = ffmpeg;
      setFfmpegState("ready");
    } catch (e) {
      setFfmpegState("error");
      setFfmpegError(e instanceof Error ? e.message : "FFmpeg 加载失败。");
    }
  };

  const pick = (selected: File) => {
    setFile(selected);
    setParsed(null);
    logRef.current = [];
    setLogs("");
    setProgress(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    const base = selected.name.replace(/\.[^.]+$/, "") || "output";
    setDownloadName(`${base}.${outputFormat}`);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pick(selected);
  };

  useEffect(() => {
    if (!file) return;
    const base = file.name.replace(/\.[^.]+$/, "") || "output";
    setDownloadName(`${base}.${outputFormat}`);
  }, [file, outputFormat]);

  const parseInfo = async () => {
    if (!file || !inputName) return;
    await ensureLoaded();
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) return;

    setIsWorking(true);
    setProgress(null);
    setParsed(null);
    logRef.current = [];
    setLogs("");

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      try {
        await ffmpeg.exec(["-hide_banner", "-i", inputName]);
      } catch {
        // 仅用于输出媒体信息，通常会因为 “At least one output file must be specified” 而返回非 0。
      }
      const text = logRef.current.join("\n");
      setParsed(parseInfoFromLog(text));
    } catch (e) {
      setParsed(null);
      setFfmpegError(e instanceof Error ? e.message : "解析失败。");
      setFfmpegState("error");
    } finally {
      setIsWorking(false);
    }
  };

  const transcode = async () => {
    if (!file || !inputName) return;
    await ensureLoaded();
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) return;

    setIsWorking(true);
    setProgress(0);
    logRef.current = [];
    setLogs("");
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    const base = file.name.replace(/\.[^.]+$/, "") || "output";
    const outName = `output.${outputFormat}`;

    const args: string[] = ["-hide_banner", "-y", "-i", inputName, "-vn"];
    if (channels !== "keep") args.push("-ac", String(channels));
    if (sampleRate !== "keep") args.push("-ar", String(sampleRate));

    if (outputFormat === "wav") {
      args.push("-c:a", "pcm_s16le", outName);
    } else if (outputFormat === "mp3") {
      args.push("-c:a", "libmp3lame", "-b:a", `${bitrateKbps}k`, outName);
    } else if (outputFormat === "m4a") {
      args.push("-c:a", "aac", "-b:a", `${bitrateKbps}k`, outName);
    } else if (outputFormat === "ogg") {
      args.push("-c:a", "libopus", "-b:a", `${Math.max(32, Math.min(320, bitrateKbps))}k`, outName);
    } else {
      args.push("-c:a", "flac", outName);
    }

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec(args);
      const data = (await ffmpeg.readFile(outName)) as Uint8Array;
      const blob = new Blob([toArrayBuffer(data)], { type: pickMime(outputFormat) });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName(`${base}.${outputFormat}`);
      setProgress(1);
    } catch (e) {
      setFfmpegError(
        e instanceof Error
          ? e.message
          : "转码失败（可能是该输出编码器未内置或浏览器资源不足）。",
      );
      setFfmpegState("error");
    } finally {
      setIsWorking(false);
    }
  };

  const clear = () => {
    setFile(null);
    setParsed(null);
    logRef.current = [];
    setLogs("");
    setProgress(null);
    setFfmpegError(null);
    setFfmpegState("idle");
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    if (inputRef.current) inputRef.current.value = "";
    ffmpegRef.current = null;
  };

  const showBitrate = outputFormat === "mp3" || outputFormat === "m4a" || outputFormat === "ogg";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">音频编码与格式解析</h1>
        <p className="mt-2 text-sm text-slate-500">基于 ffmpeg.wasm：解析音频信息 + 转码导出（纯本地处理）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">选择音频文件</div>
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
              disabled={!file && ffmpegState === "idle"}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              清空
            </button>
            <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={onChange} />
          </div>
        </div>

        <div className="mt-4 rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-600">
          提示：首次加载 ffmpeg.wasm 需要下载核心文件（较大），可能耗时；全程在浏览器本地处理，不上传服务器。
        </div>

        {file && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">文件</div>
                  <div className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
                <div className="mt-3 text-sm text-slate-800 break-all">{file.name}</div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void ensureLoaded()}
                    disabled={ffmpegState === "ready" || ffmpegState === "loading"}
                    className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {ffmpegState === "ready" ? "FFmpeg 已就绪" : ffmpegState === "loading" ? "加载中..." : "加载 FFmpeg"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void parseInfo()}
                    disabled={ffmpegState !== "ready" || isWorking}
                    className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    解析格式信息
                  </button>
                </div>

                {parsed && (
                  <div className="mt-4 grid gap-2 text-sm text-slate-700">
                    <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2 ring-1 ring-slate-200">
                      <span className="text-slate-500">容器</span>
                      <span className="font-semibold text-slate-900">{parsed.container ?? "-"}</span>
                    </div>
                    <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2 ring-1 ring-slate-200">
                      <span className="text-slate-500">时长</span>
                      <span className="font-semibold text-slate-900">{formatSeconds(parsed.durationSec)}</span>
                    </div>
                    <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2 ring-1 ring-slate-200">
                      <span className="text-slate-500">比特率</span>
                      <span className="font-semibold text-slate-900">
                        {parsed.bitrateKbps ? `${Math.round(parsed.bitrateKbps)} kb/s` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2 ring-1 ring-slate-200">
                      <span className="text-slate-500">音频编码</span>
                      <span className="font-semibold text-slate-900">{parsed.audioCodec ?? "-"}</span>
                    </div>
                    <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2 ring-1 ring-slate-200">
                      <span className="text-slate-500">采样率</span>
                      <span className="font-semibold text-slate-900">
                        {parsed.sampleRateHz ? `${parsed.sampleRateHz} Hz` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2 ring-1 ring-slate-200">
                      <span className="text-slate-500">声道</span>
                      <span className="font-semibold text-slate-900">{parsed.channels ?? "-"}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">转码设置</div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    输出格式
                    <select
                      value={outputFormat}
                      onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="mp3">MP3</option>
                      <option value="wav">WAV (PCM)</option>
                      <option value="m4a">M4A (AAC)</option>
                      <option value="ogg">OGG (Opus)</option>
                      <option value="flac">FLAC</option>
                    </select>
                  </label>

                  <label className="block text-sm text-slate-700">
                    采样率
                    <select
                      value={sampleRate}
                      onChange={(e) => setSampleRate(e.target.value === "keep" ? "keep" : (Number(e.target.value) as 22050 | 44100 | 48000))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="keep">保持原始</option>
                      <option value={22050}>22050 Hz</option>
                      <option value={44100}>44100 Hz</option>
                      <option value={48000}>48000 Hz</option>
                    </select>
                  </label>

                  <label className="block text-sm text-slate-700">
                    声道
                    <select
                      value={channels}
                      onChange={(e) => setChannels(e.target.value === "keep" ? "keep" : (Number(e.target.value) as 1 | 2))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="keep">保持原始</option>
                      <option value={1}>单声道</option>
                      <option value={2}>双声道</option>
                    </select>
                  </label>

                  <label className={`block text-sm text-slate-700 ${showBitrate ? "" : "opacity-60"}`}>
                    码率（kbps）
                    <input
                      type="number"
                      min={32}
                      max={320}
                      step={16}
                      value={bitrateKbps}
                      onChange={(e) => setBitrateKbps(Number(e.target.value))}
                      disabled={!showBitrate}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void transcode()}
                    disabled={ffmpegState !== "ready" || isWorking}
                    className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isWorking ? "处理中..." : "开始转码"}
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

                {ffmpegError && (
                  <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                    {ffmpegError}
                  </div>
                )}
              </div>

              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">FFmpeg 日志</div>
                <textarea
                  value={logs}
                  readOnly
                  placeholder="日志会显示在这里…"
                  className="mt-3 h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
