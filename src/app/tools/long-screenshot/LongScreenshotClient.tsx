/* eslint-disable @next/next/no-img-element */
"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  Download,
  Trash2,
  MoveUp,
  MoveDown,
  Image as ImageIcon,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

interface StitchImageItem {
  id: string;
  name: string;
  file: File;
  img: HTMLImageElement;
  width: number;
  height: number;
  previewUrl: string;
}

const DEFAULT_UI = {
  title: "长截图生成与多图垂直拼接",
  subtitle: "支持拖拽或直接粘贴（Ctrl+V）多张分段截图，智能无缝垂直拼接导出超高分辨率长图",
  pickImages: "选择多张截图",
  addMoreImages: "继续添加图片",
  dropHint: "拖拽多张截图到此处，或在页面任意处直接按下 Ctrl+V (Cmd+V) 快速粘贴截图",
  itemCountTemplate: "已添加 {count} 张截图",
  queueTitle: "截图队列与顺序调整",
  queueSubtitle: "上至下排列",
  optionsTitle: "拼接与排版参数",
  widthMode: "输出宽度模式",
  widthModeMax: "对齐最大宽度（推荐）",
  widthModeOriginal: "各图保持原宽",
  widthModeFixed: "固定常用移动端宽度 (750px)",
  gap: "图片间距 (Gap)",
  padding: "画布边距 (Padding)",
  radius: "图片圆角 (Radius)",
  bgColor: "背景颜色",
  bgColorWhite: "纯白",
  bgColorTransparent: "透明",
  bgColorDark: "深灰",
  actionMoveUp: "上移",
  actionMoveDown: "下移",
  actionDelete: "移除",
  clear: "清空全部",
  downloadLongImage: "导出长截图 (PNG)",
  generating: "正在生成高清长图…",
  previewTitle: "长截图预览",
  previewEmptyHint: "添加两张或更多分段截图即可实时生成拼接长图",
  resultMetaTemplate: "最终长图分辨率：{width} × {height} 像素",
  extensionGuideTitle: "如何对任意在线网页一键滚动长截图？",
  extensionGuideSubtitle: "由于现代浏览器出于安全同源策略（SOP）限制，任何普通网站均无法直接跨域截取外部在线网站的完整 DOM。若需截取外部线上网站，可安装 ATools 浏览器扩展进行当前标签页无感滚动截取。",
  extensionGuideSteps: [
    "在需要完整长截图的网页打开 ATools 扩展侧边栏；",
    "点击「长截图」功能，扩展会自动滚动当前页面并无缝分段拼接；",
    "完成后一键导出高清整页 PNG 图像。",
  ],
} as const;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function LongScreenshotClient() {
  return (
    <ToolPageLayout toolSlug="long-screenshot" maxWidthClassName="max-w-6xl">
      <LongScreenshotInner />
    </ToolPageLayout>
  );
}

