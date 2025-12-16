"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";

type InversionAttempts = "attemptBoth" | "dontInvert" | "onlyInvert" | "invertFirst";

type DecodeResult =
  | { ok: false; error: string }
  | {
      ok: true;
      data: string;
      location: {
        topLeftCorner: { x: number; y: number };
        topRightCorner: { x: number; y: number };
        bottomRightCorner: { x: number; y: number };
        bottomLeftCorner: { x: number; y: number };
      };
    };

const MAX_DECODE_SIZE = 1200;

export default function QrDecoderClient() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";
  const ui =
    locale === "en-us"
      ? {
          errCanvasContext: "Unable to create canvas context",
          errNoQr: "No QR code detected",
          errSelectImage: "Please select an image file",
          dropTitle: "Click or drop a QR image here",
          dropSubtitle: "Supports JPG/PNG/WebP, etc.",
          currentImage: "Current image:",
          inversion: "Inversion attempts",
          inversionRecommended: "attemptBoth (recommended)",
          chooseAgain: "Choose again",
          preview: "Preview",
          previewHint: "Tip: The detected location box is highlighted in green.",
          resultTitle: "Decoded content",
          copy: "Copy",
          resultPlaceholder: "Decoded QR content will appear here...",
          errorPrefix: "Error:",
          note: "Note: Decoding runs locally in your browser. No images are uploaded.",
        }
      : {
          errCanvasContext: "无法创建画布上下文",
          errNoQr: "未识别到二维码",
          errSelectImage: "请选择图片文件",
          dropTitle: "点击或拖拽二维码图片到此处",
          dropSubtitle: "支持 JPG/PNG/WebP 等",
          currentImage: "当前图片：",
          inversion: "反色尝试",
          inversionRecommended: "attemptBoth（推荐）",
          chooseAgain: "重新选择",
          preview: "预览",
          previewHint: "提示：识别结果的定位框会以绿色描边显示。",
          resultTitle: "解析结果",
          copy: "复制",
          resultPlaceholder: "识别后会显示二维码内容…",
          errorPrefix: "错误：",
          note: "说明：解析在浏览器本地完成，不上传任何图片。",
        };

  const [file, setFile] = useState<File | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [inversion, setInversion] = useState<InversionAttempts>("attemptBoth");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawPreview = (img: ImageBitmap, box?: DecodeResult) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scale = Math.min(1, MAX_DECODE_SIZE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    if (box && box.ok) {
      const factorX = width / img.width;
      const factorY = height / img.height;
      const { location } = box;
      ctx.save();
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(location.topLeftCorner.x * factorX, location.topLeftCorner.y * factorY);
      ctx.lineTo(location.topRightCorner.x * factorX, location.topRightCorner.y * factorY);
      ctx.lineTo(location.bottomRightCorner.x * factorX, location.bottomRightCorner.y * factorY);
      ctx.lineTo(location.bottomLeftCorner.x * factorX, location.bottomLeftCorner.y * factorY);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  };

  const decode = async (img: ImageBitmap) => {
    const scale = Math.min(1, MAX_DECODE_SIZE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false as const, error: ui.errCanvasContext };
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const qr = jsQR(imageData.data, width, height, { inversionAttempts: inversion });
    if (!qr) return { ok: false as const, error: ui.errNoQr };
    return { ok: true as const, data: qr.data, location: qr.location };
  };

  const processFile = async (selected: File) => {
    if (!selected.type.startsWith("image/")) {
      setError(ui.errSelectImage);
      return;
    }
    setError(null);
    setResult(null);
    setFile(selected);
    const next = await createImageBitmap(selected);
    setBitmap((prev) => {
      if (prev) prev.close();
      return next;
    });
  };

  useEffect(() => {
    if (!bitmap) return;
    let cancelled = false;
    const run = async () => {
      const res = await decode(bitmap);
      if (cancelled) return;
      setResult(res);
      drawPreview(bitmap, res);
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap, inversion, locale]);

  useEffect(() => {
    return () => {
      if (bitmap) bitmap.close();
    };
  }, [bitmap]);

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

  const canCopy = useMemo(() => result?.ok === true && result.data.trim().length > 0, [result]);

  const copy = async () => {
    if (!result || !result.ok) return;
    await navigator.clipboard.writeText(result.data);
  };

  return (
    <ToolPageLayout toolSlug="qr-decoder" maxWidthClassName="max-w-5xl">
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
                <span className="font-semibold text-slate-900">{ui.currentImage}</span>
                {file.name}
                {bitmap && (
                  <span className="ml-2 text-xs text-slate-500">
                    {bitmap.width} × {bitmap.height}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  {ui.inversion}
                  <select
                    value={inversion}
                    onChange={(e) => setInversion(e.target.value as InversionAttempts)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value="attemptBoth">{ui.inversionRecommended}</option>
                    <option value="dontInvert">dontInvert</option>
                    <option value="onlyInvert">onlyInvert</option>
                    <option value="invertFirst">invertFirst</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setResult(null);
                    setError(null);
                    setBitmap((prev) => {
                      if (prev) prev.close();
                      return null;
                    });
                  }}
                  className="rounded-xl bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
                >
                  {ui.chooseAgain}
                </button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{ui.preview}</div>
                <div className="mt-4 overflow-auto rounded-2xl bg-slate-50 p-4">
                  <canvas ref={canvasRef} className="block rounded-xl shadow-sm" />
                </div>
                <div className="mt-3 text-xs text-slate-500">{ui.previewHint}</div>
              </div>

              <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">{ui.resultTitle}</div>
                  <button
                    type="button"
                    disabled={!canCopy}
                    onClick={copy}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    {ui.copy}
                  </button>
                </div>

                <textarea
                  value={result?.ok ? result.data : ""}
                  readOnly
                  placeholder={ui.resultPlaceholder}
                  className="mt-3 h-48 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                />

                {result && !result.ok && (
                  <div className="mt-3 text-sm text-rose-600">
                    {ui.errorPrefix}
                    {result.error}
                  </div>
                )}

                <div className="mt-4 text-xs text-slate-500">{ui.note}</div>
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
    </ToolPageLayout>
  );
}
