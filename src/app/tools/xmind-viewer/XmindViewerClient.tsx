"use client";

import type { ChangeEvent } from "react";
import { unzipSync, strFromU8 } from "fflate";
import { useEffect, useMemo, useRef, useState } from "react";
import XmindMindMapCanvas, { type XmindMindMapCanvasHandle } from "./XmindMindMapCanvas";

type TopicNode = {
  title?: string;
  labels?: string[];
  notes?: { plain?: { content?: string } };
  children?: {
    attached?: TopicNode[];
    detached?: TopicNode[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type Sheet = {
  title?: string;
  rootTopic?: TopicNode;
  [key: string]: unknown;
};

type ParsedXmind = {
  entries: string[];
  sheets: Sheet[];
};

const safeJsonParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const asSheets = (value: unknown): Sheet[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value as Sheet[];
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.sheets)) return record.sheets as Sheet[];
  }
  return [];
};

const topicToLines = (topic: TopicNode, indent: number): string[] => {
  const pad = "  ".repeat(indent);
  const title = (topic.title ?? "").trim() || "(无标题)";
  const labels = Array.isArray(topic.labels) && topic.labels.length > 0 ? ` [${topic.labels.join(", ")}]` : "";
  const lines = [`${pad}- ${title}${labels}`];

  const note = topic.notes?.plain?.content;
  if (typeof note === "string" && note.trim()) {
    lines.push(`${pad}  > ${note.trim().replace(/\s+/g, " ").slice(0, 200)}`);
  }

  const attached = topic.children?.attached;
  if (Array.isArray(attached)) {
    for (const child of attached) {
      lines.push(...topicToLines(child, indent + 1));
    }
  }
  return lines;
};

const parseXmind = async (file: File): Promise<ParsedXmind> => {
  const raw = new Uint8Array(await file.arrayBuffer());
  const unzipped = unzipSync(raw);
  const entryNames = Object.keys(unzipped).sort((a, b) => a.localeCompare(b, "en"));

  const contentJsonKey =
    entryNames.find((name) => name.toLowerCase().endsWith("content.json")) ?? null;
  if (contentJsonKey) {
    const text = strFromU8(unzipped[contentJsonKey]);
    const parsed = safeJsonParse(text);
    const sheets = asSheets(parsed);
    return { entries: entryNames, sheets };
  }

  return { entries: entryNames, sheets: [] };
};

export default function XmindViewerClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<XmindMindMapCanvasHandle>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedXmind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  useEffect(() => {
    setActiveSheetIndex(0);
  }, [parsed?.sheets.length]);

  const activeSheet = useMemo(() => {
    if (!parsed || parsed.sheets.length === 0) return null;
    return parsed.sheets[Math.min(activeSheetIndex, parsed.sheets.length - 1)] ?? null;
  }, [activeSheetIndex, parsed]);

  const outline = useMemo(() => {
    if (!activeSheet) return "";
    const lines: string[] = [];
    const title = activeSheet.title?.trim() || `Sheet ${activeSheetIndex + 1}`;
    lines.push(`# ${title}`);
    if (activeSheet.rootTopic) {
      lines.push(...topicToLines(activeSheet.rootTopic, 0));
    } else {
      lines.push("- (未找到 rootTopic)");
    }
    return lines.join("\n").trim();
  }, [activeSheet, activeSheetIndex]);

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setParsed(null);
    setError(null);
    setIsLoading(true);
    try {
      const next = await parseXmind(selected);
      if (next.sheets.length === 0) {
        setError("未找到可解析的 content.json（目前仅支持较新的 XMind 格式）。");
      }
      setParsed(next);
      setActiveSheetIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败，请确认文件是 .xmind。");
    } finally {
      setIsLoading(false);
    }
  };

  const copy = async () => {
    if (!outline) return;
    await navigator.clipboard.writeText(outline);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">XMind 打开器</h1>
        <p className="mt-2 text-sm text-slate-500">纯前端本地解析 .xmind，支持 Canvas 思维导图大预览与大纲导出</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">选择 .xmind 文件</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              选择文件
            </button>
            <button
              type="button"
              disabled={!outline}
              onClick={() => void copy()}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              复制大纲
            </button>
            <input ref={inputRef} type="file" accept=".xmind" className="hidden" onChange={onChange} />
          </div>
        </div>

        {parsed && parsed.sheets.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Sheet</span>{" "}
              <span className="text-slate-500">（共 {parsed.sheets.length} 个）</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={activeSheetIndex}
                onChange={(e) => setActiveSheetIndex(Number(e.target.value))}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 outline-none"
              >
                {parsed.sheets.map((sheet, index) => (
                  <option key={index} value={index}>
                    {(sheet.title?.trim() || `Sheet ${index + 1}`).slice(0, 80)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="mt-6">
          <XmindMindMapCanvas
            key={`${file?.name ?? "no-file"}:${activeSheetIndex}`}
            ref={canvasRef}
            rootTopic={activeSheet?.rootTopic ?? null}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">文件信息</div>
              <div className="mt-3 text-sm text-slate-700">
                <div>文件名：{file?.name ?? "-"}</div>
                <div className="mt-1">大小：{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "-"}</div>
                <div className="mt-1">状态：{isLoading ? "解析中..." : parsed ? "已解析" : "未解析"}</div>
              </div>
              {parsed && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-slate-900">压缩包条目</div>
                  <div className="mt-2 max-h-44 overflow-auto rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
                    {parsed.entries.join("\n")}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-500">
              说明：.xmind 本质是 zip 文件。当前版本优先读取其中的 <code className="font-mono">content.json</code> 并生成大纲。
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">大纲预览</div>
                <div className="text-xs text-slate-500">
                  {parsed ? `当前：${activeSheet?.title?.trim() || `Sheet ${activeSheetIndex + 1}`}` : "-"}
                </div>
              </div>
              <textarea
                value={outline}
                readOnly
                placeholder="解析后的大纲会显示在这里…"
                className="mt-4 h-96 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
            </div>
            {error && <div className="text-sm text-rose-600">错误：{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
