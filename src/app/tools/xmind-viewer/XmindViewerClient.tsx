"use client";

import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import XmindMindMapCanvas from "./XmindMindMapCanvas";
import type { ViewStateBundle, XmindMindMapCanvasHandle } from "./XmindMindMapCanvas";
import { getTheme, themes } from "./themes";
import type {
  MindMapBoundary,
  MindMapLayoutMode,
  MindMapNode,
  MindMapRelationship,
  MindMapSheet,
  MindMapSummary,
  MindMapThemeId,
} from "./types";

type TopicNode = {
  id?: string;
  title?: string;
  labels?: string[];
  notes?: { plain?: { content?: string } };
  collapsed?: boolean;
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
  structureClass?: string;
  relationships?: MindMapRelationship[];
  boundaries?: MindMapBoundary[];
  summaries?: MindMapSummary[];
  [key: string]: unknown;
};

type ParsedXmind = {
  entries: string[];
  sheets: Sheet[];
  source: string | null;
  parseErrorKey:
    | "invalid_zip"
    | "content_json_parse_failed"
    | "content_json_sheet_not_found"
    | "content_xml_parse_failed"
    | "content_entry_not_found"
    | null;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
};

const sanitizeFilename = (name: string) =>
  name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

type NodeContext = {
  node: MindMapNode;
  parent: MindMapNode | null;
  index: number;
};

type TextViewNodeRow = {
  id: string;
  title: string;
  depth: number;
  isRoot: boolean;
};

type TextDraftRow = {
  title: string;
  depth: number;
};

const TEXT_VIEW_LINE_PREFIX = "- ";

const createNodeWithTitle = (id: string, title = "新节点"): MindMapNode => ({
  id,
  title,
  children: [],
  collapsed: false,
});

const flattenMindMapNodeRows = (root: MindMapNode): TextViewNodeRow[] => {
  const rows: TextViewNodeRow[] = [];
  const walk = (node: MindMapNode, depth: number, isRoot: boolean) => {
    rows.push({
      id: node.id,
      title: node.title,
      depth,
      isRoot,
    });
    for (const child of node.children) {
      walk(child, depth + 1, false);
    }
  };
  walk(root, 0, true);
  return rows;
};

const parseTextDraftRows = (rawText: string, fallbackRootTitle: string): TextDraftRow[] => {
  const lines = rawText.replaceAll("\r\n", "\n").split("\n");
  const rows: TextDraftRow[] = [];
  for (const line of lines) {
    const leading = line.match(/^[\t ]*/)?.[0] ?? "";
    const body = line.slice(leading.length);
    const hasLineMarker = /^(?:[-•])(?:\s|$)/.test(body);
    const withNoMarker = body.replace(/^(?:[-•])\s*/, "");
    const trimmed = withNoMarker.trim();
    if (!trimmed && !hasLineMarker) continue;
    const indentSpaces = Array.from(leading).reduce((sum, char) => (char === "\t" ? sum + 2 : sum + 1), 0);
    const depth = Math.max(0, Math.floor(indentSpaces / 2));
    const title = trimmed || fallbackRootTitle;
    rows.push({ title, depth });
  }
  if (rows.length === 0) {
    rows.push({ title: fallbackRootTitle, depth: 0 });
  }
  rows[0] = { ...rows[0], depth: 0 };
  return rows;
};

const applyIndentationToDraft = (
  value: string,
  start: number,
  end: number,
  outdent: boolean,
): { value: string; start: number; end: number } => {
  const effectiveEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const lineStart = Math.max(0, value.lastIndexOf("\n", Math.max(0, start - 1)) + 1);
  const lineEndIdx = value.indexOf("\n", effectiveEnd);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const segment = value.slice(lineStart, lineEnd);
  const lines = segment.split("\n");

  let removedFromFirst = 0;
  let totalDelta = 0;
  const nextLines = lines.map((line, index) => {
    if (!outdent) {
      totalDelta += 2;
      return `  ${line}`;
    }
    let removed = 0;
    let nextLine = line;
    if (nextLine.startsWith("\t")) {
      nextLine = nextLine.slice(1);
      removed = 1;
    } else if (nextLine.startsWith("  ")) {
      nextLine = nextLine.slice(2);
      removed = 2;
    } else if (nextLine.startsWith(" ")) {
      nextLine = nextLine.slice(1);
      removed = 1;
    }
    if (index === 0) removedFromFirst = removed;
    totalDelta -= removed;
    return nextLine;
  });

  const nextSegment = nextLines.join("\n");
  const nextValue = `${value.slice(0, lineStart)}${nextSegment}${value.slice(lineEnd)}`;

  if (start === end) {
    const nextPos = outdent ? Math.max(lineStart, start - removedFromFirst) : start + 2;
    return { value: nextValue, start: nextPos, end: nextPos };
  }

  const nextStart = Math.max(lineStart, start + (outdent ? -removedFromFirst : 2));
  const nextEnd = Math.max(nextStart, end + totalDelta);
  return { value: nextValue, start: nextStart, end: nextEnd };
};

const findNodeContext = (
  node: MindMapNode,
  targetId: string,
  parent: MindMapNode | null = null,
  index = -1,
  seen: WeakSet<MindMapNode> = new WeakSet(),
): NodeContext | null => {
  if (seen.has(node)) return null;
  seen.add(node);
  if (node.id === targetId) return { node, parent, index };
  for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
    const child = node.children[childIndex]!;
    const nested = findNodeContext(child, targetId, node, childIndex, seen);
    if (nested) return nested;
  }
  return null;
};

const mapNodeById = (
  node: MindMapNode,
  targetId: string,
  updater: (input: MindMapNode) => MindMapNode,
  seen: WeakSet<MindMapNode> = new WeakSet(),
): [MindMapNode, boolean] => {
  if (seen.has(node)) return [node, false];
  seen.add(node);

  if (node.id === targetId) {
    const nextNode = updater(node);
    return [nextNode, nextNode !== node];
  }

  let childChanged = false;
  const nextChildren = [...node.children];
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]!;
    const [mapped, didChange] = mapNodeById(child, targetId, updater, seen);
    if (didChange) childChanged = true;
    if (didChange) {
      nextChildren[index] = mapped;
      break;
    }
  }

  if (childChanged) {
    return [{ ...node, children: nextChildren }, true];
  }

  return [node, false];
};

const removeNodeById = (
  node: MindMapNode,
  targetId: string,
  seen: WeakSet<MindMapNode> = new WeakSet(),
): { node: MindMapNode; removed: boolean; parentId: string | null } => {
  if (seen.has(node)) return { node, removed: false, parentId: null };
  seen.add(node);
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]!;
    if (child.id === targetId) {
      const nextChildren = [...node.children.slice(0, index), ...node.children.slice(index + 1)];
      return { node: { ...node, children: nextChildren }, removed: true, parentId: node.id };
    }

    const nested = removeNodeById(child, targetId, seen);
    if (nested.removed) {
      const nextChildren = node.children.map((item) => (item.id === child.id ? nested.node : item));
      return { node: { ...node, children: nextChildren }, removed: true, parentId: nested.parentId };
    }
  }

  return { node, removed: false, parentId: null };
};

const detachNodeById = (
  node: MindMapNode,
  targetId: string,
  seen: WeakSet<MindMapNode> = new WeakSet(),
): { node: MindMapNode; detached: MindMapNode | null; parentId: string | null } => {
  if (seen.has(node)) return { node, detached: null, parentId: null };
  seen.add(node);
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]!;
    if (child.id === targetId) {
      const nextChildren = [...node.children.slice(0, index), ...node.children.slice(index + 1)];
      return { node: { ...node, children: nextChildren }, detached: child, parentId: node.id };
    }

    const nested = detachNodeById(child, targetId, seen);
    if (nested.detached) {
      const nextChildren = node.children.map((item) => (item.id === child.id ? nested.node : item));
      return { node: { ...node, children: nextChildren }, detached: nested.detached, parentId: nested.parentId };
    }
  }

  return { node, detached: null, parentId: null };
};

const structureClassToLayoutMode = (structureClass: unknown): MindMapLayoutMode => {
  if (typeof structureClass !== "string") return "balanced";
  const normalized = structureClass.toLowerCase();
  if (normalized.includes("supercompactdownvertical") || normalized.includes("super-compact-down-vertical")) {
    return "superCompactDownVertical";
  }
  if (normalized.includes("supercompactright") || normalized.includes("super-compact-right")) return "superCompactRight";
  if (normalized.includes("supercompactdown") || normalized.includes("super-compact-down")) return "superCompactDown";
  if (normalized.includes("compact2")) return "downCompact2";
  if (normalized.includes("compact")) return "downCompact";
  if (normalized.includes("up")) return "up";
  if (normalized.includes("down")) return "down";
  if (normalized.includes("org-chart.up")) return "up";
  if (normalized.includes("org-chart.down")) return "down";
  if (normalized.includes("tree")) return "down";
  if (normalized.includes("org")) return "down";
  if (normalized.includes("left")) return "left";
  if (normalized.includes("right")) return "right";
  if (normalized.includes("map")) return "balanced";
  return "balanced";
};

type EditorSnapshot = {
  sheets: MindMapSheet[];
  activeSheetId: string | null;
  selectedNodeId: string | null;
};

type VersionSnapshot = {
  id: string;
  createdAt: number;
  snapshot: EditorSnapshot;
};

type DraftPayload = {
  version: 2;
  savedAt: number;
  editor: EditorSnapshot;
  versionHistory: VersionSnapshot[];
};

const DRAFT_STORAGE_KEY = "atools:xmind-viewer:draft:v1";
const VIEW_MODE_STORAGE_KEY = "atools:xmind-viewer:viewMode:v1";
const VIEW_OVERRIDES_STORAGE_KEY = "atools:xmind-viewer:viewOverrides:v1";
const DEFAULT_DROP_REPLACE_HINT = "支持拖拽新 .xmind 到此区域直接替换";
const VERSION_HISTORY_LIMIT = 24;
const VERSION_HISTORY_STORAGE_LIMIT = 10;
const DEFAULT_UI = {
  untitled: "(无标题)",
  newNode: "新节点",
  centerTopic: "中心主题",
  sheetPrefix: "画布",
  newCanvasNamePrompt: "新建画布名称",
  renameCanvasPrompt: "重命名画布",
  duplicateCanvasPrompt: "复制画布名称",
  copiedSuffix: " 副本",
  keepOneCanvasAlert: "至少保留一个画布。",
  deleteCanvasConfirm: "确认删除画布",
  fileExtHint: "提示：文件后缀不是 .xmind，但仍会尝试解析（如果是改名文件也可以）。",
  parseFailed: "解析失败，请确认文件是 .xmind。",
  copied: "已复制",
  copyFailed: "复制失败（请检查浏览器权限/HTTPS 环境）",
  exportPngFailed: "导出 PNG 失败",
  exportSvgFailed: "导出 SVG 失败",
  exportPdfFailed: "导出 PDF 失败",
  expand: "展开",
  collapse: "折叠",
  collapseAll: "全部折叠",
  expandAll: "全部展开",
  openFile: "打开 .xmind 文件",
  dropTip: "支持点击上传/点击替换与拖拽上传/拖拽替换（本地解析，不上传）",
  chooseFile: "选择文件",
  replaceFile: "点击替换 .xmind",
  copyOutline: "复制大纲",
  downloadOutline: "下载大纲",
  clear: "清除",
  parsing: "解析中…",
  error: "错误",
  sheetTotalPrefix: "Sheet",
  sheetTotalSuffix: "个",
  newCanvas: "新建画布",
  rename: "重命名",
  duplicate: "复制",
  delete: "删除",
  layoutTitle: "布局模式",
  themeTitle: "主题",
  themePrefix: "主题",
  undo: "撤销",
  redo: "重做",
  collapseExpand: "折叠/展开",
  exportPng: "导出 PNG",
  exportSvg: "导出 SVG",
  exportPdf: "导出 PDF",
  exportXmind: "导出 .xmind",
  panelCanvas: "画布",
  panelLayout: "布局",
  panelTheme: "主题",
  panelExport: "导出",
  panelEdit: "编辑",
  panelNode: "节点",
  panelHistory: "版本历史",
  historyEmpty: "暂无历史快照",
  historyRollback: "回滚",
  historyCurrent: "当前版本",
  relationTitle: "关系线",
  relationTarget: "选择关联节点",
  relationLabel: "关系线标签（可选）",
  relationAdd: "添加关系线",
  relationRemove: "移除",
  relationEmpty: "当前节点暂无关系线",
  relationSelfBlocked: "不能与自己建立关系线",
  relationExists: "关系线已存在",
  boundaryTitle: "边界",
  boundaryLabel: "边界标题（可选）",
  boundaryAdd: "添加边界",
  boundaryRemove: "移除边界",
  summaryTitle: "概要",
  summaryLabel: "概要标题（可选）",
  summaryAdd: "添加概要",
  summaryRemove: "移除概要",
  create: "新建",
  moveUp: "上移",
  moveDown: "下移",
  nodeTitlePlaceholder: "节点标题",
  childNode: "子节点",
  siblingNode: "同级",
  currentNode: "当前",
  noNodeSelected: "未选中节点",
  nodeEditor: "节点编辑",
  selectNodeTip: "请选择一个节点开始编辑。",
  nodeTitleLabel: "节点标题",
  inputNodeTitle: "输入节点标题",
  addChildNode: "添加子节点",
  addSiblingNode: "添加同级",
  deleteNode: "删除节点",
  rootNodeTip: "根节点不能删除，也不能添加同级节点。",
  nodeEditTip: "可编辑选中节点，并进行增删改与折叠。",
  fileInfo: "文件信息",
  fileName: "文件名",
  fileSize: "大小",
  fileStatus: "状态",
  statusParsing: "解析中...",
  statusFailed: "解析失败",
  statusParsed: "已解析",
  statusIdle: "未解析",
  zipEntries: "压缩包条目",
  parseSource: "解析来源",
  noteBlock: "说明：.xmind 本质是 zip 文件。当前版本支持解析 content.json（新格式）与 content.xml（旧格式），支持在 Canvas 中进行基础编辑。",
  outlinePreview: "大纲预览",
  currentSheet: "当前",
  outlinePlaceholder: "解析后的大纲会显示在这里…",
  textViewTitle: "文本视图",
  textViewShortcutHint: "快捷键：Enter 新建同级，Tab 新建子级，Shift+Tab 降一级",
  textViewEmpty: "暂无可编辑节点",
  tutorial: "使用教程",
  tutorial1: "拖拽或选择一个 .xmind 文件（文件仅在本地浏览器解析，不会上传）。",
  tutorial2: "如果文件包含多个 Sheet，可在上方下拉框切换。",
  tutorial3: "Canvas 支持：点击节点选中、点击 +/- 折叠展开、拖拽平移、滚轮缩放、双击自适应。",
  tutorial4: "在左侧「节点编辑」中可改标题、增删节点；支持撤销/重做；编辑会自动保存为本地草稿。",
  tutorial5: "在「大纲预览」中复制或下载 Markdown，方便粘贴到 Obsidian/Notion/飞书文档等。",
  faq: "兼容性与常见问题",
  faqFormat: "支持格式",
  faqFormatDesc: "支持 content.json（较新 XMind）与 content.xml（较旧 XMind 8/Classic）。若仍提示无法解析，可尝试在 XMind 中另存为兼容格式后再打开。",
  faqNoContent: "为什么看不到内容？",
  faqNoContentDesc: "可能是文件格式较旧、或压缩包内缺少 content.json。你可以先查看左侧「压缩包条目」确认包含哪些文件。",
  privacy: "隐私说明",
  privacyDesc: "解析与渲染在本地完成，页面不上传思维导图内容。",
  draftDetected: "检测到上次未完成的本地草稿",
  draftPrompt: "是否恢复继续编辑？（草稿仅保存在本地浏览器）",
  restoreDraft: "恢复草稿",
  ignoreDraft: "忽略",
  deleteDraft: "删除草稿",
  layoutBalanced: "布局：左右均衡",
  layoutRight: "布局：向右",
  layoutLeft: "布局：向左",
  layoutUp: "布局：向上（树形）",
  layoutDown: "布局：向下（树形）",
  layoutDownCompact: "布局：向下紧凑",
  layoutDownCompact2: "布局：向下紧凑2",
  layoutSuperCompactDown: "布局：超级紧凑（向下）",
  layoutSuperCompactRight: "布局：超级紧凑（向右）",
  layoutSuperCompactDownVertical: "布局：超级紧凑（向下竖排）",
  modeRead: "阅读",
  modeEdit: "编辑",
  switchToEditMode: "切换到编辑模式",
  switchToReadMode: "切换到阅读模式",
  switchToMindmapView: "切换到思维导图视图",
  switchToTextView: "切换到文本视图",
  viewMindmap: "思维导图",
  viewTextView: "文本视图",
  parseErrors: {
    invalid_zip: "文件不是有效的 .xmind（zip）或已损坏。",
    content_json_parse_failed: "已找到 content.json，但解析失败（文件可能损坏或编码异常）。",
    content_json_sheet_not_found: "已找到 content.json，但未识别出 Sheet 数据（可能是格式差异）。",
    content_xml_parse_failed: "已找到 content.xml，但解析失败（可能是格式差异或文件损坏）。",
    content_entry_not_found: "未找到 content.json 或 content.xml（可能不是 XMind 文件或格式暂不支持）。",
  },
} as const;

