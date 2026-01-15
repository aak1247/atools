"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { getRealCUGANBaseURL } from "../../../lib/r2-assets";

type UpscaleMode = "realcugan" | "resize";
type DenoisePreset = "no-denoise" | "denoise3x" | "conservative";

type Ui = {
  hint: string;
  pick: string;
  clear: string;
  mode: string;
  modeRealCugan: string;
  modeResize: string;
  scale: string;
  denoise: string;
  denoiseNo: string;
  denoiseStrong: string;
  denoiseConservative: string;
  process: string;
  processing: string;
  download: string;
  notReadyTitle: string;
  notReadyDesc: string;
  crossOriginIsolatedTitle: string;
  crossOriginIsolatedDesc: string;
  unsupportedTitle: string;
  unsupportedDesc: string;
  original: string;
  output: string;
  fileInfo: string;
  outputInfo: string;
  progress: string;
  eta: string;
  seconds: string;
  error: string;
  empty: string;
  noteTitle: string;
  noteBody: string;
  libCredit: string;
};

const DEFAULT_UI: Ui = {
  hint: "图片超分辨率提升：优先使用 RealCUGAN（WebAssembly，本地 CPU 运行），不上传图片；若环境不支持则使用高质量缩放作为兼容方案。",
  pick: "选择图片",
  clear: "清空",
  mode: "模式",
  modeRealCugan: "RealCUGAN（AI超分）",
  modeResize: "高质量缩放（兼容）",
  scale: "放大倍数",
  denoise: "降噪/修复",
  denoiseNo: "无降噪",
  denoiseStrong: "强降噪（denoise3x）",
  denoiseConservative: "保守修复（conservative）",
  process: "开始处理",
  processing: "处理中…",
  download: "下载结果",
  notReadyTitle: "资源未就绪",
  notReadyDesc: "模型与运行时仍在加载，请稍后再试。",
  crossOriginIsolatedTitle: "需要跨域隔离（COOP/COEP）",
  crossOriginIsolatedDesc: "RealCUGAN（threads）依赖 SharedArrayBuffer。请在支持 Cross-Origin Isolation 的环境中打开（配置 COOP/COEP 响应头）。否则请切换到“高质量缩放”。",
  unsupportedTitle: "当前环境不支持",
  unsupportedDesc: "请使用最新版 Chrome/Firefox；若无法启用跨域隔离，请切换到“高质量缩放”。",
  original: "原图",
  output: "输出",
  fileInfo: "文件：{name}（{w}×{h}）",
  outputInfo: "输出：{w}×{h}",
  progress: "进度",
  eta: "预计剩余",
  seconds: "{n} 秒",
  error: "错误：{msg}",
  empty: "尚未生成输出",
  noteTitle: "提示",
  noteBody: "AI 超分计算耗时与内存占用较高；建议使用 PC 端最新版浏览器。输出为本地生成，不上传。",
  libCredit: "AI 引擎：RealCUGAN-ncnn-webassembly（MIT）",
};

type RealCuganProgressEvent = { eventType: "PROC_PROGRESS"; progress_rate: number; remaining_time: number };
type RealCuganEndEvent = { eventType: "PROC_END"; cost: number };
type RealCuganEvent = RealCuganProgressEvent | RealCuganEndEvent | { eventType: string };

const isRealCuganProgressEvent = (evt: RealCuganEvent): evt is RealCuganProgressEvent => {
  if (evt.eventType !== "PROC_PROGRESS") return false;
  const rec = evt as Record<string, unknown>;
  return typeof rec.progress_rate === "number" && typeof rec.remaining_time === "number";
};

const isRealCuganEndEvent = (evt: RealCuganEvent): evt is RealCuganEndEvent => evt.eventType === "PROC_END";

type RealCuganModule = {
  HEAPU8: Uint8Array;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  _process_image: (tileSize: number, srcPtr: number, dstPtr: number, w: number, h: number, scale: number, denoise: number) => number;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  locateFile?: (path: string, prefix: string) => string;
  onRuntimeInitialized?: () => void;
};

type GlobalRealCugan = {
  promise?: Promise<RealCuganModule>;
  module?: RealCuganModule;
  onEvent?: (evt: RealCuganEvent) => void;
};

// 动态获取 RealCUGAN 基础 URL（支持本地和 R2）
const REALCUGAN_BASE = getRealCUGANBaseURL();
const REALCUGAN_JS = "realcugan-ncnn-webassembly-simd-threads.js";

const getGlobalRealCugan = (): GlobalRealCugan => {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.__ATOOLS_REALCUGAN) g.__ATOOLS_REALCUGAN = {};
  return g.__ATOOLS_REALCUGAN as GlobalRealCugan;
};

