"use client";

import { useMemo, useState } from "react";

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

const toHex2 = (v: number): string => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");

const rgbToHex = ({ r, g, b }: Rgb): string => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`.toUpperCase();

const hexToRgb = (raw: string): Rgb | null => {
  const s = raw.trim().replace(/^0x/i, "#");
  const m3 = s.match(/^#([0-9a-f]{3})$/i);
  if (m3) {
    const [r, g, b] = m3[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  const m6 = s.match(/^#([0-9a-f]{6})$/i);
  if (m6) {
    const v = m6[1];
    return {
      r: parseInt(v.slice(0, 2), 16),
      g: parseInt(v.slice(2, 4), 16),
      b: parseInt(v.slice(4, 6), 16),
    };
  }
  return null;
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

const parseRgbFunc = (raw: string): Rgb | null => {
  const m = raw.trim().match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
};

const parseHslFunc = (raw: string): Hsl | null => {
  const m = raw.trim().match(/^hsla?\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (!m) return null;
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
};

const formatRgb = ({ r, g, b }: Rgb): string =>
  `rgb(${Math.round(clamp(r, 0, 255))}, ${Math.round(clamp(g, 0, 255))}, ${Math.round(clamp(b, 0, 255))})`;

const formatHsl = ({ h, s, l }: Hsl): string =>
  `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(clamp(s, 0, 100))}%, ${Math.round(clamp(l, 0, 100))}%)`;

export default function ColorConverterClient() {
  const [input, setInput] = useState("#3B82F6");

  const parsed = useMemo(() => {
    const fromHex = hexToRgb(input);
    if (fromHex) return { ok: true as const, rgb: fromHex };
    const fromRgb = parseRgbFunc(input);
    if (fromRgb) return { ok: true as const, rgb: fromRgb };
    const fromHsl = parseHslFunc(input);
    if (fromHsl) return { ok: true as const, rgb: hslToRgb(fromHsl) };
    return { ok: false as const, error: "无法识别输入格式（支持 #RGB/#RRGGBB、rgb(...)、hsl(...)）" };
  }, [input]);

  const outputs = useMemo(() => {
    if (!parsed.ok) return null;
    const rgb = parsed.rgb;
    const hex = rgbToHex(rgb);
    const hsl = rgbToHsl(rgb);
    return { rgb, hex, hsl };
  }, [parsed]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">颜色转换器</h1>
        <p className="mt-2 text-sm text-slate-500">HEX / RGB / HSL 互转（纯本地处理）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">输入</div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  placeholder="#RRGGBB / rgb(...) / hsl(...)"
                />
                <input
                  type="color"
                  value={outputs?.hex ?? "#000000"}
                  onChange={(e) => setInput(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                  aria-label="选择颜色"
                />
              </div>
              {!parsed.ok && <div className="mt-3 text-sm text-rose-600">{parsed.error}</div>}
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">预览</div>
              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <div className="h-28 w-full" style={{ background: outputs?.hex ?? "#ffffff" }} />
              </div>
              {outputs && (
                <div className="mt-3 text-xs text-slate-500">
                  {outputs.hex} · {formatRgb(outputs.rgb)} · {formatHsl(outputs.hsl)}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">输出</div>
              {outputs ? (
                <div className="mt-4 space-y-3">
                  {[
                    { label: "HEX", value: outputs.hex },
                    { label: "RGB", value: formatRgb(outputs.rgb) },
                    { label: "HSL", value: formatHsl(outputs.hsl) },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-500">{row.label}</div>
                        <div className="mt-1 font-mono text-sm text-slate-900 break-all">{row.value}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copy(row.value)}
                        className="shrink-0 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        复制
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 text-sm text-slate-500">请输入颜色值以显示转换结果。</div>
              )}
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 text-xs text-slate-500">
              支持格式示例：<code className="font-mono">#3B82F6</code>、<code className="font-mono">rgb(59, 130, 246)</code>、<code className="font-mono">hsl(217, 91%, 60%)</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

