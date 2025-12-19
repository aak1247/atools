"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Scope = "all" | "custom";

type LoadedPdf = {
  id: string;
  name: string;
  size: number;
  bytes: Uint8Array;
  pageCount: number;
  scope: Scope;
  pagesInput: string;
};

const formatSize = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(value)));

const parsePagesInput = (input: string, pageCount: number): number[] => {
  const out: number[] = [];
  const seen = new Set<number>();
  const raw = input.trim();
  if (!raw) return out;

  const tokens = raw
    .split(/[,\s]+/u)
    .map((t) => t.trim())
    .filter(Boolean);

  const push = (page: number) => {
    if (seen.has(page)) return;
    seen.add(page);
    out.push(page);
  };

  for (const token of tokens) {
    if (/^\d+$/u.test(token)) {
      push(clampInt(Number(token), 1, pageCount));
      continue;
    }
    const match = token.match(/^(\d+)?-(\d+)?$/u);
    if (!match) continue;
    const startRaw = match[1] ? Number(match[1]) : 1;
    const endRaw = match[2] ? Number(match[2]) : pageCount;
    if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw)) continue;
    const start = clampInt(Math.min(startRaw, endRaw), 1, pageCount);
    const end = clampInt(Math.max(startRaw, endRaw), 1, pageCount);
    for (let page = start; page <= end; page += 1) push(page);
  }

  return out;
};

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function PdfPageMergerClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<LoadedPdf[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("");

  const cleanupUrl = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  };

  useEffect(() => {
    return () => cleanupUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetAll = () => {
    cleanupUrl();
    setItems([]);
    setIsWorking(false);
    setError(null);
    setDownloadUrl(null);
    setDownloadName("");
  };

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setError(null);
    cleanupUrl();
    setDownloadUrl(null);

    const next: LoadedPdf[] = [];
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const doc = await PDFDocument.load(bytes);
        next.push({
          id: newId(),
          name: file.name,
          size: file.size,
          bytes,
          pageCount: doc.getPageCount(),
          scope: "all",
          pagesInput: "1-",
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : DEFAULT_UI.errParseFailed);
      }
    }

    setItems((prev) => [...prev, ...next]);
    event.target.value = "";
  };

  const move = (id: string, dir: -1 | 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = prev.slice();
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item!);
      return copy;
    });
  };

  const remove = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id));

  const updateItem = (id: string, patch: Partial<LoadedPdf>) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const run = async (ui: Ui) => {
    if (items.length < 2) {
      setError(ui.errNeedTwoFiles);
      return;
    }
    setIsWorking(true);
    setError(null);
    cleanupUrl();
    setDownloadUrl(null);

    try {
      const out = await PDFDocument.create();

      for (const item of items) {
        const src = await PDFDocument.load(item.bytes);
        const pageCount = src.getPageCount();
        const pages =
          item.scope === "all"
            ? Array.from({ length: pageCount }, (_, i) => i + 1)
            : parsePagesInput(item.pagesInput, pageCount);
        if (!pages.length) continue;
        const indices = pages.map((p) => p - 1).filter((idx) => idx >= 0 && idx < pageCount);
        const copied = await out.copyPages(src, indices);
        copied.forEach((p) => out.addPage(p));
      }

      const bytes = await out.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName("merged.pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errMergeFailed);
    } finally {
      setIsWorking(false);
    }
  };

  const totalPages = useMemo(() => items.reduce((sum, x) => sum + x.pageCount, 0), [items]);

  return (
    <ToolPageLayout toolSlug="pdf-page-merger" maxWidthClassName="max-w-5xl">
      {({ config }) => {
        const ui: Ui = { ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) };
        return (
          <div className="w-full px-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.hint}</div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                {ui.pick}
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {ui.clear}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={onFiles}
              />
            </div>

            {items.length ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-700">
                  {ui.files} · {items.length} {ui.fileUnit} · {totalPages} {ui.pageUnit}
                </div>
                <div className="mt-3 grid gap-3">
                  {items.map((item, idx) => (
                    <div key={item.id} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900" title={item.name}>
                            {idx + 1}. {item.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatSize(item.size)} · {item.pageCount} {ui.pageUnit}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => move(item.id, -1)}
                            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {ui.moveUp}
                          </button>
                          <button
                            type="button"
                            onClick={() => move(item.id, 1)}
                            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {ui.moveDown}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(item.id)}
                            className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                          >
                            {ui.remove}
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,160px)_minmax(0,1fr)]">
                        <div className="text-xs font-medium text-slate-700">{ui.scope}</div>
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`scope-${item.id}`}
                              checked={item.scope === "all"}
                              onChange={() => updateItem(item.id, { scope: "all" })}
                            />
                            <span>{ui.all}</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`scope-${item.id}`}
                              checked={item.scope === "custom"}
                              onChange={() => updateItem(item.id, { scope: "custom" })}
                            />
                            <span>{ui.custom}</span>
                          </label>
                          {item.scope === "custom" ? (
                            <input
                              value={item.pagesInput}
                              onChange={(e) => updateItem(item.id, { pagesInput: e.target.value })}
                              placeholder={ui.pagesPlaceholder}
                              className="min-w-[220px] flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                            />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <button
                  type="button"
                  onClick={() => void run(ui)}
                  disabled={isWorking || items.length < 2}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isWorking ? ui.working : ui.start}
                </button>
                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                ) : null}
              </div>

              <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-700">{ui.result}</div>
                <div className="flex flex-wrap gap-2">
                  {downloadUrl ? (
                    <a
                      href={downloadUrl}
                      download={downloadName || "merged.pdf"}
                      className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                    >
                      {ui.download}
                    </a>
                  ) : (
                    <div className="text-sm text-slate-500">{ui.noOutput}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      }}
    </ToolPageLayout>
  );
}

type Ui = {
  hint: string;
  pick: string;
  clear: string;
  files: string;
  fileUnit: string;
  pageUnit: string;
  moveUp: string;
  moveDown: string;
  remove: string;
  scope: string;
  all: string;
  custom: string;
  pagesPlaceholder: string;
  start: string;
  working: string;
  result: string;
  download: string;
  noOutput: string;
  errNeedTwoFiles: string;
  errParseFailed: string;
  errMergeFailed: string;
};

const DEFAULT_UI: Ui = {
  hint: "合并多个 PDF 并调整顺序，可为每个文件设置页码范围，全程本地处理不上传。",
  pick: "选择多个 PDF",
  clear: "清空",
  files: "文件列表",
  fileUnit: "个文件",
  pageUnit: "页",
  moveUp: "上移",
  moveDown: "下移",
  remove: "移除",
  scope: "页码范围",
  all: "全部",
  custom: "指定页码",
  pagesPlaceholder: "例如：1-3,5,10-",
  start: "开始合并",
  working: "处理中…",
  result: "输出结果",
  download: "下载合并后的 PDF",
  noOutput: "暂无输出。",
  errNeedTwoFiles: "请至少选择 2 个 PDF 文件。",
  errParseFailed: "PDF 解析失败。",
  errMergeFailed: "合并失败。",
};
