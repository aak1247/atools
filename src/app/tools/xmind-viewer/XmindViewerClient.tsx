"use client";

import type { ChangeEvent } from "react";
import { unzipSync, strFromU8 } from "fflate";
import { useEffect, useMemo, useRef, useState } from "react";
import XmindMindMapCanvas from "./XmindMindMapCanvas";

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
  source: string | null;
  parseError: string | null;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
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
    if (record.rootTopic && typeof record.rootTopic === "object") return [value as Sheet];
  }
  return [];
};

const getFirstChildElementByLocalName = (el: Element, localName: string): Element | null => {
  for (const child of Array.from(el.children)) {
    if (child.localName === localName) return child;
  }
  return null;
};

const getChildElementsByLocalName = (el: Element, localName: string): Element[] =>
  Array.from(el.children).filter((child) => child.localName === localName);

const getChildTextByLocalName = (el: Element, localName: string): string => {
  const child = getFirstChildElementByLocalName(el, localName);
  return (child?.textContent ?? "").trim();
};

const parseTopicXml = (topicEl: Element): TopicNode => {
  const title = getChildTextByLocalName(topicEl, "title");

  const labelsEl = getFirstChildElementByLocalName(topicEl, "labels");
  const labels = labelsEl
    ? getChildElementsByLocalName(labelsEl, "label")
        .map((labelEl) => (labelEl.textContent ?? "").trim())
        .filter(Boolean)
    : [];

  const notesEl = getFirstChildElementByLocalName(topicEl, "notes");
  const plainEl = notesEl ? getFirstChildElementByLocalName(notesEl, "plain") : null;
  const noteContent = (plainEl?.textContent ?? "").trim();

  const childrenEl = getFirstChildElementByLocalName(topicEl, "children");
  const topicsGroups = childrenEl ? getChildElementsByLocalName(childrenEl, "topics") : [];

  const attached: TopicNode[] = [];
  const detached: TopicNode[] = [];
  for (const groupEl of topicsGroups) {
    const groupType = (groupEl.getAttribute("type") ?? "attached").toLowerCase();
    const topicChildren = getChildElementsByLocalName(groupEl, "topic").map(parseTopicXml);
    if (groupType === "detached") detached.push(...topicChildren);
    else attached.push(...topicChildren);
  }

  const children: TopicNode["children"] = {};
  if (attached.length > 0) children.attached = attached;
  if (detached.length > 0) children.detached = detached;

  return {
    title,
    labels: labels.length > 0 ? labels : undefined,
    notes: noteContent ? { plain: { content: noteContent } } : undefined,
    children: Object.keys(children).length > 0 ? children : undefined,
  };
};

const parseXmindXml = (xmlText: string): Sheet[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return [];

  const sheetEls = Array.from(doc.getElementsByTagNameNS("*", "sheet"));
  return sheetEls.map((sheetEl, index) => {
    const title = getChildTextByLocalName(sheetEl, "title") || `Sheet ${index + 1}`;
    const directTopic = getFirstChildElementByLocalName(sheetEl, "topic");
    const anyTopic = directTopic ?? sheetEl.getElementsByTagNameNS("*", "topic")[0] ?? null;
    const rootTopic = anyTopic ? parseTopicXml(anyTopic) : undefined;
    return { title, rootTopic };
  });
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
  const detached = topic.children?.detached;
  if (Array.isArray(detached) && detached.length > 0) {
    lines.push(`${pad}  - (浮动主题)`);
    for (const child of detached) {
      lines.push(...topicToLines(child, indent + 2));
    }
  }
  return lines;
};

const parseXmind = async (file: File): Promise<ParsedXmind> => {
  const raw = new Uint8Array(await file.arrayBuffer());
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(raw);
  } catch {
    return { entries: [], sheets: [], source: null, parseError: "文件不是有效的 .xmind（zip）或已损坏。" };
  }
  const entryNames = Object.keys(unzipped).sort((a, b) => a.localeCompare(b, "en"));

  const contentJsonKey = entryNames.find((name) => name.toLowerCase().endsWith("content.json")) ?? null;
  if (contentJsonKey) {
    const text = strFromU8(unzipped[contentJsonKey]);
    const parsed = safeJsonParse(text);
    if (!parsed) {
      return {
        entries: entryNames,
        sheets: [],
        source: contentJsonKey,
        parseError: "已找到 content.json，但解析失败（文件可能损坏或编码异常）。",
      };
    }
    const sheets = asSheets(parsed);
    if (sheets.length === 0) {
      return {
        entries: entryNames,
        sheets: [],
        source: contentJsonKey,
        parseError: "已找到 content.json，但未识别出 Sheet 数据（可能是格式差异）。",
      };
    }
    return { entries: entryNames, sheets, source: contentJsonKey, parseError: null };
  }

  const contentXmlKey = entryNames.find((name) => name.toLowerCase().endsWith("content.xml")) ?? null;
  if (contentXmlKey) {
    const text = strFromU8(unzipped[contentXmlKey]);
    const sheets = parseXmindXml(text);
    if (sheets.length === 0) {
      return {
        entries: entryNames,
        sheets: [],
        source: contentXmlKey,
        parseError: "已找到 content.xml，但解析失败（可能是格式差异或文件损坏）。",
      };
    }
    return { entries: entryNames, sheets, source: contentXmlKey, parseError: null };
  }

  return {
    entries: entryNames,
    sheets: [],
    source: null,
    parseError: "未找到 content.json 或 content.xml（可能不是 XMind 文件或格式暂不支持）。",
  };
};

