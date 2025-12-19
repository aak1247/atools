"use client";

import type { ChangeEvent } from "react";
import { useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { loadPdfJs, type PdfJsTextItem } from "../../../lib/pdfjs-loader";

type DiffOp =
  | { type: "equal"; value: string }
  | { type: "insert"; value: string }
  | { type: "delete"; value: string };

const splitLines = (text: string): string[] => text.replace(/\r\n/g, "\n").split("\n");

const myersDiffLines = (a: string[], b: string[]): DiffOp[] => {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;

  const v = new Array<number>(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const kIndex = k + offset;
      let x = 0;
      if (k === -d || (k !== d && v[kIndex - 1] < v[kIndex + 1])) x = v[kIndex + 1];
      else x = v[kIndex - 1] + 1;
      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[kIndex] = x;

      if (x >= n && y >= m) {
        const ops: DiffOp[] = [];
        let bx = n;
        let by = m;
        for (let bd = d; bd > 0; bd -= 1) {
          const prevV = trace[bd - 1];
          const curK = bx - by;
          const curKIndex = curK + offset;
          let prevK: number;
          if (curK === -bd || (curK !== bd && prevV[curKIndex - 1] < prevV[curKIndex + 1])) prevK = curK + 1;
          else prevK = curK - 1;

          const prevX = prevV[prevK + offset];
          const prevY = prevX - prevK;

          while (bx > prevX && by > prevY) {
            ops.push({ type: "equal", value: a[bx - 1] });
            bx -= 1;
            by -= 1;
          }
          if (bx === prevX) {
            ops.push({ type: "insert", value: b[prevY] });
            by -= 1;
          } else {
            ops.push({ type: "delete", value: a[prevX] });
            bx -= 1;
          }
        }
        while (bx > 0 && by > 0) {
          ops.push({ type: "equal", value: a[bx - 1] });
          bx -= 1;
          by -= 1;
        }
        while (bx > 0) {
          ops.push({ type: "delete", value: a[bx - 1] });
          bx -= 1;
        }
        while (by > 0) {
          ops.push({ type: "insert", value: b[by - 1] });
          by -= 1;
        }
        ops.reverse();
        return ops;
      }
    }
  }

  return [
    ...a.map((line) => ({ type: "delete" as const, value: line })),
    ...b.map((line) => ({ type: "insert" as const, value: line })),
  ];
};

const buildUnifiedDiff = (ops: DiffOp[], name: string): string => {
  const lines: string[] = [`--- base`, `+++ ${name}`];
  for (const op of ops) {
    if (op.type === "equal") lines.push(` ${op.value}`);
    if (op.type === "delete") lines.push(`-${op.value}`);
    if (op.type === "insert") lines.push(`+${op.value}`);
  }
  return lines.join("\n");
};

type Version = { id: string; name: string; text: string };
type UploadNotice = { tone: "info" | "error"; text: string };

const DEFAULT_UI = {
  ignoreTrailingWhitespace: "忽略行尾空白",
  uploadBaseText: "上传基准文本",
  batchUploadVersions: "批量上传版本",
  addVersion: "添加版本",
  baseContract: "基准合同（Base）",
  versionList: "版本列表",
  clickVersionToViewDiff: "点击版本查看差异",
  deleteCurrentVersion: "删除当前版本",
  currentVersionContent: "当前版本内容：",
  diffPreview: "差异预览（按行）",
  copyUnifiedDiff: "复制 unified diff",
  version: "版本",
  versionPrefix: "版本",
  defaultBaseText: "第一条 甲方...\n第二条 乙方...\n",
  defaultVersionName: "版本",
  defaultVersionText: "第一条 甲方...\n第二条 乙方（修订）...\n第三条 新增条款...\n",
  tip: "提示：此工具适合「对版/条款变更」快速检查；复杂合同建议先做文本化（如复制正文或 OCR），再进行对比。",
  pdfSupportHint: "支持上传 PDF 文件，会自动提取文本后再进行对比（扫描件需先 OCR）。",
  parsingPdf: "正在解析 PDF：{file}",
  parsingPdfDone: "PDF 文本提取完成：{file}",
  parsingPdfFailed: "PDF 解析失败：{file}（请确认不是纯图片扫描件）"
} as const;

type ContractVersionDiffUi = typeof DEFAULT_UI;

