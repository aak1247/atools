"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Ui = {
  hint: string;
  foreground: string;
  background: string;
  sample: string;
  ratio: string;
  result: string;
  aaNormal: string;
  aaLarge: string;
  aaaNormal: string;
  aaaLarge: string;
  pass: string;
  fail: string;
  suggest: string;
  useBlack: string;
  useWhite: string;
  simulate: string;
  none: string;
  protanopia: string;
  deuteranopia: string;
  tritanopia: string;
};

const DEFAULT_UI: Ui = {
  hint: "色彩对比度检查器：输入前景/背景颜色，计算 WCAG 对比度并给出 AA/AAA 通过情况（本地运行不上传）。",
  foreground: "前景色",
  background: "背景色",
  sample: "示例文本",
  ratio: "对比度",
  result: "检查结果",
  aaNormal: "AA（普通文本）≥ 4.5",
  aaLarge: "AA（大号文本）≥ 3.0",
  aaaNormal: "AAA（普通文本）≥ 7.0",
  aaaLarge: "AAA（大号文本）≥ 4.5",
  pass: "通过",
  fail: "不通过",
  suggest: "建议前景色",
  useBlack: "使用黑色",
  useWhite: "使用白色",
  simulate: "色盲模拟",
  none: "无",
  protanopia: "红色盲",
  deuteranopia: "绿色盲",
  tritanopia: "蓝色盲",
};

type Rgb = { r: number; g: number; b: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const hexToRgb = (hex: string): Rgb | null => {
  const raw = hex.trim().replace(/^#/u, "");
  const s = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/u.test(s)) return null;
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const rgbToHex = (rgb: Rgb): string =>
  `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();

const srgbToLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const relativeLuminance = (rgb: Rgb) => 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);

const contrastRatio = (a: Rgb, b: Rgb) => {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

type BlindSim = "none" | "protanopia" | "deuteranopia" | "tritanopia";

const MATRICES: Record<Exclude<BlindSim, "none">, number[][]> = {
  protanopia: [
    [0.56667, 0.43333, 0],
    [0.55833, 0.44167, 0],
    [0, 0.24167, 0.75833],
  ],
  deuteranopia: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7],
  ],
  tritanopia: [
    [0.95, 0.05, 0],
    [0, 0.43333, 0.56667],
    [0, 0.475, 0.525],
  ],
};

const sim = (rgb: Rgb, mode: BlindSim): Rgb => {
  if (mode === "none") return rgb;
  const m = MATRICES[mode];
  const r = clamp01((m[0]![0]! * rgb.r + m[0]![1]! * rgb.g + m[0]![2]! * rgb.b) / 255) * 255;
  const g = clamp01((m[1]![0]! * rgb.r + m[1]![1]! * rgb.g + m[1]![2]! * rgb.b) / 255) * 255;
  const b = clamp01((m[2]![0]! * rgb.r + m[2]![1]! * rgb.g + m[2]![2]! * rgb.b) / 255) * 255;
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
};

export default function ColorContrastCheckerClient() {
  return (
    <ToolPageLayout toolSlug="color-contrast-checker" maxWidthClassName="max-w-5xl">
      {({ config }) => <Inner ui={{ ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) }} />}
    </ToolPageLayout>
  );
}

function Inner({ ui }: { ui: Ui }) {
  const [fg, setFg] = useState("#0F172A");
  const [bg, setBg] = useState("#FFFFFF");
  const [simMode, setSimMode] = useState<BlindSim>("none");

  const parsed = useMemo(() => {
    const fgRgb = hexToRgb(fg);
    const bgRgb = hexToRgb(bg);
    if (!fgRgb || !bgRgb) return null;
    const fgS = sim(fgRgb, simMode);
    const bgS = sim(bgRgb, simMode);
    const ratio = contrastRatio(fgS, bgS);
    return { fgRgb, bgRgb, fgS, bgS, ratio };
  }, [bg, fg, simMode]);

  const ratioText = parsed ? parsed.ratio.toFixed(2) : "-";
  const passes = parsed
    ? {
        aaNormal: parsed.ratio >= 4.5,
        aaLarge: parsed.ratio >= 3.0,
        aaaNormal: parsed.ratio >= 7.0,
        aaaLarge: parsed.ratio >= 4.5,
      }
    : null;

  const suggestion = useMemo(() => {
    if (!parsed) return null;
    const black: Rgb = { r: 0, g: 0, b: 0 };
    const white: Rgb = { r: 255, g: 255, b: 255 };
    const blackRatio = contrastRatio(black, parsed.bgS);
    const whiteRatio = contrastRatio(white, parsed.bgS);
    return { best: blackRatio >= whiteRatio ? "black" : "white", blackRatio, whiteRatio };
  }, [parsed]);

  const sampleStyle = parsed
    ? { color: rgbToHex(parsed.fgS), backgroundColor: rgbToHex(parsed.bgS) }
    : { color: fg, backgroundColor: bg };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.hint}</div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="grid gap-3">
              <label className="grid gap-1 text-xs text-slate-600">
                {ui.foreground}
                <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="h-10 w-full" />
              </label>
              <label className="grid gap-1 text-xs text-slate-600">
                {ui.background}
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-10 w-full" />
              </label>
              <label className="grid gap-1 text-xs text-slate-600">
                {ui.simulate}
                <select
                  value={simMode}
                  onChange={(e) => setSimMode(e.target.value as BlindSim)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                >
                  <option value="none">{ui.none}</option>
                  <option value="protanopia">{ui.protanopia}</option>
                  <option value="deuteranopia">{ui.deuteranopia}</option>
                  <option value="tritanopia">{ui.tritanopia}</option>
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-2xl p-5 ring-1 ring-slate-200" style={sampleStyle as React.CSSProperties}>
              <div className="text-sm font-semibold">{ui.sample}</div>
              <div className="mt-2 text-sm">
                The quick brown fox jumps over the lazy dog. 0123456789
              </div>
              <div className="mt-2 text-2xl font-bold">Aa</div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.result}</div>
            <div className="mt-3 text-sm text-slate-700">
              {ui.ratio}: <span className="font-mono">{ratioText}</span>
            </div>

            <div className="mt-4 grid gap-2">
              {passes ? (
                <>
                  <Rule label={ui.aaNormal} ok={passes.aaNormal} ui={ui} />
                  <Rule label={ui.aaLarge} ok={passes.aaLarge} ui={ui} />
                  <Rule label={ui.aaaNormal} ok={passes.aaaNormal} ui={ui} />
                  <Rule label={ui.aaaLarge} ok={passes.aaaLarge} ui={ui} />
                </>
              ) : (
                <div className="text-sm text-slate-500">-</div>
              )}
            </div>

            {suggestion ? (
              <div className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-medium text-slate-700">{ui.suggest}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-slate-200">
                    {ui.useBlack}: <span className="font-mono">{suggestion.blackRatio.toFixed(2)}</span>
                  </span>
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-slate-200">
                    {ui.useWhite}: <span className="font-mono">{suggestion.whiteRatio.toFixed(2)}</span>
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Rule({ label, ok, ui }: { label: string; ok: boolean; ui: Ui }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
      <span className="text-slate-700">{label}</span>
      <span className={`text-xs font-semibold ${ok ? "text-emerald-700" : "text-rose-700"}`}>{ok ? ui.pass : ui.fail}</span>
    </div>
  );
}

