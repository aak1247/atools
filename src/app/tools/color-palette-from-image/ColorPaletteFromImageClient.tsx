"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Rgb = { r: number; g: number; b: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const toHex2 = (v: number): string => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
const rgbToHex = (c: Rgb): string => `#${toHex2(c.r)}${toHex2(c.g)}${toHex2(c.b)}`.toUpperCase();

const dist2 = (a: Rgb, b: Rgb) => {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
};

const randomInt = (max: number) => Math.floor(Math.random() * max);

const kmeans = (points: Rgb[], k: number, iterations: number) => {
  if (points.length === 0) return [] as Array<{ color: Rgb; count: number }>;
  const kk = clamp(Math.round(k), 1, 16);
  const centers: Rgb[] = [];
  for (let i = 0; i < kk; i += 1) centers.push(points[randomInt(points.length)]);

  const counts = new Array<number>(kk).fill(0);
  const sums: Rgb[] = Array.from({ length: kk }, () => ({ r: 0, g: 0, b: 0 }));
  const assignment = new Array<number>(points.length).fill(0);

  for (let iter = 0; iter < iterations; iter += 1) {
    counts.fill(0);
    for (const s of sums) {
      s.r = 0;
      s.g = 0;
      s.b = 0;
    }

    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      let best = 0;
      let bestD = dist2(p, centers[0]);
      for (let c = 1; c < kk; c += 1) {
        const d = dist2(p, centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assignment[i] = best;
      counts[best] += 1;
      sums[best].r += p.r;
      sums[best].g += p.g;
      sums[best].b += p.b;
    }

    for (let c = 0; c < kk; c += 1) {
      if (counts[c] === 0) continue;
      centers[c] = { r: sums[c].r / counts[c], g: sums[c].g / counts[c], b: sums[c].b / counts[c] };
    }
  }

  const result = centers.map((color, idx) => ({ color, count: counts[idx] }));
  result.sort((a, b) => b.count - a.count);
  return result;
};

const isNearWhite = (p: Rgb) => p.r > 245 && p.g > 245 && p.b > 245;
const isNearBlack = (p: Rgb) => p.r < 10 && p.g < 10 && p.b < 10;

export default function ColorPaletteFromImageClient() {
  return (
    <ToolPageLayout toolSlug="color-palette-from-image" maxWidthClassName="max-w-6xl">
      <ColorPaletteFromImageInner />
    </ToolPageLayout>
  );
}

function ColorPaletteFromImageInner() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [count, setCount] = useState(8);
  const [ignoreWhite, setIgnoreWhite] = useState(true);
  const [ignoreBlack, setIgnoreBlack] = useState(false);
  const [maxSize, setMaxSize] = useState(220);

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [palette, setPalette] = useState<Array<{ hex: string; ratio: number }>>([]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const pick = (selected: File) => {
    setFile(selected);
    setError(null);
    setPalette([]);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(selected));
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pick(selected);
  };

  const extract = async () => {
    if (!file) return;
    setIsWorking(true);
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(bitmap, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const pts: Rgb[] = [];

      const stride = 4;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const a = img.data[i + 3];
          if (a < 40) continue;
          const p = { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] };
          if (ignoreWhite && isNearWhite(p)) continue;
          if (ignoreBlack && isNearBlack(p)) continue;
          pts.push(p);
        }
      }

      if (pts.length === 0) throw new Error("未采样到有效像素（可尝试取消忽略白/黑背景）。");

      const result = kmeans(pts.filter((_, idx) => idx % stride === 0), count, 10);
      const total = result.reduce((acc, r) => acc + r.count, 0) || 1;
      const out = result
        .filter((r) => r.count > 0)
        .map((r) => ({ hex: rgbToHex(r.color), ratio: r.count / total }));
      setPalette(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提取失败");
    } finally {
      setIsWorking(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const cssVars = useMemo(() => {
    if (palette.length === 0) return "";
    const lines = palette.map((p, i) => `  --palette-${i + 1}: ${p.hex};`);
    return `:root {\n${lines.join("\n")}\n}\n`;
  }, [palette]);

  const clear = () => {
    setFile(null);
    setPalette([]);
    setError(null);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              选择图片
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              清空
            </button>
            {file && (
              <div className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{file.name}</span>{" "}
                <span className="text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void extract()}
            disabled={!file || isWorking}
            className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isWorking ? "提取中…" : "提取配色"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        {file && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">图片预览</div>
              <div className="mt-4 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="preview" className="h-80 w-full object-contain p-4" />
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">参数</div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    颜色数量
                    <input
                      type="number"
                      min={2}
                      max={16}
                      step={1}
                      value={count}
                      onChange={(e) => setCount(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                  <label className="block text-sm text-slate-700">
                    采样边长（px）
                    <input
                      type="number"
                      min={64}
                      max={512}
                      step={8}
                      value={maxSize}
                      onChange={(e) => setMaxSize(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ignoreWhite}
                      onChange={(e) => setIgnoreWhite(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    忽略近白背景
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ignoreBlack}
                      onChange={(e) => setIgnoreBlack(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    忽略近黑背景
                  </label>
                </div>
              </div>

              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">配色结果</div>
                  {palette.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void copy(cssVars)}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
                    >
                      复制 CSS 变量
                    </button>
                  )}
                </div>

                {palette.length === 0 ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                    点击“提取配色”后显示结果。
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {palette.map((p) => (
                      <button
                        key={p.hex}
                        type="button"
                        onClick={() => void copy(p.hex)}
                        className="group overflow-hidden rounded-2xl ring-1 ring-slate-200 transition hover:shadow-md"
                        title="点击复制 HEX"
                      >
                        <div className="h-14 w-full" style={{ background: p.hex }} />
                        <div className="bg-white px-3 py-2 text-center font-mono text-xs text-slate-800">{p.hex}</div>
                        <div className="bg-slate-50 px-3 py-2 text-center text-[11px] text-slate-500">
                          {(p.ratio * 100).toFixed(1)}%
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {palette.length > 0 && (
                  <textarea
                    value={cssVars}
                    readOnly
                    className="mt-4 h-28 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