function LongScreenshotInner() {
  const config = useOptionalToolConfig("long-screenshot");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<StitchImageItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);

  // Stitching configuration
  const [widthMode, setWidthMode] = useState<"max" | "original" | "fixed">("max");
  const [gap, setGap] = useState<number>(0);
  const [padding, setPadding] = useState<number>(0);
  const [radius, setRadius] = useState<number>(0);
  const [bgColor, setBgColor] = useState<string>("#ffffff");

  // Output
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultDimensions, setResultDimensions] = useState<{ width: number; height: number } | null>(
    null
  );

  const addFiles = useCallback(async (picked: File[]) => {
    const validImages = picked.filter((f) => f.type.startsWith("image/"));
    if (validImages.length === 0) return;

    const newItems: StitchImageItem[] = [];
    for (const f of validImages) {
      const url = URL.createObjectURL(f);
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
      });

      if (img.width > 0 && img.height > 0) {
        newItems.push({
          id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: f.name,
          file: f,
          img,
          width: img.width,
          height: img.height,
          previewUrl: url,
        });
      }
    }

    setImages((prev) => [...prev, ...newItems]);
  }, []);

  // Support paste from clipboard (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length > 0) {
        void addFiles(imageFiles);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addFiles]);

  // Revoke preview URL on cleanup
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      images.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [previewUrl, images]);

  const moveItem = (index: number, direction: "up" | "down") => {
    setImages((prev) => {
      const next = [...prev];
      const targetIdx = direction === "up" ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  const removeItem = (id: string) => {
    setImages((prev) => prev.filter((item) => item.id !== id));
  };

  const clearAll = () => {
    images.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setImages([]);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResultDimensions(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Re-generate the stitched canvas when images or parameters change
  useEffect(() => {
    if (images.length === 0) return;

    let isMounted = true;

    const timer = setTimeout(() => {
      // Calculate output canvas dimensions
      let contentWidth = 0;
      if (widthMode === "fixed") {
        contentWidth = 750;
      } else {
        contentWidth = Math.max(...images.map((img) => img.width));
      }

      // Calculate total height with scaling
      let contentHeight = 0;
      const scaledHeights: number[] = [];

      for (const item of images) {
        let drawHeight = item.height;

        if (widthMode === "max" || widthMode === "fixed") {
          const scale = contentWidth / item.width;
          drawHeight = item.height * scale;
        }
        scaledHeights.push(drawHeight);
        contentHeight += drawHeight;
      }

      const totalWidth = contentWidth + padding * 2;
      const totalHeight = contentHeight + padding * 2 + gap * (images.length - 1);

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(totalWidth);
      canvas.height = Math.round(totalHeight);
      const ctx = canvas.getContext("2d");

      if (ctx) {
        if (bgColor !== "transparent") {
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        let currentY = padding;

        for (let i = 0; i < images.length; i++) {
          const item = images[i];
          const drawHeight = scaledHeights[i];
          let drawWidth = contentWidth;
          let drawX = padding;

          if (widthMode === "original") {
            drawWidth = item.width;
            drawX = padding + (contentWidth - drawWidth) / 2;
          }

          if (radius > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(drawX, currentY, drawWidth, drawHeight, radius);
            ctx.clip();
            ctx.drawImage(item.img, drawX, currentY, drawWidth, drawHeight);
            ctx.restore();
          } else {
            ctx.drawImage(item.img, drawX, currentY, drawWidth, drawHeight);
          }

          currentY += drawHeight + gap;
        }

        canvas.toBlob((blob) => {
          if (!isMounted || !blob) return;
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
          setResultDimensions({ width: canvas.width, height: canvas.height });
        }, "image/png");
      }
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [images, widthMode, gap, padding, radius, bgColor]);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (dropped.length) void addFiles(dropped);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{ui.title}</h1>
            <p className="mt-1 text-xs text-slate-500">{ui.subtitle}</p>
          </div>
          {images.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1.5 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              <Trash2 className="h-4 w-4" />
              {ui.clear}
            </button>
          )}
        </div>

        {/* Drop and Paste Zone */}
        <div
          className={`mt-5 rounded-3xl border-2 border-dashed p-6 transition ${
            isDragging
              ? "border-blue-500 bg-blue-50/50"
              : "border-slate-200 bg-slate-50/60 hover:bg-slate-50"
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const files = Array.from(e.target.files ?? []);
              void addFiles(files);
              e.target.value = "";
            }}
          />

          <div className="flex flex-col items-center justify-center text-center">
            <div className="rounded-2xl bg-blue-100 p-3 text-blue-600">
              <ImageIcon className="h-8 w-8" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-800">
              {images.length > 0
                ? ui.itemCountTemplate.replace("{count}", String(images.length))
                : ui.dropHint}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Upload className="h-4 w-4" />
                {images.length > 0 ? ui.addMoreImages : ui.pickImages}
              </button>
            </div>
          </div>
        </div>

        {/* Workspace Layout */}
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* Left Column: Image List & Formatting Options (6 cols) */}
          <div className="space-y-5 lg:col-span-6">
            {/* Image Stack / Ordering */}
            {images.length > 0 && (
              <div className="rounded-3xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>{ui.queueTitle}</span>
                  <span className="text-slate-400 font-normal">{ui.queueSubtitle}</span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 pr-1">
                  {images.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                          #{idx + 1}
                        </span>
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          className="h-10 w-10 shrink-0 rounded-lg object-cover border border-slate-200"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-800">{item.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {item.width} × {item.height}px ({formatBytes(item.file.size)})
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveItem(idx, "up")}
                          disabled={idx === 0}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                          title={ui.actionMoveUp}
                        >
                          <MoveUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(idx, "down")}
                          disabled={idx === images.length - 1}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                          title={ui.actionMoveDown}
                        >
                          <MoveDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title={ui.actionDelete}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Layout Options */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="text-sm font-semibold text-slate-900">{ui.optionsTitle}</div>

              {/* Width Mode */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {ui.widthMode}
                </label>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setWidthMode("max")}
                    className={`rounded-xl border p-2.5 text-xs text-left transition ${
                      widthMode === "max"
                        ? "border-blue-600 bg-blue-50/50 text-blue-900 ring-1 ring-blue-500 font-semibold"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {ui.widthModeMax}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWidthMode("original")}
                    className={`rounded-xl border p-2.5 text-xs text-left transition ${
                      widthMode === "original"
                        ? "border-blue-600 bg-blue-50/50 text-blue-900 ring-1 ring-blue-500 font-semibold"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {ui.widthModeOriginal}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWidthMode("fixed")}
                    className={`rounded-xl border p-2.5 text-xs text-left transition ${
                      widthMode === "fixed"
                        ? "border-blue-600 bg-blue-50/50 text-blue-900 ring-1 ring-blue-500 font-semibold"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {ui.widthModeFixed}
                  </button>
                </div>
              </div>

              {/* Sliders for Gap, Padding, Radius */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="flex justify-between text-xs text-slate-600 font-medium">
                    <span>{ui.gap}</span>
                    <span className="font-mono">{gap}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={gap}
                    onChange={(e) => setGap(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-600 font-medium">
                    <span>{ui.padding}</span>
                    <span className="font-mono">{padding}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={padding}
                    onChange={(e) => setPadding(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-600 font-medium">
                    <span>{ui.radius}</span>
                    <span className="font-mono">{radius}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-600"
                  />
                </div>
              </div>

              {/* Background Color */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {ui.bgColor}
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setBgColor("#ffffff")}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition ${
                      bgColor === "#ffffff"
                        ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-500 font-medium"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full border border-slate-300 bg-white" />
                    <span>{ui.bgColorWhite}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBgColor("transparent")}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition ${
                      bgColor === "transparent"
                        ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-500 font-medium"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full border border-slate-300 bg-[linear-gradient(45deg,#ccc_25%,transparent_25%),linear-gradient(-45deg,#ccc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ccc_75%),linear-gradient(-45deg,transparent_75%,#ccc_75%)] bg-[size:6px_6px]" />
                    <span>{ui.bgColorTransparent}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBgColor("#1e293b")}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition ${
                      bgColor === "#1e293b"
                        ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-500 font-medium"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full bg-slate-800" />
                    <span>{ui.bgColorDark}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Collapsible Extension Guide Card */}
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <button
                type="button"
                onClick={() => setShowExtensionGuide(!showExtensionGuide)}
                className="flex w-full items-center justify-between text-left text-xs font-semibold text-slate-700"
              >
                <div className="flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-blue-600" />
                  <span>{ui.extensionGuideTitle}</span>
                </div>
                {showExtensionGuide ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </button>

              {showExtensionGuide && (
                <div className="mt-3 space-y-2 text-xs text-slate-600 border-t border-slate-200/60 pt-3">
                  <p className="leading-relaxed">{ui.extensionGuideSubtitle}</p>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                    {ui.extensionGuideSteps.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Preview & Export (6 cols) */}
          <div className="space-y-4 lg:col-span-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{ui.previewTitle}</div>
                {resultDimensions && (
                  <div className="text-xs text-slate-500">
                    {ui.resultMetaTemplate
                      .replace("{width}", String(resultDimensions.width))
                      .replace("{height}", String(resultDimensions.height))}
                  </div>
                )}
              </div>

              {previewUrl ? (
                <div className="space-y-4">
                  <a
                    href={previewUrl}
                    download="long-screenshot.png"
                    className="flex items-center justify-center gap-2 w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700"
                  >
                    <Download className="h-4 w-4" />
                    <span>{ui.downloadLongImage}</span>
                  </a>

                  {/* Scrollable Preview Container */}
                  <div className="max-h-[600px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-100 p-2 shadow-inner">
                    <img
                      src={previewUrl}
                      alt="Long screenshot preview"
                      className="mx-auto max-w-full rounded-lg shadow-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400">
                  <Sparkles className="h-10 w-10 stroke-1" />
                  <p className="mt-3 text-xs">{ui.previewEmptyHint}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
