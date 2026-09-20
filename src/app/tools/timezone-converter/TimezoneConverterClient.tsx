"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

const DEFAULT_TZS = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Paris",
  "America/Los_Angeles",
  "America/New_York",
  "Australia/Sydney",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatInTimeZone = (ms: number, timeZone: string): string => {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
};

const getTimeZoneOffsetMinutes = (msUtc: number, timeZone: string): number => {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(msUtc));
  const asNumber = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const y = asNumber("year");
  const m = asNumber("month");
  const d = asNumber("day");
  const hh = asNumber("hour");
  const mm = asNumber("minute");
  const ss = asNumber("second");
  const zonedAsUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  return (zonedAsUtc - msUtc) / 60000;
};

const zonedLocalToUtcMs = (local: { y: number; m: number; d: number; hh: number; mm: number; ss: number }, timeZone: string) => {
  const guess = Date.UTC(local.y, local.m - 1, local.d, local.hh, local.mm, local.ss);
  const offset1 = getTimeZoneOffsetMinutes(guess, timeZone);
  const corrected1 = guess - offset1 * 60000;
  const offset2 = getTimeZoneOffsetMinutes(corrected1, timeZone);
  const corrected2 = guess - offset2 * 60000;
  return corrected2;
};

const DEFAULT_UI = {
  inputTitle: "输入",
  sourceTimezone: "源时区",
  targetTimezone: "目标时区",
  date: "日期",
  time: "时间",
  timePlaceholder: "HH:mm:ss",
  tip: "提示：DST（夏令时）地区会按该日期对应的时区规则自动计算。",
  resultTitle: "结果",
  copyMs: "复制毫秒时间戳",
  targetTime: "目标时区：",
  utcTime: "UTC：",
  sourceNormalized: "源时区规范化：",
  unixSec: "Unix（秒）：",
  unixMs: "Unix（毫秒）：",
  copyTarget: "复制目标时间",
  copyUtc: "复制 UTC",
  copySec: "复制秒时间戳",
  copied: "已复制",
  errorPrefix: "错误：",
  errDateTimeFormat: "日期/时间格式错误。",
  errConvertFailed: "转换失败。",
} as const;

export default function TimezoneConverterClient() {
  return (
    <ToolPageLayout toolSlug="timezone-converter">
      <TimezoneConverterInner />
    </ToolPageLayout>
  );
}

function TimezoneConverterInner() {
  const config = useOptionalToolConfig("timezone-converter");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const [sourceTz, setSourceTz] = useState("Asia/Shanghai");
  const [targetTz, setTargetTz] = useState("UTC");
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  });
  const [time, setTime] = useState(() => {
    const now = new Date();
    return `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const result = useMemo(() => {
    try {
      const [yS, mS, dS] = date.split("-");
      const [hhS, mmS, ssS = "0"] = time.split(":");
      const y = Number(yS);
      const m = Number(mS);
      const d = Number(dS);
      const hh = Number(hhS);
      const mm = Number(mmS);
      const ss = Number(ssS);
      if (![y, m, d, hh, mm, ss].every((n) => Number.isFinite(n))) {
        return { ok: false as const, error: ui.errDateTimeFormat };
      }
      const utcMs = zonedLocalToUtcMs({ y, m, d, hh, mm, ss }, sourceTz);
      const target = formatInTimeZone(utcMs, targetTz);
      const utc = formatInTimeZone(utcMs, "UTC");
      return {
        ok: true as const,
        utcMs,
        utcSec: Math.floor(utcMs / 1000),
        target,
        utc,
        local: formatInTimeZone(utcMs, sourceTz),
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : ui.errConvertFailed };
    }
  }, [date, sourceTz, targetTz, time, ui.errConvertFailed, ui.errDateTimeFormat]);

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.inputTitle}</div>
            <div className="mt-4 grid gap-3">
              <label className="block text-sm text-slate-700">
                {ui.sourceTimezone}
                <select
                  value={sourceTz}
                  onChange={(e) => setSourceTz(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  {DEFAULT_TZS.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-700">
                {ui.targetTimezone}
                <select
                  value={targetTz}
                  onChange={(e) => setTargetTz(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  {DEFAULT_TZS.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm text-slate-700">
                  {ui.date}
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.time}
                  <input
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    placeholder={ui.timePlaceholder}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
              </div>
            </div>
            <div className="mt-4 text-xs text-slate-500">{ui.tip}</div>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">{ui.resultTitle}</div>
              {result.ok && (
                <button
                  type="button"
                  onClick={() => void copy("ms", String(result.utcMs))}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                >
                  {copiedKey === "ms" ? ui.copied : ui.copyMs}
                </button>
              )}
            </div>

            {!result.ok ? (
              <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                {ui.errorPrefix}{result.error}
              </div>
            ) : (
              <div className="grid gap-3 text-sm text-slate-700">
                <div>
                  {ui.targetTime}<span className="font-mono">{result.target}</span>
                </div>
                <div>
                  {ui.utcTime}<span className="font-mono">{result.utc}</span>
                </div>
                <div>
                  {ui.sourceNormalized}<span className="font-mono">{result.local}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    {ui.unixSec}<span className="font-mono">{result.utcSec}</span>
                  </div>
                  <div>
                    {ui.unixMs}<span className="font-mono">{result.utcMs}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => void copy("target", result.target)}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    {copiedKey === "target" ? ui.copied : ui.copyTarget}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copy("utc", result.utc)}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    {copiedKey === "utc" ? ui.copied : ui.copyUtc}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copy("sec", String(result.utcSec))}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    {copiedKey === "sec" ? ui.copied : ui.copySec}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
