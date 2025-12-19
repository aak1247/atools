"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type PresetKey = "one-inch" | "two-inch" | "custom";

type Preset = { key: PresetKey; name: string; width: number; height: number };

type Ui = {
  hint: string;
  pick: string;
  clear: string;
  preset: string;
  presets: Record<PresetKey, string>;
  size: string;
  width: string;
  height: string;
  bg: string;
  zoom: string;
  offsetX: string;
  offsetY: string;
  export: string;
  exportPng: string;
  exportJpg: string;
  download: string;
  errPickImage: string;
};

const DEFAULT_UI: Ui = {
  hint: "证件照处理器：选择尺寸与背景色，调整缩放与位置，一键导出证件照（全程本地处理不上传）。",
  pick: "选择照片",
  clear: "清空",
  preset: "尺寸预设",
  presets: { "one-inch": "一寸（295×413）", "two-inch": "二寸（413×579）", custom: "自定义" },
  size: "尺寸",
  width: "宽度(px)",
  height: "高度(px)",
  bg: "背景色",
  zoom: "缩放",
  offsetX: "水平位移",
  offsetY: "垂直位移",
  export: "导出",
  exportPng: "导出 PNG",
  exportJpg: "导出 JPG",
  download: "下载",
  errPickImage: "请选择图片文件（PNG/JPG/WebP）。",
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export default function IdPhotoProcessorClient() {
  return (
    <ToolPageLayout toolSlug="id-photo-processor" maxWidthClassName="max-w-6xl">
      {({ config }) => <Inner ui={{ ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) }} />}
    </ToolPageLayout>
  );
}

function Inner({ ui }: { ui: Ui }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [bg, setBg] = useState("#FFFFFF");

  const [presetKey, setPresetKey] = useState<PresetKey>("two-inch");
  const [customW, setCustomW] = useState(413);
  const [customH, setCustomH] = useState(579);

  const [zoom, setZoom] = useState(1.1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("id-photo.png");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const presets = useMemo<Preset[]>(
    () => [
      { key: "one-inch", name: ui.presets["one-inch"], width: 295, height: 413 },
      { key: "two-inch", name: ui.presets["two-inch"], width: 413, height: 579 },
      { key: "custom", name: ui.presets.custom, width: customW, height: customH },
    ],
    [customH, customW, ui.presets],
  );

  const target = useMemo(() => presets.find((p) => p.key === presetKey) ?? presets[1]!, [presetKey, presets]);

  const resetAll = () => {
    setFile(null);
    bitmap?.close();
    setBitmap(null);
    setBg("#FFFFFF");
    setPresetKey("two-inch");
    setCustomW(413);
    setCustomH(579);
    setZoom(1.1);
    setOffsetX(0);
    setOffsetY(0);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setDownloadName("id-photo.png");
  };

  const pick = async (selected: File) => {
    if (!selected.type.startsWith("image/")) {
      alert(ui.errPickImage);
      return;
    }
    setFile(selected);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    bitmap?.close();
    const bm = await createImageBitmap(selected);
    setBitmap(bm);
    setZoom(1.1);
    setOffsetX(0);
    setOffsetY(0);
    const base = selected.name.replace(/\.[^.]+$/u, "") || "id-photo";
    setDownloadName(`${base}.id-photo.png`);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) void pick(selected);
    e.target.value = "";
  };

  const renderToCanvas = () => {
    const bm = bitmap;
    const canvas = canvasRef.current;
    if (!bm || !canvas) return;
    const w = clamp(target.width, 64, 4000);
    const h = clamp(target.height, 64, 6000);
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const scale = clamp(zoom, 0.2, 3);
    const drawW = bm.width * scale;
    const drawH = bm.height * scale;
    const cx = w / 2 + offsetX;
    const cy = h / 2 + offsetY;
    const x = cx - drawW / 2;
    const y = cy - drawH / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bm, x, y, drawW, drawH);
  };

  useEffect(() => {
    renderToCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap, bg, presetKey, customW, customH, zoom, offsetX, offsetY]);

  const exportImage = async (type: "png" | "jpeg") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderToCanvas();
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b),
        type === "png" ? "image/png" : "image/jpeg",
        type === "png" ? 1 : 0.92,
      );
    });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setDownloadUrl(url);
    setDownloadName((prev) => prev.replace(/\.(png|jpg|jpeg)$/iu, type === "png" ? ".png" : ".jpg"));
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.hint}</div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {ui.pick}
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {ui.clear}
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-600">
                {ui.size}: <span className="font-mono">{target.width}×{target.height}</span>
              </div>
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  {ui.download}
                </a>
              ) : null}
            </div>
            <div className="mt-3 overflow-auto rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <canvas ref={canvasRef} className="block max-w-full" />
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <label className="grid gap-1 text-xs text-slate-600">
              {ui.preset}
              <select
                value={presetKey}
                onChange={(e) => setPresetKey(e.target.value as PresetKey)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
              >
                <option value="one-inch">{ui.presets["one-inch"]}</option>
                <option value="two-inch">{ui.presets["two-inch"]}</option>
                <option value="custom">{ui.presets.custom}</option>
              </select>
            </label>

            {presetKey === "custom" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs text-slate-600">
                  {ui.width}
                  <input
                    type="number"
                    min={64}
                    max={4000}
                    value={customW}
                    onChange={(e) => setCustomW(clamp(Number(e.target.value), 64, 4000))}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  {ui.height}
                  <input
                    type="number"
                    min={64}
                    max={6000}
                    value={customH}
                    onChange={(e) => setCustomH(clamp(Number(e.target.value), 64, 6000))}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                  />
                </label>
              </div>
            ) : null}

            <label className="grid gap-1 text-xs text-slate-600">
              {ui.bg}
              <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-10 w-full" />
            </label>

            <label className="grid gap-1 text-xs text-slate-600">
              {ui.zoom}: <span className="font-mono">{zoom.toFixed(2)}</span>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-600">
              {ui.offsetX}: <span className="font-mono">{offsetX.toFixed(0)}</span>
              <input
                type="range"
                min={-300}
                max={300}
                step={1}
                value={offsetX}
                onChange={(e) => setOffsetX(Number(e.target.value))}
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-600">
              {ui.offsetY}: <span className="font-mono">{offsetY.toFixed(0)}</span>
              <input
                type="range"
                min={-400}
                max={400}
                step={1}
                value={offsetY}
                onChange={(e) => setOffsetY(Number(e.target.value))}
              />
            </label>

            <div className="pt-2">
              <div className="text-xs font-medium text-slate-700">{ui.export}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!bitmap}
                  onClick={() => void exportImage("png")}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {ui.exportPng}
                </button>
                <button
                  type="button"
                  disabled={!bitmap}
                  onClick={() => void exportImage("jpeg")}
                  className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {ui.exportJpg}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

