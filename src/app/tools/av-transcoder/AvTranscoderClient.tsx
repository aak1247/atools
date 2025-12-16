"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type OutputFormat = "webm" | "wav";

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const pickMimeType = (kind: "audio" | "video"): string | null => {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates =
    kind === "video"
      ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
      : ["audio/webm;codecs=opus", "audio/webm", "video/webm;codecs=opus", "video/webm"];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
};

const writeString = (view: DataView, offset: number, value: string) => {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
};

const encodeWav = (audio: AudioBuffer): Blob => {
  const channels = audio.numberOfChannels;
  const sampleRate = audio.sampleRate;
  const length = audio.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch += 1) channelData.push(audio.getChannelData(ch));

  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
};

export default function AvTranscoderClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [output, setOutput] = useState<OutputFormat>("webm");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("output.webm");

  const kind = useMemo(() => {
    if (!file) return null;
    if (file.type.startsWith("audio/")) return "audio" as const;
    if (file.type.startsWith("video/")) return "video" as const;
    return "video" as const;
  }, [file]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl, url]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setError(null);
    setProgress(null);
    if (url) URL.revokeObjectURL(url);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    const next = URL.createObjectURL(selected);
    setFile(selected);
    setUrl(next);
    setDuration(0);
    setDownloadName(`${selected.name.replace(/\.[^.]+$/, "") || "output"}.${output}`);
  };

  const clear = () => {
    if (url) URL.revokeObjectURL(url);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setFile(null);
    setUrl(null);
    setDuration(0);
    setError(null);
    setProgress(null);
    setDownloadUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  useEffect(() => {
    if (!file) return;
    setDownloadName(`${file.name.replace(/\.[^.]+$/, "") || "output"}.${output}`);
  }, [file, output]);

  const canTranscode = useMemo(() => Boolean(file) && !isProcessing, [file, isProcessing]);

  const transcode = async () => {
    if (!file || !kind) {
      setError("请先选择一个音频或视频文件。");
      return;
    }
    setError(null);
    setProgress(0);
    setIsProcessing(true);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    try {
      if (output === "wav") {
        if (kind !== "audio") {
          setError("WAV 导出仅支持音频文件（video 请导出 WebM）。");
          return;
        }
        const context = new AudioContext();
        try {
          const raw = await file.arrayBuffer();
          const decoded = await context.decodeAudioData(raw.slice(0));
          const wav = encodeWav(decoded);
          setDownloadUrl(URL.createObjectURL(wav));
          setProgress(1);
        } finally {
          await context.close().catch(() => undefined);
        }
        return;
      }

      const mimeType = pickMimeType(kind);
      if (!mimeType) {
        setError("当前浏览器不支持 MediaRecorder 导出 WebM。");
        return;
      }

      const element = kind === "video" ? videoRef.current : audioRef.current;
      if (!element) {
        setError("媒体元素未初始化，请刷新页面重试。");
        return;
      }
      if (typeof (element as HTMLMediaElement & { captureStream?: () => MediaStream }).captureStream !== "function") {
        setError("当前浏览器不支持 captureStream，无法在纯前端导出 WebM。");
        return;
      }

      element.pause();
      element.currentTime = 0;

      const stream = (element as HTMLMediaElement & { captureStream: () => MediaStream }).captureStream();
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      });

      const stopPromise = new Promise<Blob>((resolve) => {
        recorder.addEventListener(
          "stop",
          () => resolve(new Blob(chunks, { type: mimeType })),
          { once: true },
        );
      });

      recorder.start(250);
      await element.play();

      const tick = window.setInterval(() => {
        const d = Number.isFinite(element.duration) ? element.duration : 0;
        const t = element.currentTime;
        if (d > 0) setProgress(Math.max(0, Math.min(1, t / d)));
        if (element.ended) {
          window.clearInterval(tick);
          element.pause();
          if (recorder.state !== "inactive") recorder.stop();
        }
      }, 100);

      const blob = await stopPromise;
      setDownloadUrl(URL.createObjectURL(blob));
      setProgress(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "转码失败，请稍后重试。");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">音视频转码</h1>
        <p className="mt-2 text-sm text-slate-500">导出 WebM / WAV（基于浏览器能力，纯本地处理）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">选择文件</div>
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
              disabled={!file || isProcessing}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              清空
            </button>
            <input ref={inputRef} type="file" accept="audio/*,video/*" className="hidden" onChange={onChange} />
          </div>
        </div>

        {url && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="space-y-4">
              {kind === "video" ? (
                <div className="overflow-hidden rounded-3xl bg-black ring-1 ring-slate-200">
                  <video
                    ref={videoRef}
                    src={url}
                    controls
                    className="h-auto w-full"
                    onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
                  />
                </div>
              ) : (
                <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                  <div className="text-sm font-semibold text-slate-900">预览</div>
                  <div className="mt-3">
                    <audio
                      ref={audioRef}
                      src={url}
                      controls
                      className="w-full"
                      onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
                    />
                  </div>
                </div>
              )}

              <div className="text-xs text-slate-500">
                文件：{file?.name ?? "-"} · 时长：{formatTime(duration)}（{duration.toFixed(2)}s）
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">输出格式</div>
                <div className="mt-4 grid gap-3">
                  <label className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                    <span className="text-sm font-semibold text-slate-900">WebM（实时转码）</span>
                    <input
                      type="radio"
                      name="format"
                      checked={output === "webm"}
                      onChange={() => setOutput("webm")}
                      className="h-4 w-4"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                    <span className="text-sm font-semibold text-slate-900">WAV（仅音频）</span>
                    <input
                      type="radio"
                      name="format"
                      checked={output === "wav"}
                      onChange={() => setOutput("wav")}
                      className="h-4 w-4"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">开始转码</div>
                <p className="mt-2 text-xs text-slate-500">
                  WebM 导出依赖浏览器对 MediaRecorder/captureStream 的支持；WAV 导出会解码并重编码，文件较大时耗时较长。
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={!canTranscode}
                    onClick={() => void transcode()}
                    className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {isProcessing ? "转码中..." : "开始转码"}
                  </button>
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

                {downloadUrl && (
                  <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    已生成输出文件：
                    <a
                      href={downloadUrl}
                      download={downloadName}
                      className="ml-2 font-semibold underline decoration-emerald-400 underline-offset-2"
                    >
                      下载 {downloadName}
                    </a>
                  </div>
                )}

                {error && <div className="mt-4 text-sm text-rose-600">错误：{error}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

