"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import ToolPageLayout from "../../../components/ToolPageLayout";

type OutputMode = "objects" | "matrix";

const DEFAULT_UI = {
  pickFile: "选择 .xlsx",
  replaceFile: "替换 .xlsx",
  copyJson: "复制 JSON",
  downloadJson: "下载 {name}",
  dropHint: "支持点击上传与拖拽上传 XLSX，拖拽可直接替换当前文件。",
  optionsTitle: "选项",
  sheetLabel: "工作表",
  outputModeLabel: "输出模式",
  modeObjects: "数组对象（推荐）",
  modeMatrix: "二维数组（matrix）",
  firstRowHeader: "首行作为字段名",
  skipEmptyRows: "跳过空行",
  emptyAsNull: "空值输出为 null",
  indentLabel: "缩进",
  outputTitle: "JSON 输出",
  errorPrefix: "错误：",
  outputPlaceholder: "转换结果会显示在这里…",
  formulaTip: "提示：含公式的单元格会导出为计算后的值（若有缓存）。",
  errParseFailed: "解析 Excel 失败。",
  errSheetNotFound: "未找到工作表。",
  errConvertFailed: "转换失败。",
} as const;

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 2).replace(/\.00$/, "")} ${units[index]}`;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

export default function ExcelToJsonClient() {
  const config = useOptionalToolConfig("excel-to-json");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState<string>("");

  const [outputMode, setOutputMode] = useState<OutputMode>("objects");
  const [firstRowHeader, setFirstRowHeader] = useState(true);
  const [skipEmptyRows, setSkipEmptyRows] = useState(true);
  const [emptyAsNull, setEmptyAsNull] = useState(true);
  const [indent, setIndent] = useState(2);

  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("data.json");

  const pick = async (selected: File) => {
    setFile(selected);
    setError(null);

    try {
      const buffer = await selected.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      setWorkbook(wb);
      const first = wb.SheetNames[0] ?? "";
      setSheetName(first);
      const base = selected.name.replace(/\.[^.]+$/, "") || "data";
      setDownloadName(`${base}.json`);
    } catch (e) {
      setWorkbook(null);
      setSheetName("");
      setError(e instanceof Error ? e.message : ui.errParseFailed);
    }
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) void pick(selected);
    e.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (!selected) return;
    void pick(selected);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const output = useMemo(() => {
    if (!workbook || !sheetName) return { ok: true as const, text: "", data: null as unknown };
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return { ok: false as const, error: ui.errSheetNotFound, text: "", data: null as unknown };

    try {
      const defval = emptyAsNull ? null : "";
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval }) as unknown[][];
      const normalizedRows = skipEmptyRows
        ? rows.filter((r) => Array.isArray(r) && r.some((cell) => cell !== null && cell !== ""))
        : rows;

      if (outputMode === "matrix") {
        const text = `${JSON.stringify(normalizedRows, null, indent)}\n`;
        return { ok: true as const, text, data: normalizedRows as unknown };
      }

      if (normalizedRows.length === 0) return { ok: true as const, text: "[]\n", data: [] as unknown[] };

      const headerRow = firstRowHeader ? (normalizedRows[0] as unknown[]) : [];
      const headers = firstRowHeader
        ? headerRow.map((h, idx) => {
            const name = typeof h === "string" ? h.trim() : "";
            return name || `col_${idx + 1}`;
          })
        : [];

      const start = firstRowHeader ? 1 : 0;
      const items: Record<string, unknown>[] = [];
      for (let rowIndex = start; rowIndex < normalizedRows.length; rowIndex += 1) {
        const row = normalizedRows[rowIndex] ?? [];
        if (!Array.isArray(row)) continue;
        if (headers.length === 0) {
          const obj: Record<string, unknown> = {};
          for (let c = 0; c < row.length; c += 1) obj[`col_${c + 1}`] = row[c];
          items.push(obj);
        } else {
          const obj: Record<string, unknown> = {};
          for (let c = 0; c < headers.length; c += 1) obj[headers[c]!] = row[c] ?? null;
          items.push(obj);
        }
      }
      const text = `${JSON.stringify(items, null, indent)}\n`;
      return { ok: true as const, text, data: items as unknown };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : ui.errConvertFailed, text: "", data: null as unknown };
    }
  }, [emptyAsNull, firstRowHeader, indent, outputMode, sheetName, skipEmptyRows, ui.errConvertFailed, ui.errSheetNotFound, workbook]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const download = () => {
    if (!output.ok || !output.text) return;
    const bytes = new TextEncoder().encode(output.text);
    const blob = new Blob([toArrayBuffer(bytes)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <ToolPageLayout toolSlug="excel-to-json">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div
            className={`rounded-2xl border-2 border-dashed p-3 transition ${
              isDragging ? "border-slate-400 bg-slate-50/70" : "border-slate-200 bg-slate-50/70"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200"
            >
              {file ? ui.replaceFile : ui.pickFile}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={onChange}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copy(output.ok ? output.text : "")}
                disabled={!output.ok || !output.text}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                {ui.copyJson}
              </button>
              <button
                type="button"
                onClick={download}
                disabled={!output.ok || !output.text}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {ui.downloadJson.replace("{name}", downloadName)}
              </button>
            </div>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {ui.dropHint}
            </div>
          </div>

          {file && (
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
              {file.name}（{formatBytes(file.size)}）
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
              {error}
            </div>
          )}

          {workbook && (
            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.optionsTitle}</div>
                <div className="mt-4 grid gap-3">
                  <label className="block text-sm text-slate-700">
                    {ui.sheetLabel}
                    <select
                      value={sheetName}
                      onChange={(e) => setSheetName(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      {workbook.SheetNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-slate-700">
                    {ui.outputModeLabel}
                    <select
                      value={outputMode}
                      onChange={(e) => setOutputMode(e.target.value as OutputMode)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="objects">{ui.modeObjects}</option>
                      <option value="matrix">{ui.modeMatrix}</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={firstRowHeader}
                      onChange={(e) => setFirstRowHeader(e.target.checked)}
                      disabled={outputMode !== "objects"}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
                    />
                    {ui.firstRowHeader}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={skipEmptyRows}
                      onChange={(e) => setSkipEmptyRows(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {ui.skipEmptyRows}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={emptyAsNull}
                      onChange={(e) => setEmptyAsNull(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {ui.emptyAsNull}
                  </label>
                  <label className="block text-sm text-slate-700">
                    {ui.indentLabel}
                    <select
                      value={indent}
                      onChange={(e) => setIndent(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value={2}>2</option>
                      <option value={4}>4</option>
                      <option value={0}>0</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">{ui.outputTitle}</div>
                  {!output.ok && <div className="text-xs text-rose-600">{ui.errorPrefix}{output.error}</div>}
                </div>
                <textarea
                  value={output.ok ? output.text : ""}
                  readOnly
                  placeholder={ui.outputPlaceholder}
                  className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                />
                <div className="mt-3 text-xs text-slate-500">{ui.formulaTip}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolPageLayout>
  );
}

