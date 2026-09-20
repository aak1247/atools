"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { getRealCUGANBaseURL } from "../../../lib/r2-assets";
import {
  checkWebGPUSupport,
  upscaleImageWebGPU,
  type WebGPUScaleFactor,
  type WebGPUStylePreset,
} from "../../../lib/webgpu-upscaler";

type UpscaleMode = "webgpu" | "realcugan" | "resize";
type DenoisePreset = "no-denoise" | "denoise3x" | "conservative";

type Ui = {
  hint: string;
  pick: string;
  replace: string;
  clear: string;
  dropReplaceHint: string;
  mode: string;
  modeWebGPU: string;
  modeRealCugan: string;
  modeResize: string;
  scale: string;
  preset: string;
  presetAnime: string;
  presetBalanced: string;
  presetSharp: string;
  gpuDetected: string;
  gpuUnsupported: string;
  denoise: string;
  denoiseNo: string;
  denoiseStrong: string;
  denoiseConservative: string;
  process: string;
  processing: string;
  modelLoading: string;
  modelReady: string;
  modelLoadingHint: string;
  modelLoadFailed: string;
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
  hint: "图片超分辨率提升：默认使用纯 WebGPU Shader 硬件加速（毫秒级极速放大，无额外模型下载，零上传）；亦支持 RealCUGAN 深度 AI 模型与兼容模式。",
  pick: "选择图片",
  replace: "点击替换图片",
  clear: "清空",
  dropReplaceHint: "支持拖拽新图片到此区域直接替换",
  mode: "引擎模式",
  modeWebGPU: "WebGPU 极速超分（推荐·毫秒级）",
  modeRealCugan: "RealCUGAN（AI深度超分）",
  modeResize: "高质量缩放（兼容兜底）",
  scale: "放大倍数",
  preset: "优化风格",
  presetAnime: "动漫/插画（强化轮廓与线条）",
  presetBalanced: "通用高清（自适应平滑）",
  presetSharp: "细节锐化（边缘强化）",
  gpuDetected: "已启用本地 GPU 硬件加速：{adapter}",
  gpuUnsupported: "当前浏览器暂未启用 WebGPU，已自动为您切至备用模式。",
  denoise: "降噪/修复",
  denoiseNo: "无降噪",
  denoiseStrong: "强降噪（denoise3x）",
  denoiseConservative: "保守修复（conservative）",
  process: "开始处理",
  processing: "处理中…",
  modelLoading: "模型加载中…",
  modelReady: "AI 模型已就绪",
  modelLoadingHint: "正在加载 RealCUGAN 模型权重与运行时 (约 12MB)，首次加载需数秒…",
  modelLoadFailed: "模型加载失败",
  download: "下载结果",
  notReadyTitle: "资源未就绪",
  notReadyDesc: "模型与运行时仍在加载，请稍后再试。",
  crossOriginIsolatedTitle: "需要跨域隔离（COOP/COEP）",
  crossOriginIsolatedDesc: "RealCUGAN（threads）依赖 SharedArrayBuffer。请在支持 Cross-Origin Isolation 的环境中打开（配置 COOP/COEP 响应头）。否则请切换到“WebGPU 极速超分”或“高质量缩放”。",
  unsupportedTitle: "当前环境不支持",
  unsupportedDesc: "请使用最新版 Chrome/Firefox；若无法启用跨域隔离，请切换到“WebGPU 极速超分”或“高质量缩放”。",
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
  noteBody: "推荐使用 WebGPU 极速超分：无需下载庞大模型，利用本机显卡并行渲染，秒出结果；全程纯本地浏览器运算，不上传任何数据。",
  libCredit: "计算引擎：WebGPU WGSL Shader + RealCUGAN-ncnn-webassembly",
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

      let hasResolved = false;
      const onReady = () => {
        if (hasResolved) return;
        const ready = getEmscriptenModule();
        if (!isRealCuganModule(ready)) {
          g.promise = undefined;
          reject(new Error("RealCUGAN module not initialized"));
          return;
        }
        hasResolved = true;
        g.module = ready;
        resolve(ready);
      };

      const moduleConfig: Partial<RealCuganModule> = {
        locateFile: (path: string) => `${REALCUGAN_BASE}${path}`,
        onRuntimeInitialized: onReady,
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
          console.warn("[RealCUGAN]", text);
        },
      };

      setEmscriptenModule(moduleConfig);

      const script = document.createElement("script");
      script.async = true;
      script.src = `${REALCUGAN_BASE}${REALCUGAN_JS}`;
      script.onload = () => {
        const loaded = getEmscriptenModule();
        if (!loaded || typeof loaded !== "object") {
          g.promise = undefined;
          reject(new Error("RealCUGAN module missing"));
          return;
        }
        if (isRealCuganModule(loaded)) {
          onReady();
        } else {
          (loaded as Partial<RealCuganModule>).onRuntimeInitialized = onReady;
        }
      };
      script.onerror = () => {
        g.promise = undefined;
        reject(new Error("Failed to load RealCUGAN script"));
      };
      document.head.appendChild(script);
    } catch (e) {
      g.promise = undefined;
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

  const [mode, setMode] = useState<UpscaleMode>("webgpu");
  const [scale, setScale] = useState<number>(2);
  const [stylePreset, setStylePreset] = useState<WebGPUStylePreset>("anime");
  const [denoisePreset, setDenoisePreset] = useState<DenoisePreset>("denoise3x");

  const [webgpuSupported, setWebgpuSupported] = useState<boolean | null>(null);
  const [gpuAdapterName, setGpuAdapterName] = useState<string>("");

  const [modelState, setModelState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [modelError, setModelError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("upscaled.png");
  const [outSize, setOutSize] = useState<{ w: number; h: number } | null>(null);

  const ptrRef = useRef<{ srcPtr: number; dstPtr: number; outLen: number; w: number; h: number; scale: number } | null>(null);

  // 初始化 WebGPU 检测
  useEffect(() => {
    let active = true;
    checkWebGPUSupport().then((res) => {
      if (!active) return;
      setWebgpuSupported(res.supported);
      if (res.supported) {
        setGpuAdapterName(res.adapterInfo || "GPU");
        setMode("webgpu");
      } else {
        // 如果不支持 WebGPU，回退到 realcugan 或 resize
        setMode(hasThreadsSupport() ? "realcugan" : "resize");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (origUrl) URL.revokeObjectURL(origUrl);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl, origUrl]);

  const realcuganSupport = useMemo(() => {
    if (!hasThreadsSupport()) {
      return { ok: false, reason: ui.crossOriginIsolatedDesc };
    }
    if (typeof WebAssembly === "undefined") {
      return { ok: false, reason: ui.unsupportedDesc };
    }
    return { ok: true, reason: "" };
  }, [ui.crossOriginIsolatedDesc, ui.unsupportedDesc]);

  const triggerLoadModel = () => {
    if (!realcuganSupport.ok) return;
    const g = getGlobalRealCugan();
    if (g.module) {
      setModelState("ready");
      return;
    }
    setModelState("loading");
    setModelError(null);
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
      .then(() => {
        setModelState("ready");
      })
      .catch((e) => {
        setModelState("error");
        setModelError(e instanceof Error ? e.message : "RealCUGAN load failed");
      });
  };

  useEffect(() => {
    if (mode !== "realcugan") return;
    triggerLoadModel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, realcuganSupport.ok]);

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

  const openFilePicker = () => {
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) void pick(selected);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const process = async () => {
    if (!file) return;
    setError(null);
    setProgressPct(null);
    setEtaSeconds(null);

    if (mode === "webgpu") {
      await runWebGPU();
      return;
    }

    if (mode === "realcugan") {
      if (!realcuganSupport.ok) {
        setError(realcuganSupport.reason);
        return;
      }
      if (modelState === "error") {
        setError(modelError || ui.modelLoadFailed);
        return;
      }
      if (modelState === "loading") {
        setIsWorking(true);
        try {
          await loadRealCugan();
          setModelState("ready");
        } catch (e) {
          setIsWorking(false);
          setError(e instanceof Error ? e.message : ui.modelLoadFailed);
          return;
        }
      }
      await runRealCugan();
      return;
    }

    await runResize();
  };

  const runWebGPU = async () => {
    if (!file) return;
    setIsWorking(true);
    setProgressPct(30);
    try {
      const bmp = await fileToImageBitmap(file);
      const outW = Math.round(bmp.width * scale);
      const outH = Math.round(bmp.height * scale);
      setOutSize({ w: outW, h: outH });
      setProgressPct(60);

      const renderedCanvas = await upscaleImageWebGPU(bmp, {
        scale: (scale === 3 ? 3 : 2) as WebGPUScaleFactor,
        preset: stylePreset,
      });
      bmp.close();

      setProgressPct(90);
      const blob = await new Promise<Blob>((resolve, reject) => {
        renderedCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error("WebGPU canvas export failed"))), "image/png", 1);
      });

      const url = URL.createObjectURL(blob);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(url);
      setDownloadName(`${file.name.replace(/\.[^.]+$/u, "") || "image"}-webgpu-x${scale}.png`);
      setProgressPct(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "WebGPU processing failed");
    } finally {
      setIsWorking(false);
      setProgressPct(null);
    }
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
    return `${ui.progress}: ${progressPct}%${etaSeconds !== null ? ` · ${ui.eta}: ${eta}` : ""}`;
  }, [etaSeconds, progressPct, ui.eta, ui.progress, ui.seconds]);

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.hint}</div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div
            className={`rounded-3xl border-2 border-dashed bg-white p-5 transition ${
              isDragging
                ? "border-slate-400 bg-slate-50/60"
                : "border-slate-200"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="flex flex-wrap items-center gap-2">
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
              <button
                type="button"
                onClick={openFilePicker}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                {file ? ui.replace : ui.pick}
              </button>
              <button
                type="button"
                onClick={clear}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                {ui.clear}
              </button>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">{ui.dropReplaceHint}</div>

            {fileInfo ? <div className="mt-3 text-xs text-slate-600">{fileInfo}</div> : null}

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs text-slate-600">
                {ui.mode}
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as UpscaleMode)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                >
                  <option value="webgpu">{ui.modeWebGPU}</option>
                  <option value="realcugan">{ui.modeRealCugan}</option>
                  <option value="resize">{ui.modeResize}</option>
                </select>
              </label>

              {/* WebGPU 状态提示 */}
              {mode === "webgpu" && (
                <div>
                  {webgpuSupported === true ? (
                    <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 ring-1 ring-emerald-200">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
                      <span>{ui.gpuDetected.replace("{adapter}", gpuAdapterName)}</span>
                    </div>
                  ) : webgpuSupported === false ? (
                    <div className="rounded-2xl bg-amber-50 px-4 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
                      {ui.gpuUnsupported}
                    </div>
                  ) : null}
                </div>
              )}

              {/* RealCUGAN 跨域隔离与模型加载状态 */}
              {mode === "realcugan" && !realcuganSupport.ok ? (
                <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-200">
                  <div className="font-semibold">{ui.crossOriginIsolatedTitle}</div>
                  <div className="mt-1">{ui.crossOriginIsolatedDesc}</div>
                </div>
              ) : null}

              {mode === "realcugan" && realcuganSupport.ok ? (
                <div>
                  {modelState === "loading" ? (
                    <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
                      <svg className="h-4 w-4 animate-spin text-amber-600 shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>{ui.modelLoadingHint}</span>
                    </div>
                  ) : modelState === "ready" ? (
                    <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
                      <span>{ui.modelReady}</span>
                    </div>
                  ) : modelState === "error" ? (
                    <div className="flex items-center justify-between gap-2 rounded-2xl bg-rose-50 px-4 py-2.5 text-xs text-rose-800 ring-1 ring-rose-200">
                      <span>{ui.modelLoadFailed}：{modelError}</span>
                      <button
                        type="button"
                        onClick={triggerLoadModel}
                        className="rounded-lg bg-rose-100 px-2 py-1 font-semibold text-rose-800 hover:bg-rose-200"
                      >
                        重试
                      </button>
                    </div>
                  ) : null}
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

                {mode === "webgpu" ? (
                  <label className="grid gap-1 text-xs text-slate-600">
                    {ui.preset}
                    <select
                      value={stylePreset}
                      onChange={(e) => setStylePreset(e.target.value as WebGPUStylePreset)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                    >
                      <option value="anime">{ui.presetAnime}</option>
                      <option value="balanced">{ui.presetBalanced}</option>
                      <option value="sharp">{ui.presetSharp}</option>
                    </select>
                  </label>
                ) : (
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
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void process()}
                  disabled={!file || isWorking}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isWorking ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>{modelState === "loading" && mode === "realcugan" ? ui.modelLoading : ui.processing}</span>
                    </>
                  ) : mode === "realcugan" && modelState === "loading" ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>{ui.modelLoading}</span>
                    </>
                  ) : (
                    <span>{ui.process}</span>
                  )}
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
