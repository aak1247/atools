"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Delimiter = "," | "\t" | ";";

const safeJsonParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const flatten = (value: unknown, prefix: string, out: Record<string, unknown>) => {
  if (isRecord(value)) {
    for (const [k, v] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${k}` : k;
      flatten(v, next, out);
    }
    return;
  }
  if (Array.isArray(value)) {
    out[prefix || "value"] = value;
    return;
  }
  out[prefix || "value"] = value;
};

const toCellString = (value: unknown): string => {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const encodeCsvCell = (raw: string, delimiter: Delimiter, quoteAll: boolean) => {
  const needsQuote =
    quoteAll || raw.includes('"') || raw.includes("\n") || raw.includes("\r") || raw.includes(delimiter);
  if (!needsQuote) return raw;
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
};

const buildCsv = (rows: Array<Record<string, unknown>>, delimiter: Delimiter, includeHeader: boolean, quoteAll: boolean) => {
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).sort();
  const lines: string[] = [];
  if (includeHeader) {
    lines.push(columns.map((c) => encodeCsvCell(c, delimiter, quoteAll)).join(delimiter));
  }
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => encodeCsvCell(toCellString(row[c]), delimiter, quoteAll))
        .join(delimiter),
    );
  }
  return { csv: lines.join("\n"), columns, rowCount: rows.length };
};

export default function JsonToCsvClient() {
  const [delimiter, setDelimiter] = useState<Delimiter>(",");
  const [includeHeader, setIncludeHeader] = useState(true);
  const [quoteAll, setQuoteAll] = useState(false);
  const [input, setInput] = useState('[\n  { "id": 1, "name": "Alice", "profile": { "email": "a@example.com" } },\n  { "id": 2, "name": "Bob", "profile": { "email": "b@example.com" } }\n]\n');

  const result = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed) return { ok: true as const, csv: "", columns: 0, rows: 0 };
    const parsed = safeJsonParse(trimmed);
    if (parsed === null && trimmed !== "null") return { ok: false as const, error: "JSON 解析失败，请检查格式。" };

    const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    const rows: Array<Record<string, unknown>> = items.map((item) => {
      if (isRecord(item)) {
        const out: Record<string, unknown> = {};
        flatten(item, "", out);
        return out;
      }
      return { value: item };
    });

    const built = buildCsv(rows, delimiter, includeHeader, quoteAll);
    return { ok: true as const, csv: built.csv, columns: built.columns.length, rows: built.rowCount };
  }, [delimiter, includeHeader, input, quoteAll]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  const download = () => {
    if (!result.ok || !result.csv) return;
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const formatInput = () => {
    const parsed = safeJsonParse(input);
    if (parsed === null && input.trim() !== "null") return;
    setInput(JSON.stringify(parsed, null, 2));
  };

  return (
    <ToolPageLayout toolSlug="json-to-csv">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                分隔符
                <select
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value as Delimiter)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value=",">逗号 ,</option>
                  <option value="\t">Tab</option>
                  <option value=";">分号 ;</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                表头
                <input
                  type="checkbox"
                  checked={includeHeader}
                  onChange={(e) => setIncludeHeader(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                全部加引号
                <input
                  type="checkbox"
                  checked={quoteAll}
                  onChange={(e) => setQuoteAll(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </label>
              <button
                type="button"
                onClick={formatInput}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
              >
                格式化 JSON
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={download}
                disabled={!result.ok || !result.csv}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                下载 CSV
              </button>
              <button
                type="button"
                onClick={() => void copy(result.ok ? result.csv : "")}
                disabled={!result.ok || !result.csv}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                复制 CSV
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">JSON 输入</div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              {!result.ok && <div className="mt-2 text-sm text-rose-600">错误：{result.error}</div>}
              {result.ok && (
                <div className="mt-3 text-xs text-slate-600">
                  列数：{result.columns} · 行数：{result.rows}（对象会按 <span className="font-mono">a.b.c</span> 方式扁平化；数组/复杂值会 JSON.stringify）
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">CSV 输出</div>
              <textarea
                value={result.ok ? result.csv : ""}
                readOnly
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}

