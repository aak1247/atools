"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type PickedAudio = {
  id: string;
  file: File;
  durationSec: number | null;
};

const DEFAULT_UI = {
  pickTitle: "选择多个音频文件",
  addFiles: "添加文件",
  probeDurations: "读取时长",
  orderTitle: "拼接顺序",
  totalDurationUnknown: "未读取时长",
  totalDurationTemplate: "总时长：{time}（{seconds}s）",
  durationUnknown: "时长：-",
  durationTemplate: "时长：{time}（{seconds}s）",
  moveUp: "上移",
  moveDown: "下移",
  remove: "移除",
  exportTitle: "导出",
  exportHint: "会将所有音频解码并重新编码为 WAV（16-bit PCM，立体声）。文件较大时导出耗时较长。",
  mergeExport: "合并并导出 WAV",
  processing: "处理中...",
  clear: "清空",
  generated: "已生成合并文件：",
  download: "下载",
  errorPrefix: "错误：",
  errReadAudio: "读取音频时出错。",
  errNeedAtLeastTwo: "请至少选择 2 个音频文件再进行拼接。",
  errMergeFailed: "拼接失败，请换一批音频再试。",
} as const;

type AudioMergerUi = typeof DEFAULT_UI;

const applyTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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
  const dataViews: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch += 1) dataViews.push(audio.getChannelData(ch));

  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, dataViews[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
};

const normalizeToStereo = async (buffer: AudioBuffer, sampleRate: number): Promise<AudioBuffer> => {
  const duration = buffer.duration;
  const offline = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
};

export default function AudioMergerClient() {
  return (
    <ToolPageLayout toolSlug="audio-merger" maxWidthClassName="max-w-6xl">
      <AudioMergerInner />
    </ToolPageLayout>
  );
}

function AudioMergerInner() {
  const config = useOptionalToolConfig("audio-merger");
  const ui: AudioMergerUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<AudioMergerUi>) };

  const inputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<PickedAudio[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("merged.wav");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const totalDuration = useMemo(() => {
    const durations = items.map((item) => item.durationSec).filter((d): d is number => typeof d === "number");
    if (durations.length !== items.length) return null;
    return durations.reduce((a, b) => a + b, 0);
  }, [items]);

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    const next: PickedAudio[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      durationSec: null,
    }));
    setItems((prev) => [...prev, ...next]);
  };

  const remove = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));

  const move = (id: string, direction: -1 | 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = prev.slice();
      const [picked] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, picked);
      return copy;
    });
  };

  const probeDurations = async () => {
    if (items.length === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      const context = new AudioContext();
      try {
        const updated: PickedAudio[] = [];
        for (const item of items) {
          const raw = await item.file.arrayBuffer();
          const decoded = await context.decodeAudioData(raw.slice(0));
          updated.push({ ...item, durationSec: decoded.duration });
        }
        setItems(updated);
      } finally {
        await context.close().catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errReadAudio);
    } finally {
      setIsProcessing(false);
    }
  };

  const merge = async () => {
    if (items.length < 2) {
      setError(ui.errNeedAtLeastTwo);
      return;
    }

    setIsProcessing(true);
    setError(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    try {
      const context = new AudioContext();
      try {
        const decoded: AudioBuffer[] = [];
        for (const item of items) {
          const raw = await item.file.arrayBuffer();
          const buffer = await context.decodeAudioData(raw.slice(0));
          decoded.push(buffer);
        }

        const targetSampleRate = decoded[0].sampleRate;
        const normalized = await Promise.all(decoded.map((buf) => normalizeToStereo(buf, targetSampleRate)));
        const totalLength = normalized.reduce((sum, buf) => sum + buf.length, 0);
        const merged = new AudioBuffer({ length: totalLength, numberOfChannels: 2, sampleRate: targetSampleRate });

        let offset = 0;
        for (const buf of normalized) {
          for (let ch = 0; ch < 2; ch += 1) {
            merged.getChannelData(ch).set(buf.getChannelData(ch), offset);
          }
          offset += buf.length;
        }

        const wav = encodeWav(merged);
        const url = URL.createObjectURL(wav);
        setDownloadUrl(url);

        const base = items[0]?.file?.name?.replace(/\.[^.]+$/, "") || "merged";
        setDownloadName(`${base}-merged.wav`);
      } finally {
        await context.close().catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errMergeFailed);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">{ui.pickTitle}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {ui.addFiles}
            </button>
            <button
              type="button"
              disabled={items.length === 0 || isProcessing}
              onClick={probeDurations}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {ui.probeDurations}
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={onChange}
          />
        </div>

	        {items.length > 0 && (
	          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="space-y-3">
                <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">{ui.orderTitle}</div>
                    <div className="text-xs text-slate-500">
                      {totalDuration === null
                        ? ui.totalDurationUnknown
                        : applyTemplate(ui.totalDurationTemplate, {
                            time: formatTime(totalDuration),
                            seconds: totalDuration.toFixed(2),
                          })}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {items.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-200"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">
                          {index + 1}. {item.file.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.durationSec == null
                            ? ui.durationUnknown
                            : applyTemplate(ui.durationTemplate, {
                                time: formatTime(item.durationSec),
                                seconds: item.durationSec.toFixed(2),
                              })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => move(item.id, -1)}
                          disabled={index === 0 || isProcessing}
                          className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-60"
                        >
                          {ui.moveUp}
                        </button>
                        <button
                          type="button"
                          onClick={() => move(item.id, 1)}
                          disabled={index === items.length - 1 || isProcessing}
                          className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-60"
                        >
                          {ui.moveDown}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(item.id)}
                          disabled={isProcessing}
                          className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100 disabled:opacity-60"
                        >
                          {ui.remove}
                        </button>
                      </div>
                    </div>
                  ))}
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
                    onClick={merge}
                    disabled={isProcessing || items.length < 2}
                    className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {isProcessing ? ui.processing : ui.mergeExport}
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      if (inputRef.current) inputRef.current.value = "";
                      setItems([]);
                      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
                      setDownloadUrl(null);
                      setError(null);
                    }}
                    className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
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
            </div>
	          </div>
	        )}
	    </div>
	  );
}
