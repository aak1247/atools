"use client";

import type { ChangeEvent } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type TocItem = { title: string; page: number };

const parseOutline = (text: string): TocItem[] => {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out: TocItem[] = [];
  for (const line of lines) {
    const m = line.match(/^(\d+)\s*[:\t|]\s*(.+)$/);
    if (m) {
      const page = Number(m[1]);
      const title = m[2].trim();
      if (Number.isFinite(page) && page > 0 && title) out.push({ page, title });
      continue;
    }
    const m2 = line.match(/^(.+?)\s+(\d+)$/);
    if (m2) {
      const title = m2[1].trim();
      const page = Number(m2[2]);
      if (Number.isFinite(page) && page > 0 && title) out.push({ page, title });
    }
  }
  return out;
};

export default function PdfTocGeneratorClient() {
  return (
    <ToolPageLayout toolSlug="pdf-toc-generator" maxWidthClassName="max-w-6xl">
      <PdfTocGeneratorInner />
    </ToolPageLayout>
  );
}

function PdfTocGeneratorInner() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [outline, setOutline] = useState("1\t封面\n2\t前言\n5\t第一章 标题\n");
  const [title, setTitle] = useState("目录");
  const [insertAtBeginning, setInsertAtBeginning] = useState(true);
  const [shiftPageNumbers, setShiftPageNumbers] = useState(true);

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("with-toc.pdf");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  useEffect(() => {
    if (!insertAtBeginning) setShiftPageNumbers(false);
  }, [insertAtBeginning]);

  const items = useMemo(() => parseOutline(outline), [outline]);

  const pick = async (selected: File) => {
    setFile(selected);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    const base = selected.name.replace(/\.pdf$/i, "") || "document";
    setDownloadName(`${base}.toc.pdf`);
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
      setPageCount(doc.getPageCount());
    } catch (e) {
      setPageCount(null);
      setError(e instanceof Error ? e.message : "PDF 解析失败（可能是加密 PDF 或文件损坏）。");
    }
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) void pick(selected);
  };

  const build = async () => {
    if (!file) return;
    setIsWorking(true);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    try {
      const srcBytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(srcBytes, { ignoreEncryption: false });
      const pages = doc.getPages();
      const baseCount = doc.getPageCount();

      const tocFont = await doc.embedFont(StandardFonts.Helvetica);
      const tocFontBold = await doc.embedFont(StandardFonts.HelveticaBold);

      const refPage = pages[0];
      const size = refPage.getSize();
      const marginX = 54;
      const rightPadding = 54;
      const marginBottom = 54;
      const titleY = size.height - 72;
      const titleGap = 34;
      const lineHeight = 14;
      const availableFirst = Math.max(0, Math.floor((titleY - titleGap - marginBottom) / lineHeight));
      const availableNext = Math.max(0, Math.floor((titleY - marginBottom) / lineHeight));
      const pageWidth = size.width;

      const safeItems = items
        .map((it) => ({ ...it, page: clampPage(it.page, baseCount) }))
        .filter((it) => it.title);

      const tocPageCount = (() => {
        if (safeItems.length <= availableFirst) return 1;
        const remaining = safeItems.length - availableFirst;
        if (availableNext <= 0) return 1;
        return 1 + Math.ceil(remaining / availableNext);
      })();

      const tocPages = [];
      if (insertAtBeginning) {
        for (let i = 0; i < tocPageCount; i += 1) tocPages.push(doc.insertPage(i, [size.width, size.height]));
      } else {
        for (let i = 0; i < tocPageCount; i += 1) tocPages.push(doc.addPage([size.width, size.height]));
      }

      for (let i = 0; i < tocPages.length; i += 1) {
        const page = tocPages[i];
        const yTitle = titleY;
        if (i === 0) {
          page.drawText(title || "目录", {
            x: marginX,
            y: yTitle,
            size: 20,
            font: tocFontBold,
            color: rgb(0.06, 0.09, 0.16),
          });
        } else {
          page.drawText(title || "目录", {
            x: marginX,
            y: yTitle,
            size: 14,
            font: tocFontBold,
            color: rgb(0.06, 0.09, 0.16),
          });
        }
      }

      let pageIndex = 0;
      let y = titleY - titleGap;
      for (const it of safeItems) {
        if (pageIndex === 0) {
          if (y <= marginBottom + lineHeight) {
            pageIndex = Math.min(tocPages.length - 1, pageIndex + 1);
            y = titleY - titleGap;
          }
        } else if (y <= marginBottom + lineHeight) {
          pageIndex = Math.min(tocPages.length - 1, pageIndex + 1);
          y = titleY - lineHeight * 2;
        }

        const page = tocPages[pageIndex];
        const outPage = shiftPageNumbers && insertAtBeginning ? it.page + tocPageCount : it.page;
        const pageNumberText = String(outPage);
        const textWidth = tocFont.widthOfTextAtSize(pageNumberText, 11);
        const xNum = pageWidth - rightPadding - textWidth;

        page.drawText(it.title, {
          x: marginX,
          y,
          size: 11,
          font: tocFont,
          color: rgb(0.15, 0.23, 0.34),
        });
        page.drawText(pageNumberText, {
          x: xNum,
          y,
          size: 11,
          font: tocFont,
          color: rgb(0.15, 0.23, 0.34),
        });
        y -= lineHeight;
      }

      const out = await doc.save();
      const url = URL.createObjectURL(new Blob([out], { type: "application/pdf" }));
      setDownloadUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setIsWorking(false);
    }
  };

  const clear = () => {
    setFile(null);
    setPageCount(null);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onChange} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              选择 PDF
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              清空
            </button>
            {file && (
              <div className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{file.name}</span>
                {pageCount != null && <span className="ml-2 text-slate-500">页数：{pageCount}</span>}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void build()}
            disabled={!file || isWorking || items.length === 0}
            className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isWorking ? "生成中…" : "生成目录页"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">目录内容</div>
            <div className="mt-3 text-xs text-slate-500">每行格式：页码 TAB 标题（或 “页码: 标题”）。</div>
            <textarea
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              className="mt-3 h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
            <div className="mt-3 text-xs text-slate-500">已解析 {items.length} 条。</div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">设置</div>
              <div className="mt-4 grid gap-4">
                <label className="block text-sm text-slate-700">
                  目录标题
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={insertAtBeginning}
                    onChange={(e) => setInsertAtBeginning(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  插入到 PDF 首页
                </label>
                <label className={`flex items-center gap-2 text-sm text-slate-700 ${insertAtBeginning ? "" : "opacity-60"}`}>
                  <input
                    type="checkbox"
                    checked={shiftPageNumbers}
                    onChange={(e) => setShiftPageNumbers(e.target.checked)}
                    disabled={!insertAtBeginning}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  目录页码按插入后自动 +1（仅在插入首页时生效）
                </label>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">输出</div>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={downloadName}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    下载 {downloadName}
                  </a>
                )}
              </div>
              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                提示：此工具不会自动识别 PDF 标题层级（纯前端限制）。推荐先用目录大纲/书签信息手动整理页码与标题，再生成目录页插入。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const clampPage = (page: number, pageCount: number) => {
  if (!Number.isFinite(page) || page <= 0) return 1;
  if (!Number.isFinite(pageCount) || pageCount <= 0) return Math.max(1, Math.round(page));
  return Math.min(pageCount, Math.max(1, Math.round(page)));
};
