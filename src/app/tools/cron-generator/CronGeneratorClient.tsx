"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { CronParser, type CronField } from "../../../lib/cron";

type Preset = "every-minute" | "hourly" | "daily" | "weekly" | "monthly" | "custom";

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(value)));

const applyTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);

type Ui = {
  hint: string;
  tip: string;
  noPreview: string;
  preset: string;
  presets: Record<Preset, string>;
  time: string;
  hour: string;
  minute: string;
  day: string;
  month: string;
  weekday: string;
  monthday: string;
  custom: string;
  fieldsHint: string;
  output: string;
  copy: string;
  copied: string;
  nextRuns: string;
  errorPrefix: string;
  errPartsCountTemplate: string;
  errInvalidValueTemplate: string;
  errParseError: string;
  weekdays: string[];
};

const formatCronError = (raw: string | undefined, ui: Ui): string | undefined => {
  if (!raw) return undefined;
  if (raw.startsWith("ERR_PARTS_COUNT:")) {
    const count = raw.slice("ERR_PARTS_COUNT:".length);
    return applyTemplate(ui.errPartsCountTemplate, { count });
  }
  if (raw.startsWith("ERR_INVALID_VALUE:")) {
    const parts = raw.split(":");
    const value = parts[1] ?? "";
    const min = parts[2] ?? "";
    const max = parts[3] ?? "";
    return applyTemplate(ui.errInvalidValueTemplate, { value, min, max });
  }
  if (raw === "ERR_PARSE") return ui.errParseError;
  if (raw === "ERR_INVALID_CRON") return ui.errParseError;
  return raw;
};

const fieldsToExpr = (fields: CronField) =>
  `${fields.minute} ${fields.hour} ${fields.day} ${fields.month} ${fields.weekday}`.trim();

export default function CronGeneratorClient() {
  return (
    <ToolPageLayout toolSlug="cron-generator" maxWidthClassName="max-w-5xl">
      {({ config, locale }) => <CronGeneratorInner locale={locale} ui={{ ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) }} />}
    </ToolPageLayout>
  );
}

const DEFAULT_UI: Ui = {
  hint: "可视化生成 Cron 表达式（纯前端本地运行，不上传）。",
  tip: "提示：时间为本地时区；输出格式为“分钟 小时 日 月 星期”。",
  noPreview: "暂无预览。",
  preset: "预设",
  presets: {
    "every-minute": "每分钟",
    hourly: "每小时",
    daily: "每天",
    weekly: "每周",
    monthly: "每月",
    custom: "自定义",
  },
  time: "时间",
  hour: "小时",
  minute: "分钟",
  day: "日",
  month: "月",
  weekday: "星期",
  monthday: "每月几号",
  custom: "自定义字段",
  fieldsHint: "格式：分钟 小时 日 月 星期",
  output: "Cron 表达式",
  copy: "复制",
  copied: "已复制",
  nextRuns: "下次执行时间",
  errorPrefix: "错误：",
  errPartsCountTemplate: "Cron 表达式应有 5 或 6 段，但发现 {count} 段。",
  errInvalidValueTemplate: "无效的值：{value}（范围 {min}-{max}）",
  errParseError: "解析错误",
  weekdays: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
};