type XmindViewerUi = typeof DEFAULT_UI;

const cloneValue = <T,>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value) as T;
  return JSON.parse(JSON.stringify(value)) as T;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  return Boolean(
    element.closest("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']"),
  );
};

const normalizeEditorSheets = (sheets: MindMapSheet[]): MindMapSheet[] =>
  sheets.map((sheet) => ({
    ...sheet,
    themeId: (sheet as Partial<MindMapSheet>).themeId ?? "classicLight",
    relationships: normalizeRelationships((sheet as Partial<MindMapSheet>).relationships),
    boundaries: normalizeBoundaries((sheet as Partial<MindMapSheet>).boundaries),
    summaries: normalizeSummaries((sheet as Partial<MindMapSheet>).summaries),
  }));

const normalizeEditorSnapshot = (value: unknown): EditorSnapshot | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<EditorSnapshot>;
  if (!Array.isArray(record.sheets)) return null;
  return {
    sheets: normalizeEditorSheets(cloneValue(record.sheets as MindMapSheet[])),
    activeSheetId: typeof record.activeSheetId === "string" || record.activeSheetId === null ? record.activeSheetId : null,
    selectedNodeId: typeof record.selectedNodeId === "string" || record.selectedNodeId === null ? record.selectedNodeId : null,
  };
};

const normalizeVersionHistory = (value: unknown): VersionSnapshot[] => {
  if (!Array.isArray(value)) return [];
  const snapshots: VersionSnapshot[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<VersionSnapshot>;
    const snapshot = normalizeEditorSnapshot(record.snapshot);
    if (!snapshot) continue;
    snapshots.push({
      id: typeof record.id === "string" && record.id ? record.id : `snapshot-${Date.now()}-${snapshots.length + 1}`,
      createdAt: typeof record.createdAt === "number" && Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
      snapshot,
    });
  }
  return snapshots.slice(-VERSION_HISTORY_LIMIT);
};

const getDraftFromStorage = (): DraftPayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as {
      version?: number;
      savedAt?: unknown;
      editor?: unknown;
      versionHistory?: unknown;
    };
    const editor = normalizeEditorSnapshot(record.editor);
    if (!editor) return null;

    if (record.version === 2) {
      return {
        version: 2,
        savedAt: typeof record.savedAt === "number" && Number.isFinite(record.savedAt) ? record.savedAt : Date.now(),
        editor,
        versionHistory: normalizeVersionHistory(record.versionHistory),
      };
    }

    if (record.version === 1) {
      return {
        version: 2,
        savedAt: typeof record.savedAt === "number" && Number.isFinite(record.savedAt) ? record.savedAt : Date.now(),
        editor,
        versionHistory: [],
      };
    }

    return null;
  } catch {
    return null;
  }
};

const saveDraftToStorage = (payload: DraftPayload) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
};

const clearDraftStorage = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const safeJsonParse = (raw: string): unknown => {
  try {
    const normalized = raw.replace(/^\uFEFF/, "");
    return JSON.parse(normalized) as unknown;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object");

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

const looksLikeTopicRecord = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  if (typeof value.title === "string") return true;
  if (typeof value.text === "string") return true;
  if (typeof value.name === "string") return true;
  return false;
};

const looksLikeSheetRecord = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  if (value.class === "sheet") return true;
  if ("rootTopic" in value) return true;
  if ("rootTopicId" in value) return true;
  if ("topic" in value) return true;
  if ("topicId" in value) return true;
  return false;
};

const extractSheetsFromUnknown = (value: unknown, maxDepth = 6): Sheet[] => {
  if (!value || maxDepth <= 0) return [];
  if (Array.isArray(value)) {
    const sheets = value.filter(looksLikeSheetRecord) as Sheet[];
    if (sheets.length > 0) return sheets;
    for (const item of value) {
      const nested = extractSheetsFromUnknown(item, maxDepth - 1);
      if (nested.length > 0) return nested;
    }
    return [];
  }

  if (!isRecord(value)) return [];

  const directKeys = ["sheets", "sheet", "content", "data", "workbook"];
  for (const key of directKeys) {
    const nested = extractSheetsFromUnknown(value[key], maxDepth - 1);
    if (nested.length > 0) return nested;
  }

  if (looksLikeSheetRecord(value)) return [value as Sheet];

  for (const nestedValue of Object.values(value)) {
    const nested = extractSheetsFromUnknown(nestedValue, maxDepth - 1);
    if (nested.length > 0) return nested;
  }

  return [];
};

const buildTopicsById = (value: unknown, maxDepth = 6): Record<string, unknown> => {
  if (!value || maxDepth <= 0) return {};

  if (Array.isArray(value)) {
    const topicMap: Record<string, unknown> = {};
    for (const item of value) {
      if (!isRecord(item)) continue;
      const idValue = item.id;
      if (typeof idValue !== "string" && typeof idValue !== "number") continue;
      if (!looksLikeTopicRecord(item)) continue;
      topicMap[String(idValue)] = item;
    }
    if (Object.keys(topicMap).length > 0) return topicMap;

    for (const item of value) {
      const nested = buildTopicsById(item, maxDepth - 1);
      if (Object.keys(nested).length > 0) return nested;
    }
    return {};
  }

  if (!isRecord(value)) return {};

  const candidates: unknown[] = [];
  if (isRecord(value.topics) || Array.isArray(value.topics)) candidates.push(value.topics);
  if (isRecord(value.topic) || Array.isArray(value.topic)) candidates.push(value.topic);
  if (isRecord(value.resources)) candidates.push(value.resources);

  for (const candidate of candidates) {
    const nested = buildTopicsById(candidate, maxDepth - 1);
    if (Object.keys(nested).length > 0) return nested;

    if (!isRecord(candidate)) continue;
    const entries = Object.entries(candidate);
    if (entries.length === 0) continue;
    const sample = entries.slice(0, 5).map(([, v]) => v);
    if (sample.some(looksLikeTopicRecord)) return candidate;
  }

  for (const nestedValue of Object.values(value)) {
    const nested = buildTopicsById(nestedValue, maxDepth - 1);
    if (Object.keys(nested).length > 0) return nested;
  }

  return {};
};

const resolveTopicValue = (value: unknown, topicsById: Record<string, unknown>): unknown => {
  if (looksLikeTopicRecord(value)) return value;

  if (isRecord(value)) {
    const refId =
      typeof value.id === "string" || typeof value.id === "number"
        ? String(value.id)
        : typeof value.topicId === "string" || typeof value.topicId === "number"
          ? String(value.topicId)
          : null;
    if (refId && topicsById[refId] && isRecord(topicsById[refId])) {
      return { ...(topicsById[refId] as Record<string, unknown>), ...value };
    }
  }

  if (typeof value === "string" || typeof value === "number") {
    const resolved = topicsById[String(value)];
    return resolved ?? null;
  }

  return value;
};

const normalizeLabels = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    const labels = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
    return labels.length > 0 ? labels : undefined;
  }
  if (typeof value === "string") {
    const labels = value
      .split(/[,;\n]/g)
      .map((item) => item.trim())
      .filter(Boolean);
    return labels.length > 0 ? labels : undefined;
  }
  return undefined;
};

const normalizeNoteContent = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (!isRecord(value)) return undefined;
  const plain = value.plain;
  if (typeof plain === "string") return plain.trim() || undefined;
  if (isRecord(plain) && typeof plain.content === "string") return plain.content.trim() || undefined;
  if (typeof value.content === "string") return value.content.trim() || undefined;
  return undefined;
};

const extractChildGroup = (value: unknown, topicsById: Record<string, unknown>): { type: "attached" | "detached"; items: unknown[] }[] => {
  const resolved = resolveTopicValue(value, topicsById);
  if (Array.isArray(resolved)) return [{ type: "attached", items: resolved }];
  if (!isRecord(resolved)) return [];

  const typeRaw = typeof resolved.type === "string" ? resolved.type.toLowerCase() : "";
  const type: "attached" | "detached" = typeRaw.includes("detached") ? "detached" : "attached";

  if (Array.isArray(resolved.topics)) return [{ type, items: resolved.topics }];
  if (Array.isArray(resolved.topic)) return [{ type, items: resolved.topic }];
  if (Array.isArray(resolved.attached)) return [{ type: "attached", items: resolved.attached }];
  if (Array.isArray(resolved.detached)) return [{ type: "detached", items: resolved.detached }];
  return [];
};

const toTopicNode = (rawTopic: unknown, topicsById: Record<string, unknown>, seen: Set<string>): TopicNode => {
  const resolved = resolveTopicValue(rawTopic, topicsById);
  const topicRecord = isRecord(resolved) ? resolved : {};

  const rawId = typeof topicRecord.id === "string" || typeof topicRecord.id === "number" ? String(topicRecord.id) : null;
  if (rawId) {
    if (seen.has(rawId)) {
      return { title: (String(topicRecord.title ?? topicRecord.text ?? topicRecord.name ?? "")).trim() || "(无标题)" };
    }
    seen.add(rawId);
  }

  const titleRaw =
    typeof topicRecord.title === "string"
      ? topicRecord.title
      : typeof topicRecord.text === "string"
        ? topicRecord.text
        : typeof topicRecord.name === "string"
          ? topicRecord.name
          : "";

  const labels = normalizeLabels(topicRecord.labels);
  const noteContent = normalizeNoteContent(topicRecord.notes ?? topicRecord.note);
  const collapsed = Boolean(
    topicRecord.collapsed ?? topicRecord.folded ?? topicRecord.isFolded ?? (topicRecord.branch === "folded"),
  );

  const attached: TopicNode[] = [];
  const detached: TopicNode[] = [];

  const childrenValue = topicRecord.children;
  if (Array.isArray(childrenValue)) {
    for (const item of childrenValue) attached.push(toTopicNode(item, topicsById, seen));
  }
  if (isRecord(childrenValue)) {
    if (Array.isArray(childrenValue.attached)) {
      for (const item of childrenValue.attached) attached.push(toTopicNode(item, topicsById, seen));
    }
    if (Array.isArray(childrenValue.detached)) {
      for (const item of childrenValue.detached) detached.push(toTopicNode(item, topicsById, seen));
    }

    for (const [groupKey, groupValue] of Object.entries(childrenValue)) {
      if (groupKey === "attached" || groupKey === "detached") continue;
      const groups = extractChildGroup(groupValue, topicsById);
      for (const group of groups) {
        for (const item of group.items) {
          if (group.type === "detached") detached.push(toTopicNode(item, topicsById, seen));
          else attached.push(toTopicNode(item, topicsById, seen));
        }
      }
    }
  }

  if (Array.isArray(topicRecord.attached)) {
    for (const item of topicRecord.attached) attached.push(toTopicNode(item, topicsById, seen));
  }
  if (Array.isArray(topicRecord.detached)) {
    for (const item of topicRecord.detached) detached.push(toTopicNode(item, topicsById, seen));
  }

  const resultChildren: TopicNode["children"] = {};
  if (attached.length > 0) resultChildren.attached = attached;
  if (detached.length > 0) resultChildren.detached = detached;

  return {
    id: rawId ?? undefined,
    title: titleRaw.trim() || "(无标题)",
    labels,
    notes: noteContent ? { plain: { content: noteContent } } : undefined,
    collapsed,
    children: Object.keys(resultChildren).length > 0 ? resultChildren : undefined,
  };
};

const ATTOOLS_EXTENSION_PROVIDER = "atools.site";

const extractAtoolsExtensionData = (
  rawTopic: unknown,
  topicsById: Record<string, unknown>,
): {
  layoutMode?: MindMapLayoutMode;
  themeId?: MindMapThemeId;
  relationships?: MindMapRelationship[];
  boundaries?: MindMapBoundary[];
  summaries?: MindMapSummary[];
} => {
  const resolved = resolveTopicValue(rawTopic, topicsById);
  if (!isRecord(resolved)) return {};
  const extensionsValue = resolved.extensions;
  if (!Array.isArray(extensionsValue)) return {};
  for (const extension of extensionsValue) {
    if (!isRecord(extension)) continue;
    if (extension.provider !== ATTOOLS_EXTENSION_PROVIDER) continue;
    const content = extension.content;
    if (typeof content === "string") {
      const parsed = safeJsonParse(content);
      if (!parsed || typeof parsed !== "object") continue;
      const record = parsed as Record<string, unknown>;
      const layoutMode = typeof record.layoutMode === "string" ? (record.layoutMode as MindMapLayoutMode) : undefined;
      const themeId = typeof record.themeId === "string" ? (record.themeId as MindMapThemeId) : undefined;
      const relationships = normalizeRelationships(record.relationships);
      const boundaries = normalizeBoundaries(record.boundaries);
      const summaries = normalizeSummaries(record.summaries);
      return { layoutMode, themeId, relationships, boundaries, summaries };
    }
    if (isRecord(content)) {
      const layoutMode = typeof content.layoutMode === "string" ? (content.layoutMode as MindMapLayoutMode) : undefined;
      const themeId = typeof content.themeId === "string" ? (content.themeId as MindMapThemeId) : undefined;
      const relationships = normalizeRelationships(content.relationships);
      const boundaries = normalizeBoundaries(content.boundaries);
      const summaries = normalizeSummaries(content.summaries);
      return { layoutMode, themeId, relationships, boundaries, summaries };
    }
  }
  return {};
};

const extractSheetTitle = (sheet: Sheet, index: number) => {
  if (typeof sheet.title === "string" && sheet.title.trim()) return sheet.title.trim();
  const record = sheet as Record<string, unknown>;
  if (typeof record.name === "string" && record.name.trim()) return record.name.trim();
  return `Sheet ${index + 1}`;
};

const extractRootTopicRef = (sheet: Sheet): unknown => {
  if (sheet.rootTopic != null) return sheet.rootTopic;
  const record = sheet as Record<string, unknown>;
  if (record.rootTopicId != null) return record.rootTopicId;
  if (record.topic != null) return record.topic;
  if (record.topicId != null) return record.topicId;
  return null;
};

