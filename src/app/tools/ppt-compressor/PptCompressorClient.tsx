"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Presentation,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Settings,
  Sparkles,
  Zap,
  ShieldCheck,
  Package,
  Sliders,
  Image as ImageIcon,
  Video,
  FileBox,
  Loader2,
  Trash2,
  Info,
} from "lucide-react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import {
  compressOfficeDocument,
  inspectOfficeMedia,
  type OfficeMediaInfo,
} from "../../../lib/office-compressor";

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

type Strategy = "balanced" | "aggressive" | "lossless" | "repackOnly" | "custom";

const DEFAULT_UI = {
  title: "PPT 幻灯片智能压缩",
  clear: "清空",
  pickFile: "选择 PPT 幻灯片 (.pptx)",
  replaceFile: "替换幻灯片",
  dropHint: "拖拽 .pptx 文件到此处，或点击按钮上传。",
  selectedPrefix: "已选择：",
  compressModeTitle: "压缩策略与模式",
  modeBalanced: "智能深度压缩（推荐）",
  modeBalancedDesc:
    "自动优化幻灯片内的高清插图，无透明通道 PNG 转高画质 JPEG，最高级别容器重打包，画质与体积兼顾。",
  modeAggressive: "强力极致压缩（狠压）",
  modeAggressiveDesc:
    "更强力度压缩图片（720P/画质55%），清理内置缩略图，大幅缩减 60%~90%，适合邮件和网络快速分享。",
  modeLossless: "极致无损压缩（保真）",
  modeLosslessDesc:
    "100% 保持原始点对点像素与分辨率，通过剥离元数据、Deflate Level 9 算法与 ZIP 极限打包，完全无损瘦身。",
  modeRepackOnly: "仅重打包容器",
  modeRepackOnlyDesc: "仅重新打包 ZIP 容器，不修改任何插图资源。",
  modeCustom: "自定义高级选项",
  modeCustomDesc: "自由调节媒体压缩模式（有损/无损）、分辨率上限、画质滑块及格式转换策略。",
  mediaAnalysisTitle: "幻灯片媒体成分检测",
  mediaImages: "内嵌图片",
  mediaVideos: "音频/视频媒体",
  mediaThumbnail: "幻灯片缩略图",
  mediaVideoWarning:
    "检测到 PPT 包含嵌入音视频媒体（约 {size}），这通常是 PPT 体积巨大的主要原因。建议配合专门的音视频压缩工具进一步瘦身。",
  settingMediaMode: "媒体压缩模式",
  settingLossy: "智能有损（大幅减小体积）",
  settingLossless: "极致无损（保持 100% 原画质）",
  settingResolution: "图片最大分辨率限制",
  settingQuality: "图片压缩画质",
  settingConvertPng: "PNG 智能转 JPEG",
  settingConvertPngDesc: "自动检测无透明通道的 PNG 图片并转为高画质 JPEG，大幅缩减文件体积",
  settingStripThumbnail: "清理内置缩略图缓存",
  settingStripThumbnailDesc: "清理 PPT 内部自动保存的幻灯片预览缩略图，节省额外存储",
  resOriginal: "原图尺寸（不限制宽高）",
  res2K: "2K 高清 (2048px)",
  res1080P: "1080P 全高清 (1920px, 推荐)",
  res720P: "720P 高清 (1280px)",
  res800: "800px (快速预览/超小体积)",
  runCompress: "开始压缩幻灯片",
  working: "正在优化压缩中…",
  optimizingImage: "正在优化第 {current}/{total} 张图片: {filename}",
  resultTitle: "压缩结果与导出",
  compressSuccess: "压缩成功！",
  originalSize: "原始体积：",
  compressedSize: "压缩后体积：",
  reduction: "体积变化：",
  imagesFound: "检测到内嵌图片：",
  imagesOptimized: "成功优化图片：",
  imageOptimization: "内嵌图片优化",
  imageStats: "共 {count} 张，成功优化 {optimized} 张",
  mediaSaved: "媒体节省体积：",
  emptyHint: "点击“开始压缩幻灯片”即可获取优化后的 PPT 文件",
  download: "下载压缩后的 PPT 文件",
  tipTitle: "说明与提示",
  tips: [
    "PPT 幻灯片（.pptx）中 80%~95% 的体积通常来源于幻灯片内插入的高清摄影图、截图与背景；",
    "本工具纯前端在本地解包，针对幻灯片内置的多媒体图片进行智能重采样或无损 Deflate 深度压缩，同时保持所有动画、文本与排版完全不变；",
    "提供【极致无损】（100% 原始像素不变）与【强力有损】等多种媒体压缩模式，满足大屏高清汇报或邮件体积限制等不同需求；",
    "全程在浏览器本地离线完成，绝不会上传幻灯片至服务器，安全保护演示隐私。",
  ],
  errNotPptx: "请上传以 .pptx 结尾的 PowerPoint 幻灯片文件",
  errFailed: "压缩失败，请确认该文件为未受损坏的有效 .pptx 文件",
} as const;