function CronGeneratorInner({ locale, ui }: { locale: string; ui: Ui }) {
  const [preset, setPreset] = useState<Preset>("daily");
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [monthday, setMonthday] = useState(1);
  const [customFields, setCustomFields] = useState<CronField>({
    minute: "0",
    hour: "12",
    day: "*",
    month: "*",
    weekday: "*",
  });

  const fields = useMemo<CronField>(() => {
    if (preset === "every-minute") return { minute: "*", hour: "*", day: "*", month: "*", weekday: "*" };
    if (preset === "hourly") return { minute: String(clampInt(minute, 0, 59)), hour: "*", day: "*", month: "*", weekday: "*" };
    if (preset === "daily") return { minute: String(clampInt(minute, 0, 59)), hour: String(clampInt(hour, 0, 23)), day: "*", month: "*", weekday: "*" };
    if (preset === "weekly") {
      const wd = weekdays.length ? weekdays.slice().sort((a, b) => a - b).join(",") : "*";
      return {
        minute: String(clampInt(minute, 0, 59)),
        hour: String(clampInt(hour, 0, 23)),
        day: "*",
        month: "*",
        weekday: wd,
      };
    }
    if (preset === "monthly") {
      return {
        minute: String(clampInt(minute, 0, 59)),
        hour: String(clampInt(hour, 0, 23)),
        day: String(clampInt(monthday, 1, 31)),
        month: "*",
        weekday: "*",
      };
    }
    return customFields;
  }, [customFields, hour, minute, monthday, preset, weekdays]);

  const expression = useMemo(() => fieldsToExpr(fields), [fields]);

  const parse = useMemo(() => CronParser.parse(expression), [expression]);
  const errorText = useMemo(() => (parse.isValid ? null : formatCronError(parse.error, ui) ?? ui.errParseError), [parse, ui]);
  const nextRuns = useMemo(() => {
    if (!parse.isValid) return [];
    try {
      return CronParser.getNextRuns(expression, 10);
    } catch {
      return [];
    }
  }, [expression, parse.isValid]);

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(expression);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 900);
  };

  const toggleWeekday = (d: number) => {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          {ui.hint}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.preset}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(ui.presets) as Preset[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPreset(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                    preset === key ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {ui.presets[key]}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3">
              {preset === "custom" ? (
                <div className="grid gap-2">
                  <div className="text-xs text-slate-600">{ui.fieldsHint}</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {([
                      ["minute", "minute"],
                      ["hour", "hour"],
                      ["day", "day"],
                      ["month", "month"],
                      ["weekday", "weekday"],
                    ] as const).map(([key, labelKey]) => (
                      <label key={key} className="grid gap-1 text-xs text-slate-600">
                        {ui[labelKey]}
                        <input
                          value={customFields[key]}
                          onChange={(e) => setCustomFields((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {preset !== "every-minute" ? (
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="grid gap-1 text-xs text-slate-600">
                        {ui.hour}
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={hour}
                          onChange={(e) => setHour(clampInt(Number(e.target.value), 0, 23))}
                          disabled={preset === "hourly"}
                          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none disabled:opacity-60"
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-slate-600">
                        {ui.minute}
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={minute}
                          onChange={(e) => setMinute(clampInt(Number(e.target.value), 0, 59))}
                          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none"
                        />
                      </label>
                    </div>
                  ) : null}

                  {preset === "weekly" ? (
                    <div className="grid gap-2">
                      <div className="text-xs text-slate-600">{ui.weekday}</div>
                      <div className="flex flex-wrap gap-2">
                        {ui.weekdays.map((label, idx) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => toggleWeekday(idx)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                              weekdays.includes(idx)
                                ? "bg-blue-600 text-white ring-blue-600"
                                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {preset === "monthly" ? (
                    <label className="grid gap-1 text-xs text-slate-600">
                      {ui.monthday}
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={monthday}
                        onChange={(e) => setMonthday(clampInt(Number(e.target.value), 1, 31))}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none"
                      />
                    </label>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.output}</div>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={expression}
                readOnly
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 shadow-sm outline-none"
              />
              <button
                type="button"
                onClick={() => void copy()}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                {copied ? ui.copied : ui.copy}
              </button>
            </div>

            {errorText ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {ui.errorPrefix}
                {errorText}
              </div>
            ) : null}

              <div className="mt-4">
                <div className="text-xs font-medium text-slate-700">{ui.nextRuns}</div>
              <div className="mt-2 grid gap-2">
                {nextRuns.length ? (
                  nextRuns.map((d, idx) => (
                    <div
                      key={`${d.getTime()}-${idx}`}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200"
                    >
                      <span className="font-mono">#{idx + 1}</span>
                      <span>
                        {d.toLocaleString(locale === "en-us" ? "en-US" : "zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500">{ui.noPreview}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">{ui.tip}</div>
      </div>
    </div>
  );
}
