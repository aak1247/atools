"use client";

import type { ChangeEvent } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type OutputFormat = "mp3" | "wav" | "m4a" | "ogg" | "flac" | "opus";

type Ui = {
  hint: string;
  pick: string;
  clear: string;
  loadFfmpeg: string;
  ffmpegLoading: string;
  ffmpegReady: string;
  file: string;
  outputFormat: string;
  bitrate: string;
  sampleRate: string;
  channels: string;
  keep: string;
  mono: string;
  stereo: string;
  metadata: string;
  title: string;
  artist: string;
  album: string;
  start: string;
  working: string;
  download: string;
  progress: string;
  logs: string;
  logsPlaceholder: string;
  errPickAudio: string;
  errFfmpegLoadFailed: string;
  errTranscodeFailed: string;
};

const DEFAULT_UI: Ui = {
  hint: "音频格式转换：支持 MP3/WAV/FLAC/OGG/M4A/OPUS 转换与基础参数设置（纯前端本地处理不上传）。首次需加载 ffmpeg.wasm。",
  pick: "选择音频文件",
  clear: "清空",
  loadFfmpeg: "加载 FFmpeg",
  ffmpegLoading: "加载中…",
  ffmpegReady: "FFmpeg 已就绪",
  file: "文件",
  outputFormat: "输出格式",
  bitrate: "码率(kbps)",
  sampleRate: "采样率(Hz)",
  channels: "声道",
  keep: "保持原始",
  mono: "单声道",
  stereo: "双声道",
  metadata: "元数据",
  title: "标题",
  artist: "艺术家",
  album: "专辑",
  start: "开始转换",
  working: "处理中…",
  download: "下载",
  progress: "进度",
  logs: "FFmpeg 日志",
  logsPlaceholder: "日志会显示在这里…",
  errPickAudio: "请先选择一个音频文件。",
  errFfmpegLoadFailed: "FFmpeg 加载失败。",
  errTranscodeFailed: "转换失败（可能输出编码器未内置或浏览器资源不足）。",
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
  if (format === "mp3") return "audio/mpeg";
  if (format === "wav") return "audio/wav";
  if (format === "m4a") return "audio/mp4";
  if (format === "ogg") return "audio/ogg";
  if (format === "opus") return "audio/ogg";
  return "audio/flac";
};

const outputExt = (format: OutputFormat) => (format === "m4a" ? "m4a" : format);

export default function AudioFormatConverterClient() {
  return (
    <ToolPageLayout toolSlug="audio-format-converter" maxWidthClassName="max-w-6xl">
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
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp3");
  const [bitrateKbps, setBitrateKbps] = useState(192);
  const [sampleRate, setSampleRate] = useState<number | "keep">("keep");
  const [channels, setChannels] = useState<1 | 2 | "keep">("keep");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaArtist, setMetaArtist] = useState("");
  const [metaAlbum, setMetaAlbum] = useState("");

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("output.mp3");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const inputName = useMemo(() => {
    if (!file) return null;
    const ext = (file.name.split(".").pop() || "audio").toLowerCase().replace(/[^a-z0-9]+/g, "");
    return `input.${ext || "audio"}`;
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
        if (logRef.current.length > 600) logRef.current.splice(0, logRef.current.length - 600);
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
    setDownloadName(`${base}.${outputExt(outputFormat)}`);
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
    setDownloadName("output.mp3");
  };

  const transcode = async () => {
    if (!file || !inputName) {
      setError(ui.errPickAudio);
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

    const outName = `output.${outputExt(outputFormat)}`;

    const args: string[] = ["-hide_banner", "-y", "-i", inputName];

    if (channels !== "keep") args.push("-ac", String(channels));
    if (sampleRate !== "keep") args.push("-ar", String(clampInt(sampleRate, 8000, 384000)));

    // encoder hints (may vary by wasm build)
    if (outputFormat === "mp3") args.push("-c:a", "libmp3lame", "-b:a", `${clampInt(bitrateKbps, 32, 320)}k`);
    if (outputFormat === "m4a") args.push("-c:a", "aac", "-b:a", `${clampInt(bitrateKbps, 32, 320)}k`);
    if (outputFormat === "ogg") args.push("-c:a", "libvorbis", "-q:a", "5");
    if (outputFormat === "opus") args.push("-c:a", "libopus", "-b:a", `${clampInt(bitrateKbps, 32, 320)}k`);
    if (outputFormat === "flac") args.push("-c:a", "flac");
    if (outputFormat === "wav") args.push("-c:a", "pcm_s16le");

    if (metaTitle.trim()) args.push("-metadata", `title=${metaTitle.trim()}`);
    if (metaArtist.trim()) args.push("-metadata", `artist=${metaArtist.trim()}`);
    if (metaAlbum.trim()) args.push("-metadata", `album=${metaAlbum.trim()}`);

    args.push(outName);

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec(args);
      const data = (await ffmpeg.readFile(outName)) as Uint8Array;
      const blob = new Blob([toArrayBuffer(data)], { type: pickMime(outputFormat) });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      const base = file.name.replace(/\.[^.]+$/u, "") || "output";
      setDownloadName(`${base}.${outputExt(outputFormat)}`);
      setProgress(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errTranscodeFailed);
      setFfmpegState("ready");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.hint}</div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {ui.pick}
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {ui.clear}
          </button>
          <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={onChange} />

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
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="mp3">MP3</option>
                  <option value="wav">WAV</option>
                  <option value="flac">FLAC</option>
                  <option value="ogg">OGG</option>
                  <option value="m4a">M4A (AAC)</option>
                  <option value="opus">OPUS</option>
                </select>
              </label>

              <label className="block text-sm text-slate-700">
                {ui.bitrate}
                <input
                  type="number"
                  min={32}
                  max={320}
                  step={16}
                  value={bitrateKbps}
                  onChange={(e) => setBitrateKbps(clampInt(Number(e.target.value), 32, 320))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>

              <label className="block text-sm text-slate-700">
                {ui.sampleRate}
                <select
                  value={sampleRate}
                  onChange={(e) => setSampleRate(e.target.value === "keep" ? "keep" : Number(e.target.value))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="keep">{ui.keep}</option>
                  {[8000, 16000, 22050, 24000, 32000, 44100, 48000, 96000].map((hz) => (
                    <option key={hz} value={hz}>
                      {hz}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-slate-700">
                {ui.channels}
                <select
                  value={channels}
                  onChange={(e) => setChannels(e.target.value === "keep" ? "keep" : (Number(e.target.value) as 1 | 2))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="keep">{ui.keep}</option>
                  <option value={1}>{ui.mono}</option>
                  <option value={2}>{ui.stereo}</option>
                </select>
              </label>
            </div>

            <div className="mt-6 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="text-xs font-medium text-slate-700">{ui.metadata}</div>
              <div className="mt-3 grid gap-2">
                <input
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder={ui.title}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                <input
                  value={metaArtist}
                  onChange={(e) => setMetaArtist(e.target.value)}
                  placeholder={ui.artist}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                <input
                  value={metaAlbum}
                  onChange={(e) => setMetaAlbum(e.target.value)}
                  placeholder={ui.album}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void transcode()}
                disabled={ffmpegState !== "ready" || isWorking}
                className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {isWorking ? ui.working : ui.start}
              </button>
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
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

            {ffmpegError ? (
              <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                {ffmpegError}
              </div>
            ) : null}
            {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.logs}</div>
            <textarea
              value={logs}
              readOnly
              placeholder={ui.logsPlaceholder}
              className="mt-3 h-[520px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

