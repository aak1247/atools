"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type PickedColor = {
  r: number;
  g: number;
  b: number;
  a: number;
  x: number;
  y: number;
};

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

const toHex2 = (value: number) => clampByte(value).toString(16).padStart(2, "0");

const rgbaToHex = (r: number, g: number, b: number, a: number) => {
  const alpha = clampByte(a);
  const base = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`.toUpperCase();
  if (alpha === 255) return base;
  return `${base}${toHex2(alpha)}`.toUpperCase();
};

const rgbToHsl = (r: number, g: number, b: number) => {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6;
    else if (max === gg) h = (bb - rr) / delta + 2;
    else h = (rr - gg) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const MAX_DISPLAY = 900;

type ColorPickerUi = {
  pickImageError: string;
  dropTitle: string;
  dropSubtitle: string;
  currentImagePrefix: string;
  reselect: string;
  hintPick: string;
  colorInfo: string;
  pixelPrefix: string;
  notPicked: string;
  copy: string;
  alphaNote: string;
};

const DEFAULT_UI: ColorPickerUi = {
  pickImageError: "请选择图片文件",
  dropTitle: "点击或拖拽图片到此处",
  dropSubtitle: "支持常见图片格式（JPG/PNG/WebP…）",
  currentImagePrefix: "当前图片：",
  reselect: "重新选择",
  hintPick: "提示：点击画布任意位置即可取色。",
  colorInfo: "颜色信息",
  pixelPrefix: "像素坐标：",
  notPicked: "未取色",
  copy: "复制",
  alphaNote: "说明：带透明度的颜色会输出 8 位 HEX（#RRGGBBAA）。",
};

function ColorPickerInner({ ui }: { ui: ColorPickerUi }) {
  const [file, setFile] = useState<File | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [picked, setPicked] = useState<PickedColor | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  const displaySize = useMemo(() => {
    if (!bitmap) return null;
    const scale = Math.min(1, MAX_DISPLAY / Math.max(bitmap.width, bitmap.height));
    return {
      width: Math.max(1, Math.round(bitmap.width * scale)),
      height: Math.max(1, Math.round(bitmap.height * scale)),
      scale,
    };
  }, [bitmap]);

  const draw = () => {
    if (!bitmap || !displaySize) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${displaySize.width}px`;
    canvas.style.height = `${displaySize.height}px`;
    canvas.width = Math.max(1, Math.floor(displaySize.width * dpr));
    canvas.height = Math.max(1, Math.floor(displaySize.height * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, displaySize.width, displaySize.height);
    ctx.drawImage(bitmap, 0, 0, displaySize.width, displaySize.height);

    if (!offscreenRef.current) offscreenRef.current = document.createElement("canvas");
    const off = offscreenRef.current;
    off.width = bitmap.width;
    off.height = bitmap.height;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    offCtx.clearRect(0, 0, bitmap.width, bitmap.height);
    offCtx.drawImage(bitmap, 0, 0);
  };

  useEffect(() => {
    draw();
    return () => {
      if (bitmap) bitmap.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap]);

  const processFile = async (selected: File) => {
    if (!selected.type.startsWith("image/")) {
      setError(ui.pickImageError);
      return;
    }
    setError(null);
    setPicked(null);
    setFile(selected);
    const nextBitmap = await createImageBitmap(selected);
    setBitmap((prev) => {
      if (prev) prev.close();
      return nextBitmap;
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) void processFile(selected);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) void processFile(selected);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const pickAt = (clientX: number, clientY: number) => {
    if (!bitmap || !displaySize) return;
    const canvas = canvasRef.current;
    const off = offscreenRef.current;
    if (!canvas || !off) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return;

    const scaleX = bitmap.width / displaySize.width;
    const scaleY = bitmap.height / displaySize.height;
    const ox = Math.min(bitmap.width - 1, Math.max(0, Math.floor(x * scaleX)));
    const oy = Math.min(bitmap.height - 1, Math.max(0, Math.floor(y * scaleY)));

    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    const data = offCtx.getImageData(ox, oy, 1, 1).data;
    setPicked({
      r: data[0],
      g: data[1],
      b: data[2],
      a: data[3],
      x: ox,
      y: oy,
    });
  };

  const hex = useMemo(() => {
    if (!picked) return "";
    return rgbaToHex(picked.r, picked.g, picked.b, picked.a);
  }, [picked]);

  const rgba = useMemo(() => {
    if (!picked) return "";
    const alpha = Math.round((picked.a / 255) * 1000) / 1000;
    return `rgba(${picked.r}, ${picked.g}, ${picked.b}, ${alpha})`;
  }, [picked]);

  const rgb = useMemo(() => {
    if (!picked) return "";
    return `rgb(${picked.r}, ${picked.g}, ${picked.b})`;
  }, [picked]);

  const hsl = useMemo(() => {
    if (!picked) return "";
    const { h, s, l } = rgbToHsl(picked.r, picked.g, picked.b);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }, [picked]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <>
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        {!file ? (
          <div
            className={`relative flex h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 ${
              isDragging
                ? "border-blue-500 bg-blue-50/50 scale-[1.01]"
                : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/50"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="text-sm font-medium text-slate-700">{ui.dropTitle}</div>
            <div className="mt-1 text-xs text-slate-500">{ui.dropSubtitle}</div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/80 p-4">
              <div className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{ui.currentImagePrefix}</span>
                {file.name}
                {bitmap && (
                  <span className="ml-2 text-xs text-slate-500">
                    {bitmap.width} × {bitmap.height}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setPicked(null);
                  setError(null);
                  setBitmap((prev) => {
                    if (prev) prev.close();
                    return null;
                  });
                }}
                className="rounded-xl bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
              >
                {ui.reselect}
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
              <div className="overflow-auto rounded-2xl border border-slate-200 bg-white p-4">
                {displaySize && (
                  <canvas
                    ref={canvasRef}
                    onClick={(e) => pickAt(e.clientX, e.clientY)}
                    className="block cursor-crosshair rounded-xl shadow-sm"
                  />
                )}
                <div className="mt-3 text-xs text-slate-500">
                  {ui.hintPick}
                </div>
              </div>

              <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
                <div className="text-sm font-semibold text-slate-900">{ui.colorInfo}</div>

                <div className="mt-4 flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-2xl ring-1 ring-black/10"
                    style={{
                      background: picked ? `rgba(${picked.r},${picked.g},${picked.b},${picked.a / 255})` : "#fff",
                    }}
                  />
                  <div className="text-xs text-slate-500">
                    {picked ? (
                      <div>
                        {ui.pixelPrefix}{picked.x}, {picked.y}
                      </div>
                    ) : (
                      <div>{ui.notPicked}</div>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {[
                    { label: "HEX", value: hex },
                    { label: "RGB", value: rgb },
                    { label: "RGBA", value: rgba },
                    { label: "HSL", value: hsl },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-slate-700">{item.label}</div>
                        <button
                          type="button"
                          disabled={!item.value}
                          onClick={() => copy(item.value)}
                          className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          {ui.copy}
                        </button>
                      </div>
                      <div className="mt-1 break-all font-mono text-xs text-slate-900">
                        {item.value || "-"}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 text-xs text-slate-500">
                  {ui.alphaNote}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-6 mx-auto max-w-md rounded-lg bg-rose-50 p-4 text-center text-sm text-rose-600 animate-fade-in-up">
          {error}
        </div>
      )}
    </>
  );
}

export default function ColorPickerClient() {
  return (
    <ToolPageLayout toolSlug="color-picker">
      {({ config }) => (
        <ColorPickerInner ui={{ ...DEFAULT_UI, ...(config.ui as Partial<ColorPickerUi> | undefined) }} />
      )}
    </ToolPageLayout>
  );
}