const normalizeSheetsFromContentJson = (content: unknown, topicsById: Record<string, unknown>): Sheet[] => {
  const rawSheets = extractSheetsFromUnknown(content);
  if (rawSheets.length === 0) return [];

  return rawSheets.map((sheet, index) => {
    const title = extractSheetTitle(sheet, index);
    const rootRef = extractRootTopicRef(sheet);
    const rootTopic = rootRef ? toTopicNode(rootRef, topicsById, new Set()) : { title: "中心主题" };
    const sheetRecord = sheet as Record<string, unknown>;
    const resolvedRoot = rootRef ? resolveTopicValue(rootRef, topicsById) : null;
    const resolvedRootRecord = isRecord(resolvedRoot) ? resolvedRoot : null;
    const structureClass =
      typeof sheetRecord.structureClass === "string"
        ? sheetRecord.structureClass
        : typeof resolvedRootRecord?.structureClass === "string"
          ? resolvedRootRecord.structureClass
          : undefined;
    const {
      layoutMode,
      themeId,
      relationships: extensionRelationships,
      boundaries: extensionBoundaries,
      summaries: extensionSummaries,
    } = rootRef ? extractAtoolsExtensionData(rootRef, topicsById) : {};
    const legacyThemeId = typeof sheetRecord.atoolsThemeId === "string" ? (sheetRecord.atoolsThemeId as MindMapThemeId) : undefined;
    const legacyLayoutMode =
      typeof sheetRecord.structureClass === "string" && sheetRecord.structureClass.startsWith("atools:layout:")
        ? (sheetRecord.structureClass.slice("atools:layout:".length) as MindMapLayoutMode)
        : undefined;
    const relationships = normalizeRelationships(sheetRecord.relationships);
    const boundaries = normalizeBoundaries(sheetRecord.boundaries);
    const summaries = normalizeSummaries(sheetRecord.summaries);

    return {
      title,
      rootTopic,
      relationships: relationships.length > 0 ? relationships : extensionRelationships ?? [],
      boundaries: boundaries.length > 0 ? boundaries : extensionBoundaries ?? [],
      summaries: summaries.length > 0 ? summaries : extensionSummaries ?? [],
      structureClass,
      atoolsLayoutMode: layoutMode ?? legacyLayoutMode,
      atoolsThemeId: themeId ?? legacyThemeId,
    };
  });
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
    id: topicEl.getAttribute("id") ?? undefined,
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

const mindMapNodeToLines = (topic: MindMapNode, indent: number): string[] => {
  const pad = "  ".repeat(indent);
  const title = topic.title.trim() || "(无标题)";
  const labels = Array.isArray(topic.labels) && topic.labels.length > 0 ? ` [${topic.labels.join(", ")}]` : "";
  const lines = [`${pad}- ${title}${labels}`];

  const note = topic.notes?.plain?.content;
  if (typeof note === "string" && note.trim()) {
    lines.push(`${pad}  > ${note.trim().replace(/\s+/g, " ").slice(0, 200)}`);
  }

  for (const child of topic.children) {
    lines.push(...mindMapNodeToLines(child, indent + 1));
  }
  return lines;
};

const normalizeRelationships = (value: unknown): MindMapRelationship[] => {
  if (!Array.isArray(value)) return [];
  const result: MindMapRelationship[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) continue;
    const fromId =
      typeof item.end1Id === "string"
        ? item.end1Id
        : typeof item.fromId === "string"
          ? item.fromId
          : typeof item.sourceId === "string"
            ? item.sourceId
            : "";
    const toId =
      typeof item.end2Id === "string"
        ? item.end2Id
        : typeof item.toId === "string"
          ? item.toId
          : typeof item.targetId === "string"
            ? item.targetId
            : "";
    if (!fromId || !toId || fromId === toId) continue;
    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id
        : `${fromId}:${toId}:${index}`;
    const title =
      typeof item.title === "string"
        ? item.title
        : typeof item.label === "string"
          ? item.label
          : undefined;
    result.push({ id, fromId, toId, title: title?.trim() || undefined });
  }
  return result;
};

const normalizeBoundaries = (value: unknown): MindMapBoundary[] => {
  if (!Array.isArray(value)) return [];
  const result: MindMapBoundary[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) continue;
    const nodeId =
      typeof item.nodeId === "string"
        ? item.nodeId
        : typeof item.topicId === "string"
          ? item.topicId
          : typeof item.targetId === "string"
            ? item.targetId
            : "";
    if (!nodeId) continue;
    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id
        : `boundary:${nodeId}:${index}`;
    const title =
      typeof item.title === "string"
        ? item.title
        : typeof item.name === "string"
          ? item.name
          : typeof item.label === "string"
            ? item.label
            : undefined;
    result.push({ id, nodeId, title: title?.trim() || undefined });
  }
  return result;
};

const normalizeSummaries = (value: unknown): MindMapSummary[] => {
  if (!Array.isArray(value)) return [];
  const result: MindMapSummary[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) continue;
    const nodeId =
      typeof item.nodeId === "string"
        ? item.nodeId
        : typeof item.topicId === "string"
          ? item.topicId
          : typeof item.targetId === "string"
            ? item.targetId
            : typeof item.rangeNodeId === "string"
              ? item.rangeNodeId
              : "";
    if (!nodeId) continue;
    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id
        : `summary:${nodeId}:${index}`;
    const title =
      typeof item.title === "string"
        ? item.title
        : typeof item.name === "string"
          ? item.name
          : typeof item.label === "string"
            ? item.label
            : undefined;
    result.push({ id, nodeId, title: title?.trim() || undefined });
  }
  return result;
};

const collectNodeIds = (node: MindMapNode | null): Set<string> => {
  const ids = new Set<string>();
  const walk = (current: MindMapNode | null) => {
    if (!current) return;
    ids.add(current.id);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return ids;
};

const filterRelationshipsByNodeIds = (
  relationships: MindMapRelationship[] | undefined,
  nodeIds: Set<string>,
): MindMapRelationship[] => {
  if (!relationships || relationships.length === 0) return [];
  return relationships.filter(
    (relation) =>
      relation.fromId !== relation.toId &&
      nodeIds.has(relation.fromId) &&
      nodeIds.has(relation.toId),
  );
};

const filterBoundariesByNodeIds = (
  boundaries: MindMapBoundary[] | undefined,
  nodeIds: Set<string>,
): MindMapBoundary[] => {
  if (!boundaries || boundaries.length === 0) return [];
  return boundaries.filter((boundary) => nodeIds.has(boundary.nodeId));
};

const filterSummariesByNodeIds = (
  summaries: MindMapSummary[] | undefined,
  nodeIds: Set<string>,
): MindMapSummary[] => {
  if (!summaries || summaries.length === 0) return [];
  return summaries.filter((summary) => nodeIds.has(summary.nodeId));
};

const topicNodeToMindMapNode = (topic: TopicNode, createId: () => string): MindMapNode => {
  const attached = topic.children?.attached ?? [];
  const detached = topic.children?.detached ?? [];
  const children = [...attached, ...detached].map((child) => topicNodeToMindMapNode(child, createId));

  return {
    id: topic.id ?? createId(),
    title: (topic.title ?? "").trim() || "(无标题)",
    labels: topic.labels && topic.labels.length > 0 ? [...topic.labels] : undefined,
    notes: topic.notes?.plain?.content ? { plain: { content: topic.notes.plain.content } } : undefined,
    children,
    collapsed: Boolean(topic.collapsed),
  };
};

const cloneMindMapNodeWithNewIds = (
  node: MindMapNode,
  createId: () => string,
  idMap: Map<string, string>,
): MindMapNode => {
  const nextId = createId();
  idMap.set(node.id, nextId);
  return {
    ...node,
    id: nextId,
    children: node.children.map((child) => cloneMindMapNodeWithNewIds(child, createId, idMap)),
  };
};

const remapRelationships = (
  relationships: MindMapRelationship[] | undefined,
  idMap: Map<string, string>,
): MindMapRelationship[] => {
  if (!relationships || relationships.length === 0) return [];
  const remapped: MindMapRelationship[] = [];
  for (const relation of relationships) {
    const fromId = idMap.get(relation.fromId);
    const toId = idMap.get(relation.toId);
    if (!fromId || !toId || fromId === toId) continue;
    remapped.push({
      ...relation,
      id: `${fromId}:${toId}:${relation.id}`,
      fromId,
      toId,
    });
  }
  return remapped;
};

const remapBoundaries = (
  boundaries: MindMapBoundary[] | undefined,
  idMap: Map<string, string>,
): MindMapBoundary[] => {
  if (!boundaries || boundaries.length === 0) return [];
  const remapped: MindMapBoundary[] = [];
  for (const boundary of boundaries) {
    const nodeId = idMap.get(boundary.nodeId);
    if (!nodeId) continue;
    remapped.push({
      ...boundary,
      id: `${nodeId}:${boundary.id}`,
      nodeId,
    });
  }
  return remapped;
};

const remapSummaries = (
  summaries: MindMapSummary[] | undefined,
  idMap: Map<string, string>,
): MindMapSummary[] => {
  if (!summaries || summaries.length === 0) return [];
  const remapped: MindMapSummary[] = [];
  for (const summary of summaries) {
    const nodeId = idMap.get(summary.nodeId);
    if (!nodeId) continue;
    remapped.push({
      ...summary,
      id: `${nodeId}:${summary.id}`,
      nodeId,
    });
  }
  return remapped;
};

const setCollapseForAll = (node: MindMapNode, collapsed: boolean): MindMapNode => ({
  ...node,
  collapsed: node.children.length > 0 ? collapsed : false,
  children: node.children.map((child) => setCollapseForAll(child, collapsed)),
});

const hasAnyExpandedBranch = (node: MindMapNode): boolean => {
  if (node.children.length > 0 && !node.collapsed) return true;
  return node.children.some((child) => hasAnyExpandedBranch(child));
};

const normalizeToMindMapSheets = (
  sheets: Sheet[],
  createId: () => string,
  fallbackRootTitle = "中心主题",
): MindMapSheet[] => {
  if (sheets.length === 0) {
    const rootTopic = createNodeWithTitle(createId(), fallbackRootTitle);
    return [
      {
        id: createId(),
        title: "Sheet 1",
        rootTopic,
        layoutMode: "balanced",
        themeId: "classicLight",
        relationships: [],
        boundaries: [],
        summaries: [],
      },
    ];
  }

  return sheets.map((sheet, index) => {
    const rootTopic = sheet.rootTopic
      ? topicNodeToMindMapNode(sheet.rootTopic, createId)
      : createNodeWithTitle(createId(), fallbackRootTitle);
    const nodeIds = collectNodeIds(rootTopic);
    const rawRelationships = normalizeRelationships((sheet as Record<string, unknown>).relationships);
    const rawBoundaries = normalizeBoundaries((sheet as Record<string, unknown>).boundaries);
    const rawSummaries = normalizeSummaries((sheet as Record<string, unknown>).summaries);
    return {
      id: createId(),
      title: extractSheetTitle(sheet, index),
      rootTopic,
      layoutMode:
        typeof (sheet as Record<string, unknown>).atoolsLayoutMode === "string"
          ? ((sheet as Record<string, unknown>).atoolsLayoutMode as MindMapLayoutMode)
          : structureClassToLayoutMode(sheet.structureClass),
      themeId:
        typeof (sheet as Record<string, unknown>).atoolsThemeId === "string"
          ? ((sheet as Record<string, unknown>).atoolsThemeId as MindMapThemeId)
          : "classicLight",
      relationships: filterRelationshipsByNodeIds(rawRelationships, nodeIds),
      boundaries: filterBoundariesByNodeIds(rawBoundaries, nodeIds),
      summaries: filterSummariesByNodeIds(rawSummaries, nodeIds),
    };
  });
};

const parseXmind = async (file: File): Promise<ParsedXmind> => {
  const raw = new Uint8Array(await file.arrayBuffer());
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(raw);
  } catch {
    return { entries: [], sheets: [], source: null, parseErrorKey: "invalid_zip" };
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
        parseErrorKey: "content_json_parse_failed",
      };
    }
    const topicsById = buildTopicsById(parsed);
    const normalizedSheets = normalizeSheetsFromContentJson(parsed, topicsById);
    const sheets =
      normalizedSheets.length > 0
      ? normalizedSheets
        : asSheets(parsed).map((sheet, index) => {
            const rootRef = extractRootTopicRef(sheet);
            const {
              layoutMode,
              themeId,
              relationships: extensionRelationships,
              boundaries: extensionBoundaries,
              summaries: extensionSummaries,
            } = rootRef ? extractAtoolsExtensionData(rootRef, topicsById) : {};
            const sheetRecord = sheet as Record<string, unknown>;
            const relationships = normalizeRelationships(sheetRecord.relationships);
            const boundaries = normalizeBoundaries(sheetRecord.boundaries);
            const summaries = normalizeSummaries(sheetRecord.summaries);
            return {
              title: extractSheetTitle(sheet, index),
              rootTopic: rootRef ? toTopicNode(rootRef, topicsById, new Set()) : { title: "中心主题" },
              relationships: relationships.length > 0 ? relationships : extensionRelationships ?? [],
              boundaries: boundaries.length > 0 ? boundaries : extensionBoundaries ?? [],
              summaries: summaries.length > 0 ? summaries : extensionSummaries ?? [],
              structureClass:
                typeof (sheet as Sheet).structureClass === "string" ? (sheet as Sheet).structureClass : undefined,
              atoolsLayoutMode: layoutMode,
              atoolsThemeId: themeId,
            };
          });
    if (sheets.length === 0) {
      return {
        entries: entryNames,
        sheets: [],
        source: contentJsonKey,
        parseErrorKey: "content_json_sheet_not_found",
      };
    }
    return { entries: entryNames, sheets, source: contentJsonKey, parseErrorKey: null };
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
        parseErrorKey: "content_xml_parse_failed",
      };
    }
    return { entries: entryNames, sheets, source: contentXmlKey, parseErrorKey: null };
  }

  return {
    entries: entryNames,
    sheets: [],
    source: null,
    parseErrorKey: "content_entry_not_found",
  };
};

