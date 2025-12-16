"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Track = {
  id: string;
  name: string;
  url: string;
  file: File;
};

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export default function MusicPlayerClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isLoop, setIsLoop] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const currentIndex = useMemo(() => tracks.findIndex((t) => t.id === currentId), [currentId, tracks]);
  const current = currentIndex >= 0 ? tracks[currentIndex] : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    return () => {
      for (const track of tracks) URL.revokeObjectURL(track.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (files: File[]) => {
    const next: Track[] = files
      .filter((file) => file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name))
      .map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        name: file.name,
        url: URL.createObjectURL(file),
        file,
      }));

    if (next.length === 0) return;
    setTracks((prev) => {
      const merged = [...prev, ...next];
      return merged;
    });
    if (!currentId) setCurrentId(next[0].id);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) addFiles(files);
  };

  const play = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    await audio.play();
  };

  const pause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
  };

  const nextTrack = async () => {
    if (tracks.length === 0) return;
    const next = currentIndex >= 0 ? (currentIndex + 1) % tracks.length : 0;
    setCurrentId(tracks[next].id);
  };

  const prevTrack = async () => {
    if (tracks.length === 0) return;
    const prev = currentIndex >= 0 ? (currentIndex - 1 + tracks.length) % tracks.length : 0;
    setCurrentId(tracks[prev].id);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!current) return;
    audio.src = current.url;
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);
    if (isPlaying) {
      void audio.play().catch(() => undefined);
    }
  }, [current, isPlaying]);

  const remove = (id: string) => {
    setTracks((prev) => {
      const toRemove = prev.find((t) => t.id === id);
      if (toRemove) URL.revokeObjectURL(toRemove.url);
      const next = prev.filter((t) => t.id !== id);
      if (currentId === id) {
        const nextCurrent = next[0]?.id ?? null;
        setCurrentId(nextCurrent);
      }
      return next;
    });
  };

  const clear = () => {
    for (const t of tracks) URL.revokeObjectURL(t.url);
    setTracks([]);
    setCurrentId(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">音乐播放器</h1>
        <p className="mt-2 text-sm text-slate-500">导入本地音频文件，播放列表播放（不上传服务器）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">播放列表</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              添加音乐
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={tracks.length === 0}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              清空
            </button>
            <input ref={inputRef} type="file" accept="audio/*" multiple className="hidden" onChange={onChange} />
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">播放器</div>
              <div className="mt-3">
                <audio
                  ref={audioRef}
                  controls
                  className="w-full"
                  loop={isLoop}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
                  onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
                  onEnded={() => {
                    if (isLoop) return;
                    void nextTrack();
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{current ? current.name : "未选择音频"}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void prevTrack()}
                    disabled={tracks.length === 0}
                    className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    上一首
                  </button>
                  <button
                    type="button"
                    onClick={() => void nextTrack()}
                    disabled={tracks.length === 0}
                    className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    下一首
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="block text-sm text-slate-700">
                  倍速
                  <select
                    value={playbackRate}
                    onChange={(e) => setPlaybackRate(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value={0.75}>0.75×</option>
                    <option value={1}>1×</option>
                    <option value={1.25}>1.25×</option>
                    <option value={1.5}>1.5×</option>
                    <option value={2}>2×</option>
                  </select>
                </label>
                <label className="block text-sm text-slate-700">
                  音量
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="mt-3 w-full"
                  />
                </label>
                <label className="mt-7 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={isLoop}
                    onChange={(e) => setIsLoop(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  单曲循环
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void play()}
                  disabled={!current}
                  className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  播放
                </button>
                <button
                  type="button"
                  onClick={pause}
                  disabled={!current}
                  className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  暂停
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">列表</div>
              <div className="mt-4 space-y-2">
                {tracks.length === 0 && <div className="text-sm text-slate-500">暂无音频，点击“添加音乐”导入。</div>}
                {tracks.map((t, i) => {
                  const active = t.id === currentId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCurrentId(t.id)}
                      className={`w-full rounded-2xl px-4 py-3 text-left ring-1 transition ${
                        active
                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          : "bg-slate-50 text-slate-800 ring-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {i + 1}. {t.name}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{Math.round(t.file.size / 1024)} KB</div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(t.id);
                          }}
                          className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-50"
                        >
                          移除
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

