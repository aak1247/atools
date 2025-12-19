"use client";

import type { ChangeEvent } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type ParsedInfo = {
  container?: string;
  durationSec?: number;
  bitrateKbps?: number;
  video?: Array<{
    codec?: string;
    profile?: string;
    resolution?: string;
    fps?: string;
    pixFmt?: string;
  }>;
  audio?: Array<{
    codec?: string;
    sampleRateHz?: number;
    channels?: string;
    bitrateKbps?: number;
  }>;
};

const CORE_BASE = "/vendor/ffmpeg/core/";

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatSeconds = (seconds: number | undefined): string => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "-";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

const parseInfoFromLog = (logText: string): ParsedInfo => {
  const lines = logText.split(/\r?\n/);
  const out: ParsedInfo = { video: [], audio: [] };

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

    const video = line.match(/Stream #\d+:\d+.*:\s*Video:\s*([^,]+)(?:,\s*([^,]+))?(?:,\s*([^,]+))?(?:,\s*([^,]+))?/i);
    if (video) {
      const codec = video[1]?.trim();
      const extra1 = video[2]?.trim();
      const extra2 = video[3]?.trim();
      const extra3 = video[4]?.trim();
      const resolution = [extra1, extra2, extra3].find((s) => !!s && /\d+x\d+/.test(s || "")) ?? undefined;
      const fps = line.match(/(\d+(?:\.\d+)?)\s*fps/i)?.[1];
      const pixFmt = line.match(/\b(yuv[0-9a-z]+)\b/i)?.[1];
      out.video!.push({ codec, profile: extra1, resolution, fps, pixFmt });
    }

    const audio = line.match(/Stream #\d+:\d+.*:\s*Audio:\s*([^,]+),\s*(\d+)\s*Hz,\s*([^,]+)/i);
    if (audio) {
      const codec = audio[1].trim();
      const sampleRateHz = Number(audio[2]);
      const channels = audio[3].trim();
      const abr = line.match(/(\d+)\s*kb\/s/i)?.[1];
      out.audio!.push({ codec, sampleRateHz, channels, bitrateKbps: abr ? Number(abr) : undefined });
    }
  }

  if (out.video && out.video.length === 0) delete out.video;
  if (out.audio && out.audio.length === 0) delete out.audio;
  return out;
};

export default function MediaMetadataViewerClient() {
  return (
    <ToolPageLayout toolSlug="media-metadata-viewer" maxWidthClassName="max-w-6xl">
      <MediaMetadataViewerInner />
    </ToolPageLayout>
  );
}

function MediaMetadataViewerInner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const logRef = useRef<string[]>([]);

  const [ffmpegState, setFfmpegState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ParsedInfo | null>(null);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const inputName = useMemo(() => {
    if (!file) return null;
    const ext = (file.name.split(".").pop() || "bin").replace(/[^a-z0-9]+/gi, "");
    return `input.${ext || "bin"}`;
  }, [file]);

  const ensureLoaded = async () => {
    if (ffmpegState === "ready" || ffmpegState === "loading") return;
    setFfmpegState("loading");
    setError(null);

    try {
      const ffmpeg = new FFmpeg();
      ffmpeg.on("log", ({ message }) => {
        logRef.current.push(message);
        if (logRef.current.length > 800) logRef.current.splice(0, logRef.current.length - 800);
        setLogs(logRef.current.join("\n"));
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
    setInfo(null);
    logRef.current = [];
    setLogs("");
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(selected));
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pick(selected);
  };

  const analyze = async () => {
    if (!file || !inputName) return;
    await ensureLoaded();
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) return;
    setError(null);
    setInfo(null);
    logRef.current = [];
    setLogs("");
    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      // Process a tiny segment to get stream info; avoids full decode.
      await ffmpeg.exec(["-hide_banner", "-y", "-i", inputName, "-t", "0.1", "-f", "null", "-"]);
      const parsed = parseInfoFromLog(logRef.current.join("\n"));
      setInfo(parsed);
    } catch (e) {
      const parsed = parseInfoFromLog(logRef.current.join("\n"));
      if (parsed.container || parsed.durationSec || parsed.audio?.length || parsed.video?.length) {
        setInfo(parsed);
      } else {
        setError(e instanceof Error ? e.message : "解析失败");
      }
    }
  };

  const clear = () => {
    setFile(null);
    setError(null);
    setInfo(null);
    logRef.current = [];
    setLogs("");
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputRef} type="file" accept="audio/*,video/*" className="hidden" onChange={onChange} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              选择音视频文件
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
                <span className="text-slate-500">({formatSize(file.size)})</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void ensureLoaded()}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              加载 FFmpeg
            </button>
            <button
              type="button"
              onClick={() => void analyze()}
              disabled={!file}
              className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              解析元数据
            </button>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {ffmpegState === "ready" ? "FFmpeg 就绪" : ffmpegState === "loading" ? "加载中…" : "FFmpeg"}
            </span>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          说明：此工具使用浏览器本地解析（Media 元素 + 可选 FFmpeg 日志解析）展示容器/编码/码率/分辨率等信息，不上传文件。
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">预览</div>
            <div className="mt-3">
              {url && file?.type.startsWith("video/") ? (
                <video src={url} controls className="w-full rounded-2xl bg-black" />
              ) : url ? (
                <audio src={url} controls className="w-full" />
              ) : (
                <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
                  请选择音视频文件
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 text-xs text-slate-700 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                MIME：<span className="font-mono">{file?.type || "-"}</span>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                大小：<span className="font-mono">{file ? formatSize(file.size) : "-"}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">解析结果</div>
                <button
                  type="button"
                  onClick={() => void copy(JSON.stringify(info ?? {}, null, 2))}
                  disabled={!info}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  复制 JSON
                </button>
              </div>
              {!info ? (
                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                  点击“解析元数据”后显示。
                </div>
              ) : (
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                      容器：<span className="font-mono">{info.container ?? "-"}</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                      时长：<span className="font-mono">{formatSeconds(info.durationSec)}</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                      总码率：<span className="font-mono">{info.bitrateKbps != null ? `${info.bitrateKbps} kb/s` : "-"}</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                      视频流：<span className="font-mono">{info.video?.length ?? 0}</span> · 音频流：{" "}
                      <span className="font-mono">{info.audio?.length ?? 0}</span>
                    </div>
                  </div>

                  {info.video?.length ? (
                    <div className="rounded-2xl bg-white ring-1 ring-slate-200">
                      <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-700">Video</div>
                      <div className="p-4 space-y-2 text-xs text-slate-700">
                        {info.video.map((v, idx) => (
                          <div key={idx} className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                            codec <span className="font-mono">{v.codec ?? "-"}</span> · res{" "}
                            <span className="font-mono">{v.resolution ?? "-"}</span> · fps{" "}
                            <span className="font-mono">{v.fps ?? "-"}</span> · pix{" "}
                            <span className="font-mono">{v.pixFmt ?? "-"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {info.audio?.length ? (
                    <div className="rounded-2xl bg-white ring-1 ring-slate-200">
                      <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-700">Audio</div>
                      <div className="p-4 space-y-2 text-xs text-slate-700">
                        {info.audio.map((a, idx) => (
                          <div key={idx} className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                            codec <span className="font-mono">{a.codec ?? "-"}</span> · rate{" "}
                            <span className="font-mono">{a.sampleRateHz != null ? `${a.sampleRateHz} Hz` : "-"}</span> · ch{" "}
                            <span className="font-mono">{a.channels ?? "-"}</span> · abr{" "}
                            <span className="font-mono">{a.bitrateKbps != null ? `${a.bitrateKbps} kb/s` : "-"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">FFmpeg 日志</div>
              <textarea
                value={logs}
                readOnly
                placeholder="加载并解析后显示…"
                className="mt-3 h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
