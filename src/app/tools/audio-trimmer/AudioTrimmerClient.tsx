"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

const DEFAULT_UI = {
  pickTitle: "选择音频文件",
  pickFile: "选择文件",
  previewTitle: "预览",
  durationTemplate: "时长：{time}（{seconds}s）",
  rangeTitle: "裁剪范围",
  startSeconds: "开始（秒）",
  endSeconds: "结束（秒）",
  selectedSegmentTemplate: "选中片段：{time}（{seconds}s）",
  exportTitle: "导出",
  exportHint: "导出为 WAV（16-bit PCM）。长音频导出会占用较多内存。",
  exportWav: "导出 WAV",
  processing: "处理中...",
  clear: "清空",
  generated: "已生成剪辑文件：",
  download: "下载",
  errorPrefix: "错误：",
  hint: "提示：不同浏览器对音频解码支持不同；如导出失败，建议先转为常见格式（MP3/WAV）后再试。",
  errChooseFile: "请先选择一个音频文件。",
  errEndAfterStart: "结束时间必须大于开始时间。",
  errProcessFailed: "处理音频失败，请换一个文件试试。",
} as const;

type AudioTrimmerUi = typeof DEFAULT_UI;

const applyTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
};

const writeString = (view: DataView, offset: number, value: string) => {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
};

const encodeWav = (audio: AudioBuffer): Blob => {
  const numberOfChannels = audio.numberOfChannels;
  const sampleRate = audio.sampleRate;
  const length = audio.length;
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // interleave channels
  const offset = 44;
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numberOfChannels; ch += 1) {
    channels.push(audio.getChannelData(ch));
  }
  const interleaved = new Float32Array(length * numberOfChannels);
  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < numberOfChannels; ch += 1) {
      interleaved[i * numberOfChannels + ch] = channels[ch][i];
    }
  }
  floatTo16BitPCM(view, offset, interleaved);

  return new Blob([buffer], { type: "audio/wav" });
};

export default function AudioTrimmerClient() {
  return (
    <ToolPageLayout toolSlug="audio-trimmer" maxWidthClassName="max-w-6xl">
      <AudioTrimmerInner />
    </ToolPageLayout>
  );
}

function AudioTrimmerInner() {
  const config = useOptionalToolConfig("audio-trimmer");
  const ui: AudioTrimmerUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<AudioTrimmerUi>) };

  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [start, setStart] = useState<number>(0);
  const [end, setEnd] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("clip.wav");

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl, objectUrl]);

  const handlePick = (selected: File) => {
    setError(null);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    const nextUrl = URL.createObjectURL(selected);
    setFile(selected);
    setObjectUrl(nextUrl);
    setDuration(0);
    setStart(0);
    setEnd(0);
    setDownloadName(`${selected.name.replace(/\.[^.]+$/, "") || "clip"}.wav`);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handlePick(selected);
  };

  const onLoadedMeta = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const d = Number.isFinite(audio.duration) ? audio.duration : 0;
    setDuration(d);
    setStart(0);
    setEnd(d);
  };

  const canExport = useMemo(() => {
    if (!file || !duration) return false;
    if (isProcessing) return false;
    if (!(end > start)) return false;
    if (start < 0 || end > duration) return false;
    return true;
  }, [duration, end, file, isProcessing, start]);

  const exportWav = async () => {
    if (!file) {
      setError(ui.errChooseFile);
      return;
    }
    if (!(end > start)) {
      setError(ui.errEndAfterStart);
      return;
    }
    setIsProcessing(true);
    setError(null);

    try {
      const context = new AudioContext();
      try {
        const raw = await file.arrayBuffer();
        const decoded = await context.decodeAudioData(raw.slice(0));
        const startSample = Math.floor(start * decoded.sampleRate);
        const endSample = Math.min(decoded.length, Math.floor(end * decoded.sampleRate));
        const nextLength = Math.max(0, endSample - startSample);

        const clipped = new AudioBuffer({
          length: nextLength,
          numberOfChannels: decoded.numberOfChannels,
          sampleRate: decoded.sampleRate,
        });

        for (let ch = 0; ch < decoded.numberOfChannels; ch += 1) {
          const src = decoded.getChannelData(ch);
          const dst = clipped.getChannelData(ch);
          dst.set(src.subarray(startSample, startSample + nextLength));
        }

        const wav = encodeWav(clipped);
        const url = URL.createObjectURL(wav);
        setDownloadUrl(url);
      } finally {
        await context.close().catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errProcessFailed);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">{ui.pickTitle}</div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {ui.pickFile}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={onChange}
          />
        </div>

        {file && objectUrl && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.previewTitle}</div>
                <div className="mt-3">
                  <audio ref={audioRef} src={objectUrl} controls className="w-full" onLoadedMetadata={onLoadedMeta} />
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {applyTemplate(ui.durationTemplate, { time: formatTime(duration), seconds: duration.toFixed(2) })}
                </div>
              </div>

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
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.exportTitle}</div>
                <p className="mt-2 text-xs text-slate-500">
                  {ui.exportHint}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={!canExport}
                    onClick={exportWav}
                    className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {isProcessing ? ui.processing : ui.exportWav}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (inputRef.current) inputRef.current.value = "";
                      setFile(null);
                      if (objectUrl) URL.revokeObjectURL(objectUrl);
                      setObjectUrl(null);
                      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
                      setDownloadUrl(null);
                      setDuration(0);
                      setStart(0);
                      setEnd(0);
                      setError(null);
                    }}
                    className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
                  >
                    {ui.clear}
                  </button>
                </div>

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

                {error && (
                  <div className="mt-4 text-sm text-rose-600">
                    {ui.errorPrefix}
                    {error}
                  </div>
                )}
              </div>

              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 text-xs text-slate-500">
                {ui.hint}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