export default function PptCompressorClient() {
  const config = useOptionalToolConfig("ppt-compressor");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [mediaInfo, setMediaInfo] = useState<OfficeMediaInfo | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Strategy & Custom settings
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [customMode, setCustomMode] = useState<"lossy" | "lossless">("lossy");
  const [customMaxDim, setCustomMaxDim] = useState<number>(1920);
  const [customQuality, setCustomQuality] = useState<number>(75);
  const [customConvertPng, setCustomConvertPng] = useState<boolean>(true);
  const [customStripThumbnail, setCustomStripThumbnail] = useState<boolean>(false);

  const [isWorking, setIsWorking] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("presentation.compressed.pptx");
  const [outputSize, setOutputSize] = useState<number | null>(null);
  const [stats, setStats] = useState<{
    imageCount: number;
    compressedImageCount: number;
    savedMediaBytes: number;
    savedThumbnailBytes: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const beforeSize = file?.size ?? null;

  const reductionText = useMemo(() => {
    if (!beforeSize || !outputSize) return null;
    const diff = beforeSize - outputSize;
    const pct = (diff / beforeSize) * 100;
    const sign = diff === 0 ? "" : diff > 0 ? "-" : "+";
    return `${sign}${formatBytes(Math.abs(diff))} (${sign}${Math.abs(pct).toFixed(1)}%)`;
  }, [beforeSize, outputSize]);

  const inspectFile = async (selected: File) => {
    setIsInspecting(true);
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      const info = inspectOfficeMedia(bytes);
      setMediaInfo(info);
    } catch {
      setMediaInfo(null);
    } finally {
      setIsInspecting(false);
    }
  };

  const pick = (selected: File) => {
    if (!selected.name.toLowerCase().endsWith(".pptx")) {
      setError(ui.errNotPptx);
      return;
    }
    setFile(selected);
    setError(null);
    setOutputSize(null);
    setStats(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    const base = selected.name.replace(/\.[^.]+$/, "") || "presentation";
    setDownloadName(`${base}.compressed.pptx`);
    void inspectFile(selected);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pick(selected);
    e.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) pick(selected);
  };

  const clear = () => {
    setFile(null);
    setMediaInfo(null);
    setError(null);
    setOutputSize(null);
    setStats(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const compress = async () => {
    if (!file) return;
    setIsWorking(true);
    setError(null);
    setOutputSize(null);
    setStats(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    try {
      const inputBytes = new Uint8Array(await file.arrayBuffer());

      let mode: "lossy" | "lossless" | "repackOnly" = "lossy";
      let quality = 0.75;
      let maxDim = 1920;
      let convertPngToJpeg = true;
      let stripThumbnail = false;

      if (strategy === "balanced") {
        mode = "lossy";
        quality = 0.75;
        maxDim = 1920;
        convertPngToJpeg = true;
        stripThumbnail = false;
      } else if (strategy === "aggressive") {
        mode = "lossy";
        quality = 0.55;
        maxDim = 1280;
        convertPngToJpeg = true;
        stripThumbnail = true;
      } else if (strategy === "lossless") {
        mode = "lossless";
        quality = 1.0;
        maxDim = 0;
        convertPngToJpeg = false;
        stripThumbnail = false;
      } else if (strategy === "repackOnly") {
        mode = "repackOnly";
      } else if (strategy === "custom") {
        mode = customMode;
        quality = customQuality / 100;
        maxDim = customMaxDim;
        convertPngToJpeg = customConvertPng;
        stripThumbnail = customStripThumbnail;
      }

      const result = await compressOfficeDocument(inputBytes, {
        level: 9,
        mode,
        imageQuality: quality,
        maxImageDimension: maxDim,
        convertPngToJpeg,
        stripThumbnail,
        onProgress: ({ current, total, filename }) => {
          setProgressStatus(
            ui.optimizingImage
              .replace("{current}", String(current))
              .replace("{total}", String(total))
              .replace("{filename}", filename)
          );
        },
      });

      setOutputSize(result.outputBytes.byteLength);
      setStats({
        imageCount: result.imageCount,
        compressedImageCount: result.compressedImageCount,
        savedMediaBytes: Math.max(0, result.originalImageBytes - result.newImageBytes),
        savedThumbnailBytes: result.savedThumbnailBytes,
      });

      const blob = new Blob([toArrayBuffer(result.outputBytes)], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errFailed);
    } finally {
      setIsWorking(false);
      setProgressStatus(null);
    }
  };

  return (
    <ToolPageLayout toolSlug="ppt-compressor" maxWidthClassName="max-w-6xl">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-2">
              <div className="rounded-2xl bg-amber-100 p-2 text-amber-600">
                <Presentation className="h-5 w-5" />
              </div>
              <h1 className="text-lg font-bold text-slate-900">{ui.title}</h1>
            </div>
            {file && (
              <button
                type="button"
                onClick={clear}
                className="flex items-center gap-1.5 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                <Trash2 className="h-4 w-4" />
                {ui.clear}
              </button>
            )}
          </div>

          {/* Dropzone */}
          <div
            className={`mt-5 rounded-3xl border-2 border-dashed p-6 transition ${
              isDragging
                ? "border-amber-500 bg-amber-50/50"
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
              ref={inputRef}
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              onChange={onChange}
            />

            <div className="flex flex-col items-center justify-center text-center">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-600">
                <Presentation className="h-8 w-8" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-800">
                {file ? `${ui.selectedPrefix}${file.name} (${formatBytes(file.size)})` : ui.dropHint}
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex items-center gap-2 rounded-2xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
                >
                  <Upload className="h-4 w-4" />
                  {file ? ui.replaceFile : ui.pickFile}
                </button>
              </div>
            </div>
          </div>

          {/* Media Diagnostics Bar */}
          {file && (
            <div className="mt-5 rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4">
              <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-amber-600" />
                  <span>{ui.mediaAnalysisTitle}</span>
                </div>
                {isInspecting && (
                  <div className="flex items-center gap-1.5 text-amber-700 font-normal">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>正在扫描媒体资源…</span>
                  </div>
                )}
              </div>
              {mediaInfo && (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                    <div className="rounded-xl bg-white/80 p-3 border border-amber-100 shadow-xs">
                      <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                        <ImageIcon className="h-3.5 w-3.5 text-amber-600" />
                        <span>{ui.mediaImages}</span>
                      </div>
                      <div className="mt-1 font-semibold text-slate-900 text-sm">
                        {mediaInfo.totalImageCount} 张 ({formatBytes(mediaInfo.totalImageBytes)})
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        PNG: {mediaInfo.imageBreakdown.png} · JPG: {mediaInfo.imageBreakdown.jpeg}
                        {mediaInfo.imageBreakdown.bmp > 0 ? ` · BMP: ${mediaInfo.imageBreakdown.bmp}` : ""}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/80 p-3 border border-amber-100 shadow-xs">
                      <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                        <Video className="h-3.5 w-3.5 text-indigo-600" />
                        <span>{ui.mediaVideos}</span>
                      </div>
                      <div className="mt-1 font-semibold text-slate-900 text-sm">
                        {mediaInfo.videoAudioCount} 个 ({formatBytes(mediaInfo.videoAudioBytes)})
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        {mediaInfo.videoAudioCount > 0 ? "包含嵌入多媒体" : "无大型音视频"}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/80 p-3 border border-amber-100 shadow-xs">
                      <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                        <FileBox className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{ui.mediaThumbnail}</span>
                      </div>
                      <div className="mt-1 font-semibold text-slate-900 text-sm">
                        {mediaInfo.hasThumbnail ? formatBytes(mediaInfo.thumbnailBytes) : "无"}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        {mediaInfo.hasThumbnail ? "可安全清理瘦身" : "未生成缩略图"}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/80 p-3 border border-amber-100 shadow-xs">
                      <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                        <Sparkles className="h-3.5 w-3.5 text-rose-600" />
                        <span>媒体占总体积</span>
                      </div>
                      <div className="mt-1 font-semibold text-slate-900 text-sm">
                        {file.size > 0
                          ? `${(
                              ((mediaInfo.totalImageBytes + mediaInfo.videoAudioBytes) / file.size) *
                              100
                            ).toFixed(1)}%`
                          : "0%"}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">主要瘦身体积源</div>
                    </div>
                  </div>

                  {mediaInfo.videoAudioCount > 0 && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-100/70 p-2.5 text-[11px] text-amber-900">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
                      <span>
                        {ui.mediaVideoWarning.replace(
                          "{size}",
                          formatBytes(mediaInfo.videoAudioBytes)
                        )}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {file && (
            <div className="mt-6 grid gap-6 lg:grid-cols-12">
              {/* Left Column: Settings */}
              <div className="space-y-4 lg:col-span-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Settings className="h-4 w-4 text-slate-500" />
                      {ui.compressModeTitle}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {/* Balanced Option */}
                    <button
                      type="button"
                      onClick={() => setStrategy("balanced")}
                      className={`w-full rounded-2xl border p-3.5 text-left transition ${
                        strategy === "balanced"
                          ? "border-amber-600 bg-amber-50/50 ring-1 ring-amber-500"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold text-xs text-amber-900 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-amber-600" />
                          <span>{ui.modeBalanced}</span>
                        </div>
                        <span className="text-[10px] font-normal text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
                          智能有损 · 推荐
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 leading-tight">
                        {ui.modeBalancedDesc}
                      </div>
                    </button>

                    {/* Aggressive Option */}
                    <button
                      type="button"
                      onClick={() => setStrategy("aggressive")}
                      className={`w-full rounded-2xl border p-3.5 text-left transition ${
                        strategy === "aggressive"
                          ? "border-amber-600 bg-amber-50/50 ring-1 ring-amber-500"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold text-xs text-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Zap className="h-4 w-4 text-rose-500" />
                          <span>{ui.modeAggressive}</span>
                        </div>
                        <span className="text-[10px] font-normal text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                          狠压 · 极致压缩
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 leading-tight">
                        {ui.modeAggressiveDesc}
                      </div>
                    </button>

                    {/* Lossless Option */}
                    <button
                      type="button"
                      onClick={() => setStrategy("lossless")}
                      className={`w-full rounded-2xl border p-3.5 text-left transition ${
                        strategy === "lossless"
                          ? "border-amber-600 bg-amber-50/50 ring-1 ring-amber-500"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold text-xs text-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="h-4 w-4 text-emerald-600" />
                          <span>{ui.modeLossless}</span>
                        </div>
                        <span className="text-[10px] font-normal text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          100% 原始画质
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 leading-tight">
                        {ui.modeLosslessDesc}
                      </div>
                    </button>

                    {/* Custom Advanced Option */}
                    <button
                      type="button"
                      onClick={() => setStrategy("custom")}
                      className={`w-full rounded-2xl border p-3.5 text-left transition ${
                        strategy === "custom"
                          ? "border-amber-600 bg-amber-50/50 ring-1 ring-amber-500"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold text-xs text-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Sliders className="h-4 w-4 text-indigo-600" />
                          <span>{ui.modeCustom}</span>
                        </div>
                        <span className="text-[10px] font-normal text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                          自由配置
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 leading-tight">
                        {ui.modeCustomDesc}
                      </div>
                    </button>

                    {/* Repack Only Option */}
                    <button
                      type="button"
                      onClick={() => setStrategy("repackOnly")}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        strategy === "repackOnly"
                          ? "border-amber-600 bg-amber-50/50 ring-1 ring-amber-500"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold text-xs text-slate-700 flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-slate-500" />
                        <span>{ui.modeRepackOnly}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 leading-tight">
                        {ui.modeRepackOnlyDesc}
                      </div>
                    </button>
                  </div>

                  {/* Custom Configuration Panel */}
                  {strategy === "custom" && (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 space-y-4">
                      {/* Media Mode: Lossy vs Lossless */}
                      <div>
                        <label className="text-xs font-semibold text-slate-800">
                          {ui.settingMediaMode}
                        </label>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setCustomMode("lossy")}
                            className={`rounded-xl border py-2 px-3 text-xs font-medium transition ${
                              customMode === "lossy"
                                ? "border-indigo-600 bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-500"
                                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                            }`}
                          >
                            {ui.settingLossy}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomMode("lossless")}
                            className={`rounded-xl border py-2 px-3 text-xs font-medium transition ${
                              customMode === "lossless"
                                ? "border-indigo-600 bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-500"
                                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                            }`}
                          >
                            {ui.settingLossless}
                          </button>
                        </div>
                      </div>

                      {customMode === "lossy" && (
                        <>
                          {/* Resolution Cap */}
                          <div>
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                              <span>{ui.settingResolution}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {[
                                { label: ui.resOriginal, val: 0 },
                                { label: ui.res2K, val: 2048 },
                                { label: ui.res1080P, val: 1920 },
                                { label: ui.res720P, val: 1280 },
                                { label: ui.res800, val: 800 },
                              ].map((item) => (
                                <button
                                  key={item.val}
                                  type="button"
                                  onClick={() => setCustomMaxDim(item.val)}
                                  className={`rounded-xl border p-2 text-center text-[11px] font-medium transition ${
                                    customMaxDim === item.val
                                      ? "border-indigo-600 bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-500"
                                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                                  }`}
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Quality Slider */}
                          <div>
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                              <span>{ui.settingQuality}</span>
                              <span className="font-mono text-indigo-700">{customQuality}%</span>
                            </div>
                            <input
                              type="range"
                              min="30"
                              max="95"
                              step="5"
                              value={customQuality}
                              onChange={(e) => setCustomQuality(Number(e.target.value))}
                              className="mt-2 w-full accent-indigo-600"
                            />
                            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                              <span>较小体积 (30%)</span>
                              <span>标准推荐 (75%)</span>
                              <span>极高保真 (95%)</span>
                            </div>
                          </div>

                          {/* Convert PNG toggle */}
                          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
                            <label className="flex items-start gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={customConvertPng}
                                onChange={(e) => setCustomConvertPng(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded accent-indigo-600"
                              />
                              <div>
                                <div className="text-xs font-semibold text-slate-800">
                                  {ui.settingConvertPng}
                                </div>
                                <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                                  {ui.settingConvertPngDesc}
                                </div>
                              </div>
                            </label>
                          </div>
                        </>
                      )}

                      {/* Strip Thumbnail toggle */}
                      <div className="rounded-xl border border-slate-200/80 bg-white p-3">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={customStripThumbnail}
                            onChange={(e) => setCustomStripThumbnail(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded accent-indigo-600"
                          />
                          <div>
                            <div className="text-xs font-semibold text-slate-800">
                              {ui.settingStripThumbnail}
                            </div>
                            <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                              {ui.settingStripThumbnailDesc}
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void compress()}
                    disabled={isWorking}
                    className="flex items-center justify-center gap-2 w-full rounded-2xl bg-amber-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isWorking ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{progressStatus || ui.working}</span>
                      </>
                    ) : (
                      ui.runCompress
                    )}
                  </button>

                  {error && (
                    <div className="flex items-center gap-2 rounded-2xl bg-rose-50 p-4 text-xs text-rose-800 ring-1 ring-rose-200">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>

                {/* Tips Card */}
                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 space-y-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-800">{ui.tipTitle}</div>
                  <ul className="list-disc pl-4 space-y-1 text-[11px]">
                    {ui.tips.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Right Column: Output */}
              <div className="space-y-4 lg:col-span-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                  <div className="text-sm font-semibold text-slate-900">{ui.resultTitle}</div>

                  {outputSize != null && downloadUrl ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl bg-emerald-50 p-4 text-xs text-emerald-900 ring-1 ring-emerald-200 flex items-start gap-2.5">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-sm">{ui.compressSuccess}</div>
                          <div className="mt-1 text-slate-600 leading-relaxed">
                            {ui.reduction} <span className="font-semibold text-emerald-700">{reductionText}</span>
                          </div>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50 text-xs">
                        <div className="flex justify-between p-3">
                          <span className="text-slate-500">{ui.originalSize}</span>
                          <span className="font-mono text-slate-700">{formatBytes(file.size)}</span>
                        </div>
                        <div className="flex justify-between p-3">
                          <span className="text-slate-500">{ui.compressedSize}</span>
                          <span className="font-mono font-semibold text-emerald-600">
                            {formatBytes(outputSize)}
                          </span>
                        </div>
                        {stats && (
                          <>
                            <div className="flex justify-between p-3">
                              <span className="text-slate-500 flex items-center gap-1">
                                <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                                {ui.imageOptimization}
                              </span>
                              <span className="text-slate-700">
                                {ui.imageStats
                                  .replace("{count}", String(stats.imageCount))
                                  .replace("{optimized}", String(stats.compressedImageCount))}
                              </span>
                            </div>
                            {stats.savedMediaBytes > 0 && (
                              <div className="flex justify-between p-3">
                                <span className="text-slate-500">{ui.mediaSaved}</span>
                                <span className="font-mono text-emerald-600">
                                  -{formatBytes(stats.savedMediaBytes)}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <a
                        href={downloadUrl}
                        download={downloadName}
                        className="flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700"
                      >
                        <Download className="h-4 w-4" />
                        {ui.download}
                      </a>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-14 text-center">
                      <div className="rounded-2xl bg-slate-100 p-3 text-slate-400">
                        <Presentation className="h-8 w-8" />
                      </div>
                      <p className="mt-3 text-xs text-slate-400">{ui.emptyHint}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolPageLayout>
  );
}
