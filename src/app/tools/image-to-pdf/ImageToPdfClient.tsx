"use client";

import type { ChangeEvent } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type PageSizePreset = "auto" | "a4" | "letter";
type FitMode = "contain" | "cover";

type Item = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
};

const makeId = () => Math.random().toString(16).slice(2);

const DEFAULT_UI = {
  selectImages: "选择图片",
  sortByName: "按文件名排序",
  clear: "清空",
  selectedCount: "已选 {count} 张",
  download: "下载 {filename}",
  generating: "生成中…",
  generatePdf: "生成 PDF",
  imageList: "图片列表",
  dragSortHint: "支持拖拽排序可后续增强；目前可用上下按钮调整。",
  selectImagesHint: "请选择图片（JPG/PNG/WebP/GIF 等，具体取决于浏览器解码能力）。",
  delete: "删除",
  pageSettings: "页面设置",
  paperSize: "纸张",
  a4: "A4",
  letter: "Letter",
  autoByImageSize: "按图片尺寸（DPI）",
  orientation: "方向",
  portrait: "竖版",
  landscape: "横版",
  fitMode: "适配",
  contain: "Contain（完整显示）",
  cover: "Cover（铺满裁切）",
  dpi: "DPI（仅按图片尺寸时生效）",
  margins: "页边距（pt）",
  backgroundColor: "背景色",
  backgroundColorLabel: "背景色",
  tip: "提示：本工具使用浏览器本地生成 PDF，不上传图片。若要保留原始 JPEG 体积优势，建议上传 JPG/JPEG（会直接嵌入）；其他格式会转为 PNG 再嵌入。",
  readImageError: "读取图片失败",
  buildError: "生成失败"
} as const;

type ImageToPdfUi = typeof DEFAULT_UI;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const sizePresetToPoints = (preset: PageSizePreset, orientation: "portrait" | "landscape") => {
  // points (1pt = 1/72 inch)
  if (preset === "a4") return orientation === "portrait" ? { w: 595.28, h: 841.89 } : { w: 841.89, h: 595.28 };
  if (preset === "letter") return orientation === "portrait" ? { w: 612, h: 792 } : { w: 792, h: 612 };
  return { w: 0, h: 0 };
};

const readImageSize = async (file: File): Promise<{ width: number; height: number }> => {
  const bmp = await createImageBitmap(file);
  return { width: bmp.width, height: bmp.height };
};

const fileExt = (name: string) => {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
};

const blobToUint8 = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer());

const toPngBytes = async (file: File): Promise<Uint8Array> => {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bmp, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to export PNG"))), "image/png", 1);
  });
  return blobToUint8(blob);
};

const scaleRect = (srcW: number, srcH: number, dstW: number, dstH: number, mode: FitMode) => {
  const sx = dstW / srcW;
  const sy = dstH / srcH;
  const s = mode === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
  const w = srcW * s;
  const h = srcH * s;
  const x = (dstW - w) / 2;
  const y = (dstH - h) / 2;
  return { x, y, w, h };
};

export default function ImageToPdfClient() {
  return (
    <ToolPageLayout toolSlug="image-to-pdf" maxWidthClassName="max-w-6xl">
      <ImageToPdfInner />
    </ToolPageLayout>
  );
}

