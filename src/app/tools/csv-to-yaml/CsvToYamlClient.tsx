"use client";

import type { ChangeEvent } from "react";
import { useMemo, useRef, useState } from "react";
import YAML from "yaml";

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

const downloadText = (filename: string, content: string, mime = "text/yaml") => {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function CsvToYamlClient() {
  const [delimiter, setDelimiter] = useState<DelimiterOption>("auto");
  const [hasHeader, setHasHeader] = useState(true);
  const [skipEmptyLines, setSkipEmptyLines] = useState(true);
  const [input, setInput] = useState("name,age\nAlice,18\nBob,20\n");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    const raw = input;
    if (!raw.trim()) return { ok: true as const, yaml: "", actualDelimiter: null as string | null };
    try {
      const actualDelimiter = delimiter === "auto" ? detectDelimiter(raw) : delimiter;
      const rows = parseCsv(raw, actualDelimiter, skipEmptyLines);
      if (rows.length === 0) return { ok: true as const, yaml: "[]", actualDelimiter };

      const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
      const normalizedRows = rows.map((r) => {
        const next = r.slice();
        while (next.length < maxCols) next.push("");
        return next;
      });

      let data: unknown;
      if (hasHeader) {
        const header = normalizedRows[0].map((h, idx) => (h.trim() ? h.trim() : `col${idx + 1}`));
        data = normalizedRows.slice(1).map((r) => {
          const obj: Record<string, string> = {};
          for (let i = 0; i < header.length; i += 1) obj[header[i]] = r[i] ?? "";
          return obj;
        });
      } else {
        data = normalizedRows;
      }

      return { ok: true as const, yaml: YAML.stringify(data), actualDelimiter };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "转换失败" };
    }
  }, [delimiter, hasHeader, input, skipEmptyLines]);

  const copy = async () => {
    if (!parsed.ok) return;
    await navigator.clipboard.writeText(parsed.yaml);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const text = await selected.text();
    setInput(text);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">CSV-YAML 转换器</h1>
        <p className="mt-2 text-sm text-slate-500">支持表头与分隔符识别，纯本地转换</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              分隔符
              <select
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value as DelimiterOption)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
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
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              首行表头
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
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 active:scale-[0.99]"
            >
              选择 CSV 文件
            </button>
            <button
              type="button"
              disabled={!parsed.ok}
              onClick={copy}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 disabled:opacity-60 active:scale-[0.99]"
            >
              复制 YAML
            </button>
            <button
              type="button"
              disabled={!parsed.ok}
              onClick={() => {
                if (!parsed.ok) return;
                downloadText("data.yaml", parsed.yaml);
              }}
              className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 active:scale-[0.99]"
            >
              下载 YAML
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">CSV 输入</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
            <div className="mt-2 text-xs text-slate-500">
              {parsed.ok && parsed.actualDelimiter
                ? `自动识别分隔符：${parsed.actualDelimiter === "\t" ? "\\t" : parsed.actualDelimiter}`
                : "提示：自动模式会尝试识别常见分隔符。"}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">YAML 输出</div>
            <textarea
              value={parsed.ok ? parsed.yaml : ""}
              readOnly
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
            {!parsed.ok && (
              <div className="mt-2 text-sm text-rose-600">错误：{parsed.error}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

