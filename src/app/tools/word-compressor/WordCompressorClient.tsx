"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Settings,
  Sparkles,
  Image as ImageIcon,
  Loader2,
  Trash2,
} from "lucide-react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { compressOfficeDocument } from "../../../lib/office-compressor";

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

type Strategy = "balanced" | "aggressive" | "repackOnly";

const DEFAULT_UI = {
  headerTitle: "Word 文档智能压缩",
  clear: "清空",
  pickFile: "选择 Word 文档 (.docx)",
  replaceFile: "替换文档",
  dropHint: "拖拽 .docx 文件到此处，或点击按钮上传。",
  fileSelectedPrefix: "已选择：",
  compressModeTitle: "压缩策略",
  modeBalanced: "智能深度压缩（推荐）",
  modeBalancedDesc: "自动优化文档内的高清插图（保留清晰度），并使用最高级别重新打包，大幅减小体积。",
  modeAggressive: "强力极致压缩",
  modeAggressiveDesc: "较大力度压缩内嵌图片，适合仅需日常传阅或邮件发送的超大文档。",
  modeRepackOnly: "仅重打包容器",
  modeRepackOnlyDesc: "仅重新打包 ZIP 容器，不修改任何图片资源。",
  runCompress: "开始压缩文档",
  working: "正在优化压缩中…",
  optimizingProgress: "正在优化第 {current}/{total} 张图片: {filename}",
  tipTitle: "说明与提示",
  tips: [
    "Word 文档（.docx）中 90% 以上的体积通常来源于插入的高清照片、插图和截屏；",
    "本工具纯前端在本地解包，针对文档内置多媒体图片进行智能有损/无损重采样压缩，同时保持文档内容和排版完全不变；",
    "全程在浏览器本地离线完成，绝不会上传文档至服务器，安全可靠。",
  ],
  resultTitle: "压缩结果与导出",
  successTitle: "压缩成功！",
  originalSize: "原始体积：",
  compressedSize: "压缩后体积：",
  reduction: "体积变化：",
  imageOptimizationLabel: "内嵌图片优化",
  imageOptimizationStats: "共 {total} 张，成功优化 {count} 张",
  download: "下载压缩后的 Word 文档",
  emptyResultHint: "点击“开始压缩文档”即可获取优化后的 Word 文档",
  errNotDocx: "请上传以 .docx 结尾的 Word 文档",
  errFailed: "压缩失败，请确认该文档为未受损坏的有效 .docx 文件",
} as const;

export default function WordCompressorClient() {
  return (
    <ToolPageLayout toolSlug="word-compressor" maxWidthClassName="max-w-6xl">
      <WordCompressorInner />
    </ToolPageLayout>
  );
}

function WordCompressorInner() {
  const config = useOptionalToolConfig("word-compressor");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [isWorking, setIsWorking] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("document.compressed.docx");
  const [outputSize, setOutputSize] = useState<number | null>(null);
  const [stats, setStats] = useState<{
    imageCount: number;
    compressedImageCount: number;
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

  const pick = (selected: File) => {
    if (!selected.name.toLowerCase().endsWith(".docx")) {
      setError(ui.errNotDocx);
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
    const base = selected.name.replace(/\.[^.]+$/, "") || "document";
    setDownloadName(`${base}.compressed.docx`);
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

      let quality = 0.75;
      let maxDim = 1920;
      if (strategy === "aggressive") {
        quality = 0.6;
        maxDim = 1440;
      }

      const result = await compressOfficeDocument(inputBytes, {
        level: 9,
        imageQuality: strategy === "repackOnly" ? 1.0 : quality,
        maxImageDimension: strategy === "repackOnly" ? 99999 : maxDim,
        onProgress: ({ current, total, filename }) => {
          setProgressStatus(
            ui.optimizingProgress
              .replace("{current}", current.toString())
              .replace("{total}", total.toString())
              .replace("{filename}", filename),
          );
        },
      });

      setOutputSize(result.outputBytes.byteLength);
      setStats({
        imageCount: result.imageCount,
        compressedImageCount: result.compressedImageCount,
      });

      const blob = new Blob([toArrayBuffer(result.outputBytes)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-blue-100 p-2 text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">{ui.headerTitle}</h1>
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
              ref={inputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={onChange}
            />

            <div className="flex flex-col items-center justify-center text-center">
              <div className="rounded-2xl bg-blue-100 p-3 text-blue-600">
                <FileText className="h-8 w-8" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-800">
                {file ? `${ui.fileSelectedPrefix}${file.name} (${formatBytes(file.size)})` : ui.dropHint}
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  <Upload className="h-4 w-4" />
                  {file ? ui.replaceFile : ui.pickFile}
                </button>
              </div>
            </div>
          </div>

          {file && (
            <div className="mt-6 grid gap-6 lg:grid-cols-12">
              {/* Left Column: Settings */}
              <div className="space-y-4 lg:col-span-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Settings className="h-4 w-4 text-slate-500" />
                    {ui.compressModeTitle}
                  </div>

                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => setStrategy("balanced")}
                      className={`w-full rounded-2xl border p-3.5 text-left transition ${
                        strategy === "balanced"
                          ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-500"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold text-xs text-blue-900 flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-blue-600" />
                        {ui.modeBalanced}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 leading-tight">
                        {ui.modeBalancedDesc}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStrategy("aggressive")}
                      className={`w-full rounded-2xl border p-3.5 text-left transition ${
                        strategy === "aggressive"
                          ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-500"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold text-xs text-slate-800">
                        {ui.modeAggressive}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 leading-tight">
                        {ui.modeAggressiveDesc}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStrategy("repackOnly")}
                      className={`w-full rounded-2xl border p-3.5 text-left transition ${
                        strategy === "repackOnly"
                          ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-500"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold text-xs text-slate-800">
                        {ui.modeRepackOnly}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 leading-tight">
                        {ui.modeRepackOnlyDesc}
                      </div>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => void compress()}
                    disabled={isWorking}
                    className="flex items-center justify-center gap-2 w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <div className="font-semibold text-sm">{ui.successTitle}</div>
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
                          <div className="flex justify-between p-3">
                            <span className="text-slate-500 flex items-center gap-1">
                              <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                              {ui.imageOptimizationLabel}
                            </span>
                            <span className="text-slate-700">
                              {ui.imageOptimizationStats
                                .replace("{total}", stats.imageCount.toString())
                                .replace("{count}", stats.compressedImageCount.toString())}
                            </span>
                          </div>
                        )}
                      </div>

                      <a
                        href={downloadUrl}
                        download={downloadName}
                        className="flex items-center justify-center gap-2 w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700"
                      >
                        <Download className="h-4 w-4" />
                        {ui.download}
                      </a>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
                      <FileText className="h-10 w-10 stroke-1" />
                      <p className="mt-3 text-xs">{ui.emptyResultHint}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