export default function XmindViewerClient() {
  const providedConfig = useOptionalToolConfig("xmind-viewer");
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasHandleRef = useRef<XmindMindMapCanvasHandle>(null);
  const idCounterRef = useRef(0);
  const isEnglish = providedConfig?.lang?.toLowerCase().startsWith("en") ?? false;
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedXmind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [editorSheets, setEditorSheets] = useState<MindMapSheet[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationTitleInput, setRelationTitleInput] = useState("");
  const [boundaryTitleInput, setBoundaryTitleInput] = useState("");
  const [summaryTitleInput, setSummaryTitleInput] = useState("");
  const [canvasViewResetKey, setCanvasViewResetKey] = useState(0);
  const copyHintTimerRef = useRef<number | null>(null);
  const textViewTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [textViewDraft, setTextViewDraft] = useState("");
  const [isTextViewEditing, setIsTextViewEditing] = useState(false);
  const textViewEditSessionRef = useRef<{ hasPushedHistory: boolean }>({ hasPushedHistory: false });
  const titleEditSessionRef = useRef<{ nodeId: string | null; hasPushedHistory: boolean }>({
    nodeId: null,
    hasPushedHistory: false,
  });

  const historyRef = useRef<{ past: EditorSnapshot[]; future: EditorSnapshot[] }>({ past: [], future: [] });
  const [historyTick, setHistoryTick] = useState(0);
  const versionHistoryRef = useRef<VersionSnapshot[]>([]);
  const snapshotCounterRef = useRef(0);
  const [versionHistoryTick, setVersionHistoryTick] = useState(0);

  const [draftStatus, setDraftStatus] = useState<"idle" | "available" | "dismissed">("idle");
  const draftRef = useRef<DraftPayload | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);

  const sheetViewByIdRef = useRef<Record<string, ViewStateBundle>>({});
  const ui: XmindViewerUi = useMemo(() => {
    const customUi = (providedConfig?.ui ?? {}) as Partial<XmindViewerUi>;
    return {
      ...DEFAULT_UI,
      ...customUi,
      parseErrors: {
        ...DEFAULT_UI.parseErrors,
        ...(customUi.parseErrors ?? {}),
      },
    };
  }, [providedConfig?.ui]);
  const [viewerMode, setViewerMode] = useState<"edit" | "read">("edit");
  const [fullscreenPrimaryView, setFullscreenPrimaryView] = useState<"mindmap" | "text">("mindmap");
  const isReadMode = viewerMode === "read";
  const isFullscreenTextView = fullscreenPrimaryView === "text";
  const [viewOverridesBySheetId, setViewOverridesBySheetId] = useState<
    Record<string, { layoutMode?: MindMapLayoutMode; themeId?: MindMapThemeId }>
  >({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const modeRaw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (modeRaw === "read" || modeRaw === "edit") setViewerMode(modeRaw);
      const overridesRaw = window.localStorage.getItem(VIEW_OVERRIDES_STORAGE_KEY);
      if (overridesRaw) {
        const parsedOverrides = JSON.parse(overridesRaw) as unknown;
        if (parsedOverrides && typeof parsedOverrides === "object") {
          setViewOverridesBySheetId(parsedOverrides as Record<string, { layoutMode?: MindMapLayoutMode; themeId?: MindMapThemeId }>);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewerMode);
      window.localStorage.setItem(VIEW_OVERRIDES_STORAGE_KEY, JSON.stringify(viewOverridesBySheetId));
    } catch {
      // ignore quota errors
    }
  }, [viewerMode, viewOverridesBySheetId]);

  const createId = useCallback(() => {
    idCounterRef.current += 1;
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `xmind-node-${idCounterRef.current}`;
  }, []);

  const createVersionSnapshotId = useCallback(() => {
    snapshotCounterRef.current += 1;
    return `snapshot-${Date.now().toString(36)}-${snapshotCounterRef.current.toString(36)}`;
  }, []);

  const pushVersionSnapshot = useCallback(
    (snapshot: EditorSnapshot, createdAt = Date.now()) => {
      const next: VersionSnapshot = {
        id: createVersionSnapshotId(),
        createdAt,
        snapshot: cloneValue(snapshot),
      };
      versionHistoryRef.current = [...versionHistoryRef.current, next].slice(-VERSION_HISTORY_LIMIT);
      setVersionHistoryTick((prev) => prev + 1);
    },
    [createVersionSnapshotId],
  );

  const replaceVersionHistory = useCallback(
    (versionHistory: VersionSnapshot[], fallbackSnapshot?: EditorSnapshot, fallbackSavedAt?: number) => {
      const normalized = versionHistory
        .map((entry) => ({
          id: entry.id || createVersionSnapshotId(),
          createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
          snapshot: cloneValue(entry.snapshot),
        }))
        .slice(-VERSION_HISTORY_LIMIT);

      if (normalized.length > 0) {
        versionHistoryRef.current = normalized;
      } else if (fallbackSnapshot) {
        versionHistoryRef.current = [
          {
            id: createVersionSnapshotId(),
            createdAt: typeof fallbackSavedAt === "number" ? fallbackSavedAt : Date.now(),
            snapshot: cloneValue(fallbackSnapshot),
          },
        ];
      } else {
        versionHistoryRef.current = [];
      }
      setVersionHistoryTick((prev) => prev + 1);
    },
    [createVersionSnapshotId],
  );

  const resetHistory = useCallback(() => {
    historyRef.current = { past: [], future: [] };
    versionHistoryRef.current = [];
    setHistoryTick((prev) => prev + 1);
    setVersionHistoryTick((prev) => prev + 1);
  }, []);

  const pushHistory = useCallback(
    (snapshot: EditorSnapshot) => {
      const history = historyRef.current;
      const cloned = cloneValue(snapshot);
      history.past = [...history.past, cloned].slice(-80);
      history.future = [];
      pushVersionSnapshot(cloned);
      setHistoryTick((prev) => prev + 1);
    },
    [pushVersionSnapshot],
  );

  const canUndo = historyTick >= 0 && historyRef.current.past.length > 0;
  const canRedo = historyTick >= 0 && historyRef.current.future.length > 0;

  const versionSnapshots = useMemo(() => {
    void versionHistoryTick;
    return [...versionHistoryRef.current].reverse();
  }, [versionHistoryTick]);

  const formatVersionSnapshotTime = useCallback(
    (timestamp: number) => {
      try {
        return new Intl.DateTimeFormat(isEnglish ? "en-US" : "zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(timestamp);
      } catch {
        return new Date(timestamp).toLocaleString();
      }
    },
    [isEnglish],
  );

  const rollbackToVersionSnapshot = useCallback(
    (versionId: string) => {
      if (isReadMode) return;
      const target = versionHistoryRef.current.find((entry) => entry.id === versionId);
      if (!target) return;
      pushHistory({ sheets: editorSheets, activeSheetId, selectedNodeId });
      setEditorSheets(normalizeEditorSheets(cloneValue(target.snapshot.sheets)));
      setActiveSheetId(target.snapshot.activeSheetId);
      setSelectedNodeId(target.snapshot.selectedNodeId);
      setCanvasViewResetKey((prev) => prev + 1);
    },
    [activeSheetId, editorSheets, isReadMode, pushHistory, selectedNodeId],
  );

  const undo = useCallback(() => {
    if (isReadMode) return;
    const history = historyRef.current;
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1]!;
    history.past = history.past.slice(0, -1);
    history.future = [
      cloneValue({ sheets: editorSheets, activeSheetId, selectedNodeId }),
      ...history.future,
    ].slice(0, 80);
    setEditorSheets(normalizeEditorSheets(cloneValue(previous.sheets)));
    setActiveSheetId(previous.activeSheetId);
    setSelectedNodeId(previous.selectedNodeId);
    setHistoryTick((prev) => prev + 1);
  }, [activeSheetId, editorSheets, isReadMode, selectedNodeId]);

  const redo = useCallback(() => {
    if (isReadMode) return;
    const history = historyRef.current;
    if (history.future.length === 0) return;
    const next = history.future[0]!;
    history.future = history.future.slice(1);
    history.past = [
      ...history.past,
      cloneValue({ sheets: editorSheets, activeSheetId, selectedNodeId }),
    ].slice(-80);
    setEditorSheets(normalizeEditorSheets(cloneValue(next.sheets)));
    setActiveSheetId(next.activeSheetId);
    setSelectedNodeId(next.selectedNodeId);
    setHistoryTick((prev) => prev + 1);
  }, [activeSheetId, editorSheets, isReadMode, selectedNodeId]);

  useEffect(() => {
    const draft = getDraftFromStorage();
    if (!draft || !draft.editor.sheets || draft.editor.sheets.length === 0) {
      setDraftStatus("dismissed");
      return;
    }
    draftRef.current = draft;
    setDraftStatus("available");
  }, []);

  const restoreDraft = useCallback(() => {
    const draft = draftRef.current;
    if (!draft) return;
    setFile(null);
    setParsed(null);
    setError(null);
    setEditorSheets(normalizeEditorSheets(cloneValue(draft.editor.sheets)));
    setActiveSheetId(draft.editor.activeSheetId);
    setSelectedNodeId(draft.editor.selectedNodeId);
    setCanvasViewResetKey((prev) => prev + 1);
    resetHistory();
    replaceVersionHistory(draft.versionHistory, draft.editor, draft.savedAt);
    sheetViewByIdRef.current = {};
    setDraftStatus("dismissed");
  }, [replaceVersionHistory, resetHistory]);

  const deleteDraft = useCallback(() => {
    draftRef.current = null;
    clearDraftStorage();
    setDraftStatus("dismissed");
  }, []);

  useEffect(() => {
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    if (editorSheets.length === 0) return;
    autosaveTimerRef.current = window.setTimeout(() => {
      saveDraftToStorage({
        version: 2,
        savedAt: Date.now(),
        editor: {
          sheets: cloneValue(editorSheets),
          activeSheetId,
          selectedNodeId,
        },
        versionHistory: versionHistoryRef.current.slice(-VERSION_HISTORY_STORAGE_LIMIT).map((entry) => ({
          id: entry.id,
          createdAt: entry.createdAt,
          snapshot: cloneValue(entry.snapshot),
        })),
      });
    }, 650);
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [activeSheetId, editorSheets, selectedNodeId]);

  useEffect(() => {
    return () => {
      if (copyHintTimerRef.current) window.clearTimeout(copyHintTimerRef.current);
    };
  }, []);

  const activeSheet = useMemo(() => {
    if (!activeSheetId) return null;
    return editorSheets.find((sheet) => sheet.id === activeSheetId) ?? null;
  }, [activeSheetId, editorSheets]);

  useEffect(() => {
    if (activeSheet) return;
    setFullscreenPrimaryView("mindmap");
  }, [activeSheet]);

  const activeSheetOverride = useMemo(
    () => (activeSheetId ? viewOverridesBySheetId[activeSheetId] ?? null : null),
    [activeSheetId, viewOverridesBySheetId],
  );
  const effectiveLayoutMode = useMemo<MindMapLayoutMode>(() => {
    if (isReadMode && activeSheetOverride?.layoutMode) return activeSheetOverride.layoutMode;
    return activeSheet?.layoutMode ?? "balanced";
  }, [activeSheet?.layoutMode, activeSheetOverride?.layoutMode, isReadMode]);
  const effectiveThemeId = useMemo<MindMapThemeId>(() => {
    if (isReadMode && activeSheetOverride?.themeId) return activeSheetOverride.themeId;
    return activeSheet?.themeId ?? "classicLight";
  }, [activeSheet?.themeId, activeSheetOverride?.themeId, isReadMode]);
  const activeTheme = useMemo(() => getTheme(effectiveThemeId), [effectiveThemeId]);

  const activeSheetIndex = useMemo(() => {
    if (!activeSheetId) return -1;
    return editorSheets.findIndex((sheet) => sheet.id === activeSheetId);
  }, [activeSheetId, editorSheets]);

  useEffect(() => {
    if (!activeSheet?.rootTopic) {
      setSelectedNodeId(null);
      return;
    }
    const rootTopic = activeSheet.rootTopic;
    setSelectedNodeId((prev) => (prev && findNodeContext(rootTopic, prev) ? prev : rootTopic.id));
  }, [activeSheet?.id, activeSheet?.rootTopic]);

  const selectedContext = useMemo(() => {
    if (!activeSheet?.rootTopic || !selectedNodeId) return null;
    return findNodeContext(activeSheet.rootTopic, selectedNodeId);
  }, [activeSheet?.rootTopic, selectedNodeId]);

  const selectedNode = selectedContext?.node ?? null;
  const selectedNodeIsRoot = selectedContext?.parent === null;
  const selectedNodeHasChildren = (selectedNode?.children.length ?? 0) > 0;
  const selectedNodeBoundary = useMemo(() => {
    if (!activeSheet?.boundaries || !selectedNodeId) return null;
    return activeSheet.boundaries.find((boundary) => boundary.nodeId === selectedNodeId) ?? null;
  }, [activeSheet?.boundaries, selectedNodeId]);
  const selectedNodeSummary = useMemo(() => {
    if (!activeSheet?.summaries || !selectedNodeId) return null;
    return activeSheet.summaries.find((summary) => summary.nodeId === selectedNodeId) ?? null;
  }, [activeSheet?.summaries, selectedNodeId]);

  const nodeTitleById = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (node: MindMapNode | null) => {
      if (!node) return;
      map.set(node.id, node.title || ui.untitled);
      for (const child of node.children) walk(child);
    };
    walk(activeSheet?.rootTopic ?? null);
    return map;
  }, [activeSheet?.rootTopic, ui.untitled]);

  const relationTargetOptions = useMemo(() => {
    if (!activeSheet?.rootTopic || !selectedNodeId) return [];
    const options: Array<{ id: string; title: string }> = [];
    const walk = (node: MindMapNode) => {
      if (node.id !== selectedNodeId) options.push({ id: node.id, title: node.title || ui.untitled });
      for (const child of node.children) walk(child);
    };
    walk(activeSheet.rootTopic);
    return options;
  }, [activeSheet?.rootTopic, selectedNodeId, ui.untitled]);

  const selectedNodeRelationships = useMemo(() => {
    if (!activeSheet?.relationships || !selectedNodeId) return [];
    return activeSheet.relationships
      .filter((relation) => relation.fromId === selectedNodeId || relation.toId === selectedNodeId)
      .map((relation) => {
        const targetId = relation.fromId === selectedNodeId ? relation.toId : relation.fromId;
        return {
          ...relation,
          targetId,
          targetTitle: nodeTitleById.get(targetId) ?? ui.untitled,
        };
      });
  }, [activeSheet?.relationships, nodeTitleById, selectedNodeId, ui.untitled]);

  const relationExists = useMemo(() => {
    if (!activeSheet?.relationships || !selectedNodeId || !relationTargetId) return false;
    return activeSheet.relationships.some(
      (relation) =>
        (relation.fromId === selectedNodeId && relation.toId === relationTargetId) ||
        (relation.fromId === relationTargetId && relation.toId === selectedNodeId),
    );
  }, [activeSheet?.relationships, relationTargetId, selectedNodeId]);

  const relationGuardText = useMemo(() => {
    if (!selectedNodeId || !relationTargetId) return "";
    if (selectedNodeId === relationTargetId) return ui.relationSelfBlocked;
    if (relationExists) return ui.relationExists;
    return "";
  }, [relationExists, relationTargetId, selectedNodeId, ui.relationExists, ui.relationSelfBlocked]);

  const collapseAction = useMemo(() => {
    if (!activeSheet?.rootTopic) return null;
    const canToggleSelected = Boolean(selectedNodeId && selectedNodeHasChildren);
    if (canToggleSelected) {
      return {
        label: selectedNode?.collapsed ? ui.expand : ui.collapse,
        mode: "selected" as const,
      };
    }

    const shouldCollapse = hasAnyExpandedBranch(activeSheet.rootTopic);
    return {
      label: shouldCollapse ? ui.collapseAll : ui.expandAll,
      mode: shouldCollapse ? ("collapse-all" as const) : ("expand-all" as const),
    };
  }, [activeSheet?.rootTopic, selectedNode?.collapsed, selectedNodeHasChildren, selectedNodeId, ui.collapse, ui.collapseAll, ui.expand, ui.expandAll]);

  const outline = useMemo(() => {
    if (!activeSheet?.rootTopic) return "";
    const lines: string[] = [];
    lines.push(`# ${activeSheet.title.trim() || "Sheet"}`);
    lines.push(...mindMapNodeToLines(activeSheet.rootTopic, 0));
    const text = lines.join("\n").trim();
    return text.replaceAll("(无标题)", ui.untitled);
  }, [activeSheet, ui.untitled]);

  const textViewRows = useMemo(() => {
    if (!activeSheet?.rootTopic) return [];
    return flattenMindMapNodeRows(activeSheet.rootTopic);
  }, [activeSheet?.rootTopic]);
  const textViewText = useMemo(
    () => textViewRows.map((row) => `${"  ".repeat(Math.min(row.depth, 24))}${TEXT_VIEW_LINE_PREFIX}${row.title}`).join("\n"),
    [textViewRows],
  );

  useEffect(() => {
    setEditingTitle(selectedNode?.title ?? "");
    titleEditSessionRef.current = { nodeId: selectedNode?.id ?? null, hasPushedHistory: false };
    setRelationTargetId("");
    setRelationTitleInput("");
    setBoundaryTitleInput(selectedNodeBoundary?.title ?? "");
    setSummaryTitleInput(selectedNodeSummary?.title ?? "");
  }, [
    selectedNode?.id,
    selectedNode?.title,
    selectedNodeBoundary?.id,
    selectedNodeBoundary?.title,
    selectedNodeSummary?.id,
    selectedNodeSummary?.title,
  ]);

  useEffect(() => {
    setIsTextViewEditing(false);
    textViewEditSessionRef.current = { hasPushedHistory: false };
  }, [activeSheet?.id]);

  useEffect(() => {
    if (isTextViewEditing) return;
    setTextViewDraft(textViewText);
  }, [isTextViewEditing, textViewText]);

  const applyActiveSheetUpdate = useCallback(
    (
      updater: (sheet: MindMapSheet) => MindMapSheet,
      options?: { recordHistory?: boolean; allowInReadMode?: boolean },
    ) => {
      if (!activeSheetId) return;
      if (isReadMode && options?.allowInReadMode !== true) return;
      setEditorSheets((prev) => {
        if (options?.recordHistory !== false) {
          pushHistory({ sheets: prev, activeSheetId, selectedNodeId });
        }
        return prev.map((sheet) => (sheet.id === activeSheetId ? updater(sheet) : sheet));
      });
    },
    [activeSheetId, isReadMode, pushHistory, selectedNodeId],
  );

  const setSheetLayout = useCallback(
    (layoutMode: MindMapLayoutMode) => {
      applyActiveSheetUpdate((sheet) => ({ ...sheet, layoutMode }));
    },
    [applyActiveSheetUpdate],
  );

  const setSheetTheme = useCallback(
    (themeId: MindMapThemeId) => {
      applyActiveSheetUpdate((sheet) => ({ ...sheet, themeId }));
    },
    [applyActiveSheetUpdate],
  );

  const setEffectiveLayoutMode = useCallback(
    (layoutMode: MindMapLayoutMode) => {
      if (!activeSheetId) return;
      if (isReadMode) {
        setViewOverridesBySheetId((prev) => ({
          ...prev,
          [activeSheetId]: { ...prev[activeSheetId], layoutMode },
        }));
        return;
      }
      setSheetLayout(layoutMode);
    },
    [activeSheetId, isReadMode, setSheetLayout],
  );

  const setEffectiveThemeId = useCallback(
    (themeId: MindMapThemeId) => {
      if (!activeSheetId) return;
      if (isReadMode) {
        setViewOverridesBySheetId((prev) => ({
          ...prev,
          [activeSheetId]: { ...prev[activeSheetId], themeId },
        }));
        return;
      }
      setSheetTheme(themeId);
    },
    [activeSheetId, isReadMode, setSheetTheme],
  );

  const updateSelectedNodeTitle = useCallback(
    (rawTitle: string) => {
      if (isReadMode) return;
      if (!activeSheet?.rootTopic || !selectedNodeId) return;
      const normalizedTitle = rawTitle;

      const session = titleEditSessionRef.current;
      if (session.nodeId !== selectedNodeId) {
        session.nodeId = selectedNodeId;
        session.hasPushedHistory = false;
      }
      const recordHistory = !session.hasPushedHistory;
      if (recordHistory) session.hasPushedHistory = true;

      applyActiveSheetUpdate((sheet) => {
        if (!sheet.rootTopic) return sheet;
        const [nextRoot] = mapNodeById(sheet.rootTopic, selectedNodeId, (node) => ({ ...node, title: normalizedTitle }));
        return { ...sheet, rootTopic: nextRoot };
      }, { recordHistory });
    },
    [activeSheet?.rootTopic, applyActiveSheetUpdate, isReadMode, selectedNodeId],
  );

  const applyTextViewDraft = useCallback(
    (rawText: string) => {
      if (isReadMode || !activeSheet?.rootTopic) return;
      const parsedRows = parseTextDraftRows(rawText, activeSheet.rootTopic.title.trim() || ui.untitled);
      const oldRows = textViewRows;
      const signatureToOldIndexes = new Map<string, number[]>();
      for (let index = 0; index < oldRows.length; index += 1) {
        const row = oldRows[index]!;
        const signature = `${row.depth}\u0000${row.title}`;
        const list = signatureToOldIndexes.get(signature);
        if (list) list.push(index);
        else signatureToOldIndexes.set(signature, [index]);
      }

      const nextRows = parsedRows.map((row, index) => {
        if (index === 0 && oldRows[0]) {
          return { ...row, id: oldRows[0].id };
        }
        const signature = `${row.depth}\u0000${row.title}`;
        const list = signatureToOldIndexes.get(signature);
        if (list && list.length > 0) {
          const matchedOldIndex = list.shift()!;
          return { ...row, id: oldRows[matchedOldIndex]!.id };
        }
        return { ...row, id: createId() };
      });

      const oldText = oldRows.map((row) => `${row.depth}\u0000${row.title}`).join("\n");
      const nextText = nextRows.map((row) => `${row.depth}\u0000${row.title}`).join("\n");
      if (oldText === nextText) return;

      const recordHistory = !textViewEditSessionRef.current.hasPushedHistory;
      if (recordHistory) {
        textViewEditSessionRef.current = { hasPushedHistory: true };
      }

      const existingNodeById = new Map<string, MindMapNode>();
      const collectExistingNodes = (node: MindMapNode) => {
        existingNodeById.set(node.id, node);
        for (const child of node.children) collectExistingNodes(child);
      };
      collectExistingNodes(activeSheet.rootTopic);

      const createTextNode = (id: string, title: string): MindMapNode => {
        const existing = existingNodeById.get(id);
        return {
          id,
          title,
          children: [],
          collapsed: existing?.collapsed ?? false,
          labels: existing?.labels ? [...existing.labels] : undefined,
          notes: existing?.notes?.plain?.content ? { plain: { content: existing.notes.plain.content } } : undefined,
        };
      };

      const rootRow = nextRows[0]!;
      const rootNode = createTextNode(rootRow.id, rootRow.title);
      const stack: MindMapNode[] = [rootNode];
      for (let index = 1; index < nextRows.length; index += 1) {
        const row = nextRows[index]!;
        const desiredDepth = Math.max(1, row.depth);
        const depth = Math.min(desiredDepth, stack.length);
        while (stack.length > depth) stack.pop();
        const parent = stack[stack.length - 1] ?? rootNode;
        const nextNode = createTextNode(row.id, row.title);
        parent.children.push(nextNode);
        stack.push(nextNode);
      }

      let nextNodeIds: Set<string> | null = null;
      const rootId = rootNode.id;

      applyActiveSheetUpdate((sheet) => {
        if (!sheet.rootTopic) return sheet;
        nextNodeIds = collectNodeIds(rootNode);
        return {
          ...sheet,
          rootTopic: rootNode,
          relationships: filterRelationshipsByNodeIds(sheet.relationships, nextNodeIds),
          boundaries: filterBoundariesByNodeIds(sheet.boundaries, nextNodeIds),
          summaries: filterSummariesByNodeIds(sheet.summaries, nextNodeIds),
        };
      }, { recordHistory });

      if (nextNodeIds) {
        setSelectedNodeId((previous) => (previous && nextNodeIds!.has(previous) ? previous : rootId));
      }
    },
    [activeSheet?.rootTopic, applyActiveSheetUpdate, createId, isReadMode, textViewRows, ui.untitled],
  );

  const handleTextViewTextareaKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (isReadMode) return;
      const textarea = event.currentTarget;
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;

      if (event.key === "Enter") {
        event.preventDefault();
        const lineStart = Math.max(0, textViewDraft.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1);
        const leading = textViewDraft.slice(lineStart, selectionStart).match(/^[\t ]*/)?.[0] ?? "";
        const insert = `\n${leading}${TEXT_VIEW_LINE_PREFIX}`;
        const nextValue = `${textViewDraft.slice(0, selectionStart)}${insert}${textViewDraft.slice(selectionEnd)}`;
        const nextCaret = selectionStart + insert.length;
        setTextViewDraft(nextValue);
        applyTextViewDraft(nextValue);
        window.requestAnimationFrame(() => {
          const element = textViewTextareaRef.current;
          if (!element) return;
          element.setSelectionRange(nextCaret, nextCaret);
        });
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        const next = applyIndentationToDraft(textViewDraft, selectionStart, selectionEnd, event.shiftKey);
        setTextViewDraft(next.value);
        applyTextViewDraft(next.value);
        window.requestAnimationFrame(() => {
          const element = textViewTextareaRef.current;
          if (!element) return;
          element.setSelectionRange(next.start, next.end);
        });
      }
    },
    [applyTextViewDraft, isReadMode, textViewDraft],
  );

  const renameNodeFromCanvas = useCallback(
    (nodeId: string) => {
      if (isReadMode) return;
      if (!activeSheet?.rootTopic) return;
      const context = findNodeContext(activeSheet.rootTopic, nodeId);
      if (!context) return;
      const rawTitle = window.prompt(ui.nodeTitleLabel, context.node.title);
      if (rawTitle === null) return;
      const normalizedTitle = rawTitle.trim() || ui.untitled;

      setSelectedNodeId(nodeId);
      setEditingTitle(normalizedTitle);
      titleEditSessionRef.current = { nodeId, hasPushedHistory: false };

      if (normalizedTitle === context.node.title) return;

      applyActiveSheetUpdate((sheet) => {
        if (!sheet.rootTopic) return sheet;
        const [nextRoot] = mapNodeById(sheet.rootTopic, nodeId, (node) => ({ ...node, title: normalizedTitle }));
        return { ...sheet, rootTopic: nextRoot };
      });
    },
    [activeSheet?.rootTopic, applyActiveSheetUpdate, isReadMode, ui.nodeTitleLabel, ui.untitled],
  );

  const toggleCollapse = useCallback(
    (nodeId: string) => {
      applyActiveSheetUpdate((sheet) => {
        if (!sheet.rootTopic) return sheet;
        const [nextRoot] = mapNodeById(sheet.rootTopic, nodeId, (node) => {
          if (node.children.length === 0) return node;
          return { ...node, collapsed: !node.collapsed };
        });
        return { ...sheet, rootTopic: nextRoot };
      }, { allowInReadMode: true, recordHistory: !isReadMode });
    },
    [applyActiveSheetUpdate, isReadMode],
  );

  const runCollapseAction = useCallback(() => {
    if (!activeSheet?.rootTopic || !collapseAction) return;
    if (collapseAction.mode === "selected") {
      if (!selectedNodeId) return;
      toggleCollapse(selectedNodeId);
      return;
    }
    const collapsed = collapseAction.mode === "collapse-all";
    applyActiveSheetUpdate((sheet) => {
      if (!sheet.rootTopic) return sheet;
      return { ...sheet, rootTopic: setCollapseForAll(sheet.rootTopic, collapsed) };
    }, { allowInReadMode: true, recordHistory: !isReadMode });
  }, [activeSheet?.rootTopic, applyActiveSheetUpdate, collapseAction, isReadMode, selectedNodeId, toggleCollapse]);

  const switchActiveSheet = useCallback(
    (nextSheetId: string | null) => {
      if (activeSheetId && canvasHandleRef.current) {
        sheetViewByIdRef.current[activeSheetId] = canvasHandleRef.current.getViewStateBundle();
      }
      setActiveSheetId(nextSheetId);
      if (nextSheetId) {
        const saved = sheetViewByIdRef.current[nextSheetId];
        if (saved && canvasHandleRef.current) {
          canvasHandleRef.current.setViewStateBundle(saved);
        } else {
          setCanvasViewResetKey((prev) => prev + 1);
        }
      } else {
        setCanvasViewResetKey((prev) => prev + 1);
      }
    },
    [activeSheetId],
  );

  const createNewSheet = useCallback(() => {
    if (isReadMode) return;
    const defaultTitle = `${ui.sheetPrefix} ${editorSheets.length + 1}`;
    const rawTitle = window.prompt(ui.newCanvasNamePrompt, defaultTitle);
    if (!rawTitle) return;
    const title = rawTitle.trim();
    if (!title) return;

    const nextSheet: MindMapSheet = {
      id: createId(),
      title,
      rootTopic: createNodeWithTitle(createId(), ui.centerTopic),
      layoutMode: activeSheet?.layoutMode ?? "balanced",
      themeId: activeSheet?.themeId ?? "classicLight",
      relationships: [],
      boundaries: [],
      summaries: [],
    };

    pushHistory({ sheets: editorSheets, activeSheetId, selectedNodeId });
    setEditorSheets((prev) => [...prev, nextSheet]);
    switchActiveSheet(nextSheet.id);
    setSelectedNodeId(nextSheet.rootTopic?.id ?? null);
  }, [
    activeSheet?.layoutMode,
    activeSheet?.themeId,
    activeSheetId,
    createId,
    editorSheets,
    isReadMode,
    pushHistory,
    selectedNodeId,
    ui.centerTopic,
    ui.newCanvasNamePrompt,
    ui.sheetPrefix,
    switchActiveSheet,
  ]);

  const renameActiveSheet = useCallback(() => {
    if (isReadMode) return;
    if (!activeSheetId) return;
    const current = editorSheets.find((sheet) => sheet.id === activeSheetId);
    if (!current) return;
    const rawTitle = window.prompt(ui.renameCanvasPrompt, current.title);
    if (!rawTitle) return;
    const title = rawTitle.trim();
    if (!title) return;

    pushHistory({ sheets: editorSheets, activeSheetId, selectedNodeId });
    setEditorSheets((prev) => prev.map((sheet) => (sheet.id === activeSheetId ? { ...sheet, title } : sheet)));
  }, [activeSheetId, editorSheets, isReadMode, pushHistory, selectedNodeId, ui.renameCanvasPrompt]);

  const duplicateActiveSheet = useCallback(() => {
    if (isReadMode) return;
    if (!activeSheetId) return;
    const current = editorSheets.find((sheet) => sheet.id === activeSheetId);
    if (!current) return;

    const nextTitle = `${current.title}${ui.copiedSuffix}`;
    const rawTitle = window.prompt(ui.duplicateCanvasPrompt, nextTitle);
    if (!rawTitle) return;
    const title = rawTitle.trim();
    if (!title) return;

    const idMap = new Map<string, string>();
    const clonedRoot = current.rootTopic
      ? cloneMindMapNodeWithNewIds(current.rootTopic, createId, idMap)
      : createNodeWithTitle(createId(), ui.centerTopic);
    const nextSheet: MindMapSheet = {
      ...current,
      id: createId(),
      title,
      rootTopic: clonedRoot,
      themeId: current.themeId ?? "classicLight",
      relationships: remapRelationships(current.relationships, idMap),
      boundaries: remapBoundaries(current.boundaries, idMap),
      summaries: remapSummaries(current.summaries, idMap),
    };

    pushHistory({ sheets: editorSheets, activeSheetId, selectedNodeId });
    setEditorSheets((prev) => [...prev, nextSheet]);
    switchActiveSheet(nextSheet.id);
    setSelectedNodeId(nextSheet.rootTopic?.id ?? null);
  }, [activeSheetId, createId, editorSheets, isReadMode, pushHistory, selectedNodeId, switchActiveSheet, ui.centerTopic, ui.copiedSuffix, ui.duplicateCanvasPrompt]);

  const deleteActiveSheet = useCallback(() => {
    if (isReadMode) return;
    if (!activeSheetId) return;
    if (editorSheets.length <= 1) {
      window.alert(ui.keepOneCanvasAlert);
      return;
    }
    const sheet = editorSheets.find((item) => item.id === activeSheetId);
    if (!sheet) return;
    const ok = window.confirm(`${ui.deleteCanvasConfirm} "${sheet.title}"?`);
    if (!ok) return;

    pushHistory({ sheets: editorSheets, activeSheetId, selectedNodeId });
    const nextSheets = editorSheets.filter((item) => item.id !== activeSheetId);
    setEditorSheets(nextSheets);

    const nextActive = nextSheets[Math.max(0, activeSheetIndex - 1)] ?? nextSheets[0] ?? null;
    const nextActiveId = nextActive?.id ?? null;
    switchActiveSheet(nextActiveId);
    setSelectedNodeId(nextActive?.rootTopic?.id ?? null);
  }, [activeSheetId, activeSheetIndex, editorSheets, isReadMode, pushHistory, selectedNodeId, switchActiveSheet, ui.deleteCanvasConfirm, ui.keepOneCanvasAlert]);

  const moveActiveSheet = useCallback(
    (direction: -1 | 1) => {
      if (isReadMode) return;
      if (!activeSheetId) return;
      const index = editorSheets.findIndex((sheet) => sheet.id === activeSheetId);
      if (index < 0) return;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= editorSheets.length) return;

      pushHistory({ sheets: editorSheets, activeSheetId, selectedNodeId });
      const nextSheets = [...editorSheets];
      const [removed] = nextSheets.splice(index, 1);
      nextSheets.splice(nextIndex, 0, removed!);
      setEditorSheets(nextSheets);
    },
    [activeSheetId, editorSheets, isReadMode, pushHistory, selectedNodeId],
  );

  const addChildNodeById = useCallback(
    (targetId: string): string | null => {
      const nextId = createId();
      let inserted = false;
      applyActiveSheetUpdate((sheet) => {
        if (!sheet.rootTopic) return sheet;
        const [nextRoot, changed] = mapNodeById(sheet.rootTopic, targetId, (node) => ({
          ...node,
          collapsed: false,
          children: [...node.children, createNodeWithTitle(nextId, ui.newNode)],
        }));
        if (!changed) return sheet;
        inserted = true;
        return { ...sheet, rootTopic: nextRoot };
      });
      if (!inserted) return null;
      setSelectedNodeId(nextId);
      return nextId;
    },
    [applyActiveSheetUpdate, createId, ui.newNode],
  );

  const addSiblingNodeById = useCallback(
    (nodeId: string): string | null => {
      const nextId = createId();
      let inserted = false;
      applyActiveSheetUpdate((sheet) => {
        if (!sheet.rootTopic) return sheet;
        const context = findNodeContext(sheet.rootTopic, nodeId);
        if (!context?.parent) return sheet;
        const parentId = context.parent.id;
        const insertIndex = context.index + 1;
        const [nextRoot] = mapNodeById(sheet.rootTopic, parentId, (parentNode) => {
          const nextChildren = [...parentNode.children];
          nextChildren.splice(insertIndex, 0, createNodeWithTitle(nextId, ui.newNode));
          return { ...parentNode, collapsed: false, children: nextChildren };
        });
        inserted = true;
        return { ...sheet, rootTopic: nextRoot };
      });
      if (!inserted) return null;
      setSelectedNodeId(nextId);
      return nextId;
    },
    [applyActiveSheetUpdate, createId, ui.newNode],
  );

  const addChildNode = useCallback(() => {
    if (!activeSheet?.rootTopic) return;
    const targetId = selectedNodeId ?? activeSheet.rootTopic.id;
    addChildNodeById(targetId);
  }, [activeSheet?.rootTopic, addChildNodeById, selectedNodeId]);

  const addSiblingNode = useCallback(() => {
    if (!selectedNodeId) return;
    addSiblingNodeById(selectedNodeId);
  }, [addSiblingNodeById, selectedNodeId]);

  const deleteSelectedNode = useCallback(() => {
    if (!activeSheet?.rootTopic || !selectedNodeId) return;
    if (activeSheet.rootTopic.id === selectedNodeId) return;
    let nextSelectedId: string | null = null;

    applyActiveSheetUpdate((sheet) => {
      if (!sheet.rootTopic) return sheet;
      const result = removeNodeById(sheet.rootTopic, selectedNodeId);
      if (!result.removed) return sheet;
      nextSelectedId = result.parentId ?? sheet.rootTopic.id;
      const nodeIds = collectNodeIds(result.node);
      return {
        ...sheet,
        rootTopic: result.node,
        relationships: filterRelationshipsByNodeIds(sheet.relationships, nodeIds),
        boundaries: filterBoundariesByNodeIds(sheet.boundaries, nodeIds),
        summaries: filterSummariesByNodeIds(sheet.summaries, nodeIds),
      };
    });

    setSelectedNodeId(nextSelectedId);
  }, [activeSheet?.rootTopic, applyActiveSheetUpdate, selectedNodeId]);

  const moveNode = useCallback(
    (draggedId: string, targetId: string, placement: "before" | "after" | "child") => {
      if (!activeSheet?.rootTopic) return;
      if (activeSheet.rootTopic.id === draggedId) return;

      applyActiveSheetUpdate((sheet) => {
        if (!sheet.rootTopic) return sheet;

        const draggedContext = findNodeContext(sheet.rootTopic, draggedId);
        if (!draggedContext) return sheet;
        if (findNodeContext(draggedContext.node, targetId)) return sheet;

        const detached = detachNodeById(sheet.rootTopic, draggedId);
        if (!detached.detached) return sheet;

        const nodeToInsert = detached.detached;
        let workingRoot = detached.node;

        if (placement === "child") {
          const [nextRoot] = mapNodeById(workingRoot, targetId, (node) => ({
            ...node,
            collapsed: false,
            children: [...node.children, nodeToInsert],
          }));
          workingRoot = nextRoot;
        } else {
          const targetContext = findNodeContext(workingRoot, targetId);
          if (!targetContext) return sheet;
          const parent = targetContext.parent;
          if (!parent) {
            const [nextRoot] = mapNodeById(workingRoot, workingRoot.id, (node) => ({
              ...node,
              collapsed: false,
              children: [...node.children, nodeToInsert],
            }));
            workingRoot = nextRoot;
          } else {
            const insertIndex = targetContext.index + (placement === "after" ? 1 : 0);
            const [nextRoot] = mapNodeById(workingRoot, parent.id, (node) => {
              const nextChildren = [...node.children];
              nextChildren.splice(Math.max(0, Math.min(insertIndex, nextChildren.length)), 0, nodeToInsert);
              return { ...node, collapsed: false, children: nextChildren };
            });
            workingRoot = nextRoot;
          }
        }

        return { ...sheet, rootTopic: workingRoot };
      });

      setSelectedNodeId(draggedId);
    },
    [activeSheet?.rootTopic, applyActiveSheetUpdate],
  );

  const addRelationship = useCallback(() => {
    if (!selectedNodeId || !relationTargetId || selectedNodeId === relationTargetId) return;
    const normalizedTitle = relationTitleInput.trim() || undefined;

    applyActiveSheetUpdate((sheet) => {
      const existing = sheet.relationships ?? [];
      const duplicate = existing.some(
        (relation) =>
          (relation.fromId === selectedNodeId && relation.toId === relationTargetId) ||
          (relation.fromId === relationTargetId && relation.toId === selectedNodeId),
      );
      if (duplicate) return sheet;
      return {
        ...sheet,
        relationships: [
          ...existing,
          {
            id: createId(),
            fromId: selectedNodeId,
            toId: relationTargetId,
            title: normalizedTitle,
          },
        ],
      };
    });

    setRelationTargetId("");
    setRelationTitleInput("");
  }, [applyActiveSheetUpdate, createId, relationTargetId, relationTitleInput, selectedNodeId]);

  const removeRelationship = useCallback(
    (relationId: string) => {
      applyActiveSheetUpdate((sheet) => ({
        ...sheet,
        relationships: (sheet.relationships ?? []).filter((relation) => relation.id !== relationId),
      }));
    },
    [applyActiveSheetUpdate],
  );

  const addBoundary = useCallback(() => {
    if (!selectedNodeId || selectedNodeBoundary) return;
    const normalizedTitle = boundaryTitleInput.trim() || undefined;
    applyActiveSheetUpdate((sheet) => {
      const boundaries = sheet.boundaries ?? [];
      if (boundaries.some((boundary) => boundary.nodeId === selectedNodeId)) return sheet;
      return {
        ...sheet,
        boundaries: [
          ...boundaries,
          {
            id: createId(),
            nodeId: selectedNodeId,
            title: normalizedTitle,
          },
        ],
      };
    });
  }, [applyActiveSheetUpdate, boundaryTitleInput, createId, selectedNodeBoundary, selectedNodeId]);

  const updateBoundaryTitle = useCallback(() => {
    if (!selectedNodeId || !selectedNodeBoundary) return;
    const normalizedTitle = boundaryTitleInput.trim() || undefined;
    const currentTitle = selectedNodeBoundary.title?.trim() || undefined;
    if (currentTitle === normalizedTitle) return;
    applyActiveSheetUpdate((sheet) => {
      const boundaries = sheet.boundaries ?? [];
      let changed = false;
      const nextBoundaries = boundaries.map((boundary) => {
        if (boundary.nodeId !== selectedNodeId) return boundary;
        const previousTitle = boundary.title?.trim() || undefined;
        if (previousTitle === normalizedTitle) return boundary;
        changed = true;
        return { ...boundary, title: normalizedTitle };
      });
      if (!changed) return sheet;
      return { ...sheet, boundaries: nextBoundaries };
    });
  }, [applyActiveSheetUpdate, boundaryTitleInput, selectedNodeBoundary, selectedNodeId]);

  const removeBoundary = useCallback(() => {
    if (!selectedNodeId || !selectedNodeBoundary) return;
    applyActiveSheetUpdate((sheet) => {
      const boundaries = sheet.boundaries ?? [];
      const nextBoundaries = boundaries.filter((boundary) => boundary.nodeId !== selectedNodeId);
      if (nextBoundaries.length === boundaries.length) return sheet;
      return { ...sheet, boundaries: nextBoundaries };
    });
    setBoundaryTitleInput("");
  }, [applyActiveSheetUpdate, selectedNodeBoundary, selectedNodeId]);

  const addSummary = useCallback(() => {
    if (!selectedNodeId || !selectedNodeHasChildren || selectedNodeSummary) return;
    const normalizedTitle = summaryTitleInput.trim() || undefined;
    applyActiveSheetUpdate((sheet) => {
      const summaries = sheet.summaries ?? [];
      if (summaries.some((summary) => summary.nodeId === selectedNodeId)) return sheet;
      return {
        ...sheet,
        summaries: [
          ...summaries,
          {
            id: createId(),
            nodeId: selectedNodeId,
            title: normalizedTitle,
          },
        ],
      };
    });
  }, [
    applyActiveSheetUpdate,
    createId,
    selectedNodeHasChildren,
    selectedNodeId,
    selectedNodeSummary,
    summaryTitleInput,
  ]);

  const updateSummaryTitle = useCallback(() => {
    if (!selectedNodeId || !selectedNodeSummary) return;
    const normalizedTitle = summaryTitleInput.trim() || undefined;
    const currentTitle = selectedNodeSummary.title?.trim() || undefined;
    if (currentTitle === normalizedTitle) return;
    applyActiveSheetUpdate((sheet) => {
      const summaries = sheet.summaries ?? [];
      let changed = false;
      const nextSummaries = summaries.map((summary) => {
        if (summary.nodeId !== selectedNodeId) return summary;
        const previousTitle = summary.title?.trim() || undefined;
        if (previousTitle === normalizedTitle) return summary;
        changed = true;
        return { ...summary, title: normalizedTitle };
      });
      if (!changed) return sheet;
      return { ...sheet, summaries: nextSummaries };
    });
  }, [applyActiveSheetUpdate, selectedNodeId, selectedNodeSummary, summaryTitleInput]);

  const removeSummary = useCallback(() => {
    if (!selectedNodeId || !selectedNodeSummary) return;
    applyActiveSheetUpdate((sheet) => {
      const summaries = sheet.summaries ?? [];
      const nextSummaries = summaries.filter((summary) => summary.nodeId !== selectedNodeId);
      if (nextSummaries.length === summaries.length) return sheet;
      return { ...sheet, summaries: nextSummaries };
    });
    setSummaryTitleInput("");
  }, [applyActiveSheetUpdate, selectedNodeId, selectedNodeSummary]);

  useEffect(() => {
    if (editorSheets.length === 0) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const hasMod = event.metaKey || event.ctrlKey;
      const canvas = canvasHandleRef.current;

      if (!isReadMode && hasMod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          if (canRedo) redo();
        } else if (canUndo) {
          undo();
        }
        return;
      }

      if (!isReadMode && hasMod && key === "y") {
        event.preventDefault();
        if (canRedo) redo();
        return;
      }

      if (hasMod && (key === "=" || key === "+")) {
        event.preventDefault();
        canvas?.zoomByFactor(1.1);
        return;
      }

      if (hasMod && key === "-") {
        event.preventDefault();
        canvas?.zoomByFactor(0.9);
        return;
      }

      if (hasMod && key === "0") {
        event.preventDefault();
        canvas?.fitToView();
        return;
      }

      if (hasMod && event.shiftKey && key === "f") {
        event.preventDefault();
        canvas?.toggleFullscreen();
        return;
      }

      if (event.repeat && (key === "tab" || key === "enter" || key === "delete" || key === "backspace")) return;

      if (!isReadMode && key === "tab") {
        event.preventDefault();
        addChildNode();
        return;
      }

      if (!isReadMode && key === "enter") {
        event.preventDefault();
        addSiblingNode();
        return;
      }

      if (!isReadMode && (key === "delete" || key === "backspace")) {
        event.preventDefault();
        deleteSelectedNode();
        return;
      }

      if (key === " ") {
        event.preventDefault();
        runCollapseAction();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    addChildNode,
    addSiblingNode,
    canRedo,
    canUndo,
    deleteSelectedNode,
    editorSheets.length,
    isReadMode,
    redo,
    runCollapseAction,
    undo,
  ]);

  const runParse = async (selected: File) => {
    const looksLikeXmind = /\.xmind$/i.test(selected.name);
    if (!looksLikeXmind) {
      setError(ui.fileExtHint);
    }
    setFile(selected);
    setParsed(null);
    setCopyHint(null);
    setIsLoading(true);
    setEditorSheets([]);
    setActiveSheetId(null);
    setSelectedNodeId(null);
    resetHistory();
    try {
      const next = await parseXmind(selected);
      setParsed(next);
      if (next.parseErrorKey) {
        setError(ui.parseErrors[next.parseErrorKey]);
        setEditorSheets([]);
        setActiveSheetId(null);
        setSelectedNodeId(null);
        resetHistory();
        return;
      }

      const normalizedSheets = normalizeToMindMapSheets(next.sheets, createId, ui.centerTopic);
      setEditorSheets(normalizedSheets);
      const nextActiveId = normalizedSheets[0]?.id ?? null;
      setActiveSheetId(nextActiveId);
      const nextSelectedNodeId = normalizedSheets[0]?.rootTopic?.id ?? null;
      setSelectedNodeId(nextSelectedNodeId);
      setCanvasViewResetKey((prev) => prev + 1);
      resetHistory();
      replaceVersionHistory([], {
        sheets: cloneValue(normalizedSheets),
        activeSheetId: nextActiveId,
        selectedNodeId: nextSelectedNodeId,
      });
      sheetViewByIdRef.current = {};

      if (looksLikeXmind) setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.parseFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    await runParse(selected);
    e.target.value = "";
  };

  const openFilePicker = () => {
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  };

  const copy = async () => {
    if (!outline) return;
    try {
      await navigator.clipboard.writeText(outline);
      setCopyHint(ui.copied);
    } catch {
      setCopyHint(ui.copyFailed);
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

  const exportBaseName = useMemo(() => {
    const fileBase = file?.name ? file.name.replace(/\.xmind$/i, "") : null;
    const sheetBase = activeSheet?.title ?? null;
    return sanitizeFilename(fileBase || sheetBase || "mindmap") || "mindmap";
  }, [activeSheet?.title, file?.name]);

  const exportPng = useCallback(async () => {
    const canvas = canvasHandleRef.current;
    if (!canvas) return;
    try {
      const blob = await canvas.exportAsPng({ scale: 2, padding: 56 });
      const suffix = activeSheet ? `-${sanitizeFilename(activeSheet.title)}` : "";
      downloadBlob(`${exportBaseName}${suffix}.png`, blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.exportPngFailed);
    }
  }, [activeSheet, exportBaseName, ui.exportPngFailed]);

  const exportSvg = useCallback(() => {
    const canvas = canvasHandleRef.current;
    if (!canvas) return;
    try {
      const svg = canvas.exportAsSvg({ padding: 56 });
      const suffix = activeSheet ? `-${sanitizeFilename(activeSheet.title)}` : "";
      downloadBlob(
        `${exportBaseName}${suffix}.svg`,
        new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.exportSvgFailed);
    }
  }, [activeSheet, exportBaseName, ui.exportSvgFailed]);

  const exportPdf = useCallback(async () => {
    const canvas = canvasHandleRef.current;
    if (!canvas) return;
    try {
      const pngBlob = await canvas.exportAsPng({ scale: 2, padding: 56 });
      const pngBytes = await pngBlob.arrayBuffer();

      const doc = await PDFDocument.create();
      const image = await doc.embedPng(pngBytes);
      const page = doc.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

      const pdfBytes = await doc.save();
      const pdfBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
      const suffix = activeSheet ? `-${sanitizeFilename(activeSheet.title)}` : "";
      downloadBlob(`${exportBaseName}${suffix}.pdf`, new Blob([pdfBuffer], { type: "application/pdf" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.exportPdfFailed);
    }
  }, [activeSheet, exportBaseName, ui.exportPdfFailed]);

  const exportXmind = useCallback(() => {
    const sheetsToExport = isReadMode
      ? editorSheets.map((sheet) => {
          const override = viewOverridesBySheetId[sheet.id];
          if (!override) return sheet;
          return {
            ...sheet,
            layoutMode: override.layoutMode ?? sheet.layoutMode,
            themeId: override.themeId ?? sheet.themeId,
          };
        })
      : editorSheets;
    const sheets = sheetsToExport.length > 0 ? sheetsToExport : null;
    if (!sheets) return;

    const createZipId = (): string => {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
      return `xmind-export-${Math.random().toString(16).slice(2)}-${Date.now()}`;
    };

    const createStyle = () => ({ id: createZipId(), properties: {} as Record<string, string> });

    const nodeToXmindTopic = (node: MindMapNode, options?: { isRoot?: boolean; sheet?: MindMapSheet }): Record<string, unknown> => {
      const attached = node.children.map((child) => nodeToXmindTopic(child));
      const topic: Record<string, unknown> = {
        id: node.id,
        title: node.title,
        style: createStyle(),
      };

      if (node.labels && node.labels.length > 0) topic.labels = node.labels.join(",");
      if (node.notes?.plain?.content) topic.notes = { plain: { content: node.notes.plain.content } };
      if (node.collapsed) topic.branch = "folded";
      if (attached.length > 0) topic.children = { attached };

      if (options?.isRoot && options.sheet) {
        const extensionPayload = {
          version: 1,
          layoutMode: options.sheet.layoutMode,
          themeId: options.sheet.themeId,
          relationships: (options.sheet.relationships ?? []).map((relation) => ({
            id: relation.id,
            fromId: relation.fromId,
            toId: relation.toId,
            title: relation.title ?? "",
          })),
          boundaries: (options.sheet.boundaries ?? []).map((boundary) => ({
            id: boundary.id,
            nodeId: boundary.nodeId,
            title: boundary.title ?? "",
          })),
          summaries: (options.sheet.summaries ?? []).map((summary) => ({
            id: summary.id,
            nodeId: summary.nodeId,
            title: summary.title ?? "",
          })),
        };
        topic.extensions = [
          {
            provider: ATTOOLS_EXTENSION_PROVIDER,
            content: JSON.stringify(extensionPayload),
          },
        ];
      }

      return topic;
    };

    const content = sheets.map((sheet) => ({
      id: sheet.id,
      title: sheet.title,
      rootTopic: sheet.rootTopic ? nodeToXmindTopic(sheet.rootTopic, { isRoot: true, sheet }) : { id: createZipId(), title: "中心主题" },
      relationships: (sheet.relationships ?? []).map((relation) => ({
        id: relation.id || createZipId(),
        end1Id: relation.fromId,
        end2Id: relation.toId,
        title: relation.title ?? "",
        style: createStyle(),
      })),
      boundaries: (sheet.boundaries ?? []).map((boundary) => ({
        id: boundary.id || createZipId(),
        nodeId: boundary.nodeId,
        title: boundary.title ?? "",
      })),
      summaries: (sheet.summaries ?? []).map((summary) => ({
        id: summary.id || createZipId(),
        nodeId: summary.nodeId,
        title: summary.title ?? "",
      })),
      style: createStyle(),
      topicPositioning: "fixed",
    }));

    const metadata = {};
    const manifest = { "file-entries": { "content.json": {}, "metadata.json": {} } };
    const contentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?><xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" xmlns:fo="http://www.w3.org/1999/XSL/Format" xmlns:svg="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink" modified-by="atools" timestamp="0" version="2.0"><sheet id="atools-warning" modified-by="atools" theme="atools" timestamp="0"><topic id="atools-warning-topic" modified-by="atools" structure-class="org.xmind.ui.logic.right" timestamp="0"><title>Warning\n警告\nAttention\nWarnung\n경고</title><children><topics type="attached"><topic id="atools-warning-node" modified-by="atools" timestamp="0"><title svg:width="500">This file may not be fully compatible with older XMind versions. Please open with XMind 8 Update 3 or later.</title></topic></topics></children></topic></sheet></xmap-content>';

    const zip = zipSync(
      {
        "content.json": strToU8(JSON.stringify(content, null, 2)),
        "metadata.json": strToU8(JSON.stringify(metadata, null, 2)),
        "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
        "content.xml": strToU8(contentXml),
      },
      { level: 6 },
    );

    const zipBuffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    downloadBlob(`${exportBaseName}.xmind`, new Blob([zipBuffer], { type: "application/octet-stream" }));
  }, [editorSheets, exportBaseName, isReadMode, viewOverridesBySheetId]);

  const clear = () => {
    setFile(null);
    setParsed(null);
    setError(null);
    setEditorSheets([]);
    setActiveSheetId(null);
    setSelectedNodeId(null);
    setEditingTitle("");
    setSummaryTitleInput("");
    setCanvasViewResetKey((prev) => prev + 1);
    resetHistory();
    sheetViewByIdRef.current = {};
    clearDraftStorage();
    setDraftStatus("dismissed");
    setCopyHint(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const toggleViewerMode = useCallback(() => {
    setViewerMode((prev) => (prev === "read" ? "edit" : "read"));
  }, []);

  const renderVersionHistoryPanel = (panelClassName: string) => (
    <div className={panelClassName}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-700">{ui.panelHistory}</div>
        <div className="text-[11px] text-slate-500">{ui.historyCurrent}: {versionSnapshots.length + 1}</div>
      </div>
      <div className="mt-2 max-h-52 overflow-auto rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-200">
        {versionSnapshots.length === 0 ? (
          <div className="px-2 py-1 text-[11px] text-slate-500">{ui.historyEmpty}</div>
        ) : (
          <div className="space-y-1.5">
            {versionSnapshots.map((entry, index) => {
              const snapshotActiveSheet =
                entry.snapshot.sheets.find((sheet) => sheet.id === entry.snapshot.activeSheetId) ?? entry.snapshot.sheets[0] ?? null;
              const revisionNumber = versionSnapshots.length - index;
              return (
                <div key={entry.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-2 ring-1 ring-slate-200">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold text-slate-800">
                      #{revisionNumber} · {formatVersionSnapshotTime(entry.createdAt)}
                    </div>
                    <div className="truncate text-[11px] text-slate-500">{snapshotActiveSheet?.title || ui.untitled}</div>
                  </div>
                  <button
                    type="button"
                    disabled={isReadMode}
                    onClick={() => rollbackToVersionSnapshot(entry.id)}
                    className="rounded-xl bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {ui.historyRollback}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const fullscreenTextViewOverlay = activeSheet ? (
    <div className="flex h-full w-full min-h-0 flex-col rounded-3xl bg-white/95 p-4 shadow-xl ring-1 ring-slate-200 backdrop-blur">
      <div className="text-sm font-semibold text-slate-700">{ui.textViewTitle}</div>
      <div className="mt-3 min-h-0 flex-1 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
        {textViewRows.length === 0 ? (
          <div className="px-2 py-1 text-xs text-slate-500">{ui.textViewEmpty}</div>
        ) : (
          <div
            className={[
              "flex h-full min-h-0 overflow-hidden rounded-xl border transition",
              isReadMode
                ? "border-slate-200 bg-slate-100 text-slate-700"
                : "border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/30",
            ].join(" ")}
          >
            <textarea
              ref={textViewTextareaRef}
              value={textViewDraft}
              readOnly={isReadMode}
              onFocus={() => {
                setIsTextViewEditing(true);
                textViewEditSessionRef.current = { hasPushedHistory: false };
              }}
              onChange={
                isReadMode
                  ? undefined
                  : (event) => {
                      const nextValue = event.target.value;
                      setTextViewDraft(nextValue);
                      applyTextViewDraft(nextValue);
                    }
              }
              onBlur={() => {
                setIsTextViewEditing(false);
                textViewEditSessionRef.current = { hasPushedHistory: false };
              }}
              onKeyDown={isReadMode ? undefined : handleTextViewTextareaKeyDown}
              className="h-full min-h-0 w-full resize-none overflow-auto bg-transparent px-3 py-2 font-mono text-xs leading-5 text-slate-900 outline-none"
              placeholder={ui.textViewEmpty}
              spellCheck={false}
            />
          </div>
        )}
      </div>
      <div className="mt-2 text-[11px] text-slate-500">{ui.textViewShortcutHint}</div>
    </div>
  ) : null;

  const fullscreenToolbar = activeSheet ? (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={toggleViewerMode}
        className={
          viewerMode === "read"
            ? "rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
            : "rounded-2xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
        }
        title={viewerMode === "read" ? ui.switchToEditMode : ui.switchToReadMode}
      >
        {viewerMode === "read" ? ui.modeRead : ui.modeEdit}
      </button>

      <button
        type="button"
        onClick={() => setFullscreenPrimaryView((prev) => (prev === "mindmap" ? "text" : "mindmap"))}
        className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
        title={isFullscreenTextView ? ui.switchToMindmapView : ui.switchToTextView}
      >
        {isFullscreenTextView ? ui.viewMindmap : ui.viewTextView}
      </button>

      {viewerMode === "edit" ? (
        <>
          <button
            type="button"
            disabled={!canUndo}
            onClick={undo}
            className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
          >
            {ui.undo}
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={redo}
            className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
          >
            {ui.redo}
          </button>
        </>
      ) : null}

      <button
        type="button"
        disabled={!collapseAction}
        onClick={runCollapseAction}
        className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
      >
        {collapseAction?.label ?? ui.collapseExpand}
      </button>

      <button
        type="button"
        onClick={() => void exportPng()}
        className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
      >
        PNG
      </button>
      <button
        type="button"
        onClick={exportSvg}
        className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
      >
        SVG
      </button>
      <button
        type="button"
        onClick={() => void exportPdf()}
        className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
      >
        PDF
      </button>
      <button
        type="button"
        onClick={exportXmind}
        className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
      >
        XMind
      </button>
    </div>
  ) : null;

  return (
    <ToolPageLayout toolSlug="xmind-viewer" maxWidthClassName="max-w-7xl">
      <div className="space-y-8">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        {draftStatus === "available" && editorSheets.length === 0 && (
          <div className="mb-6 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-amber-900">{ui.draftDetected}</div>
                <div className="mt-1 text-xs text-amber-800">{ui.draftPrompt}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={restoreDraft}
                  className="rounded-2xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
                >
                  {ui.restoreDraft}
                </button>
                <button
                  type="button"
                  onClick={() => setDraftStatus("dismissed")}
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100"
                >
                  {ui.ignoreDraft}
                </button>
                <button
                  type="button"
                  onClick={deleteDraft}
                  className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  {ui.deleteDraft}
                </button>
              </div>
            </div>
          </div>
        )}

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
              <div className="text-sm font-semibold text-slate-900">{ui.openFile}</div>
              <div className="mt-1 text-xs text-slate-500">{ui.dropTip || DEFAULT_DROP_REPLACE_HINT}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openFilePicker}
                className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {file ? ui.replaceFile : ui.chooseFile}
              </button>
              <button
                type="button"
                disabled={!outline}
                onClick={() => void copy()}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                {ui.copyOutline}
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
                {ui.downloadOutline}
              </button>
              <button
                type="button"
                disabled={!file && !parsed}
                onClick={clear}
                className="rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {ui.clear}
              </button>
              <input ref={inputRef} type="file" accept=".xmind" className="hidden" onChange={onChange} />
            </div>
          </div>

          {(isLoading || error || copyHint) && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
              {isLoading && <div className="text-slate-600">{ui.parsing}</div>}
              {copyHint && <div className="text-slate-600" aria-live="polite">{copyHint}</div>}
              {error && (
                <div className="text-rose-600" aria-live="polite">
                  {ui.error}: {error}
                </div>
              )}
            </div>
          )}
        </div>

        {editorSheets.length > 0 && activeSheet && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{ui.sheetTotalPrefix}</span>{" "}
              <span className="text-slate-500">
                ({editorSheets.length}
                {ui.sheetTotalSuffix ? ` ${ui.sheetTotalSuffix}` : ""})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={activeSheetId ?? ""}
                onChange={(e) => {
                  const nextId = e.target.value || null;
                  switchActiveSheet(nextId);
                }}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 outline-none"
              >
                {editorSheets.map((sheet) => (
                  <option key={sheet.id} value={sheet.id}>
                    {sheet.title.slice(0, 80)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={createNewSheet}
                disabled={isReadMode}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {ui.newCanvas}
              </button>
              <button
                type="button"
                onClick={renameActiveSheet}
                disabled={isReadMode}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                {ui.rename}
              </button>
              <button
                type="button"
                onClick={duplicateActiveSheet}
                disabled={isReadMode}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                {ui.duplicate}
              </button>
              <button
                type="button"
                onClick={deleteActiveSheet}
                disabled={isReadMode || editorSheets.length <= 1}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50 disabled:opacity-60"
              >
                {ui.delete}
              </button>
              <button
                type="button"
                onClick={() => moveActiveSheet(-1)}
                disabled={isReadMode || activeSheetIndex <= 0}
                aria-label={ui.moveUp}
                title={ui.moveUp}
                className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveActiveSheet(1)}
                disabled={isReadMode || activeSheetIndex < 0 || activeSheetIndex >= editorSheets.length - 1}
                aria-label={ui.moveDown}
                title={ui.moveDown}
                className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                ↓
              </button>

              <select
                value={effectiveLayoutMode}
                onChange={(e) => setEffectiveLayoutMode(e.target.value as MindMapLayoutMode)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 outline-none"
                title={ui.layoutTitle}
              >
                <option value="balanced">{ui.layoutBalanced}</option>
                <option value="right">{ui.layoutRight}</option>
                <option value="left">{ui.layoutLeft}</option>
                <option value="up">{ui.layoutUp}</option>
                <option value="down">{ui.layoutDown}</option>
                <option value="downCompact">{ui.layoutDownCompact}</option>
                <option value="downCompact2">{ui.layoutDownCompact2}</option>
                <option value="superCompactDown">{ui.layoutSuperCompactDown}</option>
                <option value="superCompactRight">{ui.layoutSuperCompactRight}</option>
                <option value="superCompactDownVertical">{ui.layoutSuperCompactDownVertical}</option>
              </select>

              <select
                value={effectiveThemeId}
                onChange={(e) => setEffectiveThemeId(e.target.value as MindMapThemeId)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 outline-none"
                title={ui.themeTitle}
              >
                {Object.values(themes).map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {ui.themePrefix}: {theme.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={toggleViewerMode}
                className={
                  viewerMode === "read"
                    ? "rounded-2xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    : "rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                }
                title={viewerMode === "read" ? ui.switchToEditMode : ui.switchToReadMode}
              >
                {viewerMode === "read" ? ui.modeRead : ui.modeEdit}
              </button>

              <button
                type="button"
                disabled={isReadMode || !canUndo}
                onClick={undo}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                {ui.undo}
              </button>
              <button
                type="button"
                disabled={isReadMode || !canRedo}
                onClick={redo}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                {ui.redo}
              </button>
              <button
                type="button"
                disabled={!collapseAction}
                onClick={runCollapseAction}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                {collapseAction?.label ?? ui.collapseExpand}
              </button>

              <button
                type="button"
                onClick={() => void exportPng()}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                {ui.exportPng}
              </button>
              <button
                type="button"
                onClick={exportSvg}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                {ui.exportSvg}
              </button>
              <button
                type="button"
                onClick={() => void exportPdf()}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                {ui.exportPdf}
              </button>
              <button
                type="button"
                onClick={exportXmind}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                {ui.exportXmind}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6">
          <div className="min-w-0">
            <XmindMindMapCanvas
              ref={canvasHandleRef}
              rootTopic={activeSheet?.rootTopic ?? null}
              layoutMode={effectiveLayoutMode}
              theme={activeTheme}
              mode={viewerMode}
              relationships={activeSheet?.relationships ?? []}
              boundaries={activeSheet?.boundaries ?? []}
              summaries={activeSheet?.summaries ?? []}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onRenameNode={renameNodeFromCanvas}
              onToggleCollapse={toggleCollapse}
              onMoveNode={moveNode}
              viewResetKey={canvasViewResetKey}
              isEnglish={isEnglish}
              fullscreenToolbar={fullscreenToolbar}
              fullscreenOverlay={isFullscreenTextView ? fullscreenTextViewOverlay : null}
              fullscreenSidebar={
                activeSheet && !isFullscreenTextView ? (
                  <div className="space-y-3">
                  <div className="rounded-3xl bg-white/70 p-3 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold text-slate-700">{ui.panelCanvas}</div>
                    <select
                      value={activeSheetId ?? ""}
                      onChange={(e) => {
                        const nextId = e.target.value || null;
                        switchActiveSheet(nextId);
                      }}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 outline-none"
                    >
                      {editorSheets.map((sheet) => (
                        <option key={sheet.id} value={sheet.id}>
                          {sheet.title.slice(0, 80)}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 max-h-40 overflow-auto rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-200">
                      <div className="grid gap-1">
                        {editorSheets.map((sheet) => {
                          const isActive = sheet.id === activeSheetId;
                          return (
                            <button
                              key={sheet.id}
                              type="button"
                              onClick={() => switchActiveSheet(sheet.id)}
                              className={
                                isActive
                                  ? "rounded-2xl bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white"
                                  : "rounded-2xl bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                              }
                            >
                              {sheet.title.slice(0, 80)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={createNewSheet}
                        disabled={isReadMode}
                        className="rounded-2xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                      >
                        {ui.create}
                      </button>
                      <button
                        type="button"
                        onClick={renameActiveSheet}
                        disabled={isReadMode}
                        className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
                      >
                        {ui.rename}
                      </button>
                      <button
                        type="button"
                        onClick={duplicateActiveSheet}
                        disabled={isReadMode}
                        className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
                      >
                        {ui.duplicate}
                      </button>
                      <button
                        type="button"
                        onClick={deleteActiveSheet}
                        disabled={isReadMode || editorSheets.length <= 1}
                        className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50 disabled:opacity-60"
                      >
                        {ui.delete}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveActiveSheet(-1)}
                        disabled={isReadMode || activeSheetIndex <= 0}
                        className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                      >
                        {ui.moveUp}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveActiveSheet(1)}
                        disabled={isReadMode || activeSheetIndex < 0 || activeSheetIndex >= editorSheets.length - 1}
                        className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                      >
                        {ui.moveDown}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-3xl bg-white/70 p-3 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold text-slate-700">{ui.panelLayout}</div>
                    <select
                      value={effectiveLayoutMode}
                      onChange={(e) => setEffectiveLayoutMode(e.target.value as MindMapLayoutMode)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 outline-none"
                      title={ui.layoutTitle}
                    >
                      <option value="balanced">{ui.layoutBalanced}</option>
                      <option value="right">{ui.layoutRight}</option>
                      <option value="left">{ui.layoutLeft}</option>
                      <option value="up">{ui.layoutUp}</option>
                      <option value="down">{ui.layoutDown}</option>
                      <option value="downCompact">{ui.layoutDownCompact}</option>
                      <option value="downCompact2">{ui.layoutDownCompact2}</option>
                      <option value="superCompactDown">{ui.layoutSuperCompactDown}</option>
                      <option value="superCompactRight">{ui.layoutSuperCompactRight}</option>
                      <option value="superCompactDownVertical">{ui.layoutSuperCompactDownVertical}</option>
                    </select>
                  </div>

                  <div className="rounded-3xl bg-white/70 p-3 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold text-slate-700">{ui.panelTheme}</div>
                    <select
                      value={effectiveThemeId}
                      onChange={(e) => setEffectiveThemeId(e.target.value as MindMapThemeId)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 outline-none"
                      title={ui.themeTitle}
                    >
                      {Object.values(themes).map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {viewerMode === "edit" ? (
                    <div className="rounded-3xl bg-white/70 p-3 ring-1 ring-slate-200">
                      <div className="text-xs font-semibold text-slate-700">{ui.panelExport}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void exportPng()}
                          className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                        >
                          PNG
                        </button>
                        <button
                          type="button"
                          onClick={exportSvg}
                          className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                        >
                          SVG
                        </button>
                        <button
                          type="button"
                          onClick={() => void exportPdf()}
                          className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                        >
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={exportXmind}
                          className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                        >
                          .xmind
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {viewerMode === "edit" ? (
                    <div className="rounded-3xl bg-white/70 p-3 ring-1 ring-slate-200">
                      <div className="text-xs font-semibold text-slate-700">{ui.panelEdit}</div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          disabled={!canUndo}
                          onClick={undo}
                          className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                        >
                          {ui.undo}
                        </button>
                        <button
                          type="button"
                          disabled={!canRedo}
                          onClick={redo}
                          className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                        >
                          {ui.redo}
                        </button>
                        <button
                          type="button"
                          disabled={!collapseAction}
                          onClick={runCollapseAction}
                          className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                        >
                          {collapseAction?.label ?? ui.collapseExpand}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {renderVersionHistoryPanel("rounded-3xl bg-white/70 p-3 ring-1 ring-slate-200")}

                  {viewerMode === "edit" ? (
                  <div className="rounded-3xl bg-white/70 p-3 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold text-slate-700">{ui.panelNode}</div>
                    <input
                      value={editingTitle}
                      onChange={(event) => {
                        const nextTitle = event.target.value;
                        setEditingTitle(nextTitle);
                        updateSelectedNodeTitle(nextTitle);
                      }}
                      onBlur={() => {
                        const normalized = editingTitle.trim() || ui.untitled;
                        if (normalized !== editingTitle) {
                          setEditingTitle(normalized);
                          updateSelectedNodeTitle(normalized);
                        }
                      }}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none"
                      placeholder={ui.nodeTitlePlaceholder}
                    />
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={addChildNode}
                        className="rounded-2xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                      >
                        {ui.childNode}
                      </button>
                      <button
                        type="button"
                        onClick={addSiblingNode}
                        disabled={selectedNodeIsRoot}
                        className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                      >
                        {ui.siblingNode}
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelectedNode}
                        disabled={selectedNodeIsRoot}
                        className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                      >
                        {ui.delete}
                      </button>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      {selectedNode ? `${ui.currentNode}: ${selectedNode.title.slice(0, 30)}` : ui.noNodeSelected}
                    </div>
                    <div className="mt-3 rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-200">
                      <div className="text-[11px] font-semibold text-slate-700">{ui.boundaryTitle}</div>
                      <input
                        value={boundaryTitleInput}
                        onChange={(event) => setBoundaryTitleInput(event.target.value)}
                        onBlur={updateBoundaryTitle}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none"
                        placeholder={ui.boundaryLabel}
                      />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={addBoundary}
                          disabled={!selectedNodeId || Boolean(selectedNodeBoundary)}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                        >
                          {ui.boundaryAdd}
                        </button>
                        <button
                          type="button"
                          onClick={removeBoundary}
                          disabled={!selectedNodeBoundary}
                          className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                        >
                          {ui.boundaryRemove}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-200">
                      <div className="text-[11px] font-semibold text-slate-700">{ui.summaryTitle}</div>
                      <input
                        value={summaryTitleInput}
                        onChange={(event) => setSummaryTitleInput(event.target.value)}
                        onBlur={updateSummaryTitle}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none"
                        placeholder={ui.summaryLabel}
                      />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={addSummary}
                          disabled={!selectedNodeId || !selectedNodeHasChildren || Boolean(selectedNodeSummary)}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                        >
                          {ui.summaryAdd}
                        </button>
                        <button
                          type="button"
                          onClick={removeSummary}
                          disabled={!selectedNodeSummary}
                          className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                        >
                          {ui.summaryRemove}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-200">
                      <div className="text-[11px] font-semibold text-slate-700">{ui.relationTitle}</div>
                      <select
                        value={relationTargetId}
                        onChange={(event) => setRelationTargetId(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none"
                      >
                        <option value="">{ui.relationTarget}</option>
                        {relationTargetOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.title.slice(0, 60)}
                          </option>
                        ))}
                      </select>
                      <input
                        value={relationTitleInput}
                        onChange={(event) => setRelationTitleInput(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none"
                        placeholder={ui.relationLabel}
                      />
                      <button
                        type="button"
                        onClick={addRelationship}
                        disabled={!relationTargetId || relationExists}
                        className="mt-2 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                      >
                        {ui.relationAdd}
                      </button>
                      {relationGuardText ? <div className="mt-1 text-[11px] text-amber-700">{relationGuardText}</div> : null}
                      <div className="mt-2 space-y-2">
                        {selectedNodeRelationships.length === 0 ? (
                          <div className="text-[11px] text-slate-500">{ui.relationEmpty}</div>
                        ) : (
                          selectedNodeRelationships.map((relation) => (
                            <div
                              key={relation.id}
                              className="flex items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-2 text-[11px] text-slate-700 ring-1 ring-slate-200"
                            >
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-slate-900">{relation.targetTitle}</div>
                                {relation.title ? <div className="truncate text-slate-500">{relation.title}</div> : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeRelationship(relation.id)}
                                className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100"
                              >
                                {ui.relationRemove}
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                  ) : null}
                </div>
              ) : null
              }
            />
            </div>

            <aside className="space-y-4">
            {activeSheet && (
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.nodeEditor}</div>
                {!selectedNode ? (
                  <div className="mt-3 text-sm text-slate-500">{ui.selectNodeTip}</div>
                ) : (
                  <>
                    <label className="mt-3 block text-xs font-semibold text-slate-700">
                      {ui.nodeTitleLabel}
                      <input
                        value={editingTitle}
                        readOnly={isReadMode}
                        onChange={
                          isReadMode
                            ? undefined
                            : (event) => {
                                const nextTitle = event.target.value;
                                setEditingTitle(nextTitle);
                                updateSelectedNodeTitle(nextTitle);
                              }
                        }
                        onBlur={() => {
                          if (isReadMode) return;
                          const normalized = editingTitle.trim() || ui.untitled;
                          if (normalized !== editingTitle) {
                            setEditingTitle(normalized);
                            updateSelectedNodeTitle(normalized);
                          }
                        }}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none"
                        placeholder={ui.inputNodeTitle}
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={addChildNode}
                        disabled={isReadMode}
                        className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        {ui.addChildNode}
                      </button>
                      <button
                        type="button"
                        onClick={addSiblingNode}
                        disabled={isReadMode || selectedNodeIsRoot}
                        className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                      >
                        {ui.addSiblingNode}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedNodeId) return;
                          toggleCollapse(selectedNodeId);
                        }}
                        disabled={!selectedNodeHasChildren}
                        className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                      >
                        {selectedNode.collapsed ? ui.expand : ui.collapse}
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelectedNode}
                        disabled={isReadMode || selectedNodeIsRoot}
                        className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                      >
                        {ui.deleteNode}
                      </button>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-700">{ui.boundaryTitle}</div>
                      <div className="mt-2 grid gap-2">
                        <input
                          value={boundaryTitleInput}
                          onChange={(event) => setBoundaryTitleInput(event.target.value)}
                          onBlur={updateBoundaryTitle}
                          disabled={isReadMode}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                          placeholder={ui.boundaryLabel}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={addBoundary}
                            disabled={isReadMode || !selectedNodeId || Boolean(selectedNodeBoundary)}
                            className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                          >
                            {ui.boundaryAdd}
                          </button>
                          <button
                            type="button"
                            onClick={removeBoundary}
                            disabled={isReadMode || !selectedNodeBoundary}
                            className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                          >
                            {ui.boundaryRemove}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-700">{ui.summaryTitle}</div>
                      <div className="mt-2 grid gap-2">
                        <input
                          value={summaryTitleInput}
                          onChange={(event) => setSummaryTitleInput(event.target.value)}
                          onBlur={updateSummaryTitle}
                          disabled={isReadMode}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                          placeholder={ui.summaryLabel}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={addSummary}
                            disabled={isReadMode || !selectedNodeId || !selectedNodeHasChildren || Boolean(selectedNodeSummary)}
                            className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                          >
                            {ui.summaryAdd}
                          </button>
                          <button
                            type="button"
                            onClick={removeSummary}
                            disabled={isReadMode || !selectedNodeSummary}
                            className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                          >
                            {ui.summaryRemove}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-700">{ui.relationTitle}</div>
                      <div className="mt-2 grid gap-2">
                        <select
                          value={relationTargetId}
                          onChange={(event) => setRelationTargetId(event.target.value)}
                          disabled={isReadMode}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                        >
                          <option value="">{ui.relationTarget}</option>
                          {relationTargetOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.title.slice(0, 80)}
                            </option>
                          ))}
                        </select>
                        <input
                          value={relationTitleInput}
                          onChange={(event) => setRelationTitleInput(event.target.value)}
                          disabled={isReadMode}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                          placeholder={ui.relationLabel}
                        />
                        <button
                          type="button"
                          onClick={addRelationship}
                          disabled={isReadMode || !relationTargetId || relationExists}
                          className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                        >
                          {ui.relationAdd}
                        </button>
                        {relationGuardText ? <div className="text-xs text-amber-700">{relationGuardText}</div> : null}
                      </div>

                      <div className="mt-3 space-y-2">
                        {selectedNodeRelationships.length === 0 ? (
                          <div className="text-xs text-slate-500">{ui.relationEmpty}</div>
                        ) : (
                          selectedNodeRelationships.map((relation) => (
                            <div
                              key={relation.id}
                              className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200"
                            >
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-slate-900">{relation.targetTitle}</div>
                                {relation.title ? <div className="truncate text-slate-500">{relation.title}</div> : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeRelationship(relation.id)}
                                disabled={isReadMode}
                                className="rounded-xl bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                              >
                                {ui.relationRemove}
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-slate-500">
                      {selectedNodeIsRoot ? ui.rootNodeTip : ui.nodeEditTip}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeSheet ? renderVersionHistoryPanel("rounded-3xl bg-white p-5 ring-1 ring-slate-200") : null}

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.fileInfo}</div>
              <div className="mt-3 text-sm text-slate-700">
                <div>{ui.fileName}: {file?.name ?? "-"}</div>
                <div className="mt-1">{ui.fileSize}: {file ? formatBytes(file.size) : "-"}</div>
                <div className="mt-1">
                  {ui.fileStatus}: {isLoading ? ui.statusParsing : error ? ui.statusFailed : parsed ? ui.statusParsed : ui.statusIdle}
                </div>
              </div>
              {parsed && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-slate-900">{ui.zipEntries}</div>
                  <div className="mt-2 text-xs text-slate-500">
                    {ui.parseSource}: <code className="font-mono">{parsed.source ?? "-"}</code>
                  </div>
                  <div className="mt-2 max-h-44 overflow-auto rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
                    {parsed.entries.join("\n")}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-500">
              {ui.noteBlock}
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{ui.outlinePreview}</div>
                <div className="text-xs text-slate-500">
                  {activeSheet ? `${ui.currentSheet}: ${activeSheet.title}` : "-"}
                </div>
              </div>
              <textarea
                value={outline}
                readOnly
                placeholder={ui.outlinePlaceholder}
                className="mt-4 h-96 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
            </div>
          </aside>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
          <div className="text-base font-semibold text-slate-900">{ui.tutorial}</div>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>{ui.tutorial1}</li>
            <li>{ui.tutorial2}</li>
            <li>{ui.tutorial3}</li>
            <li>{ui.tutorial4}</li>
            <li>{ui.tutorial5}</li>
          </ol>
        </div>

        <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
          <div className="text-base font-semibold text-slate-900">{ui.faq}</div>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div>
              <div className="font-semibold text-slate-900">{ui.faqFormat}</div>
              <div className="mt-1 text-slate-600">{ui.faqFormatDesc}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">{ui.faqNoContent}</div>
              <div className="mt-1 text-slate-600">{ui.faqNoContentDesc}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">{ui.privacy}</div>
              <div className="mt-1 text-slate-600">{ui.privacyDesc}</div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </ToolPageLayout>
  );
}