export default function XmindViewerClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedXmind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const copyHintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setActiveSheetIndex(0);
  }, [parsed]);

  useEffect(() => {
    return () => {
      if (copyHintTimerRef.current) window.clearTimeout(copyHintTimerRef.current);
    };
  }, []);

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

  const runParse = async (selected: File) => {
    const looksLikeXmind = /\.xmind$/i.test(selected.name);
    if (!looksLikeXmind) {
      setError("提示：文件后缀不是 .xmind，但仍会尝试解析（如果是改名文件也可以）。");
    }
    setFile(selected);
    setParsed(null);
    setCopyHint(null);
    setIsLoading(true);
    try {
      const next = await parseXmind(selected);
      setParsed(next);
      if (next.parseError) setError(next.parseError);
      else if (looksLikeXmind) setError(null);
      setActiveSheetIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败，请确认文件是 .xmind。");
    } finally {
      setIsLoading(false);
    }
  };

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    await runParse(selected);
  };

  const copy = async () => {
    if (!outline) return;
    try {
      await navigator.clipboard.writeText(outline);
      setCopyHint("已复制");
    } catch {
      setCopyHint("复制失败（请检查浏览器权限/HTTPS 环境）");
    } finally {
      if (copyHintTimerRef.current) window.clearTimeout(copyHintTimerRef.current);
      copyHintTimerRef.current = window.setTimeout(() => setCopyHint(null), 1500);
    }
  };

  const downloadText = (filename: string, text: string, mime: string) => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clear = () => {
    setFile(null);
    setParsed(null);
    setError(null);
    setActiveSheetIndex(0);
    setCopyHint(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-8">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div
          className={[
            "rounded-3xl border border-dashed bg-white p-6 ring-1 ring-slate-200 transition",
            isDragging ? "border-slate-900 bg-slate-50" : "border-slate-200",
          ].join(" ")}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (!dropped) return;
            void runParse(dropped);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">打开 .xmind 文件</div>
              <div className="mt-1 text-xs text-slate-500">拖拽到此处或点击选择文件（本地解析，不上传）</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (inputRef.current) inputRef.current.value = "";
                  inputRef.current?.click();
                }}
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
              <button
                type="button"
                disabled={!outline || !file}
                onClick={() => {
                  if (!outline || !file) return;
                  const base = file.name.replace(/\.xmind$/i, "");
                  downloadText(`${base || "xmind"}.md`, outline + "\n", "text/markdown;charset=utf-8");
                }}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                下载大纲
              </button>
              <button
                type="button"
                disabled={!file && !parsed}
                onClick={clear}
                className="rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
              >
                清除
              </button>
              <input ref={inputRef} type="file" accept=".xmind" className="hidden" onChange={onChange} />
            </div>
          </div>

          {(isLoading || error || copyHint) && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
              {isLoading && <div className="text-slate-600">解析中…</div>}
              {copyHint && <div className="text-slate-600" aria-live="polite">{copyHint}</div>}
              {error && (
                <div className="text-rose-600" aria-live="polite">
                  错误：{error}
                </div>
              )}
            </div>
          )}
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
            rootTopic={activeSheet?.rootTopic ?? null}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">文件信息</div>
              <div className="mt-3 text-sm text-slate-700">
                <div>文件名：{file?.name ?? "-"}</div>
                <div className="mt-1">大小：{file ? formatBytes(file.size) : "-"}</div>
                <div className="mt-1">状态：{isLoading ? "解析中..." : error ? "解析失败" : parsed ? "已解析" : "未解析"}</div>
              </div>
              {parsed && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-slate-900">压缩包条目</div>
                  <div className="mt-2 text-xs text-slate-500">
                    解析来源：<code className="font-mono">{parsed.source ?? "-"}</code>
                  </div>
                  <div className="mt-2 max-h-44 overflow-auto rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
                    {parsed.entries.join("\n")}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-500">
              说明：.xmind 本质是 zip 文件。当前版本支持解析 <code className="font-mono">content.json</code>（新格式）与{" "}
              <code className="font-mono">content.xml</code>（旧格式），并生成大纲与 Canvas 预览。
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
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
          <div className="text-base font-semibold text-slate-900">使用教程</div>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>拖拽或选择一个 <code className="font-mono">.xmind</code> 文件（文件仅在本地浏览器解析，不会上传）。</li>
            <li>如果文件包含多个 Sheet，可在上方下拉框切换。</li>
            <li>Canvas 预览支持：拖拽平移、滚轮缩放、双击/自适应；悬停节点显示完整标题。</li>
            <li>在「大纲预览」中复制或下载 Markdown，方便粘贴到 Obsidian/Notion/飞书文档等。</li>
          </ol>
        </div>

        <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
          <div className="text-base font-semibold text-slate-900">兼容性与常见问题</div>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div>
                  <div className="font-semibold text-slate-900">支持格式</div>
                  <div className="mt-1 text-slate-600">
                    支持 <code className="font-mono">content.json</code>（较新 XMind）与 <code className="font-mono">content.xml</code>（较旧 XMind 8/Classic）。
                    若仍提示无法解析，可尝试在 XMind 中另存为兼容格式后再打开。
                  </div>
                </div>
            <div>
              <div className="font-semibold text-slate-900">为什么看不到内容？</div>
              <div className="mt-1 text-slate-600">
                可能是文件格式较旧、或压缩包内缺少 <code className="font-mono">content.json</code>。你可以先查看左侧「压缩包条目」确认包含哪些文件。
              </div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">隐私说明</div>
              <div className="mt-1 text-slate-600">解析与渲染在本地完成，页面不上传思维导图内容。</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
