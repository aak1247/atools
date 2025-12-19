"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Delimiter = "," | ";" | "\t";

const DEFAULT_UI = {
  pasteOrUpload: "粘贴 CSV 或上传文件",
  upload: "选择 CSV 文件",
  clear: "清空",
  hasHeader: "首行是表头",
  delimiter: "分隔符",
  auto: "自动",
  comma: "逗号 ,",
  semicolon: "分号 ;",
  tab: "Tab \\t",
  stats: "统计信息",
  preview: "表格预览",
  chart: "简单图表",
  xAxis: "X 轴",
  yAxis: "Y 轴（数值列）",
  maxRowsHint: "预览最多显示前 500 行（避免浏览器卡顿）。",
  empty: "请输入或上传 CSV。",
  parseError: "解析失败：请检查分隔符/引号/换行。",
} as const;

type Ui = typeof DEFAULT_UI;

const detectDelimiter = (text: string): Delimiter => {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const counts: Array<[Delimiter, number]> = [
    [",", (line.match(/,/g) || []).length],
    [";", (line.match(/;/g) || []).length],
    ["\t", (line.match(/\t/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] === 0 ? "," : counts[0][0];
};

const parseCsv = (text: string, delimiter: Delimiter): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  const normalized = text.replace(/\r\n/g, "\n");
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = normalized[i + 1];
        if (next === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      pushCell();
      continue;
    }
    if (ch === "\n") {
      pushRow();
      continue;
    }
    cell += ch;
  }
  if (inQuotes) throw new Error("Unclosed quote");
  if (cell.length > 0 || row.length > 0) pushRow();

  const trimmed = rows.filter((r) => r.some((c) => c.trim().length > 0));
  return trimmed;
};

const classifyValue = (raw: string): "empty" | "number" | "boolean" | "date" | "string" => {
  const s = raw.trim();
  if (!s) return "empty";
  if (/^(true|false)$/i.test(s)) return "boolean";
  if (/^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(s)) return "number";
  const d = Date.parse(s);
  if (Number.isFinite(d) && /[-/:]/.test(s)) return "date";
  return "string";
};

const toNumberMaybe = (raw: string): number | null => {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export default function CsvVisualizerClient() {
  return (
    <ToolPageLayout toolSlug="csv-visualizer" maxWidthClassName="max-w-6xl">
      <CsvVisualizerInner />
    </ToolPageLayout>
  );
}

function CsvVisualizerInner() {
  const config = useOptionalToolConfig("csv-visualizer");
  const ui: Ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<Ui>) };

  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [raw, setRaw] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [delimiterMode, setDelimiterMode] = useState<"auto" | Delimiter>("auto");
  const [selectedX, setSelectedX] = useState<string>("__index__");
  const [selectedY, setSelectedY] = useState<string>("");

  const delimiter = useMemo(
    () => (delimiterMode === "auto" ? detectDelimiter(raw) : delimiterMode),
    [delimiterMode, raw],
  );

  const parseResult = useMemo(() => {
    if (!raw.trim()) return { parsed: null as null | { rows: string[][]; header: string[]; body: string[][] }, error: null as string | null };
    try {
      const rows = parseCsv(raw, delimiter);
      if (rows.length === 0) return { parsed: { rows, header: [], body: [] }, error: null };
      const header = hasHeader ? rows[0].map((h, i) => (h.trim() ? h.trim() : `col_${i + 1}`)) : rows[0].map((_, i) => `col_${i + 1}`);
      const body = hasHeader ? rows.slice(1) : rows;
      return { parsed: { rows, header, body }, error: null };
    } catch {
      return { parsed: null, error: ui.parseError };
    }
  }, [delimiter, hasHeader, raw, ui.parseError]);

  const parsed = parseResult.parsed;
  const error = parseResult.error;

  const columns = useMemo(() => {
    if (!parsed) return [];
    const colCount = Math.max(parsed.header.length, ...parsed.body.map((r) => r.length), 0);
    const names = Array.from({ length: colCount }, (_, i) => parsed.header[i] ?? `col_${i + 1}`);

    return names.map((name, idx) => {
      const samples = parsed.body.slice(0, 200).map((r) => r[idx] ?? "");
      const counts = samples.reduce(
        (acc, s) => {
          const k = classifyValue(s);
          acc[k] += 1;
          return acc;
        },
        { empty: 0, number: 0, boolean: 0, date: 0, string: 0 },
      );
      const nonEmpty = samples.length - counts.empty;
      const kind =
        nonEmpty === 0
          ? "empty"
          : counts.number >= nonEmpty * 0.9
            ? "number"
            : counts.boolean >= nonEmpty * 0.9
              ? "boolean"
              : counts.date >= nonEmpty * 0.9
                ? "date"
                : "string";
      return { name, idx, kind };
    });
  }, [parsed]);

  const numericColumns = useMemo(() => columns.filter((c) => c.kind === "number"), [columns]);

  const effectiveSelectedY = selectedY || (numericColumns.length > 0 ? String(numericColumns[0]!.idx) : "");

  const previewRows = useMemo(() => parsed?.body.slice(0, 500) ?? [], [parsed]);

  const summary = useMemo(() => {
    if (!parsed) return null;
    const rowCount = parsed.body.length;
    const colCount = columns.length;
    const numericStats = numericColumns.slice(0, 8).map((col) => {
      const values = parsed.body.map((r) => toNumberMaybe(r[col.idx] ?? "")).filter((n): n is number => n != null);
      if (values.length === 0) return { name: col.name, count: 0, min: null, max: null, mean: null };
      let min = values[0];
      let max = values[0];
      let sum = 0;
      for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
      }
      return { name: col.name, count: values.length, min, max, mean: sum / values.length };
    });
    return { rowCount, colCount, numericStats };
  }, [columns.length, numericColumns, parsed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !parsed || !effectiveSelectedY) return;

    const yIdx = Number(effectiveSelectedY);
    if (!Number.isFinite(yIdx)) return;

    const xIdx = selectedX === "__index__" ? null : Number(selectedX);
    const points: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < Math.min(parsed.body.length, 2000); i += 1) {
      const row = parsed.body[i];
      const y = toNumberMaybe(row[yIdx] ?? "");
      if (y == null) continue;
      let x = i;
      if (xIdx != null && Number.isFinite(xIdx)) {
        const xv = row[xIdx] ?? "";
        const n = toNumberMaybe(xv);
        if (n != null) x = n;
        else {
          const d = Date.parse(xv);
          if (Number.isFinite(d)) x = d;
        }
      }
      points.push({ x, y });
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i += 1) {
      const yy = (h * i) / 5;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
      ctx.stroke();
    }

    if (points.length < 2) return;
    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = 24;
    const sx = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (w - pad * 2);
    const sy = (y: number) => h - pad - ((y - minY) / (maxY - minY || 1)) * (h - pad * 2);

    ctx.strokeStyle = "#10B981";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx(points[0].x), sy(points[0].y));
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(sx(points[i].x), sy(points[i].y));
    ctx.stroke();
  }, [effectiveSelectedY, parsed, selectedX]);

  const clearAll = () => {
    setRaw("");
    setSelectedX("__index__");
    setSelectedY("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setRaw(text);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-900">{ui.pasteOrUpload}</div>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
          >
            {ui.clear}
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="space-y-3">
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="a,b,c\n1,2,3\n4,5,6"
              className="h-52 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onUpload(e)} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                {ui.upload}
              </button>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {ui.hasHeader}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {ui.delimiter}
                <select
                  value={delimiterMode}
                  onChange={(e) => setDelimiterMode(e.target.value as "auto" | Delimiter)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="auto">{ui.auto}</option>
                  <option value=",">{ui.comma}</option>
                  <option value=";">{ui.semicolon}</option>
                  <option value="\t">{ui.tab}</option>
                </select>
              </label>
            </div>
            {error && (
              <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                {error}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.stats}</div>
            {!parsed ? (
              <div className="mt-3 text-sm text-slate-600">{ui.empty}</div>
            ) : (
              <div className="mt-3 space-y-3 text-sm text-slate-700">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                    行数：<span className="font-semibold text-slate-900">{summary?.rowCount ?? 0}</span>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                    列数：<span className="font-semibold text-slate-900">{summary?.colCount ?? 0}</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                  分隔符：<span className="font-mono">{delimiter === "\t" ? "\\t" : delimiter}</span>
                </div>

                {summary?.numericStats?.length ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-700">数值列（最多显示 8 列）</div>
                    {summary.numericStats.map((s) => (
                      <div key={s.name} className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                        <div className="text-xs font-semibold text-slate-900">{s.name}</div>
                        <div className="mt-1 text-[11px] text-slate-600">
                          count {s.count}
                          {s.count > 0 && (
                            <>
                              {" · "}min {s.min}
                              {" · "}max {s.max}
                              {" · "}mean {Number(s.mean?.toFixed(6))}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">未检测到明显的数值列。</div>
                )}
              </div>
            )}
          </div>
        </div>

        {parsed && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{ui.preview}</div>
                <div className="text-xs text-slate-500">{ui.maxRowsHint}</div>
              </div>
              <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl ring-1 ring-slate-200">
                <table className="w-full table-fixed border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-700">
                    <tr>
                      {columns.map((c) => (
                        <th key={c.idx} className="border-b border-slate-200 px-3 py-2">
                          <div className="truncate">{c.name}</div>
                          <div className="mt-0.5 text-[11px] font-normal text-slate-500">{c.kind}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-slate-800">
                    {previewRows.map((r, ri) => (
                      <tr key={ri} className="odd:bg-white even:bg-slate-50/40">
                        {columns.map((c) => (
                          <td key={c.idx} className="border-b border-slate-100 px-3 py-2">
                            <div className="truncate font-mono text-[11px]">{r[c.idx] ?? ""}</div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.chart}</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  {ui.xAxis}
                  <select
                    value={selectedX}
                    onChange={(e) => setSelectedX(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value="__index__">行号（index）</option>
                    {columns.map((c) => (
                      <option key={c.idx} value={String(c.idx)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`block text-sm text-slate-700 ${numericColumns.length ? "" : "opacity-60"}`}>
                  {ui.yAxis}
                  <select
                    value={effectiveSelectedY}
                    onChange={(e) => setSelectedY(e.target.value)}
                    disabled={numericColumns.length === 0}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                  >
                    {numericColumns.map((c) => (
                      <option key={c.idx} value={String(c.idx)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <canvas ref={canvasRef} width={800} height={360} className="h-[260px] w-full rounded-xl bg-white" />
              </div>
              <div className="mt-3 text-xs text-slate-500">
                说明：这是轻量级本地可视化（最多绘制 2000 个点）。需要更复杂的图表可将数据导出到专业工具。
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
