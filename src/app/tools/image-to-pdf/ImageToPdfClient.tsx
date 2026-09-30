"use client";

import type { ChangeEvent } from "react";
import { PDFDocument, rgb, type PDFImage } from "pdf-lib";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import ImageEditorModal from "./ImageEditorModal";
import {
  bakeImageToBytes,
  bakePreviewFromBitmap,
  IDENTITY_EDIT,
  isIdentityEdit,
  loadBitmap,
  outputSize,
  parseJpegOrientation,
  type BakeFormat,
  type ImageEdit,
} from "./imageEdit";
type PageSizePreset = "auto" | "a4" | "letter";
type OrientationPreset = "auto" | "portrait" | "landscape";
type FitMode = "contain" | "cover";
type PreviewMode = "simulate" | "pdf";

type Item = {
  id: string;
  file: File;
  width: number;
  height: number;
  edit: ImageEdit;
  previewUrl: string;
};

const makeId = () => Math.random().toString(16).slice(2);

const DEFAULT_UI = {
  selectImages: "选择图片",
  addImages: "追加图片",
  replaceImages: "替换图片",
  dropReplaceHint: "支持拖拽图片到此区域直接替换（会清空当前列表）",
  sortByName: "按文件名排序",
  clear: "清空",
  selectedCount: "已选 {count} 张",
  download: "下载 {filename}",
  generating: "生成中…",
  generatePdf: "生成 PDF",
  imageList: "图片列表",
  previewTitle: "PDF 页面预览",
  pagesCount: "共 {count} 页",
  modeSimulate: "模拟",
  modePdf: "PDF",
  pageLabel: "第 {index} 页",
  dragSortHint: "预览按最终 PDF 页面结构实时展示；点击页面可编辑（旋转 / 缩放 / 裁剪），上下按钮调整页序。",
  selectImagesHint: "请选择图片（JPG/PNG/WebP/GIF 等，具体取决于浏览器解码能力）。",
  delete: "删除",
  pageSettings: "页面设置",
  paperSize: "纸张",
  a4: "A4",
  letter: "Letter",
  autoByImageSize: "按图片尺寸（DPI）",
  orientation: "方向",
  orientationAuto: "自动（跟随图片）",
  portrait: "竖版",
  landscape: "横版",
  fitMode: "适配",
  contain: "Contain（完整显示）",
  cover: "Cover（铺满裁切）",
  dpi: "DPI（仅按图片尺寸时生效）",
  margins: "页边距（pt）",
  backgroundColor: "背景色",
  backgroundColorLabel: "背景色",
  edit: "编辑",
  editedBadge: "已编辑",
  pdfPreview: "PDF 预览",
  tip: "提示：本工具使用浏览器本地生成 PDF，不上传图片。图片保持原始方向；未编辑的 JPG/JPEG 会直接嵌入以保留体积优势，经过旋转 / 缩放 / 裁剪的图片会重新编码。",
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

/** 单张图片最终页面的 pt 尺寸（与生成逻辑共用同一套规则） */
const resolvePagePt = (
  edit: ImageEdit,
  width: number,
  height: number,
  pageSize: PageSizePreset,
  orientation: OrientationPreset,
  dpi: number,
): { w: number; h: number } => {
  const out = outputSize(edit, width, height);
  const effOrientation: "portrait" | "landscape" =
    orientation === "auto" ? (out.h >= out.w ? "portrait" : "landscape") : orientation;
  if (pageSize === "auto") {
    let w = (out.w / dpi) * 72;
    let h = (out.h / dpi) * 72;
    if (effOrientation === "landscape" && h > w) [w, h] = [h, w];
    if (effOrientation === "portrait" && w > h) [w, h] = [h, w];
    return { w, h };
  }
  return sizePresetToPoints(pageSize, effOrientation);
};

const fileExt = (name: string) => {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
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

/** 模拟单页渲染：页面比例、背景、页边距、适配模式均与最终 PDF 一致 */
function PageThumb({
  spec,
  bg,
  marginPt,
  fit,
  index,
  onOpen,
}: {
  spec: { previewUrl: string; name: string; pt: { w: number; h: number } };
  bg: string;
  marginPt: number;
  fit: FitMode;
  index: number;
  onOpen: () => void;
}) {
  // padding 百分比相对宽度计算，页面整体按 pt 比例缩放
  const padPct = Math.min(30, (marginPt / spec.pt.w) * 100);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={spec.name}
      className="group relative block shrink-0 overflow-hidden rounded-lg shadow-md ring-1 ring-slate-300 transition hover:ring-blue-400"
      style={{
        width: 184,
        aspectRatio: `${spec.pt.w} / ${spec.pt.h}`,
        backgroundColor: bg,
        padding: `${padPct}%`,
      }}
    >
      <span className="block h-full w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={spec.previewUrl}
          alt={spec.name}
          className="h-full w-full"
          style={{ objectFit: fit === "cover" ? "cover" : "contain" }}
        />
      </span>
      <span className="absolute bottom-1 right-1 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {index}
      </span>
    </button>
  );
}

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
  const pendingReplaceRef = useRef(false);

  const [items, setItems] = useState<Item[]>([]);
  const [pageSize, setPageSize] = useState<PageSizePreset>("a4");
  const [orientation, setOrientation] = useState<OrientationPreset>("auto");
  const [fit, setFit] = useState<FitMode>("contain");
  const [dpi, setDpi] = useState(150);
  const [margin, setMargin] = useState(18);
  const [bg, setBg] = useState("#FFFFFF");

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("images.pdf");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("simulate");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  // 图片列表（顺序/编辑）或页面设置变化后，已生成的 PDF 失效，回到模拟视图
  const structureKey = useMemo(
    () =>
      JSON.stringify({
        items: items.map((it) => [it.id, it.file.name, it.file.size, it.edit]),
        pageSize,
        orientation,
        fit,
        dpi,
        margin,
        bg,
      }),
    [items, pageSize, orientation, fit, dpi, margin, bg],
  );
  const structureKeyRef = useRef(structureKey);
  useEffect(() => {
    if (structureKeyRef.current === structureKey) return;
    structureKeyRef.current = structureKey;
    // 置空后由 downloadUrl 的 cleanup effect 负责 revoke
    setDownloadUrl(null);
    setPreviewMode("simulate");
  }, [structureKey]);

  const totalCount = items.length;
  const editingItem = items.find((it) => it.id === editingId) ?? null;
  const safeDpi = clamp(Math.round(dpi), 36, 600);
  const safeMargin = clamp(Math.round(margin), 0, 120);

  const pageSpecs = useMemo(
    () =>
      items.map((it) => ({
        it,
        out: outputSize(it.edit, it.width, it.height),
        pt: resolvePagePt(it.edit, it.width, it.height, pageSize, orientation, safeDpi),
      })),
    [items, pageSize, orientation, safeDpi],
  );

  const buildPreview = async (file: File, edit: ImageEdit): Promise<string> => {
    const bmp = await loadBitmap(file);
    try {
      return bakePreviewFromBitmap(bmp, edit, 480);
    } finally {
      bmp.close();
    }
  };

  const pick = async (files: File[], options: { replace?: boolean } = {}) => {
    const shouldReplace = options.replace === true;
    setError(null);
    const next: Item[] = [];
    for (const f of files) {
      try {
        const bmp = await loadBitmap(f);
        const width = bmp.width;
        const height = bmp.height;
        let previewUrl = "";
        try {
          previewUrl = bakePreviewFromBitmap(bmp, { ...IDENTITY_EDIT }, 480);
        } finally {
          bmp.close();
        }
        next.push({
          id: makeId(),
          file: f,
          width,
          height,
          edit: { ...IDENTITY_EDIT },
          previewUrl,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : ui.readImageError);
      }
    }
    setItems((prev) => (shouldReplace ? next : [...prev, ...next]));
    if (files.length > 0) {
      const base = files[0].name.replace(/\.[^.]+$/, "") || "images";
      setDownloadName(`${base}.pdf`);
    }
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const shouldReplace = pendingReplaceRef.current;
    pendingReplaceRef.current = false;
    if (files.length > 0) void pick(files, { replace: shouldReplace });
  };

  const openFilePicker = (replace: boolean) => {
    pendingReplaceRef.current = replace;
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) {
      void pick(files, { replace: items.length > 0 });
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const remove = (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    if (editingId === id) setEditingId(null);
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
    setItems([]);
    setError(null);
    setEditingId(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const sortByName = () => {
    setItems((prev) =>
      prev
        .slice()
        .sort((a, b) => a.file.name.localeCompare(b.file.name, "zh-CN", { numeric: true })),
    );
  };

  const applyEdit = (id: string, edit: ImageEdit) => {
    setEditingId(null);
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, edit } : it)));
    const target = items.find((it) => it.id === id);
    if (!target) return;
    void buildPreview(target.file, edit)
      .then((previewUrl) => {
        setItems((cur) => cur.map((it) => (it.id === id ? { ...it, previewUrl } : it)));
      })
      .catch(() => {
        // 保留旧预览图
      });
  };

  /** 嵌入单张图片：未编辑且 EXIF 方向正常时直嵌原始字节，否则按编辑参数重编码 */
  const prepareEmbed = async (it: Item, doc: PDFDocument): Promise<PDFImage> => {
    const ext = fileExt(it.file.name);
    const mime = it.file.type;
    const isJpeg = mime === "image/jpeg" || mime === "image/jpg" || ext === "jpg" || ext === "jpeg";
    const isPng = mime === "image/png" || ext === "png";

    if (isJpeg || isPng) {
      const bytes = new Uint8Array(await it.file.arrayBuffer());
      const orientationTag = isJpeg ? parseJpegOrientation(bytes) : 1;
      if (orientationTag <= 1 && isIdentityEdit(it.edit)) {
        return isJpeg ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
      }
      const format: BakeFormat = isPng ? "png" : "jpeg";
      const baked = await bakeImageToBytes(it.file, it.edit, {
        format,
        quality: 0.92,
        background: "#FFFFFF",
      });
      return baked.format === "jpeg"
        ? await doc.embedJpg(baked.bytes)
        : await doc.embedPng(baked.bytes);
    }

    const baked = await bakeImageToBytes(it.file, it.edit, { format: "png" });
    return doc.embedPng(baked.bytes);
  };

  const build = async () => {
    if (items.length === 0) return;
    setIsWorking(true);
    setError(null);

    try {
      const doc = await PDFDocument.create();
      const bgRgb = hexToRgb(bg);

      for (const it of items) {
        const img = await prepareEmbed(it, doc);
        const out = outputSize(it.edit, it.width, it.height);
        const pt = resolvePagePt(it.edit, it.width, it.height, pageSize, orientation, safeDpi);
        const pageW = pt.w;
        const pageH = pt.h;

        const page = doc.addPage([pageW, pageH]);
        page.drawRectangle({
          x: 0,
          y: 0,
          width: pageW,
          height: pageH,
          color: rgb(bgRgb.r / 255, bgRgb.g / 255, bgRgb.b / 255),
        });

        const contentW = Math.max(1, pageW - safeMargin * 2);
        const contentH = Math.max(1, pageH - safeMargin * 2);
        const rect = scaleRect(out.w, out.h, contentW, contentH, fit);
        page.drawImage(img, { x: safeMargin + rect.x, y: safeMargin + rect.y, width: rect.w, height: rect.h });
      }

      const bytes = await doc.save();
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      setDownloadUrl(url);
      setPreviewMode("pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.buildError);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
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
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onChange} />
            <button
              type="button"
              onClick={() => openFilePicker(false)}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {items.length > 0 ? ui.addImages : ui.selectImages}
            </button>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => openFilePicker(true)}
                className="rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                {ui.replaceImages}
              </button>
            )}
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
            <button
              type="button"
              onClick={() => void build()}
              disabled={items.length === 0 || isWorking}
              className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {isWorking ? ui.generating : ui.generatePdf}
            </button>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={downloadName}
                className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {ui.download.replace('{filename}', downloadName)}
              </a>
            )}
          </div>
          <div className="w-full text-[11px] text-slate-500">
            {items.length > 0 ? ui.dragSortHint : ui.selectImagesHint}
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
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-slate-900">{ui.previewTitle}</div>
                {items.length > 0 && (
                  <div className="text-xs text-slate-500">
                    {ui.pagesCount.replace("{count}", totalCount.toString())}
                  </div>
                )}
              </div>
              {items.length > 0 && downloadUrl && (
                <div className="inline-flex rounded-xl bg-slate-100 p-1">
                  {(["simulate", "pdf"] as PreviewMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPreviewMode(m)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        previewMode === m
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-800"
                      }`}
                    >
                      {m === "simulate" ? ui.modeSimulate : ui.modePdf}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                {ui.selectImagesHint}
              </div>
            ) : previewMode === "pdf" && downloadUrl ? (
              <iframe
                src={downloadUrl}
                title={ui.pdfPreview}
                className="mt-4 h-[640px] w-full rounded-2xl border border-slate-100 bg-slate-50"
              />
            ) : (
              <div className="mt-4 grid gap-3">
                {pageSpecs.map((spec, idx) => {
                  const it = spec.it;
                  const edited = !isIdentityEdit(it.edit);
                  return (
                    <div key={it.id} className="flex items-start gap-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <PageThumb
                        spec={{ previewUrl: it.previewUrl, name: it.file.name, pt: spec.pt }}
                        bg={bg}
                        marginPt={safeMargin}
                        fit={fit}
                        index={idx + 1}
                        onOpen={() => setEditingId(it.id)}
                      />
                      <div className="min-w-0 flex-1 py-1">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                            {ui.pageLabel.replace("{index}", (idx + 1).toString())}
                          </span>
                          <span className="truncate text-sm font-semibold text-slate-900">{it.file.name}</span>
                          {edited && (
                            <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                              {ui.editedBadge}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {it.width}×{it.height}px
                          {edited && (
                            <span className="text-blue-700">
                              {" "}→ {spec.out.w}×{spec.out.h}px
                            </span>
                          )}
                          <span className="text-slate-400"> · {(it.file.size / 1024).toFixed(1)} KB</span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          页面 {Math.round(spec.pt.w)}×{Math.round(spec.pt.h)} pt
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(it.id)}
                            className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-100"
                          >
                            {ui.edit}
                          </button>
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
                    </div>
                  );
                })}
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
                    onChange={(e) => setOrientation(e.target.value as OrientationPreset)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value="auto">{ui.orientationAuto}</option>
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

      {editingItem && (
        <ImageEditorModal
          file={editingItem.file}
          edit={editingItem.edit}
          ui={ui}
          onApply={(edit) => applyEdit(editingItem.id, edit)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

const hexToRgb = (hex: string) => {
  const m = hex.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return { r: 255, g: 255, b: 255 };
  const v = m[1];
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
};
