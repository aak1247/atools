"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { degrees, PDFDocument } from "pdf-lib";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Scope = "all" | "custom";
type Mode = "add" | "set";

type LoadedPdf = {
  name: string;
  size: number;
  bytes: Uint8Array;
  pageCount: number;
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

const normalizeAngle = (value: number) => ((value % 360) + 360) % 360;

export default function PdfRotateClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [pagesInput, setPagesInput] = useState("1-");
  const [mode, setMode] = useState<Mode>("add");
  const [angle, setAngle] = useState(90);

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("");

  const cleanupUrl = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  };

  const resetAll = () => {
    cleanupUrl();
    setPdf(null);
    setScope("all");
    setPagesInput("1-");
    setMode("add");
    setAngle(90);
    setError(null);
    setIsWorking(false);
    setDownloadUrl(null);
    setDownloadName("");
  };

  useEffect(() => {
    return () => cleanupUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    cleanupUrl();
    setDownloadUrl(null);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const doc = await PDFDocument.load(bytes);
      const pageCount = doc.getPageCount();
      setPdf({ name: file.name, size: file.size, bytes, pageCount });
      setPagesInput("1-");
    } catch (e) {
      setPdf(null);
      setError(e instanceof Error ? e.message : DEFAULT_UI.errParseFailed);
    }
  };

  const run = async (ui: Ui) => {
    if (!pdf) return;
    setIsWorking(true);
    setError(null);
    cleanupUrl();
    setDownloadUrl(null);

    try {
      const src = await PDFDocument.load(pdf.bytes);
      const pages = src.getPages();
      const targetPages =
        scope === "all" ? pages.map((_, idx) => idx + 1) : parsePagesInput(pagesInput, pdf.pageCount);

      if (!targetPages.length) {
        throw new Error(ui.errNoValidPages);
      }

      const delta = normalizeAngle(angle);
      for (const pageNo of targetPages) {
        const page = pages[pageNo - 1];
        if (!page) continue;
        const currentAngle = normalizeAngle(page.getRotation().angle ?? 0);
        const nextAngle = mode === "set" ? delta : normalizeAngle(currentAngle + delta);
        page.setRotation(degrees(nextAngle));
      }

      const out = await src.save();
      const blob = new Blob([new Uint8Array(out)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      const base = pdf.name.replace(/\.pdf$/iu, "") || "output";
      setDownloadName(`${base}.rotated.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errRotateFailed);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <ToolPageLayout toolSlug="pdf-rotate" maxWidthClassName="max-w-5xl">
      {({ config }) => {
        const ui: Ui = { ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) };
        return (
          <div className="w-full px-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
              {ui.hint}
            </div>

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
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {pdf ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-medium text-slate-900">{pdf.name}</div>
                <div className="text-xs text-slate-500">
                  {formatSize(pdf.size)} · {pdf.pageCount} {ui.pageUnit}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="grid gap-2">
                  <div className="text-xs font-medium text-slate-700">{ui.scope}</div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} />
                      <span>{ui.all}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="scope" checked={scope === "custom"} onChange={() => setScope("custom")} />
                      <span>{ui.custom}</span>
                    </label>
                  </div>
                  {scope === "custom" ? (
                    <label className="grid gap-1">
                      <span className="text-xs text-slate-600">{ui.pages}</span>
                      <input
                        value={pagesInput}
                        onChange={(e) => setPagesInput(e.target.value)}
                        placeholder={ui.pagesPlaceholder}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                      />
                    </label>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <div className="text-xs font-medium text-slate-700">{ui.mode}</div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="mode" checked={mode === "add"} onChange={() => setMode("add")} />
                      <span>{ui.add}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="mode" checked={mode === "set"} onChange={() => setMode("set")} />
                      <span>{ui.set}</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[90, 180, 270].map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAngle(a)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium ring-1 ${
                          angle === a
                            ? "bg-blue-600 text-white ring-blue-600"
                            : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {a}°
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void run(ui)}
                    disabled={!pdf || isWorking}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isWorking ? ui.working : ui.start}
                  </button>
                </div>

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
                      download={downloadName || "rotated.pdf"}
                      className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                    >
                      {ui.download}
                    </a>
                  ) : (
                    <div className="text-sm text-slate-500">{ui.noOutput}</div>
                  )}
                </div>
                <div className="text-xs text-slate-500">{ui.note}</div>
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
  pageUnit: string;
  scope: string;
  all: string;
  custom: string;
  pages: string;
  pagesPlaceholder: string;
  mode: string;
  add: string;
  set: string;
  start: string;
  working: string;
  result: string;
  download: string;
  noOutput: string;
  note: string;
  errParseFailed: string;
  errNoValidPages: string;
  errRotateFailed: string;
};

const DEFAULT_UI: Ui = {
  hint: "旋转 PDF 页面，全程本地处理，不上传文件。",
  pick: "选择 PDF",
  clear: "清空",
  pageUnit: "页",
  scope: "页面范围",
  all: "全部页面",
  custom: "指定页码",
  pages: "页码",
  pagesPlaceholder: "例如：1-3,5,10-",
  mode: "旋转方式",
  add: "在原角度基础上旋转",
  set: "设置为固定角度",
  start: "开始处理",
  working: "处理中…",
  result: "输出结果",
  download: "下载 PDF",
  noOutput: "暂无输出。",
  note: "提示：页数较多的 PDF 处理时间更长，且会占用更多内存。",
  errParseFailed: "PDF 解析失败。",
  errNoValidPages: "未选择有效页码。",
  errRotateFailed: "旋转失败。",
};
