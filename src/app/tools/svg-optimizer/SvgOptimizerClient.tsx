"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type OptimizeOptions = {
  removeComments: boolean;
  removeMetadata: boolean;
  removeTitleDesc: boolean;
  minifyWhitespace: boolean;
};

const DEFAULT_OPTIONS: OptimizeOptions = {
  removeComments: true,
  removeMetadata: true,
  removeTitleDesc: false,
  minifyWhitespace: true,
};

const DEFAULT_UI = {
  uploadSvg: "上传 SVG",
  copyOptimizedResult: "复制优化结果",
  download: "下载 {filename}",
  inputSvg: "输入 SVG",
  optimizedResult: "优化结果",
  optimizedPlaceholder: "优化后输出…",
  options: "选项",
  removeComments: "移除注释（<!-- -->）",
  removeMetadata: "移除 <metadata>",
  removeTitleDesc: "移除 <title>/<desc>（可能影响可访问性）",
  minifyWhitespace: "压缩空白（简单 minify）",
  lightWeightDescription: "说明：此工具为轻量优化，不等同于 SVGO 的完整规则集；不会改变路径数据和几何结构。",
  preview: "预览",
  noPreview: "无预览",
  invalidSvgError: "不是有效的 SVG（缺少 <svg> 根节点）。",
  parseError: "SVG 解析失败：请检查 XML 是否完整。",
  optimizeError: "优化失败",
  defaultSvgExample: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <!-- comment -->
  <metadata>example</metadata>
  <rect x="10" y="10" width="100" height="100" fill="#3B82F6"/>
</svg>
`,
  downloadFilename: "optimized.svg"
} as const;

type SvgOptimizerUi = typeof DEFAULT_UI;

const stripComments = (svg: string) => svg.replace(/<!--[\s\S]*?-->/g, "");

const minifySvgText = (svg: string) =>
  svg
    .replace(/\r\n/g, "\n")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();

const removeTags = (doc: Document, tagName: string) => {
  const nodes = Array.from(doc.getElementsByTagName(tagName));
  for (const n of nodes) n.parentNode?.removeChild(n);
};

const parseSvg = (text: string, ui: SvgOptimizerUi): Document => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== "svg") {
    throw new Error(ui.invalidSvgError);
  }
  const errorNode = doc.getElementsByTagName("parsererror")[0];
  if (errorNode) throw new Error(ui.parseError);
  return doc;
};

const serializeSvg = (doc: Document): string => {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
};

const byteLengthUtf8 = (text: string) => new TextEncoder().encode(text).byteLength;

export default function SvgOptimizerClient() {
  return (
    <ToolPageLayout toolSlug="svg-optimizer" maxWidthClassName="max-w-6xl">
      <SvgOptimizerInner />
    </ToolPageLayout>
  );
}

function SvgOptimizerInner() {
  const config = useOptionalToolConfig("svg-optimizer");
  const ui: SvgOptimizerUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<SvgOptimizerUi>) };

  const fileRef = useRef<HTMLInputElement>(null);

  const [raw, setRaw] = useState<string>(ui.defaultSvgExample);
  const [options, setOptions] = useState<OptimizeOptions>(DEFAULT_OPTIONS);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>(ui.downloadFilename);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const optimized = useMemo(() => {
    setError(null);
    try {
      let text = raw;
      if (options.removeComments) text = stripComments(text);
      const doc = parseSvg(text, ui);
      if (options.removeMetadata) removeTags(doc, "metadata");
      if (options.removeTitleDesc) {
        removeTags(doc, "title");
        removeTags(doc, "desc");
      }
      let out = serializeSvg(doc);
      if (options.minifyWhitespace) out = minifySvgText(out);
      if (!out.endsWith("\n")) out += "\n";
      return out;
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.optimizeError);
      return "";
    }
  }, [options, raw]);

  const stats = useMemo(() => {
    const before = byteLengthUtf8(raw);
    const after = optimized ? byteLengthUtf8(optimized) : 0;
    const ratio = before > 0 ? after / before : 0;
    return { before, after, ratio };
  }, [optimized, raw]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const buildDownload = () => {
    if (!optimized) return;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    const blob = new Blob([optimized], { type: "image/svg+xml" });
    setDownloadUrl(URL.createObjectURL(blob));
  };

  useEffect(() => {
    buildDownload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimized]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setRaw(text);
    const base = f.name.replace(/\.[^.]+$/, "") || "optimized";
    setDownloadName(`${base}.optimized.svg`);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="image/svg+xml,.svg" className="hidden" onChange={(e) => void onFile(e)} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {ui.uploadSvg}
            </button>
            <div className="rounded-2xl bg-slate-50 px-4 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
              {stats.before}B → {stats.after}B ({stats.before > 0 ? `${Math.round(stats.ratio * 100)}%` : "-"})
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copy(optimized)}
              disabled={!optimized}
              className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {ui.copyOptimizedResult}
            </button>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={downloadName}
                className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                {ui.download.replace("{filename}", downloadName)}
              </a>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.inputSvg}</div>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className="mt-3 h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.optimizedResult}</div>
              <textarea
                value={optimized}
                readOnly
                className="mt-3 h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                placeholder={ui.optimizedPlaceholder}
              />
              {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.options}</div>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.removeComments}
                    onChange={(e) => setOptions((p) => ({ ...p, removeComments: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {ui.removeComments}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.removeMetadata}
                    onChange={(e) => setOptions((p) => ({ ...p, removeMetadata: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {ui.removeMetadata}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.removeTitleDesc}
                    onChange={(e) => setOptions((p) => ({ ...p, removeTitleDesc: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {ui.removeTitleDesc}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.minifyWhitespace}
                    onChange={(e) => setOptions((p) => ({ ...p, minifyWhitespace: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {ui.minifyWhitespace}
                </label>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                {ui.lightWeightDescription}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.preview}</div>
              <div className="mt-4 overflow-hidden rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                {optimized ? (
                  <div
                    className="flex justify-center"
                    // SVG is user input; for preview only. Keep isolated.
                    dangerouslySetInnerHTML={{ __html: optimized }}
                  />
                ) : (
                  <div className="text-xs text-slate-500">{ui.noPreview}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

