"use client";

import { useEffect, useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";

type Settings = {
  length: number;
  count: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  customChars: string;
  excludeChars: string;
  excludeAmbiguous: boolean;
  saveHistory: boolean;
};

type HistoryItem = {
  id: string;
  password: string;
  createdAt: number;
};

const STORAGE_SETTINGS_KEY = "atools.random-password-generator.settings.v1";
const STORAGE_HISTORY_KEY = "atools.random-password-generator.history.v1";
const MAX_HISTORY_ITEMS = 500;

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>/?~`|\\'\"";
const AMBIGUOUS = "O0Il1";

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(value)));

const randomUint32 = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
};

const randomIndex = (maxExclusive: number) => {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("字符集为空，无法生成密码");
  }
  if (maxExclusive > 2 ** 32) {
    throw new Error("字符集过大，无法生成");
  }

  const range = maxExclusive;
  const maxUnbiased = Math.floor((2 ** 32) / range) * range;
  while (true) {
    const x = randomUint32();
    if (x < maxUnbiased) return x % range;
  }
};

const toUniqueChars = (value: string) => Array.from(new Set([...value]));

const buildCharset = (settings: Settings) => {
  const pool: string[] = [];
  if (settings.lowercase) pool.push(LOWERCASE);
  if (settings.uppercase) pool.push(UPPERCASE);
  if (settings.digits) pool.push(DIGITS);
  if (settings.symbols) pool.push(SYMBOLS);
  if (settings.customChars.trim()) pool.push(settings.customChars);

  const candidates = toUniqueChars(pool.join(""));
  const exclude = new Set([
    ...toUniqueChars(settings.excludeChars),
    ...(settings.excludeAmbiguous ? [...AMBIGUOUS] : []),
  ]);
  const charset = candidates.filter((ch) => !exclude.has(ch));
  if (charset.length === 0) {
    throw new Error("可用字符集为空：请至少选择一种字符集，或减少排除字符");
  }
  return charset;
};

const generatePassword = (length: number, charset: string[]) => {
  const chars: string[] = [];
  for (let i = 0; i < length; i += 1) {
    chars.push(charset[randomIndex(charset.length)]!);
  }
  return chars.join("");
};

const safeId = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function formatTime(ts: number, locale: string) {
  try {
    const lang = locale === "en-us" ? "en-US" : "zh-CN";
    return new Date(ts).toLocaleString(lang, { hour12: false });
  } catch {
    return new Date(ts).toISOString();
  }
}

export default function RandomPasswordGeneratorClient() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";

  const ui =
    locale === "en-us"
      ? {
          length: "Length",
          count: "Count",
          charset: "Character sets",
          lowercase: "Lowercase (a-z)",
          uppercase: "Uppercase (A-Z)",
          digits: "Digits (0-9)",
          symbols: "Symbols",
          customChars: "Custom characters",
          excludeChars: "Excluded characters",
          excludeAmbiguous: `Exclude ambiguous (${AMBIGUOUS})`,
          saveHistory: "Auto-save to local history (localStorage)",
          generate: "Generate",
          copyAll: "Copy all",
          clearResult: "Clear result",
          result: "Result",
          emptyResult: "Click “Generate” to start",
          history: "History",
          emptyHistory: "No saved passwords yet",
          clearHistory: "Clear history",
          copy: "Copy",
          remove: "Remove",
          charsetSize: "Charset size",
          charsetPreview: "Preview",
          note:
            "Note: Saved passwords are stored in your browser localStorage. Clear browser data to remove them.",
        }
      : {
          length: "长度",
          count: "数量",
          charset: "字符集",
          lowercase: "小写字母 (a-z)",
          uppercase: "大写字母 (A-Z)",
          digits: "数字 (0-9)",
          symbols: "符号",
          customChars: "自定义字符",
          excludeChars: "排除字符",
          excludeAmbiguous: `排除易混淆字符（${AMBIGUOUS}）`,
          saveHistory: "自动保存到本地历史记录（localStorage）",
          generate: "生成",
          copyAll: "复制全部",
          clearResult: "清空结果",
          result: "生成结果",
          emptyResult: "点击“生成”开始",
          history: "历史记录",
          emptyHistory: "暂无历史记录",
          clearHistory: "清空历史",
          copy: "复制",
          remove: "删除",
          charsetSize: "字符集数量",
          charsetPreview: "预览",
          note: "提示：保存的密码存储在浏览器 localStorage；清除浏览器数据即可移除。",
        };

  const defaultSettings: Settings = useMemo(
    () => ({
      length: 16,
      count: 10,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: false,
      customChars: "",
      excludeChars: "",
      excludeAmbiguous: true,
      saveHistory: true,
    }),
    [],
  );

  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window === "undefined") return defaultSettings;
    try {
      const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (!raw) return defaultSettings;
      const parsed = JSON.parse(raw) as unknown;
      if (!isObjectRecord(parsed)) return defaultSettings;

      return {
        length: typeof parsed.length === "number" ? parsed.length : defaultSettings.length,
        count: typeof parsed.count === "number" ? parsed.count : defaultSettings.count,
        lowercase:
          typeof parsed.lowercase === "boolean" ? parsed.lowercase : defaultSettings.lowercase,
        uppercase:
          typeof parsed.uppercase === "boolean" ? parsed.uppercase : defaultSettings.uppercase,
        digits: typeof parsed.digits === "boolean" ? parsed.digits : defaultSettings.digits,
        symbols: typeof parsed.symbols === "boolean" ? parsed.symbols : defaultSettings.symbols,
        customChars:
          typeof parsed.customChars === "string" ? parsed.customChars : defaultSettings.customChars,
        excludeChars:
          typeof parsed.excludeChars === "string" ? parsed.excludeChars : defaultSettings.excludeChars,
        excludeAmbiguous:
          typeof parsed.excludeAmbiguous === "boolean"
            ? parsed.excludeAmbiguous
            : defaultSettings.excludeAmbiguous,
        saveHistory:
          typeof parsed.saveHistory === "boolean" ? parsed.saveHistory : defaultSettings.saveHistory,
      };
    } catch {
      localStorage.removeItem(STORAGE_SETTINGS_KEY);
      return defaultSettings;
    }
  });

  const {
    length,
    count,
    lowercase,
    uppercase,
    digits,
    symbols,
    customChars,
    excludeChars,
    excludeAmbiguous,
    saveHistory,
  } = settings;

  const [passwords, setPasswords] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];

      const cleaned: HistoryItem[] = [];
      for (const item of parsed) {
        if (!isObjectRecord(item)) continue;
        const password = typeof item.password === "string" ? item.password : null;
        const createdAt = typeof item.createdAt === "number" ? item.createdAt : null;
        const id = typeof item.id === "string" ? item.id : null;
        if (!password || createdAt === null || !id) continue;
        cleaned.push({ id, password, createdAt });
      }
      return cleaned.slice(0, MAX_HISTORY_ITEMS);
    } catch {
      localStorage.removeItem(STORAGE_HISTORY_KEY);
      return [];
    }
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const settingsForCharset = useMemo<Settings>(
    () => settings,
    [settings],
  );

  const charsetInfo = useMemo(() => {
    try {
      const charset = buildCharset(settingsForCharset);
      const preview = charset.slice(0, 120).join("");
      return { ok: true as const, size: charset.length, preview };
    } catch (e) {
      return {
        ok: false as const,
        size: 0,
        preview: "",
        message: e instanceof Error ? e.message : "字符集配置有误",
      };
    }
  }, [settingsForCharset]);

  const resultText = useMemo(() => passwords.join("\n"), [passwords]);

  const generate = () => {
    setError(null);
    try {
      const safeLength = clampInt(length, 1, 256);
      const safeCount = clampInt(count, 1, 200);

      const normalizedSettings: Settings = {
        ...settingsForCharset,
        length: safeLength,
        count: safeCount,
      };

      const charset = buildCharset(normalizedSettings);
      const next = Array.from({ length: safeCount }, () => generatePassword(safeLength, charset));
      setPasswords(next);

      if (saveHistory) {
        const now = Date.now();
        const entries: HistoryItem[] = next.map((password) => ({
          id: safeId(),
          password,
          createdAt: now,
        }));
        setHistory((prev) => [...entries, ...prev].slice(0, MAX_HISTORY_ITEMS));
      }
    } catch (e) {
      setPasswords([]);
      setError(e instanceof Error ? e.message : "生成失败");
    }
  };

  const copyAll = async () => {
    if (!resultText.trim()) return;
    await navigator.clipboard.writeText(resultText);
  };

  const copyOne = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const clearResult = () => {
    setPasswords([]);
    setError(null);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_HISTORY_KEY);
  };

  const removeHistoryItem = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <ToolPageLayout toolSlug="random-password-generator" maxWidthClassName="max-w-5xl">
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="text-sm font-semibold text-slate-900">{ui.charset}</div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs text-slate-500">
                {ui.length} (1~256)
              </div>
              <input
                type="number"
                min={1}
                max={256}
                value={length}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, length: Number(e.target.value) }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </label>

            <label className="block">
              <div className="text-xs text-slate-500">
                {ui.count} (1~200)
              </div>
              <input
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, count: Number(e.target.value) }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={lowercase}
                onChange={(e) => setSettings((prev) => ({ ...prev, lowercase: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.lowercase}
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={uppercase}
                onChange={(e) => setSettings((prev) => ({ ...prev, uppercase: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.uppercase}
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={digits}
                onChange={(e) => setSettings((prev) => ({ ...prev, digits: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.digits}
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={symbols}
                onChange={(e) => setSettings((prev) => ({ ...prev, symbols: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.symbols}
            </label>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="block">
              <div className="text-xs text-slate-500">{ui.customChars}</div>
              <input
                type="text"
                value={customChars}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, customChars: e.target.value }))
                }
                placeholder="e.g. _-@"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </label>

            <label className="block">
              <div className="text-xs text-slate-500">{ui.excludeChars}</div>
              <input
                type="text"
                value={excludeChars}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, excludeChars: e.target.value }))
                }
                placeholder={AMBIGUOUS}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={excludeAmbiguous}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, excludeAmbiguous: e.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.excludeAmbiguous}
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={saveHistory}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, saveHistory: e.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.saveHistory}
            </label>
          </div>

          <div className="mt-4 rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-600">
                {ui.charsetSize}:{" "}
                <span className="font-semibold text-slate-900">
                  {charsetInfo.ok ? charsetInfo.size.toLocaleString() : "-"}
                </span>
              </div>
              <div className="text-xs text-slate-500">{ui.charsetPreview}</div>
            </div>
            <div className="mt-2 font-mono text-xs text-slate-700 break-all">
              {charsetInfo.ok ? charsetInfo.preview : charsetInfo.message}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generate}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-[0.99]"
            >
              {ui.generate}
            </button>
            <button
              type="button"
              onClick={copyAll}
              disabled={passwords.length === 0}
              className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-transparent active:scale-[0.99]"
            >
              {ui.copyAll}
            </button>
            <button
              type="button"
              onClick={clearResult}
              className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.99]"
            >
              {ui.clearResult}
            </button>
          </div>

          {error && (
            <p className="mt-3 text-xs text-rose-600" aria-live="polite">
              {error}
            </p>
          )}

          <p className="mt-4 text-xs text-slate-500">{ui.note}</p>
        </div>

        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">{ui.result}</div>
            <button
              type="button"
              onClick={copyAll}
              disabled={passwords.length === 0}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-transparent"
            >
              {ui.copyAll}
            </button>
          </div>

          <div className="mt-3">
            <textarea
              value={resultText}
              readOnly
              placeholder={ui.emptyResult}
              rows={10}
              className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>

          {passwords.length > 0 && (
            <div className="mt-4 space-y-2">
              {passwords.map((pw, idx) => (
                <div
                  key={`${idx}-${pw}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2 ring-1 ring-black/5"
                >
                  <div className="min-w-0 font-mono text-sm text-slate-900 break-all">{pw}</div>
                  <button
                    type="button"
                    onClick={() => copyOne(pw)}
                    className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    {ui.copy}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-card mt-6 rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">
            {ui.history}{" "}
            <span className="text-xs font-normal text-slate-500">
              ({history.length.toLocaleString()})
            </span>
          </div>
          <button
            type="button"
            onClick={clearHistory}
            disabled={history.length === 0}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-transparent"
          >
            {ui.clearHistory}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {history.length === 0 ? (
            <div className="text-sm text-slate-500">{ui.emptyHistory}</div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2 ring-1 ring-black/5"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm text-slate-900 break-all">
                    {item.password}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatTime(item.createdAt, locale)}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyOne(item.password)}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    {ui.copy}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeHistoryItem(item.id)}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    {ui.remove}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ToolPageLayout>
  );
}