function ImageToPdfInner() {
  const config = useOptionalToolConfig("image-to-pdf");
  const ui: ImageToPdfUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<ImageToPdfUi>) };

  const inputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<Item[]>([]);
  const [pageSize, setPageSize] = useState<PageSizePreset>("a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [fit, setFit] = useState<FitMode>("contain");
  const [dpi, setDpi] = useState(150);
  const [margin, setMargin] = useState(18);
  const [bg, setBg] = useState("#FFFFFF");

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("images.pdf");

  useEffect(() => {
    return () => {
      for (const it of items) URL.revokeObjectURL(it.url);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl, items]);

  const totalCount = items.length;

  const pick = async (files: File[]) => {
    setError(null);
    const next: Item[] = [];
    for (const f of files) {
      const url = URL.createObjectURL(f);
      try {
        const { width, height } = await readImageSize(f);
        next.push({ id: makeId(), file: f, url, width, height });
      } catch (e) {
        URL.revokeObjectURL(url);
        setError(e instanceof Error ? e.message : ui.readImageError);
      }
    }
    setItems((prev) => [...prev, ...next]);
    if (files.length > 0) {
      const base = files[0].name.replace(/\.[^.]+$/, "") || "images";
      setDownloadName(`${base}.pdf`);
    }
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) void pick(files);
  };

  const remove = (id: string) => {
    setItems((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((x) => x.id !== id);
    });
  };

  const move = (id: string, dir: -1 | 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === id);
      if (idx < 0) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = prev.slice();
      const tmp = copy[idx];
      copy[idx] = copy[j];
      copy[j] = tmp;
      return copy;
    });
  };

  const clear = () => {
    for (const it of items) URL.revokeObjectURL(it.url);
    setItems([]);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const sortByName = () => {
    setItems((prev) =>
      prev
        .slice()
        .sort((a, b) => a.file.name.localeCompare(b.file.name, "zh-CN", { numeric: true })),
    );
  };

  const build = async () => {
    if (items.length === 0) return;
    setIsWorking(true);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    try {
      const doc = await PDFDocument.create();
      const bgRgb = hexToRgb(bg);
      const pad = clamp(Math.round(margin), 0, 120);
      const safeDpi = clamp(Math.round(dpi), 36, 600);

      for (const it of items) {
        const ext = fileExt(it.file.name);
        const mime = it.file.type;

        const isJpeg = mime === "image/jpeg" || mime === "image/jpg" || ext === "jpg" || ext === "jpeg";
        const isPng = mime === "image/png" || ext === "png";

        let embedded: { width: number; height: number; draw: (page: any, rect: { x: number; y: number; w: number; h: number }) => void };

        if (isJpeg) {
          const bytes = new Uint8Array(await it.file.arrayBuffer());
          const img = await doc.embedJpg(bytes);
          embedded = {
            width: it.width,
            height: it.height,
            draw: (page, rect) => page.drawImage(img, { x: rect.x, y: rect.y, width: rect.w, height: rect.h }),
          };
        } else if (isPng) {
          const bytes = new Uint8Array(await it.file.arrayBuffer());
          const img = await doc.embedPng(bytes);
          embedded = {
            width: it.width,
            height: it.height,
            draw: (page, rect) => page.drawImage(img, { x: rect.x, y: rect.y, width: rect.w, height: rect.h }),
          };
        } else {
          const pngBytes = await toPngBytes(it.file);
          const img = await doc.embedPng(pngBytes);
          embedded = {
            width: it.width,
            height: it.height,
            draw: (page, rect) => page.drawImage(img, { x: rect.x, y: rect.y, width: rect.w, height: rect.h }),
          };
        }

        let pageW = 0;
        let pageH = 0;
        if (pageSize === "auto") {
          pageW = (embedded.width / safeDpi) * 72;
          pageH = (embedded.height / safeDpi) * 72;
          if (orientation === "landscape" && pageH > pageW) [pageW, pageH] = [pageH, pageW];
          if (orientation === "portrait" && pageW > pageH) [pageW, pageH] = [pageH, pageW];
        } else {
          const preset = sizePresetToPoints(pageSize, orientation);
          pageW = preset.w;
          pageH = preset.h;
        }

        const page = doc.addPage([pageW, pageH]);
        page.drawRectangle({
          x: 0,
          y: 0,
          width: pageW,
          height: pageH,
          color: rgb(bgRgb.r / 255, bgRgb.g / 255, bgRgb.b / 255),
        });

        const contentW = Math.max(1, pageW - pad * 2);
        const contentH = Math.max(1, pageH - pad * 2);
        const rect = scaleRect(embedded.width, embedded.height, contentW, contentH, fit);
        embedded.draw(page, { x: pad + rect.x, y: pad + rect.y, w: rect.w, h: rect.h });
      }

      const bytes = await doc.save();
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      setDownloadUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.buildError);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onChange} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {ui.selectImages}
            </button>
            <button
              type="button"
              onClick={sortByName}
              disabled={items.length < 2}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {ui.sortByName}
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {ui.clear}
            </button>
            <div className="text-sm text-slate-600">{ui.selectedCount.replace('{count}', totalCount.toString())}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={downloadName}
                className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {ui.download.replace('{filename}', downloadName)}
              </a>
            )}
            <button
              type="button"
              onClick={() => void build()}
              disabled={items.length === 0 || isWorking}
              className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {isWorking ? ui.generating : ui.generatePdf}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">{ui.imageList}</div>
              <div className="text-xs text-slate-500">{ui.dragSortHint}</div>
            </div>
            {items.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                {ui.selectImagesHint}
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {items.map((it, idx) => (
                  <div key={it.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div className="h-12 w-12 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.url} alt={it.file.name} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {idx + 1}. {it.file.name}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">
                        {it.width}×{it.height}px · {(it.file.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => move(it.id, -1)}
                        disabled={idx === 0}
                        className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-60"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(it.id, 1)}
                        disabled={idx === items.length - 1}
                        className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-60"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(it.id)}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100"
                      >
                        {ui.delete}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.pageSettings}</div>
              <div className="mt-4 grid gap-4">
                <label className="block text-sm text-slate-700">
                  {ui.paperSize}
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(e.target.value as PageSizePreset)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value="a4">A4</option>
                    <option value="letter">Letter</option>
                    <option value="auto">{ui.autoByImageSize}</option>
                  </select>
                </label>

                <label className="block text-sm text-slate-700">
                  {ui.orientation}
                  <select
                    value={orientation}
                    onChange={(e) => setOrientation(e.target.value as "portrait" | "landscape")}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value="portrait">{ui.portrait}</option>
                    <option value="landscape">{ui.landscape}</option>
                  </select>
                </label>

                <label className="block text-sm text-slate-700">
                  {ui.fitMode}
                  <select
                    value={fit}
                    onChange={(e) => setFit(e.target.value as FitMode)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value="contain">{ui.contain}</option>
                    <option value="cover">{ui.cover}</option>
                  </select>
                </label>

                <label className={`block text-sm text-slate-700 ${pageSize === "auto" ? "" : "opacity-60"}`}>
                  {ui.dpi}
                  <input
                    type="number"
                    min={36}
                    max={600}
                    step={1}
                    value={dpi}
                    disabled={pageSize !== "auto"}
                    onChange={(e) => setDpi(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  {ui.margins}
                  <input
                    type="number"
                    min={0}
                    max={120}
                    step={1}
                    value={margin}
                    onChange={(e) => setMargin(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  {ui.backgroundColorLabel}
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="color"
                      value={bg}
                      onChange={(e) => setBg(e.target.value.toUpperCase())}
                      className="h-10 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                      aria-label={ui.backgroundColorLabel}
                    />
                    <input
                      value={bg}
                      onChange={(e) => setBg(e.target.value.toUpperCase())}
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 font-mono text-xs outline-none"
                    />
                  </div>
                </label>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-600">
              {ui.tip}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const hexToRgb = (hex: string) => {
  const m = hex.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return { r: 255, g: 255, b: 255 };
  const v = m[1];
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
};
