"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import ToolPageLayout from "../../../components/ToolPageLayout";

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export default function JsonToExcelClient() {
  const [input, setInput] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [fileName, setFileName] = useState("data.xlsx");

  const result = useMemo(() => {
    if (!input.trim()) return { ok: true as const, bytes: null as Uint8Array | null, rows: 0 };
    try {
      const parsed = JSON.parse(input);
      if (!Array.isArray(parsed)) return { ok: false as const, error: "请输入 JSON 数组（数组对象）。" };
      const items = parsed.filter(isRecord);
      if (items.length === 0) return { ok: false as const, error: "数组中未找到对象元素。" };

      const keys = Array.from(new Set(items.flatMap((obj) => Object.keys(obj)))).sort((a, b) => a.localeCompare(b, "en"));
      const normalized = items.map((obj) => {
        const out: Record<string, unknown> = {};
        for (const k of keys) out[k] = k in obj ? obj[k] : null;
        return out;
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(normalized, { header: keys });
      XLSX.utils.book_append_sheet(wb, ws, sheetName.trim() || "Sheet1");
      const array = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      return { ok: true as const, bytes: new Uint8Array(array as ArrayBuffer), rows: normalized.length };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "解析失败" };
    }
  }, [input, sheetName]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const normalizedFileName = fileName.trim().endsWith(".xlsx") ? fileName.trim() : `${fileName.trim() || "data"}.xlsx`;

  const download = () => {
    if (!result.ok || !result.bytes) return;
    const blob = new Blob([toArrayBuffer(result.bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = normalizedFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <ToolPageLayout toolSlug="json-to-excel">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="block text-sm text-slate-700">
                工作表名
                <input
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  className="ml-2 w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <label className="block text-sm text-slate-700">
                文件名
                <input
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="ml-2 w-48 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copy(input)}
                disabled={!input.trim()}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                复制输入
              </button>
              <button
                type="button"
                onClick={download}
                disabled={!result.ok || !result.bytes}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                下载 {normalizedFileName}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">JSON 输入（数组对象）</div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder='[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]'
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              {!result.ok && "error" in result && <div className="mt-2 text-sm text-rose-600">错误：{result.error}</div>}
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">导出状态</div>
              <div className="mt-3 text-sm text-slate-700">
                {result.ok && result.bytes ? (
                  <div>已生成：{result.rows} 行</div>
                ) : (
                  <div className="text-slate-500">输入有效 JSON 后会自动生成 .xlsx。</div>
                )}
              </div>
              <div className="mt-3 text-xs text-slate-500">提示：会自动汇总所有对象的键作为表头，并按字母排序。</div>
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
