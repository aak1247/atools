"use client";

import type { DragEvent } from "react";
import { useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import styles from "./DocxPreviewToPdf.module.css";

type Ui = {
  hint: string;
  privacyNote: string;
  dropTitle: string;
  dropSubtitle: string;
  selectFile: string;
  currentFilePrefix: string;
  reselect: string;
  optionsTitle: string;
  optionPageBreaks: string;
  optionHeaders: string;
  optionFooters: string;
  renderButton: string;
  rendering: string;
  previewTitle: string;
  emptyPreview: string;
  exportTitle: string;
  printButton: string;
  printHint: string;
  clear: string;
  errorNotDocx: string;
  errorNothingToPrint: string;
  errorPopupBlocked: string;
  errorRenderFailed: string;
};

const DEFAULT_UI: Ui = {
  hint: "DOCX 预览与转 PDF：纯前端本地渲染（不上传），支持 .docx 文件的快速预览与打印/保存为 PDF。",
  privacyNote: "提示：文件仅在浏览器本地处理，不会上传到服务器。",
  dropTitle: "点击或拖拽 DOCX 文件到此处",
  dropSubtitle: "仅支持 .docx（Word 文档的新格式）；如为 .doc/.wps 请先另存为 .docx 或导出 PDF。",
  selectFile: "选择文件",
  currentFilePrefix: "当前文件：",
  reselect: "重新选择",
  optionsTitle: "渲染选项",
  optionPageBreaks: "分页（接近 Word 的页面效果）",
  optionHeaders: "渲染页眉",
  optionFooters: "渲染页脚",
  renderButton: "渲染预览",
  rendering: "渲染中…",
  previewTitle: "预览",
  emptyPreview: "请选择一个 .docx 文件后渲染预览。",
  exportTitle: "导出 PDF",
  printButton: "打印 / 保存为 PDF",
  printHint: "将弹出系统打印对话框，可选择“另存为 PDF”完成导出。",
  clear: "清空",
  errorNotDocx: "请选择 .docx 文件。",
  errorNothingToPrint: "请先渲染预览后再打印/保存为 PDF。",
  errorPopupBlocked: "无法打开打印窗口：可能被浏览器拦截了弹窗。请允许弹窗后重试，或使用浏览器菜单“打印”。",
  errorRenderFailed: "渲染失败：该文件可能包含不受支持的复杂排版或已损坏。",
};

const isDocxFile = (file: File) => file.name.toLowerCase().endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export default function DocxPreviewToPdfClient() {
  return (
    <ToolPageLayout toolSlug="docx-preview-to-pdf" maxWidthClassName="max-w-6xl">
      {({ config }) => <Inner ui={{ ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) }} />}
    </ToolPageLayout>
  );
}

function Inner({ ui }: { ui: Ui }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);

  const [breakPages, setBreakPages] = useState(true);
  const [renderHeaders, setRenderHeaders] = useState(true);
  const [renderFooters, setRenderFooters] = useState(true);

  const fileLabel = useMemo(() => (file ? file.name : ""), [file]);

  const pickFile = async (next: File | null) => {
    setError(null);
    setFile(next);
    setBuffer(null);
    setHasRendered(false);
    if (previewRef.current) previewRef.current.innerHTML = "";

    if (!next) return;
    if (!isDocxFile(next)) {
      setError(ui.errorNotDocx);
      return;
    }
    try {
      setBuffer(await next.arrayBuffer());
    } catch {
      setError(ui.errorRenderFailed);
    }
  };

  const onRender = async () => {
    if (!buffer || !previewRef.current) return;
    setIsRendering(true);
    setError(null);
    setHasRendered(false);
    try {
      const { renderAsync } = await import("docx-preview");
      previewRef.current.innerHTML = "";
      await renderAsync(buffer, previewRef.current, undefined, {
        inWrapper: true,
        breakPages,
        renderHeaders,
        renderFooters,
        renderFootnotes: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        useBase64URL: true,
      });
      setHasRendered(true);
    } catch {
      setError(ui.errorRenderFailed);
    } finally {
      setIsRendering(false);
    }
  };

  const onClear = () => {
    setFile(null);
    setBuffer(null);
    setError(null);
    setIsRendering(false);
    setIsDragging(false);
    setHasRendered(false);
    if (previewRef.current) previewRef.current.innerHTML = "";
    if (inputRef.current) inputRef.current.value = "";
  };

  const onPrint = () => {
    const html = previewRef.current?.innerHTML ?? "";
    if (!html.trim()) {
      setError(ui.errorNothingToPrint);
      return;
    }

    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      setError(ui.errorPopupBlocked);
      return;
    }

    const title = file?.name ? `${file.name} - PDF` : "DOCX";
    const doc = printWindow.document;
    doc.open();
    doc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      html, body { margin: 0; padding: 0; background: #fff; }
      .docx-wrapper { padding: 0 !important; background: transparent !important; }
      .docx-wrapper > section { box-shadow: none !important; margin: 0 auto !important; border-radius: 0 !important; }
      @page { margin: 0; }
    </style>
  </head>
  <body>
    ${html}
  </body>
</html>`);
    doc.close();

    const trigger = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.onafterprint = () => {
        printWindow.close();
      };
    };

    // Some browsers need a small delay to finish layout before printing.
    setTimeout(trigger, 50);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    void pickFile(f);
  };

  return (
    <div className={`docx-pdf-root w-full px-4 ${styles.root}`}>
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="no-print rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          <div>{ui.hint}</div>
          <div className="mt-1">{ui.privacyNote}</div>
        </div>

        <div className="no-print mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            {!file ? (
              <div
                className={`relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 ${
                  isDragging ? "border-blue-500 bg-blue-50/50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/50"
                }`}
                onClick={() => inputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
                />
                <div className="text-sm font-medium text-slate-700">{ui.dropTitle}</div>
                <div className="mt-1 max-w-[520px] px-4 text-center text-xs text-slate-500">{ui.dropSubtitle}</div>
                <button
                  type="button"
                  className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  {ui.selectFile}
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <div className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">{ui.currentFilePrefix}</span>
                    {fileLabel}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="rounded-xl bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
                    >
                      {ui.reselect}
                    </button>
                    <button
                      type="button"
                      onClick={onClear}
                      className="rounded-xl bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
                    >
                      {ui.clear}
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
                  <div className="text-sm font-semibold text-slate-900">{ui.optionsTitle}</div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={breakPages} onChange={(e) => setBreakPages(e.target.checked)} />
                    {ui.optionPageBreaks}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={renderHeaders} onChange={(e) => setRenderHeaders(e.target.checked)} />
                    {ui.optionHeaders}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={renderFooters} onChange={(e) => setRenderFooters(e.target.checked)} />
                    {ui.optionFooters}
                  </label>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onRender}
                      disabled={!buffer || isRendering}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRendering ? ui.rendering : ui.renderButton}
                    </button>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <div className="text-xs font-semibold text-slate-700">{ui.exportTitle}</div>
                      <button
                        type="button"
                        onClick={onPrint}
                        disabled={!buffer || !hasRendered}
                        className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {ui.printButton}
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">{ui.printHint}</div>

                  {error ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div> : null}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.previewTitle}</div>
            <div className="mt-3 text-xs text-slate-500">{ui.emptyPreview}</div>
          </div>
        </div>

        <div className="print-area mt-5 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <div ref={previewRef} className="docx-preview-scope overflow-auto" />
        </div>
      </div>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
