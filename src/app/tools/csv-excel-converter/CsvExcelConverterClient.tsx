"use client";

import type { ChangeEvent } from "react";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Mode = "csvToXlsx" | "xlsxToCsv";
type DelimiterOption = "auto" | "," | "\t" | ";" | "|";

const detectDelimiter = (text: string): Exclude<DelimiterOption, "auto"> => {
  const candidates: Array<Exclude<DelimiterOption, "auto">> = [",", "\t", ";", "|"];
  const sampleLines = text.split(/\r?\n/).slice(0, 20).join("\n");

  const score = (delimiter: string) => {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sampleLines.length; i += 1) {
      const ch = sampleLines[i];
      if (ch === '"') inQuotes = !inQuotes;
      if (!inQuotes && ch === delimiter) count += 1;
    }
    return count;
  };

  let best = candidates[0];
  let bestScore = -1;
  for (const d of candidates) {
    const s = score(d);
    if (s > bestScore) {
      bestScore = s;
      best = d;
    }
  }
  return best;
};

const parseCsv = (text: string, delimiter: string, skipEmptyLines: boolean) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    if (skipEmptyLines && row.length === 1 && row[0].trim() === "") {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === delimiter) {
      pushField();
      i += 1;
      continue;
    }

    if (ch === "\n" || ch === "\r") {
      pushField();
      pushRow();
      if (ch === "\r" && text[i + 1] === "\n") i += 2;
      else i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  pushField();
  pushRow();
  return rows;
};

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function CsvExcelConverterClient() {
  const [mode, setMode] = useState<Mode>("csvToXlsx");

  const [csvInput, setCsvInput] = useState("name,age\nAlice,18\nBob,20\n");
  const [csvDelimiter, setCsvDelimiter] = useState<DelimiterOption>("auto");
  const [skipEmptyLines, setSkipEmptyLines] = useState(true);
  const [sheetName, setSheetName] = useState("Sheet1");
  const [error, setError] = useState<string | null>(null);

  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [outDelimiter, setOutDelimiter] = useState<Exclude<DelimiterOption, "auto">>(",");

  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const xlsxFileInputRef = useRef<HTMLInputElement>(null);

  const xlsxToCsvText = useMemo(() => {
    if (!workbook || !activeSheet) return "";
    const sheet = workbook.Sheets[activeSheet];
    if (!sheet) return "";
    return XLSX.utils.sheet_to_csv(sheet, { FS: outDelimiter });
  }, [activeSheet, outDelimiter, workbook]);

  const readXlsx = async (file: File) => {
    setError(null);
    setWorkbook(null);
    setActiveSheet("");
    setXlsxFile(file);
    try {
      const array = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(array, { type: "array" });
      setWorkbook(wb);
      const first = wb.SheetNames[0] ?? "";
      setActiveSheet(first);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取 XLSX 失败");
    }
  };

  const handleCsvFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const text = await selected.text();
    setCsvInput(text);
  };

  const handleXlsxFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    await readXlsx(selected);
  };

  const exportXlsx = async () => {
    setError(null);
    const raw = csvInput;
    if (!raw.trim()) {
      setError("请先输入 CSV 内容");
      return;
    }
    try {
      const actualDelimiter = csvDelimiter === "auto" ? detectDelimiter(raw) : csvDelimiter;
      const rows = parseCsv(raw, actualDelimiter, skipEmptyLines);
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName.trim() || "Sheet1");
      const array = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const blob = new Blob([array], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      downloadBlob("data.xlsx", blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    }
  };

  const exportCsv = () => {
    setError(null);
    if (!xlsxToCsvText.trim()) {
      setError("请先选择 XLSX 文件与工作表");
      return;
    }
    const blob = new Blob([xlsxToCsvText], { type: "text/csv;charset=utf-8" });
    downloadBlob("data.csv", blob);
  };

  const copyCsv = async () => {
    if (!xlsxToCsvText) return;
    await navigator.clipboard.writeText(xlsxToCsvText);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">CSV-Excel 转换器</h1>
        <p className="mt-2 text-sm text-slate-500">CSV ↔ XLSX，纯本地转换</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-2xl bg-slate-100/60 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("csvToXlsx");
                setError(null);
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mode === "csvToXlsx"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              CSV → XLSX
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("xlsxToCsv");
                setError(null);
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mode === "xlsxToCsv"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              XLSX → CSV
            </button>
          </div>
        </div>

        {mode === "csvToXlsx" ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">CSV 输入</div>
              <textarea
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
                className="h-96 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </div>
            <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
              <div className="text-sm font-semibold text-slate-900">导出设置</div>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <div className="text-xs text-slate-500">分隔符</div>
                  <select
                    value={csvDelimiter}
                    onChange={(e) => setCsvDelimiter(e.target.value as DelimiterOption)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value="auto">自动</option>
                    <option value=",">逗号 ,</option>
                    <option value="\t">Tab \\t</option>
                    <option value=";">分号 ;</option>
                    <option value="|">竖线 |</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={skipEmptyLines}
                    onChange={(e) => setSkipEmptyLines(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  忽略空行
                </label>
                <label className="block">
                  <div className="text-xs text-slate-500">工作表名称</div>
                  <input
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  ref={csvFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleCsvFileChange}
                />
                <button
                  type="button"
                  onClick={() => csvFileInputRef.current?.click()}
                  className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 active:scale-[0.99]"
                >
                  选择 CSV 文件
                </button>
                <button
                  type="button"
                  onClick={exportXlsx}
                  className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-[0.99]"
                >
                  下载 XLSX
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
            <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
              <div className="text-sm font-semibold text-slate-900">读取设置</div>
              <div className="mt-3 space-y-3">
                <input
                  ref={xlsxFileInputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={handleXlsxFileChange}
                />
                <button
                  type="button"
                  onClick={() => xlsxFileInputRef.current?.click()}
                  className="w-full rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 active:scale-[0.99]"
                >
                  选择 XLSX 文件
                </button>

                <div className="text-xs text-slate-500">
                  {xlsxFile ? xlsxFile.name : "未选择文件"}
                </div>

                <label className="block">
                  <div className="text-xs text-slate-500">工作表</div>
                  <select
                    value={activeSheet}
                    disabled={!workbook}
                    onChange={(e) => setActiveSheet(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                  >
                    {(workbook?.SheetNames ?? []).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <div className="text-xs text-slate-500">输出分隔符</div>
                  <select
                    value={outDelimiter}
                    onChange={(e) => setOutDelimiter(e.target.value as Exclude<DelimiterOption, "auto">)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value=",">逗号 ,</option>
                    <option value="\t">Tab \\t</option>
                    <option value=";">分号 ;</option>
                    <option value="|">竖线 |</option>
                  </select>
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!xlsxToCsvText}
                    onClick={copyCsv}
                    className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 disabled:opacity-60 active:scale-[0.99]"
                  >
                    复制 CSV
                  </button>
                  <button
                    type="button"
                    disabled={!xlsxToCsvText}
                    onClick={exportCsv}
                    className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60 active:scale-[0.99]"
                  >
                    下载 CSV
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">CSV 输出</div>
              <textarea
                value={xlsxToCsvText}
                readOnly
                placeholder="读取 XLSX 后显示转换结果…"
                className="h-96 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
            </div>
          </div>
        )}

        {error && <div className="mt-4 text-sm text-rose-600">错误：{error}</div>}

        <div className="mt-4 text-xs text-slate-500">
          提示：所有转换均在浏览器本地完成，不上传任何文件。
        </div>
      </div>
    </div>
  );
}

