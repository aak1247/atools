"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { decodeQrImage, type QrDecodeResult } from "../../../lib/qr-decoder";

const MAX_PREVIEW_SIZE = 1200;

const DEFAULT_UI = {
  errCanvasContext: "无法创建画布上下文",
  errNoQr: "未识别到二维码",
  errSelectImage: "请选择图片文件",
  dropTitle: "点击或拖拽二维码图片到此处",
  dropSubtitle: "支持高密度/模糊/低分辨率/普通二维码图片",
  currentImage: "当前图片：",
  replaceImage: "替换图片",
  clear: "清空",
  dropReplaceHint: "支持拖拽新图片到此区域直接替换",
  preview: "预览",
  previewHint: "提示：识别结果的定位框会以绿色描边显示。",
  resultTitle: "解析结果",
  copy: "复制",
  copied: "已复制",
  resultPlaceholder: "识别后会显示二维码内容…",
  errorPrefix: "错误：",
  note: "说明：纯本地离线解析，支持多尺度与自适应二值化图像增强，不上传任何图片。",
  openLink: "访问链接",
  decoding: "正在解析...",
  statusSuccess: "解析成功",
  statusEnhancedSuccess: "通过算法增强解析成功",
} as const;

type QrDecoderUi = typeof DEFAULT_UI;

export default function QrDecoderClient() {
  return (
    <ToolPageLayout toolSlug="qr-decoder" maxWidthClassName="max-w-5xl">
      <QrDecoderInner />
    </ToolPageLayout>
  );
}

function QrDecoderInner() {
  const config = useOptionalToolConfig("qr-decoder");
  const ui: QrDecoderUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<QrDecoderUi>) };

  const [file, setFile] = useState<File | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QrDecodeResult | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawPreview = (img: ImageBitmap, box?: QrDecodeResult | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scale = Math.min(1, MAX_PREVIEW_SIZE / Math.max(img.width, img.height));
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

      // Draw subtle corner accents
      ctx.fillStyle = "#22c55e";
      const corners = [
        location.topLeftCorner,
        location.topRightCorner,
        location.bottomRightCorner,
        location.bottomLeftCorner,
      ];
      for (const pt of corners) {
        ctx.beginPath();
        ctx.arc(pt.x * factorX, pt.y * factorY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  const processFile = async (selected: File) => {
    if (!selected.type.startsWith("image/")) {
      setError(ui.errSelectImage);
      return;
    }
    setError(null);
    setResult(null);
    setFile(selected);
    try {
      const next = await createImageBitmap(selected);
      setBitmap((prev) => {
        if (prev) prev.close();
        return next;
      });
    } catch {
      // Fallback for browsers or formats where createImageBitmap might fail
      const img = new Image();
      img.src = URL.createObjectURL(selected);
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const next = await createImageBitmap(canvas);
      setBitmap((prev) => {
        if (prev) prev.close();
        return next;
      });
    }
  };

  useEffect(() => {
    if (!bitmap) return;
    let cancelled = false;
    const run = async () => {
      setIsDecoding(true);
      drawPreview(bitmap, null);
      try {
        const res = await decodeQrImage(bitmap, { inversionAttempts: "attemptBoth" });
        if (cancelled) return;
        setResult(res);
        drawPreview(bitmap, res);
      } catch (err) {
        if (cancelled) return;
        const fallbackRes: QrDecodeResult = {
          ok: false,
          error: err instanceof Error ? err.message : ui.errNoQr,
        };
        setResult(fallbackRes);
        drawPreview(bitmap, fallbackRes);
      } finally {
        if (!cancelled) setIsDecoding(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap]);

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

  const openFilePicker = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const resetWorkspace = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setBitmap((prev) => {
      if (prev) prev.close();
      return null;
    });
  };

  const canCopy = useMemo(() => result?.ok === true && result.data.trim().length > 0, [result]);

  const isUrl = useMemo(() => {
    if (!result?.ok || !result.data) return false;
    try {
      const u = new URL(result.data.trim());
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, [result]);

  const isEnhanced = useMemo(() => {
    return Boolean(result?.ok && result.pipeline && result.pipeline.startsWith("enhanced"));
  }, [result]);

  const copy = async () => {
    if (!result || !result.ok) return;
    await navigator.clipboard.writeText(result.data);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
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
            onClick={openFilePicker}
          >
            <div className="text-sm font-medium text-slate-700">{ui.dropTitle}</div>
            <div className="mt-1 text-xs text-slate-500">{ui.dropSubtitle}</div>
          </div>
        ) : (
          <div className="space-y-6">
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed p-4 transition ${
                isDragging
                  ? "border-blue-400 bg-blue-50/50"
                  : "border-slate-200 bg-slate-50/80"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{ui.currentImage}</span>
                {file.name}
                {bitmap && (
                  <span className="ml-2 text-xs text-slate-500">
                    {bitmap.width} × {bitmap.height}
                  </span>
                )}
                {isDecoding && (
                  <span className="ml-3 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600">
                    <span className="inline-block h-2 w-2 animate-ping rounded-full bg-blue-500" />
                    {ui.decoding}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openFilePicker}
                  className="rounded-xl bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
                >
                  {ui.replaceImage}
                </button>
                <button
                  type="button"
                  onClick={resetWorkspace}
                  className="rounded-xl bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
                >
                  {ui.clear}
                </button>
              </div>
              <div className="w-full text-[11px] text-slate-500">{ui.dropReplaceHint}</div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{ui.preview}</div>
                <div className="mt-4 overflow-auto rounded-2xl bg-slate-50 p-4">
                  <canvas ref={canvasRef} className="block rounded-xl shadow-sm" />
                </div>
                <div className="mt-3 text-xs text-slate-500">{ui.previewHint}</div>
              </div>

              <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">{ui.resultTitle}</div>
                    <div className="flex items-center gap-2">
                      {isUrl && (
                        <a
                          href={result?.ok ? result.data.trim() : "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-100"
                        >
                          {ui.openLink}
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={!canCopy}
                        onClick={copy}
                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                      >
                        {copied ? ui.copied : ui.copy}
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={result?.ok ? result.data : ""}
                    readOnly
                    placeholder={ui.resultPlaceholder}
                    className="mt-3 h-48 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                  />

                  {result && result.ok && (
                    <div className="mt-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                          isEnhanced
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isEnhanced ? "bg-emerald-500" : "bg-slate-500"
                          }`}
                        />
                        {isEnhanced ? ui.statusEnhancedSuccess : ui.statusSuccess}
                      </span>
                    </div>
                  )}

                  {result && !result.ok && (
                    <div className="mt-3 text-sm text-rose-600">
                      {ui.errorPrefix}
                      {result.error}
                    </div>
                  )}
                </div>

                <div className="mt-4 text-xs text-slate-500 border-t border-slate-100 pt-3">{ui.note}</div>
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
