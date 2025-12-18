"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Mode = "countdown" | "stopwatch";

const DEFAULT_UI = {
  modeCountdown: "倒计时",
  modeStopwatch: "秒表",
  start: "开始",
  pause: "暂停",
  reset: "复位",
  timeRemaining: "剩余时间",
  timeElapsed: "已用时间",
  duration: "时长",
  minutes: "分钟",
  seconds: "秒",
  durationLockedHint: "运行中为保证准确性，暂不允许修改时长",
  presets: "快捷预设",
  presetMinutesTemplate: "{minutes} 分钟",
  privacyHint: "提示：所有计时均在浏览器本地完成，不上传任何数据。",
} as const;

type TimerUi = typeof DEFAULT_UI;

const formatTime = (totalMs: number) => {
  const clamped = Math.max(0, Math.floor(totalMs));
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ms = clamped % 1000;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const ms2 = String(Math.floor(ms / 10)).padStart(2, "0");

  return { hh, mm, ss, ms2 };
};

const clampInt = (value: string, min: number, max: number) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
};

const applyTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);

export default function TimerClient() {
  const config = useOptionalToolConfig("timer");
  const ui: TimerUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<TimerUi>) };

  const [mode, setMode] = useState<Mode>("countdown");

  const [durationMinutes, setDurationMinutes] = useState(5);
  const [durationSeconds, setDurationSeconds] = useState(0);

  const durationMs = useMemo(() => {
    const minutes = Math.min(999, Math.max(0, durationMinutes));
    const seconds = Math.min(59, Math.max(0, durationSeconds));
    return (minutes * 60 + seconds) * 1000;
  }, [durationMinutes, durationSeconds]);

  const [isRunning, setIsRunning] = useState(false);

  const [countdownStartedAt, setCountdownStartedAt] = useState<number | null>(
    null,
  );
  const [countdownRemainingAtPause, setCountdownRemainingAtPause] =
    useState<number>(durationMs);

  const [stopwatchStartedAt, setStopwatchStartedAt] = useState<number | null>(
    null,
  );
  const [stopwatchAccumulatedMs, setStopwatchAccumulatedMs] =
    useState<number>(0);

  const [now, setNow] = useState<number>(() => Date.now());

  const modeRef = useRef(mode);
  const isRunningRef = useRef(isRunning);
  const countdownStartedAtRef = useRef(countdownStartedAt);
  const countdownRemainingAtPauseRef = useRef(countdownRemainingAtPause);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);
  useEffect(() => {
    countdownStartedAtRef.current = countdownStartedAt;
  }, [countdownStartedAt]);
  useEffect(() => {
    countdownRemainingAtPauseRef.current = countdownRemainingAtPause;
  }, [countdownRemainingAtPause]);

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => {
      const currentNow = Date.now();

      if (
        modeRef.current === "countdown" &&
        isRunningRef.current &&
        countdownStartedAtRef.current != null
      ) {
        const elapsed = currentNow - countdownStartedAtRef.current;
        const remaining = countdownRemainingAtPauseRef.current - elapsed;
        if (remaining <= 0) {
          setIsRunning(false);
          setCountdownStartedAt(null);
          setCountdownRemainingAtPause(0);
          isRunningRef.current = false;
          countdownStartedAtRef.current = null;
          countdownRemainingAtPauseRef.current = 0;
        }
      }

      setNow(currentNow);
    }, 100);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const countdownRemainingMs = useMemo(() => {
    if (mode !== "countdown") return durationMs;
    if (!isRunning || countdownStartedAt == null) return countdownRemainingAtPause;
    const elapsed = now - countdownStartedAt;
    return Math.max(0, countdownRemainingAtPause - elapsed);
  }, [countdownRemainingAtPause, countdownStartedAt, durationMs, isRunning, mode, now]);

  const stopwatchElapsedMs = useMemo(() => {
    if (mode !== "stopwatch") return 0;
    if (!isRunning || stopwatchStartedAt == null) return stopwatchAccumulatedMs;
    return stopwatchAccumulatedMs + (now - stopwatchStartedAt);
  }, [isRunning, mode, now, stopwatchAccumulatedMs, stopwatchStartedAt]);

  const start = () => {
    if (isRunning) return;
    setNow(Date.now());
    setIsRunning(true);
    if (mode === "countdown") {
      setCountdownStartedAt(Date.now());
    } else {
      setStopwatchStartedAt(Date.now());
    }
  };

  const pause = () => {
    if (!isRunning) return;
    setNow(Date.now());
    setIsRunning(false);
    if (mode === "countdown") {
      if (countdownStartedAt == null) return;
      const elapsed = Date.now() - countdownStartedAt;
      setCountdownRemainingAtPause((prev) => Math.max(0, prev - elapsed));
      setCountdownStartedAt(null);
    } else {
      if (stopwatchStartedAt == null) return;
      const elapsed = Date.now() - stopwatchStartedAt;
      setStopwatchAccumulatedMs((prev) => prev + elapsed);
      setStopwatchStartedAt(null);
    }
  };

  const reset = () => {
    setIsRunning(false);
    setCountdownStartedAt(null);
    setCountdownRemainingAtPause(durationMs);
    setStopwatchStartedAt(null);
    setStopwatchAccumulatedMs(0);
    setNow(Date.now());
  };

  const presets = [
    { minutes: 1, seconds: 0 },
    { minutes: 5, seconds: 0 },
    { minutes: 10, seconds: 0 },
    { minutes: 25, seconds: 0 },
  ] as const;

  const time = formatTime(mode === "countdown" ? countdownRemainingMs : stopwatchElapsedMs);

  return (
    <ToolPageLayout toolSlug="timer" maxWidthClassName="max-w-3xl">
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-2xl bg-slate-100/60 p-1">
            <button
              type="button"
              onClick={() => {
                reset();
                setMode("countdown");
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mode === "countdown"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {ui.modeCountdown}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setMode("stopwatch");
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mode === "stopwatch"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {ui.modeStopwatch}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={isRunning ? pause : start}
              className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition active:scale-[0.99] ${
                isRunning
                  ? "bg-slate-200/70 text-slate-800 hover:bg-slate-300/70"
                  : "bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700"
              }`}
            >
              {isRunning ? ui.pause : ui.start}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.99]"
            >
              {ui.reset}
            </button>
          </div>
        </div>

        <div className="mt-8 rounded-3xl bg-slate-950 px-6 py-10 text-center text-white">
          <div className="font-mono text-5xl tracking-tight sm:text-6xl">
            {time.hh}:{time.mm}:{time.ss}
            <span className="text-white/70">.{time.ms2}</span>
          </div>
          <div className="mt-3 text-xs text-white/60">
            {mode === "countdown" ? ui.timeRemaining : ui.timeElapsed}
          </div>
        </div>

        {mode === "countdown" && (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
              <div className="text-sm font-semibold text-slate-900">{ui.duration}</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-xs text-slate-500">{ui.minutes}</div>
                  <input
                    inputMode="numeric"
                    type="number"
                    min={0}
                    max={999}
                    value={durationMinutes}
                    disabled={isRunning}
                    onChange={(e) =>
                      setDurationMinutes(() => {
                        const next = clampInt(e.target.value, 0, 999);
                        if (!isRunning && mode === "countdown") {
                          const nextMs = (next * 60 + durationSeconds) * 1000;
                          setCountdownRemainingAtPause(nextMs);
                        }
                        return next;
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                  />
                </label>
                <label className="block">
                  <div className="text-xs text-slate-500">{ui.seconds}</div>
                  <input
                    inputMode="numeric"
                    type="number"
                    min={0}
                    max={59}
                    value={durationSeconds}
                    disabled={isRunning}
                    onChange={(e) =>
                      setDurationSeconds(() => {
                        const next = clampInt(e.target.value, 0, 59);
                        if (!isRunning && mode === "countdown") {
                          const nextMs = (durationMinutes * 60 + next) * 1000;
                          setCountdownRemainingAtPause(nextMs);
                        }
                        return next;
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                  />
                </label>
              </div>
              <div className="mt-3 text-xs text-slate-500">{ui.durationLockedHint}</div>
            </div>

            <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
              <div className="text-sm font-semibold text-slate-900">{ui.presets}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {presets.map((preset) => {
                  const label = applyTemplate(ui.presetMinutesTemplate, {
                    minutes: String(preset.minutes),
                  });
                  const key = `${preset.minutes}:${preset.seconds}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isRunning}
                      onClick={() => {
                        setDurationMinutes(preset.minutes);
                        setDurationSeconds(preset.seconds);
                        if (!isRunning && mode === "countdown") {
                          setCountdownRemainingAtPause(
                            (preset.minutes * 60 + preset.seconds) * 1000,
                          );
                        }
                        reset();
                      }}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 text-xs text-slate-500">{ui.privacyHint}</div>
      </div>
    </ToolPageLayout>
  );
}
