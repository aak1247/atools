"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const ZERO = BigInt(0);
const ONE = BigInt(1);

const digitValue = (ch: string): number => {
  const c = ch.toLowerCase();
  const idx = DIGITS.indexOf(c);
  return idx;
};

type ParseBigIntResult =
  | { ok: true; value: bigint }
  | { ok: false; code: "baseRange" }
  | { ok: false; code: "empty" }
  | { ok: false; code: "invalidChar"; ch: string; base: number };

const parseBigIntInBase = (raw: string, base: number): ParseBigIntResult => {
  if (!Number.isInteger(base) || base < 2 || base > 36) {
    return { ok: false, code: "baseRange" };
  }
  let text = raw.trim();
  if (!text) return { ok: false, code: "empty" };

  let sign: bigint = ONE;
  if (text.startsWith("-")) {
    sign = -ONE;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  if (base === 16 && /^0x/i.test(text)) text = text.replace(/^0x/i, "");
  if (base === 2 && /^0b/i.test(text)) text = text.replace(/^0b/i, "");
  if (base === 8 && /^0o/i.test(text)) text = text.replace(/^0o/i, "");

  if (!text) return { ok: false, code: "empty" };

  const bigBase = BigInt(base);
  let acc = ZERO;
  for (const ch of text) {
    if (ch === "_") continue;
    const v = digitValue(ch);
    if (v < 0 || v >= base) {
      return { ok: false, code: "invalidChar", ch, base };
    }
    acc = acc * bigBase + BigInt(v);
  }
  return { ok: true, value: acc * sign };
};

const formatBigIntInBase = (value: bigint, base: number): string => {
  if (value === ZERO) return "0";
  const bigBase = BigInt(base);
  const negative = value < ZERO;
  let n = negative ? -value : value;
  let out = "";
  while (n > ZERO) {
    const rem = Number(n % bigBase);
    out = DIGITS[rem] + out;
    n /= bigBase;
  }
  return negative ? `-${out}` : out;
};

type BaseConverterUi = {
  inputTitle: string;
  fromBase: string;
  toBase: string;
  numberLabel: string;
  numberPlaceholder: string;
  swap: string;
  prefix: string;
  resultTitle: string;
  copy: string;
  decimalPrefix: string;
  hint: string;
  errorBaseRange: string;
  errorEmpty: string;
  errorInvalidCharTemplate: string;
  errorConvert: string;
};

const DEFAULT_UI: BaseConverterUi = {
  inputTitle: "输入",
  fromBase: "从（base）",
  toBase: "到（base）",
  numberLabel: "数字（仅整数，可用 _ 分隔）",
  numberPlaceholder: "例如 0xff / 1010_0101 / -42",
  swap: "交换",
  prefix: "输出前缀（0x/0b/0o）",
  resultTitle: "结果",
  copy: "复制",
  decimalPrefix: "十进制：",
  hint: "提示：仅支持整数；如需小数/浮点进制转换，可另行扩展。",
  errorBaseRange: "base 必须在 2–36 之间。",
  errorEmpty: "请输入数字。",
  errorInvalidCharTemplate: "非法字符：{ch}（base={base}）",
  errorConvert: "无法转换",
};

const applyTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);

function BaseConverterInner({ ui }: { ui: BaseConverterUi }) {
  const [input, setInput] = useState("255");
  const [fromBase, setFromBase] = useState(10);
  const [toBase, setToBase] = useState(16);
  const [prefix, setPrefix] = useState(true);

  const result = useMemo(() => {
    try {
      const parsed = parseBigIntInBase(input, fromBase);
      if (!parsed.ok) {
        const error =
          parsed.code === "baseRange"
            ? ui.errorBaseRange
            : parsed.code === "empty"
              ? ui.errorEmpty
              : applyTemplate(ui.errorInvalidCharTemplate, {
                  ch: parsed.ch,
                  base: String(parsed.base),
                });
        return { ok: false as const, error };
      }

      const value = parsed.value;
      const raw = formatBigIntInBase(value, toBase);
      const pref =
        prefix && value >= ZERO
          ? toBase === 16
            ? `0x${raw}`
            : toBase === 2
              ? `0b${raw}`
              : toBase === 8
                ? `0o${raw}`
                : raw
          : raw;
      return { ok: true as const, value, raw, text: pref };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : ui.errorConvert };
    }
  }, [fromBase, input, prefix, toBase, ui.errorBaseRange, ui.errorConvert, ui.errorEmpty, ui.errorInvalidCharTemplate]);

  const swap = () => {
    setFromBase(toBase);
    setToBase(fromBase);
  };

  const copy = async () => {
    if (!result.ok) return;
    await navigator.clipboard.writeText(result.text);
  };

  return (
    <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.inputTitle}</div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-slate-700">
                {ui.fromBase}
                <input
                  type="number"
                  min={2}
                  max={36}
                  value={fromBase}
                  onChange={(e) => setFromBase(Number(e.target.value))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <label className="block text-sm text-slate-700">
                {ui.toBase}
                <input
                  type="number"
                  min={2}
                  max={36}
                  value={toBase}
                  onChange={(e) => setToBase(Number(e.target.value))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
            </div>

            <div className="mt-4">
              <label className="block text-sm text-slate-700">
                {ui.numberLabel}
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 font-mono text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  placeholder={ui.numberPlaceholder}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={swap}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                {ui.swap}
              </button>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={prefix}
                  onChange={(e) => setPrefix(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {ui.prefix}
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">{ui.resultTitle}</div>
              <button
                type="button"
                disabled={!result.ok}
                onClick={() => void copy()}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {ui.copy}
              </button>
            </div>
            <div className="mt-4 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
              <div className="font-mono text-sm text-slate-900 break-all">
                {result.ok ? result.text : "-"}
              </div>
              {!result.ok && <div className="mt-2 text-sm text-rose-600">{result.error}</div>}
            </div>
            {result.ok && (
              <div className="mt-3 text-xs text-slate-500">
                {ui.decimalPrefix}{result.value.toString()}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 text-xs text-slate-500">
            {ui.hint}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BaseConverterClient() {
  return (
    <ToolPageLayout toolSlug="base-converter">
      {({ config }) => (
        <BaseConverterInner ui={{ ...DEFAULT_UI, ...(config.ui as Partial<BaseConverterUi> | undefined) }} />
      )}
    </ToolPageLayout>
  );
}
