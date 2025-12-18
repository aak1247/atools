"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Metrics = {
  width: number;
  height: number;
  sealPixels: number;
  areaRatio: number;
  components: number;
  perimeter: number;
  perimeterAreaRatio: number;
  hueStd: number;
  score: number;
  hint: string;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const rgbToHsv = (r: number, g: number, b: number): [number, number, number] => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return [h, s, v];
};

const buildMask = (img: ImageData, sensitivity: number) => {
  const { width, height, data } = img;
  const mask = new Uint8Array(width * height);

  const s = clamp(sensitivity, 0, 100);
  const hueRange = 12 + (s / 100) * 26;
  const minSaturation = 0.45 - (s / 100) * 0.25;
  const minValue = 0.18 - (s / 100) * 0.06;
  const minRed = 80 - (s / 100) * 20;

  let sealPixels = 0;
  let hueSum = 0;
  let hueSumSq = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a < 20) continue;
      const [h, sat, val] = rgbToHsv(r, g, b);
      const isRedHue = h <= hueRange || h >= 360 - hueRange;
      const isStrong = sat >= minSaturation && val >= minValue;
      const isRedish = r >= minRed && r > g * 1.08 && r > b * 1.08;
      if ((isRedHue && isStrong) || isRedish) {
        mask[y * width + x] = 1;
        sealPixels += 1;
        hueSum += h;
        hueSumSq += h * h;
      }
    }
  }

  const mean = sealPixels ? hueSum / sealPixels : 0;
  const variance = sealPixels ? hueSumSq / sealPixels - mean * mean : 0;
  const hueStd = Math.sqrt(Math.max(0, variance));
  return { mask, sealPixels, hueStd };
};

const countComponentsAndPerimeter = (mask: Uint8Array, width: number, height: number) => {
  const visited = new Uint8Array(mask.length);
  let components = 0;
  let perimeter = 0;

  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  const inBounds = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height;
  const index = (x: number, y: number) => y * width + x;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = index(x, y);
      if (!mask[i]) continue;

      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny) || !mask[index(nx, ny)]) perimeter += 1;
      }

      if (visited[i]) continue;
      components += 1;
      const qx: number[] = [x];
      const qy: number[] = [y];
      visited[i] = 1;
      for (let qi = 0; qi < qx.length; qi += 1) {
        const cx = qx[qi];
        const cy = qy[qi];
        for (const [dx, dy] of neighbors) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inBounds(nx, ny)) continue;
          const ni = index(nx, ny);
          if (!mask[ni] || visited[ni]) continue;
          visited[ni] = 1;
          qx.push(nx);
          qy.push(ny);
        }
      }
    }
  }

  return { components, perimeter };
};

