"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Ui = {
  hint: string;
  pick: string;
  clear: string;
  files: string;
  sheets: string;
  mode: string;
  modeKeepSheets: string;
  modeSingleSheet: string;
  output: string;
  download: string;
  working: string;
  start: string;
  errPickExcel: string;
  note: string;
};

const DEFAULT_UI: Ui = {
  hint: "Excel 合并工具：导入多个 Excel，将所有工作表合并导出（本地处理不上传）。",
  pick: "选择 Excel 文件",
  clear: "清空",
  files: "文件",
  sheets: "工作表",
  mode: "合并模式",
  modeKeepSheets: "保留各自工作表（重命名后追加到新文件）",
  modeSingleSheet: "合并到一个工作表（按行追加，前两列写入来源）",
  output: "输出",
  download: "下载合并后的 Excel",
  working: "处理中…",
  start: "开始合并",
  errPickExcel: "请选择 .xlsx/.xls 文件。",
  note: "提示：复杂格式与跨表公式可能无法完整保持；建议合并后自检。",
};

type Mode = "keep-sheets" | "single-sheet";

type LoadedBook = {
  name: string;
  workbook: XLSX.WorkBook;
};

const sanitizeSheetName = (name: string) =>
  name
    .replace(/[\[\]\*\/\\\?\:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "Sheet";

const uniqueName = (base: string, used: Set<string>) => {
  let name = base;
  let i = 2;
  while (used.has(name)) {
    const suffix = `-${i}`;
    name = sanitizeSheetName(base.slice(0, Math.max(1, 31 - suffix.length)) + suffix);
    i += 1;
  }
  used.add(name);
  return name;
};

export default function ExcelMergerClient() {
  return (
    <ToolPageLayout toolSlug="excel-merger" maxWidthClassName="max-w-5xl">
      {({ config }) => <Inner ui={{ ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) }} />}
    </ToolPageLayout>
  );
}

function Inner({ ui }: { ui: Ui }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = useState<LoadedBook[]>([]);
  const [mode, setMode] = useState<Mode>("keep-sheets");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("merged.xlsx");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const clear = () => {
    setBooks([]);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setDownloadName("merged.xlsx");
  };

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    const next: LoadedBook[] = [];
    for (const file of files) {
      const ok = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");
      if (!ok) {
        setError(ui.errPickExcel);
        continue;
      }
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true, dense: false });
      next.push({ name: file.name, workbook: wb });
    }
    setBooks((prev) => [...prev, ...next]);
    e.target.value = "";
  };

  const totalSheets = useMemo(() => books.reduce((sum, b) => sum + (b.workbook.SheetNames?.length ?? 0), 0), [books]);

  const merge = async () => {
    if (books.length < 2) return;
    setIsWorking(true);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    try {
      const out = XLSX.utils.book_new();
      const used = new Set<string>();

      if (mode === "keep-sheets") {
        for (const b of books) {
          const baseFile = b.name.replace(/\.[^.]+$/u, "") || "workbook";
          for (const sheetName of b.workbook.SheetNames) {
            const sheet = b.workbook.Sheets[sheetName];
            if (!sheet) continue;
            const targetName = uniqueName(sanitizeSheetName(`${baseFile}-${sheetName}`), used);
            XLSX.utils.book_append_sheet(out, sheet, targetName);
          }
        }
      } else {
        const rows: Array<Record<string, unknown>> = [];
        for (const b of books) {
          for (const sheetName of b.workbook.SheetNames) {
            const sheet = b.workbook.Sheets[sheetName];
            if (!sheet) continue;
            const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
            for (const row of json) {
              rows.push({ __file: b.name, __sheet: sheetName, ...row });
            }
          }
        }
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(out, ws, uniqueName("Merged", used));
      }

      const bytes = XLSX.write(out, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName("merged.xlsx");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
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
            onClick={clear}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {ui.clear}
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple className="hidden" onChange={onPick} />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.files}</div>
            <div className="mt-2 text-xs text-slate-600">
              {books.length} · {ui.sheets}: {totalSheets}
            </div>
            <ul className="mt-3 grid gap-2 text-xs text-slate-700">
              {books.map((b) => (
                <li key={b.name} className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                  <div className="truncate" title={b.name}>{b.name}</div>
                  <div className="text-[11px] text-slate-500">{b.workbook.SheetNames.length} {ui.sheets}</div>
                </li>
              ))}
              {!books.length ? <li className="text-slate-500">-</li> : null}
            </ul>
          </div>

          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.mode}</div>
            <div className="mt-3 grid gap-2 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === "keep-sheets"} onChange={() => setMode("keep-sheets")} />
                <span>{ui.modeKeepSheets}</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === "single-sheet"} onChange={() => setMode("single-sheet")} />
                <span>{ui.modeSingleSheet}</span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void merge()}
                disabled={books.length < 2 || isWorking}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isWorking ? ui.working : ui.start}
              </button>
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  {ui.download}
                </a>
              ) : null}
            </div>

            {error ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="mt-4 text-xs text-slate-500">{ui.note}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