const hasThreadsSupport = () => typeof SharedArrayBuffer !== "undefined" && globalThis.crossOriginIsolated === true;

const getEmscriptenModule = (): unknown => (globalThis as unknown as { Module?: unknown }).Module;
const setEmscriptenModule = (value: unknown) => {
  (globalThis as unknown as { Module?: unknown }).Module = value;
};

const isRealCuganModule = (value: unknown): value is RealCuganModule => {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<RealCuganModule>;
  return typeof m._process_image === "function" && typeof m._malloc === "function" && typeof m._free === "function" && m.HEAPU8 instanceof Uint8Array;
};

const loadRealCugan = async (): Promise<RealCuganModule> => {
  const g = getGlobalRealCugan();
  if (g.module) return g.module;
  if (g.promise) return g.promise;

  g.promise = new Promise<RealCuganModule>((resolve, reject) => {
    try {
      const existing = getEmscriptenModule();
      if (isRealCuganModule(existing)) {
        g.module = existing;
        resolve(existing);
        return;
      }

      const moduleConfig: Partial<RealCuganModule> = {
        locateFile: (path: string) => `${REALCUGAN_BASE}${path}`,
        print: (text: string) => {
          if (typeof text !== "string") return;
          if (text.startsWith("$CALLBACK$")) {
            const raw = text.slice("$CALLBACK$".length);
            try {
              const evt = JSON.parse(raw) as RealCuganEvent;
              getGlobalRealCugan().onEvent?.(evt);
            } catch {
              // ignore
            }
          }
        },
        printErr: (text: string) => {
          reject(new Error(typeof text === "string" ? text : "RealCUGAN runtime error"));
        },
      };

      setEmscriptenModule(moduleConfig);

      const script = document.createElement("script");
      script.async = true;
      script.src = `${REALCUGAN_BASE}${REALCUGAN_JS}`;
      script.onload = () => {
        const loaded = getEmscriptenModule();
        if (!loaded || typeof loaded !== "object") {
          reject(new Error("RealCUGAN module missing"));
          return;
        }
        (loaded as Partial<RealCuganModule>).onRuntimeInitialized = () => {
          const ready = getEmscriptenModule();
          if (!isRealCuganModule(ready)) {
            reject(new Error("RealCUGAN module not initialized"));
            return;
          }
          g.module = ready;
          resolve(ready);
        };
      };
      script.onerror = () => reject(new Error("Failed to load RealCUGAN script"));
      document.head.appendChild(script);
    } catch (e) {
      reject(e instanceof Error ? e : new Error("Failed to init RealCUGAN"));
    }
  });

  return g.promise;
};

const denoiseToCode = (scale: number, preset: DenoisePreset) => {
  if (scale === 3) return 3; // only denoise3x on this build
  if (preset === "no-denoise") return 0;
  if (preset === "conservative") return 4;
  return 3;
};

async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image load failed"));
      el.src = blobUrl;
    });
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export default function ImageUpscalerClient() {
  return (
    <ToolPageLayout toolSlug="image-upscaler" maxWidthClassName="max-w-6xl">
      {({ config }) => <Inner ui={{ ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) }} />}
    </ToolPageLayout>
  );
}