const renderMaskPreview = (mask: Uint8Array, width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);
  if (!ctx) throw new Error("Canvas unavailable");
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < mask.length; i += 1) {
    const on = mask[i] === 1;
    img.data[i * 4] = on ? 220 : 0;
    img.data[i * 4 + 1] = on ? 20 : 0;
    img.data[i * 4 + 2] = on ? 60 : 0;
    img.data[i * 4 + 3] = on ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

const scoreFrom = (m: Omit<Metrics, "score" | "hint">): { score: number; hint: string } => {
  if (m.sealPixels <= 50) {
    return { score: 0, hint: "未检测到明显印章区域（可能不是红章/背景复杂/清晰度不足）。" };
  }

  let score = 0;
  score += clamp((m.components - 4) * 4, 0, 30);
  score += clamp((m.perimeterAreaRatio - 0.08) * 450, 0, 35);
  score += clamp((m.hueStd - 20) * 1.2, 0, 20);
  score += clamp((0.02 - m.areaRatio) * 1500, 0, 15);
  score = clamp(Math.round(score), 0, 100);

  let hint = "参考：分量数/边界复杂度/色相离散度越高，越可能存在抠图拼接或二次处理痕迹。";
  if (score >= 75) hint = "疑点较高：建议结合原始扫描件、不同分辨率版本与专业取证工具进一步核验。";
  else if (score >= 45) hint = "疑点中等：可能存在二次处理、压缩或背景干扰；建议对比同源文件与原件。";
  else hint = "疑点较低：未发现明显异常特征（仅供参考）。";

  return { score, hint };
};

export default function SealForgeryDetectorClient() {
  return (
    <ToolPageLayout toolSlug="seal-forgery-detector" maxWidthClassName="max-w-6xl">
      <SealForgeryDetectorInner />
    </ToolPageLayout>
  );
}

function SealForgeryDetectorInner() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState(70);

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (maskUrl) URL.revokeObjectURL(maskUrl);
    };
  }, [maskUrl, originalUrl]);

  const pick = (selected: File) => {
    setFile(selected);
    setError(null);
    setMetrics(null);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(URL.createObjectURL(selected));
    if (maskUrl) URL.revokeObjectURL(maskUrl);
    setMaskUrl(null);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pick(selected);
  };

  const analyze = async () => {
    if (!file) return;
    setIsWorking(true);
    setError(null);
    setMetrics(null);
    try {
      const bitmap = await createImageBitmap(file);
      const maxSide = 720;
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(bitmap, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);

      const { mask, sealPixels, hueStd } = buildMask(img, sensitivity);
      const { components, perimeter } = countComponentsAndPerimeter(mask, w, h);
      const areaRatio = sealPixels / (w * h);
      const perimeterAreaRatio = perimeter / (sealPixels || 1);

      const base = { width: w, height: h, sealPixels, areaRatio, components, perimeter, perimeterAreaRatio, hueStd };
      const { score, hint } = scoreFrom(base);
      setMetrics({ ...base, score, hint });

      const maskCanvas = renderMaskPreview(mask, w, h);
      const blob = await new Promise<Blob>((resolve, reject) => {
        maskCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to export preview"))), "image/png", 1);
      });
      const url = URL.createObjectURL(blob);
      if (maskUrl) URL.revokeObjectURL(maskUrl);
      setMaskUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败");
    } finally {
      setIsWorking(false);
    }
  };

  const scoreBadge = useMemo(() => {
    if (!metrics) return null;
    if (metrics.score >= 75) return "bg-rose-50 text-rose-800 ring-rose-200";
    if (metrics.score >= 45) return "bg-amber-50 text-amber-800 ring-amber-200";
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }, [metrics]);

  const clear = () => {
    setFile(null);
    setError(null);
    setMetrics(null);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(null);
    if (maskUrl) URL.revokeObjectURL(maskUrl);
    setMaskUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
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
            onClick={() => void analyze()}
            disabled={!file || isWorking}
            className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isWorking ? "分析中…" : "开始检测"}
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          说明：这是基于像素特征的启发式“疑点”检测，不等同于司法鉴定结果。强烈建议将结果作为线索参考，并结合原件、扫描流程与签章系统日志综合判断。
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-3 text-sm text-slate-700">
            灵敏度
            <input
              type="range"
              min={20}
              max={100}
              step={1}
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              className="w-56 accent-rose-600"
            />
            <span className="w-12 text-right font-semibold text-slate-900">{sensitivity}%</span>
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        {file && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">原图</div>
              <div className="mt-3 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                {originalUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={originalUrl} alt="original" className="h-80 w-full object-contain p-4" />
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">检测结果</div>
                  {metrics && scoreBadge && (
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${scoreBadge}`}>
                      疑点评分 {metrics.score}/100
                    </span>
                  )}
                </div>

                {!metrics ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                    点击“开始检测”后显示结果。
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">{metrics.hint}</div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">像素占比：{(metrics.areaRatio * 100).toFixed(2)}%</div>
                      <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">连通分量：{metrics.components}</div>
                      <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">边界长度：{metrics.perimeter}</div>
                      <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">边界/面积：{metrics.perimeterAreaRatio.toFixed(4)}</div>
                      <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">色相标准差：{metrics.hueStd.toFixed(2)}</div>
                      <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">采样尺寸：{metrics.width}×{metrics.height}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">印章像素掩膜（预览）</div>
                <div className="mt-3 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                  {maskUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={maskUrl} alt="mask" className="h-64 w-full object-contain p-4" />
                  ) : (
                    <div className="flex h-64 items-center justify-center text-xs text-slate-500">未生成</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