const makeId = () => Math.random().toString(16).slice(2);

const pdfItemsToText = (items: PdfJsTextItem[]) =>
  items
    .map((it) => (typeof it.str === "string" ? it.str : ""))
    .join(" ")
    .replace(/\s{2,}/gu, " ")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

const isPdfFile = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

const extractPdfText = async (file: File): Promise<string> => {
  const pdfjs = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const parts: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    if (!page.getTextContent) continue;
    const content = await page.getTextContent();
    const text = pdfItemsToText(content.items ?? []);
    if (text) parts.push(text);
  }
  return parts.join("\n\n").trim();
};

const readFileAsText = async (file: File): Promise<string> => {
  if (isPdfFile(file)) {
    const text = await extractPdfText(file);
    return text || "";
  }
  return file.text();
};

const formatTemplate = (template: string, fileName: string) => template.replaceAll("{file}", fileName);

export default function ContractVersionDiffClient() {
  return (
    <ToolPageLayout toolSlug="contract-version-diff" maxWidthClassName="max-w-6xl">
      <ContractVersionDiffInner />
    </ToolPageLayout>
  );
}

function ContractVersionDiffInner() {
  const config = useOptionalToolConfig("contract-version-diff");
  const ui: ContractVersionDiffUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<ContractVersionDiffUi>) };

  const baseFileRef = useRef<HTMLInputElement>(null);
  const versionsFileRef = useRef<HTMLInputElement>(null);

  const [base, setBase] = useState<string>(ui.defaultBaseText);
  const [versions, setVersions] = useState<Version[]>([
    { id: makeId(), name: `${ui.defaultVersionName}A`, text: ui.defaultVersionText },
  ]);
  const [activeId, setActiveId] = useState<string>(versions[0]?.id ?? "");
  const [ignoreTrailingWhitespace, setIgnoreTrailingWhitespace] = useState(true);
  const [notice, setNotice] = useState<UploadNotice | null>(null);

  const active = useMemo(() => versions.find((v) => v.id === activeId) ?? versions[0] ?? null, [activeId, versions]);

  const diffs = useMemo(() => {
    const a = splitLines(base);
    const normA = ignoreTrailingWhitespace ? a.map((l) => l.replace(/\s+$/g, "")) : a;
    return versions.map((v) => {
      const b = splitLines(v.text);
      const normB = ignoreTrailingWhitespace ? b.map((l) => l.replace(/\s+$/g, "")) : b;
      const ops = myersDiffLines(normA, normB);
      const stats = ops.reduce(
        (acc, op) => {
          if (op.type === "insert") acc.insert += 1;
          if (op.type === "delete") acc.delete += 1;
          if (op.type === "equal") acc.equal += 1;
          return acc;
        },
        { insert: 0, delete: 0, equal: 0 },
      );
      return { id: v.id, name: v.name, ops, stats, unified: buildUnifiedDiff(ops, v.name) };
    });
  }, [base, ignoreTrailingWhitespace, versions]);

  const activeDiff = useMemo(() => diffs.find((d) => d.id === active?.id) ?? null, [active?.id, diffs]);

  const addVersion = () => {
    const id = makeId();
    const next: Version = { id, name: `${ui.versionPrefix}${versions.length + 1}`, text: "" };
    setVersions((prev) => [...prev, next]);
    setActiveId(id);
  };

  const removeVersion = (id: string) => {
    setVersions((prev) => prev.filter((v) => v.id !== id));
    if (activeId === id) setActiveId(versions.find((v) => v.id !== id)?.id ?? "");
  };

  const copyUnified = async () => {
    if (!activeDiff) return;
    await navigator.clipboard.writeText(activeDiff.unified);
  };

  const onBaseUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const pdf = isPdfFile(f);
    try {
      if (pdf) setNotice({ tone: "info", text: formatTemplate(ui.parsingPdf, f.name) });
      const text = await readFileAsText(f);
      setBase(text);
      if (pdf) setNotice({ tone: "info", text: formatTemplate(ui.parsingPdfDone, f.name) });
    } catch (err) {
      console.error(err);
      if (pdf) setNotice({ tone: "error", text: formatTemplate(ui.parsingPdfFailed, f.name) });
    } finally {
      e.target.value = "";
    }
  };

  const onVersionsUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const loaded: Version[] = [];
    for (const f of picked) {
      const pdf = isPdfFile(f);
      try {
        if (pdf) setNotice({ tone: "info", text: formatTemplate(ui.parsingPdf, f.name) });
        const text = await readFileAsText(f);
        if (pdf) setNotice({ tone: "info", text: formatTemplate(ui.parsingPdfDone, f.name) });
        loaded.push({ id: makeId(), name: f.name, text });
      } catch (err) {
        console.error(err);
        if (pdf) setNotice({ tone: "error", text: formatTemplate(ui.parsingPdfFailed, f.name) });
      }
    }
    if (loaded.length > 0) {
      setVersions((prev) => [...prev, ...loaded]);
      if (!activeId && loaded[0]) setActiveId(loaded[0].id);
    }
    e.target.value = "";
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={ignoreTrailingWhitespace}
              onChange={(e) => setIgnoreTrailingWhitespace(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            {ui.ignoreTrailingWhitespace}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={baseFileRef}
              type="file"
              accept=".txt,.md,text/*,.pdf,application/pdf"
              className="hidden"
              onChange={(e) => void onBaseUpload(e)}
            />
            <input
              ref={versionsFileRef}
              type="file"
              multiple
              accept=".txt,.md,text/*,.pdf,application/pdf"
              className="hidden"
              onChange={(e) => void onVersionsUpload(e)}
            />
            <button
              type="button"
              onClick={() => baseFileRef.current?.click()}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {ui.uploadBaseText}
            </button>
            <button
              type="button"
              onClick={() => versionsFileRef.current?.click()}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {ui.batchUploadVersions}
            </button>
            <button
              type="button"
              onClick={addVersion}
              className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              {ui.addVersion}
            </button>
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500">{ui.pdfSupportHint}</div>
        {notice && (
          <div
            className={`mt-4 rounded-2xl px-4 py-3 text-xs ring-1 ${
              notice.tone === "error" ? "bg-rose-50 text-rose-800 ring-rose-100" : "bg-slate-50 text-slate-700 ring-slate-200"
            }`}
          >
            {notice.text}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.baseContract}</div>
            <textarea
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="mt-3 h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">{ui.versionList}</div>
              <div className="text-xs text-slate-500">{ui.clickVersionToViewDiff}</div>
            </div>
            <div className="mt-4 space-y-2">
              {diffs.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setActiveId(d.id)}
                  className={`w-full rounded-2xl px-4 py-3 text-left ring-1 transition ${
                    activeId === d.id ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-800 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-semibold">{d.name}</div>
                    <div className="shrink-0 text-xs opacity-90">
                      +{d.stats.insert} · -{d.stats.delete} · ={d.stats.equal}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {versions.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => removeVersion(activeId)}
                  disabled={versions.length <= 1}
                  className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100 disabled:opacity-60"
                >
                  {ui.deleteCurrentVersion}
                </button>
              </div>
            )}
          </div>
        </div>

        {active && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.currentVersionContent}{active.name}</div>
              <textarea
                value={active.text}
                onChange={(e) =>
                  setVersions((prev) => prev.map((v) => (v.id === active.id ? { ...v, text: e.target.value } : v)))
                }
                className="mt-3 h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{ui.diffPreview}</div>
                <button
                  type="button"
                  onClick={() => void copyUnified()}
                  disabled={!activeDiff}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {ui.copyUnifiedDiff}
                </button>
              </div>
              <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl bg-slate-50 p-4 font-mono text-xs ring-1 ring-slate-200">
                {activeDiff?.ops.map((op, idx) => {
                  const key = `${idx}-${op.type}`;
                  if (op.type === "equal") {
                    return (
                      <div key={key} className="whitespace-pre text-slate-600">
                        <span className="select-none text-slate-400"> </span>
                        {op.value}
                      </div>
                    );
                  }
                  if (op.type === "insert") {
                    return (
                      <div key={key} className="whitespace-pre bg-emerald-50/70 text-emerald-800">
                        <span className="select-none font-bold">+</span>
                        {op.value}
                      </div>
                    );
                  }
                  return (
                    <div key={key} className="whitespace-pre bg-rose-50/70 text-rose-800">
                      <span className="select-none font-bold">-</span>
                      {op.value}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-xs text-slate-500">
                {ui.tip}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