function Inner({ ui }: { ui: Ui }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const outCanvasRef = useRef<HTMLCanvasElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [origUrl, setOrigUrl] = useState<string | null>(null);
  const [origSize, setOrigSize] = useState<{ w: number; h: number } | null>(null);

  const [mode, setMode] = useState<UpscaleMode>("realcugan");
  const [scale, setScale] = useState<number>(2);
  const [denoisePreset, setDenoisePreset] = useState<DenoisePreset>("denoise3x");

  const [loadingRuntime, setLoadingRuntime] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("upscaled.png");
  const [outSize, setOutSize] = useState<{ w: number; h: number } | null>(null);

  const ptrRef = useRef<{ srcPtr: number; dstPtr: number; outLen: number; w: number; h: number; scale: number } | null>(null);

  useEffect(() => {
    return () => {
      if (origUrl) URL.revokeObjectURL(origUrl);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl, origUrl]);

  const support = useMemo(() => {
    if (!hasThreadsSupport()) {
      return { ok: false, reason: ui.crossOriginIsolatedDesc };
    }
    if (typeof WebAssembly === "undefined") {
      return { ok: false, reason: ui.unsupportedDesc };
    }
    return { ok: true, reason: "" };
  }, [ui.crossOriginIsolatedDesc, ui.unsupportedDesc]);

  useEffect(() => {
    if (mode !== "realcugan") return;
    if (!support.ok) return;
    setLoadingRuntime(true);
    const g = getGlobalRealCugan();
    g.onEvent = (evt) => {
      if (isRealCuganProgressEvent(evt)) {
        const pct = Math.max(0, Math.min(100, Math.round(evt.progress_rate * 100)));
        setProgressPct(pct);
        const eta = Math.max(0, Math.round(evt.remaining_time / 1000));
        setEtaSeconds(eta);
        return;
      }
      if (isRealCuganEndEvent(evt)) {
        void finalizeRealCuganResult();
      }
    };
    loadRealCugan()
      .catch((e) => setError(e instanceof Error ? e.message : "RealCUGAN load failed"))
      .finally(() => setLoadingRuntime(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, support.ok]);

  const pick = async (f: File) => {
    setError(null);
    setProgressPct(null);
    setEtaSeconds(null);
    setOutSize(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setDownloadName("upscaled.png");

    if (origUrl) URL.revokeObjectURL(origUrl);
    const url = URL.createObjectURL(f);
    setOrigUrl(url);
    setFile(f);
    setOrigSize(null);

    try {
      const bmp = await fileToImageBitmap(f);
      setOrigSize({ w: bmp.width, h: bmp.height });
      bmp.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read image");
    }
  };

  const clear = () => {
    setError(null);
    setProgressPct(null);
    setEtaSeconds(null);
    setOutSize(null);
    setFile(null);
    setOrigSize(null);
    if (origUrl) URL.revokeObjectURL(origUrl);
    setOrigUrl(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setDownloadName("upscaled.png");
    if (inputRef.current) inputRef.current.value = "";
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void pick(f);
  };

  const process = async () => {
    if (!file) return;
    setError(null);
    setProgressPct(null);
    setEtaSeconds(null);

    if (mode === "realcugan") {
      if (!support.ok) {
        setError(support.reason);
        return;
      }
      if (loadingRuntime) {
        setError(ui.notReadyDesc);
        return;
      }
      await runRealCugan();
      return;
    }

    await runResize();
  };

  const runResize = async () => {
    if (!file) return;
    setIsWorking(true);
    try {
      const bmp = await fileToImageBitmap(file);
      const outW = bmp.width * scale;
      const outH = bmp.height * scale;
      setOutSize({ w: outW, h: outH });

      const canvas = outCanvasRef.current ?? document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, outW, outH);
      bmp.close();

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png", 1);
      });
      const url = URL.createObjectURL(blob);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(url);
      setDownloadName(`${file.name.replace(/\.[^.]+$/u, "") || "image"}-x${scale}.png`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resize failed");
    } finally {
      setIsWorking(false);
    }
  };

  const runRealCugan = async () => {
    if (!file) return;
    setIsWorking(true);
    setProgressPct(0);
    setEtaSeconds(null);

    try {
      const wasm = await loadRealCugan();

      const bmp = await fileToImageBitmap(file);
      const w = bmp.width;
      const h = bmp.height;
      const inCanvas = document.createElement("canvas");
      inCanvas.width = w;
      inCanvas.height = h;
      const inCtx = inCanvas.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);
      if (!inCtx) throw new Error("Canvas unavailable");
      inCtx.drawImage(bmp, 0, 0, w, h);
      bmp.close();

      const input = inCtx.getImageData(0, 0, w, h);
      const outW = w * scale;
      const outH = h * scale;
      const outLen = outW * outH * 4;
      setOutSize({ w: outW, h: outH });

      const srcPtr = wasm._malloc(input.data.length);
      wasm.HEAPU8.set(input.data, srcPtr);
      const dstPtr = wasm._malloc(outLen);
      ptrRef.current = { srcPtr, dstPtr, outLen, w, h, scale };

      const denoise = denoiseToCode(scale, denoisePreset);
      const ret = wasm._process_image(0, srcPtr, dstPtr, w, h, scale, denoise);
      if (ret !== 0) throw new Error("Process is busy, please retry.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Process failed");
      setIsWorking(false);
      setProgressPct(null);
      ptrRef.current = null;
    }
  };

  const finalizeRealCuganResult = async () => {
    try {
      const wasm = await loadRealCugan();
      const ptr = ptrRef.current;
      if (!ptr) return;

      const outW = ptr.w * ptr.scale;
      const outH = ptr.h * ptr.scale;
      const canvas = outCanvasRef.current ?? document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);
      if (!ctx) throw new Error("Canvas unavailable");

      const imageData = ctx.createImageData(outW, outH);
      const view = wasm.HEAPU8.subarray(ptr.dstPtr, ptr.dstPtr + ptr.outLen);
      imageData.data.set(view);
      ctx.putImageData(imageData, 0, 0);

      wasm._free(ptr.srcPtr);
      wasm._free(ptr.dstPtr);
      ptrRef.current = null;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png", 1);
      });
      const url = URL.createObjectURL(blob);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(url);
      setDownloadName(`${file?.name.replace(/\.[^.]+$/u, "") || "image"}-realcugan-x${scale}.png`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Finalize failed");
    } finally {
      setIsWorking(false);
      setProgressPct(null);
      setEtaSeconds(null);
    }
  };

  const denoiseOptions = useMemo(() => {
    if (scale === 3) return [{ value: "denoise3x" as const, label: ui.denoiseStrong }];
    return [
      { value: "no-denoise" as const, label: ui.denoiseNo },
      { value: "denoise3x" as const, label: ui.denoiseStrong },
      { value: "conservative" as const, label: ui.denoiseConservative },
    ];
  }, [scale, ui.denoiseConservative, ui.denoiseNo, ui.denoiseStrong]);

  useEffect(() => {
    if (scale === 3 && denoisePreset !== "denoise3x") setDenoisePreset("denoise3x");
  }, [denoisePreset, scale]);

  const fileInfo = useMemo(() => {
    if (!file || !origSize) return null;
    return ui.fileInfo.replace("{name}", file.name).replace("{w}", String(origSize.w)).replace("{h}", String(origSize.h));
  }, [file, origSize, ui.fileInfo]);

  const outputInfo = useMemo(() => {
    if (!outSize) return null;
    return ui.outputInfo.replace("{w}", String(outSize.w)).replace("{h}", String(outSize.h));
  }, [outSize, ui.outputInfo]);

  const progressText = useMemo(() => {
    if (progressPct === null) return null;
    const eta = etaSeconds !== null ? ui.seconds.replace("{n}", String(etaSeconds)) : "-";
    return `${ui.progress}: ${progressPct}% · ${ui.eta}: ${eta}`;
  }, [etaSeconds, progressPct, ui.eta, ui.progress, ui.seconds]);

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.hint}</div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                {ui.pick}
              </button>
              <button
                type="button"
                onClick={clear}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                {ui.clear}
              </button>
            </div>

            {fileInfo ? <div className="mt-3 text-xs text-slate-600">{fileInfo}</div> : null}

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs text-slate-600">
                {ui.mode}
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as UpscaleMode)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                >
                  <option value="realcugan">{ui.modeRealCugan}</option>
                  <option value="resize">{ui.modeResize}</option>
                </select>
              </label>

              {mode === "realcugan" && !support.ok ? (
                <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-200">
                  <div className="font-semibold">{ui.crossOriginIsolatedTitle}</div>
                  <div className="mt-1">{ui.crossOriginIsolatedDesc}</div>
                </div>
              ) : null}

              <div className="grid gap-2 md:grid-cols-2">
                <label className="grid gap-1 text-xs text-slate-600">
                  {ui.scale}
                  <select
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                  >
                    <option value={2}>2×</option>
                    <option value={3}>3×</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  {ui.denoise}
                  <select
                    value={denoisePreset}
                    onChange={(e) => setDenoisePreset(e.target.value as DenoisePreset)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                  >
                    {denoiseOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void process()}
                  disabled={!file || isWorking}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isWorking ? ui.processing : ui.process}
                </button>

                <a
                  href={downloadUrl ?? undefined}
                  download={downloadName}
                  className={`rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 ${
                    downloadUrl ? "" : "pointer-events-none opacity-60"
                  }`}
                >
                  {ui.download}
                </a>
              </div>

              {progressText ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-700 ring-1 ring-slate-200">{progressText}</div>
              ) : null}

              {outputInfo ? <div className="text-xs text-slate-600">{outputInfo}</div> : null}
              {error ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-800 ring-1 ring-rose-200">{ui.error.replace("{msg}", error)}</div> : null}

              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-700 ring-1 ring-slate-200">
                <div className="font-semibold">{ui.noteTitle}</div>
                <div className="mt-1">{ui.noteBody}</div>
                <div className="mt-2 text-[11px] text-slate-500">{ui.libCredit}</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">{ui.original}</div>
                <div className="relative mt-3 aspect-square overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                  {origUrl ? (
                    <NextImage
                      src={origUrl}
                      alt={ui.original}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-contain"
                      unoptimized
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-slate-400">-</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">{ui.output}</div>
                <div className="relative mt-3 aspect-square overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                  {downloadUrl ? (
                    <NextImage
                      src={downloadUrl}
                      alt={ui.output}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-contain"
                      unoptimized
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-slate-400">{ui.empty}</div>
                  )}
                </div>
              </div>
            </div>

            <canvas ref={outCanvasRef} className="hidden" />
          </div>
        </div>
      </div>
    </div>
  );
}
