"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";

type Level = "L" | "M" | "Q" | "H";

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(value)));

export default function QrGeneratorClient() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";
  const ui =
    locale === "en-us"
      ? {
          content: "Content",
          placeholder: "Enter text or a link to encode...",
          size: "Size (px)",
          margin: "Margin",
          level: "Error correction",
          levelL: "L (7%)",
          levelM: "M (15%)",
          levelQ: "Q (25%)",
          levelH: "H (30%)",
          fg: "Foreground",
          bg: "Background",
          download: "Download PNG",
          clear: "Clear",
          preview: "Preview",
          hint: "Tip: QR codes are generated locally in your browser. No content is uploaded.",
          errorPrefix: "Error:",
          genFailed: "Failed to generate QR code",
        }
      : {
          content: "内容",
          placeholder: "输入要生成二维码的文本或链接…",
          size: "尺寸（px）",
          margin: "留白（margin）",
          level: "容错等级",
          levelL: "L（7%）",
          levelM: "M（15%）",
          levelQ: "Q（25%）",
          levelH: "H（30%）",
          fg: "前景色",
          bg: "背景色",
          download: "下载 PNG",
          clear: "清空",
          preview: "预览",
          hint: "提示：二维码在浏览器本地生成，不上传任何内容。",
          errorPrefix: "错误：",
          genFailed: "生成失败",
        };

  const [text, setText] = useState("https://example.com");
  const [size, setSize] = useState(320);
  const [margin, setMargin] = useState(2);
  const [level, setLevel] = useState<Level>("M");
  const [dark, setDark] = useState("#0f172a");
  const [light, setLight] = useState("#ffffff");
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const options = useMemo(
    () => ({
      errorCorrectionLevel: level,
      margin: clampInt(margin, 0, 16),
      width: clampInt(size, 128, 1024),
      color: {
        dark,
        light,
      },
    }),
    [dark, level, light, margin, size],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setError(null);
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (!text.trim()) {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      try {
        await QRCode.toCanvas(canvas, text, options);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : ui.genFailed);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [locale, options, text]);

  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png", 1),
    );
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qrcode.png";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ToolPageLayout toolSlug="qr-generator" maxWidthClassName="max-w-5xl">
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
            <div className="text-sm font-semibold text-slate-900">{ui.content}</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={ui.placeholder}
              className="mt-2 h-40 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <div className="text-xs text-slate-500">{ui.size}</div>
                <input
                  type="number"
                  min={128}
                  max={1024}
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <label className="block">
                <div className="text-xs text-slate-500">{ui.margin}</div>
                <input
                  type="number"
                  min={0}
                  max={16}
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <label className="block">
                <div className="text-xs text-slate-500">{ui.level}</div>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as Level)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="L">{ui.levelL}</option>
                  <option value="M">{ui.levelM}</option>
                  <option value="Q">{ui.levelQ}</option>
                  <option value="H">{ui.levelH}</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-xs text-slate-500">{ui.fg}</div>
                  <input
                    type="color"
                    value={dark}
                    onChange={(e) => setDark(e.target.value)}
                    className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                  />
                </label>
                <label className="block">
                  <div className="text-xs text-slate-500">{ui.bg}</div>
                  <input
                    type="color"
                    value={light}
                    onChange={(e) => setLight(e.target.value)}
                    className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={download}
                className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-[0.99]"
              >
                {ui.download}
              </button>
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setError(null);
                }}
                className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.99]"
              >
                {ui.clear}
              </button>
            </div>

            {error && (
              <div className="mt-3 text-sm text-rose-600">
                {ui.errorPrefix}
                {error}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <div className="text-sm font-semibold text-slate-900">{ui.preview}</div>
            <div className="mt-4 flex items-center justify-center rounded-2xl bg-slate-50 p-6">
              <canvas ref={canvasRef} className="h-auto w-full max-w-[320px]" />
            </div>
            <div className="mt-3 text-xs text-slate-500">{ui.hint}</div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
