"use client";

import { useMemo, useState } from "react";

type Zone = "local" | "utc";

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatDateTime = (date: Date, zone: Zone) => {
  if (zone === "utc") {
    const yyyy = date.getUTCFullYear();
    const mm = pad2(date.getUTCMonth() + 1);
    const dd = pad2(date.getUTCDate());
    const hh = pad2(date.getUTCHours());
    const mi = pad2(date.getUTCMinutes());
    const ss = pad2(date.getUTCSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} (UTC)`;
  }

  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

const parseDateTimeLocal = (value: string) => {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  return { year, month, day, hour, minute, second };
};

export default function TimestampConverterClient() {
  const [zone, setZone] = useState<Zone>("local");

  const [timestampInput, setTimestampInput] = useState("");
  const [datetimeInput, setDatetimeInput] = useState("");

  const timestampResult = useMemo(() => {
    const raw = timestampInput.trim();
    if (!raw) return { ok: false as const, error: null as string | null };
    const num = Number(raw);
    if (!Number.isFinite(num)) return { ok: false as const, error: "请输入数字时间戳" };
    const isMs = Math.abs(num) >= 1e12;
    const ms = isMs ? Math.trunc(num) : Math.trunc(num * 1000);
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return { ok: false as const, error: "无效时间戳" };
    return {
      ok: true as const,
      ms,
      sec: Math.trunc(ms / 1000),
      text: formatDateTime(date, zone),
    };
  }, [timestampInput, zone]);

  const datetimeResult = useMemo(() => {
    const raw = datetimeInput.trim();
    if (!raw) return { ok: false as const, error: null as string | null };
    const parts = parseDateTimeLocal(raw);
    if (!parts) return { ok: false as const, error: "请输入有效的日期时间" };

    const dateMs =
      zone === "utc"
        ? Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second,
          )
        : new Date(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second,
          ).getTime();

    if (!Number.isFinite(dateMs)) return { ok: false as const, error: "无效日期时间" };
    return {
      ok: true as const,
      ms: dateMs,
      sec: Math.trunc(dateMs / 1000),
    };
  }, [datetimeInput, zone]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const fillNow = () => {
    const ms = Date.now();
    setTimestampInput(String(ms));
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mi = pad2(d.getMinutes());
    const ss = pad2(d.getSeconds());
    setDatetimeInput(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          时间戳转换
        </h1>
        <p className="mt-2 text-sm text-slate-500">Unix 秒/毫秒 ↔ 日期时间</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-2xl bg-slate-100/60 p-1">
            <button
              type="button"
              onClick={() => setZone("local")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                zone === "local"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              本地时区
            </button>
            <button
              type="button"
              onClick={() => setZone("utc")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                zone === "utc"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              UTC
            </button>
          </div>

          <button
            type="button"
            onClick={fillNow}
            className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 active:scale-[0.99]"
          >
            填入当前时间
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
            <div className="text-sm font-semibold text-slate-900">
              时间戳 → 日期时间
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={timestampInput}
                onChange={(e) => setTimestampInput(e.target.value)}
                placeholder="输入 Unix 时间戳（秒或毫秒）…"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              {timestampResult.ok && (
                <button
                  type="button"
                  onClick={() => copy(timestampResult.text)}
                  className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                >
                  复制
                </button>
              )}
            </div>

            {timestampResult.ok ? (
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div>
                  日期时间：<span className="font-mono">{timestampResult.text}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => copy(String(timestampResult.sec))}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    复制秒：{timestampResult.sec}
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(String(timestampResult.ms))}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    复制毫秒：{timestampResult.ms}
                  </button>
                </div>
              </div>
            ) : (
              timestampResult.error && (
                <div className="mt-3 text-sm text-rose-600">
                  错误：{timestampResult.error}
                </div>
              )
            )}
          </div>

          <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
            <div className="text-sm font-semibold text-slate-900">
              日期时间 → 时间戳
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="datetime-local"
                step={1}
                value={datetimeInput}
                onChange={(e) => setDatetimeInput(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </div>

            {datetimeResult.ok ? (
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => copy(String(datetimeResult.sec))}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    秒：{datetimeResult.sec}
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(String(datetimeResult.ms))}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    毫秒：{datetimeResult.ms}
                  </button>
                </div>
              </div>
            ) : (
              datetimeResult.error && (
                <div className="mt-3 text-sm text-rose-600">
                  错误：{datetimeResult.error}
                </div>
              )
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          提示：时间戳输入自动识别秒/毫秒（长度较长按毫秒处理）。
        </div>
      </div>
    </div>
  );
}

