"use client";

import type { ChangeEvent } from "react";
import { unzipSync, strFromU8 } from "fflate";
import { useMemo, useRef, useState } from "react";

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
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedXmind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const outline = useMemo(() => {
    if (!parsed || parsed.sheets.length === 0) return "";
    const lines: string[] = [];
    for (const [index, sheet] of parsed.sheets.entries()) {
      const title = sheet.title?.trim() || `Sheet ${index + 1}`;
      lines.push(`# ${title}`);
      if (sheet.rootTopic) {
        lines.push(...topicToLines(sheet.rootTopic, 0));
      } else {
        lines.push("- (未找到 rootTopic)");
      }
      lines.push("");
    }
    return lines.join("\n").trim();
  }, [parsed]);

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
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">XMind 打开器</h1>
        <p className="mt-2 text-sm text-slate-500">读取 .xmind 文件并生成大纲预览（纯本地处理）</p>
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
                  {parsed ? `${parsed.sheets.length} 个 sheet` : "-"}
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

