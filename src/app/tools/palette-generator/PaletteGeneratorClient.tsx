"use client";

import { useMemo, useState } from "react";

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

const toHex2 = (v: number): string => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
const rgbToHex = ({ r, g, b }: Rgb): string => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`.toUpperCase();

const hexToRgb = (raw: string): Rgb | null => {
  const s = raw.trim();
  const m3 = s.match(/^#([0-9a-f]{3})$/i);
  if (m3) {
    const [r, g, b] = m3[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  const m6 = s.match(/^#([0-9a-f]{6})$/i);
  if (!m6) return null;
  const v = m6[1];
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
};

const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
};

const hslToRgb = ({ h, s, l }: Hsl): Rgb => {
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hh = ((h % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ln - c / 2;

  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (hh < 60) [rn, gn, bn] = [c, x, 0];
  else if (hh < 120) [rn, gn, bn] = [x, c, 0];
  else if (hh < 180) [rn, gn, bn] = [0, c, x];
  else if (hh < 240) [rn, gn, bn] = [0, x, c];
  else if (hh < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];

  return { r: (rn + m) * 255, g: (gn + m) * 255, b: (bn + m) * 255 };
};

const normalizeHue = (h: number): number => ((h % 360) + 360) % 360;

const makeMonochrome = (base: Hsl): Hsl[] => {
  const steps = [-20, -10, 0, 10, 20];
  return steps.map((delta) => ({ ...base, l: clamp(base.l + delta, 0, 100) }));
};

const makeComplementary = (base: Hsl): Hsl[] => [
  base,
  { ...base, h: normalizeHue(base.h + 180) },
  { ...base, h: normalizeHue(base.h + 180), l: clamp(base.l + 12, 0, 100) },
  { ...base, l: clamp(base.l + 12, 0, 100) },
  { ...base, l: clamp(base.l - 12, 0, 100) },
];

const makeAnalogous = (base: Hsl): Hsl[] => [
  { ...base, h: normalizeHue(base.h - 30) },
  { ...base, h: normalizeHue(base.h - 15) },
  base,
  { ...base, h: normalizeHue(base.h + 15) },
  { ...base, h: normalizeHue(base.h + 30) },
];

const makeTriadic = (base: Hsl): Hsl[] => [
  base,
  { ...base, h: normalizeHue(base.h + 120) },
  { ...base, h: normalizeHue(base.h + 240) },
  { ...base, h: normalizeHue(base.h + 120), l: clamp(base.l + 10, 0, 100) },
  { ...base, h: normalizeHue(base.h + 240), l: clamp(base.l + 10, 0, 100) },
];

const randomHex = (): string => {
  const n = Math.floor(Math.random() * 0xffffff);
  return `#${n.toString(16).padStart(6, "0")}`.toUpperCase();
};

export default function PaletteGeneratorClient() {
  const [hex, setHex] = useState("#3B82F6");

  const base = useMemo(() => {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const hsl = rgbToHsl(rgb);
    return { rgb, hsl, hex: rgbToHex(rgb) };
  }, [hex]);

  const palettes = useMemo(() => {
    if (!base) return null;
    const toHex = (hsl: Hsl) => rgbToHex(hslToRgb(hsl));
    const mono = makeMonochrome(base.hsl).map(toHex);
    const comp = makeComplementary(base.hsl).map(toHex);
    const ana = makeAnalogous(base.hsl).map(toHex);
    const tri = makeTriadic(base.hsl).map(toHex);
    return [
      { name: "单色（明暗）", colors: mono },
      { name: "互补色", colors: comp },
      { name: "类似色", colors: ana },
      { name: "三色（Triadic）", colors: tri },
    ];
  }, [base]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  const copyAll = async (colors: string[]) => {
    await navigator.clipboard.writeText(colors.join(", "));
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">配色生成器</h1>
        <p className="mt-2 text-sm text-slate-500">输入主色，生成多套配色方案（纯本地处理）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">主色</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setHex(randomHex())}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              随机
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={hex}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            placeholder="#RRGGBB"
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
          />
          <input
            type="color"
            value={base?.hex ?? "#000000"}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            className="h-10 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
            aria-label="选择主色"
          />
          <button
            type="button"
            onClick={() => void copy(base?.hex ?? hex)}
            className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            复制主色
          </button>
        </div>

        {!base && <div className="mt-3 text-sm text-rose-600">请输入有效的 HEX（例如 #3B82F6）。</div>}

        {palettes && (
          <div className="mt-8 space-y-6">
            {palettes.map((palette) => (
              <div key={palette.name} className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">{palette.name}</div>
                  <button
                    type="button"
                    onClick={() => void copyAll(palette.colors)}
                    className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
                  >
                    复制全部
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {palette.colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => void copy(c)}
                      className="group overflow-hidden rounded-2xl ring-1 ring-slate-200 transition hover:shadow-md"
                      title="点击复制"
                    >
                      <div className="h-16 w-full" style={{ background: c }} />
                      <div className="bg-white px-3 py-2 text-center font-mono text-xs text-slate-800">
                        {c}
                      </div>
                      <div className="bg-slate-50 px-3 py-2 text-center text-[11px] text-slate-500 opacity-0 transition group-hover:opacity-100">
                        点击复制
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

