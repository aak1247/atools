"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";

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
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";
  const ui =
    locale === "en-us"
      ? {
          zoneLocal: "Local timezone",
          zoneUtc: "UTC",
          fillNow: "Use current time",
          tsToDt: "Timestamp → Date/Time",
          dtToTs: "Date/Time → Timestamp",
          inputTsPlaceholder: "Enter Unix timestamp (seconds or milliseconds)...",
          copy: "Copy",
          datetimeLabel: "Date/Time:",
          copySeconds: (value: number) => `Copy seconds: ${value}`,
          copyMilliseconds: (value: number) => `Copy milliseconds: ${value}`,
          seconds: (value: number) => `Seconds: ${value}`,
          milliseconds: (value: number) => `Milliseconds: ${value}`,
          errorPrefix: "Error:",
          errNeedNumber: "Please enter a numeric timestamp",
          errInvalidTs: "Invalid timestamp",
          errNeedDatetime: "Please enter a valid date/time",
          errInvalidDatetime: "Invalid date/time",
          hint:
            "Tip: Timestamp input auto-detects seconds vs milliseconds (longer values are treated as milliseconds).",
        }
      : {
          zoneLocal: "本地时区",
          zoneUtc: "UTC",
          fillNow: "填入当前时间",
          tsToDt: "时间戳 → 日期时间",
          dtToTs: "日期时间 → 时间戳",
          inputTsPlaceholder: "输入 Unix 时间戳（秒或毫秒）…",
          copy: "复制",
          datetimeLabel: "日期时间：",
          copySeconds: (value: number) => `复制秒：${value}`,
          copyMilliseconds: (value: number) => `复制毫秒：${value}`,
          seconds: (value: number) => `秒：${value}`,
          milliseconds: (value: number) => `毫秒：${value}`,
          errorPrefix: "错误：",
          errNeedNumber: "请输入数字时间戳",
          errInvalidTs: "无效时间戳",
          errNeedDatetime: "请输入有效的日期时间",
          errInvalidDatetime: "无效日期时间",
          hint: "提示：时间戳输入自动识别秒/毫秒（长度较长按毫秒处理）。",
        };

  const [zone, setZone] = useState<Zone>("local");

  const [timestampInput, setTimestampInput] = useState("");
  const [datetimeInput, setDatetimeInput] = useState("");

  const timestampResult = useMemo(() => {
    const raw = timestampInput.trim();
    if (!raw) return { ok: false as const, error: null as string | null };
    const num = Number(raw);
    if (!Number.isFinite(num)) return { ok: false as const, error: ui.errNeedNumber };
    const isMs = Math.abs(num) >= 1e12;
    const ms = isMs ? Math.trunc(num) : Math.trunc(num * 1000);
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return { ok: false as const, error: ui.errInvalidTs };
    return {
      ok: true as const,
      ms,
      sec: Math.trunc(ms / 1000),
      text: formatDateTime(date, zone),
    };
  }, [locale, timestampInput, zone]);

  const datetimeResult = useMemo(() => {
    const raw = datetimeInput.trim();
    if (!raw) return { ok: false as const, error: null as string | null };
    const parts = parseDateTimeLocal(raw);
    if (!parts) return { ok: false as const, error: ui.errNeedDatetime };

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

    if (!Number.isFinite(dateMs)) return { ok: false as const, error: ui.errInvalidDatetime };
    return {
      ok: true as const,
      ms: dateMs,
      sec: Math.trunc(dateMs / 1000),
    };
  }, [datetimeInput, locale, zone]);

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
    <ToolPageLayout toolSlug="timestamp-converter">
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
              {ui.zoneLocal}
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
              {ui.zoneUtc}
            </button>
          </div>

          <button
            type="button"
            onClick={fillNow}
            className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 active:scale-[0.99]"
          >
            {ui.fillNow}
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
            <div className="text-sm font-semibold text-slate-900">{ui.tsToDt}</div>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={timestampInput}
                onChange={(e) => setTimestampInput(e.target.value)}
                placeholder={ui.inputTsPlaceholder}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              {timestampResult.ok && (
                <button
                  type="button"
                  onClick={() => copy(timestampResult.text)}
                  className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                >
                  {ui.copy}
                </button>
              )}
            </div>

            {timestampResult.ok ? (
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div>
                  {ui.datetimeLabel}
                  <span className="font-mono">{timestampResult.text}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => copy(String(timestampResult.sec))}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    {ui.copySeconds(timestampResult.sec)}
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(String(timestampResult.ms))}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    {ui.copyMilliseconds(timestampResult.ms)}
                  </button>
                </div>
              </div>
            ) : (
              timestampResult.error && (
                <div className="mt-3 text-sm text-rose-600">
                  {ui.errorPrefix} {timestampResult.error}
                </div>
              )
            )}
          </div>

          <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
            <div className="text-sm font-semibold text-slate-900">{ui.dtToTs}</div>
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
                    {ui.seconds(datetimeResult.sec)}
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(String(datetimeResult.ms))}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    {ui.milliseconds(datetimeResult.ms)}
                  </button>
                </div>
              </div>
            ) : (
              datetimeResult.error && (
                <div className="mt-3 text-sm text-rose-600">
                  {ui.errorPrefix} {datetimeResult.error}
                </div>
              )
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">{ui.hint}</div>
      </div>
    </ToolPageLayout>
  );
}
