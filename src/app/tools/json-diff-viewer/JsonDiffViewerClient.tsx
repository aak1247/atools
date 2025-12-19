"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type DiffKind = "equal" | "added" | "removed" | "changed" | "type-changed";

type DiffNode = {
  key: string;
  path: string;
  kind: DiffKind;
  left: unknown;
  right: unknown;
  children?: DiffNode[];
};

const safeJsonParse = (text: string): { ok: boolean; value: unknown } => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const classify = (value: unknown) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

const joinPath = (base: string, token: string) => (base ? `${base}.${token}` : token);

const buildTree = (left: unknown, right: unknown, key: string, path: string): DiffNode => {
  if (left === right) return { key, path, kind: "equal", left, right };

  const lt = classify(left);
  const rt = classify(right);
  if (lt !== rt) return { key, path, kind: "type-changed", left, right };

  if (Array.isArray(left) && Array.isArray(right)) {
    const max = Math.max(left.length, right.length);
    const children: DiffNode[] = [];
    for (let i = 0; i < max; i += 1) {
      const childKey = `[${i}]`;
      const childPath = joinPath(path, childKey);
      if (i >= left.length) children.push({ key: childKey, path: childPath, kind: "added", left: null, right: right[i] });
      else if (i >= right.length) children.push({ key: childKey, path: childPath, kind: "removed", left: left[i], right: null });
      else children.push(buildTree(left[i], right[i], childKey, childPath));
    }
    const kind = children.every((c) => c.kind === "equal") ? "equal" : "changed";
    return { key, path, kind, left, right, children };
  }

  if (isRecord(left) && isRecord(right)) {
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    const children: DiffNode[] = [];
    for (const k of keys) {
      const hasL = Object.prototype.hasOwnProperty.call(left, k);
      const hasR = Object.prototype.hasOwnProperty.call(right, k);
      const childPath = joinPath(path, k);
      if (!hasL && hasR) children.push({ key: k, path: childPath, kind: "added", left: null, right: right[k] });
      else if (hasL && !hasR) children.push({ key: k, path: childPath, kind: "removed", left: left[k], right: null });
      else children.push(buildTree(left[k], right[k], k, childPath));
    }
    const kind = children.every((c) => c.kind === "equal") ? "equal" : "changed";
    return { key, path, kind, left, right, children };
  }

  return { key, path, kind: "changed", left, right };
};

const prettyInline = (value: unknown): string => {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  try {
    const text = JSON.stringify(value);
    if (text.length <= 120) return text;
    return `${text.slice(0, 117)}…`;
  } catch {
    return String(value);
  }
};

const countKinds = (node: DiffNode) => {
  const counts = { added: 0, removed: 0, changed: 0, type: 0, equal: 0 };
  const walk = (n: DiffNode) => {
    if (n.kind === "added") counts.added += 1;
    else if (n.kind === "removed") counts.removed += 1;
    else if (n.kind === "type-changed") counts.type += 1;
    else if (n.kind === "changed") counts.changed += 1;
    else counts.equal += 1;
    if (n.children) for (const c of n.children) walk(c);
  };
  walk(node);
  return counts;
};

const DEFAULT_UI = {
  title: "JSON 差异对比工具",
  leftJson: "左侧 JSON",
  rightJson: "右侧 JSON",
  clear: "清空",
  format: "格式化",
  swap: "交换左右",
  diff: "对比差异",
  added: "新增",
  removed: "删除",
  changed: "修改",
  unchanged: "无变化",
  expandAll: "展开全部",
  collapseAll: "收起全部",
  copyPath: "复制路径",
  showPath: "显示路径",
  lineNumbers: "显示行号",
  statistics: "统计信息",
  totalChanges: "总差异",
  loading: "处理中...",
  invalidJson: "无效 JSON 格式",
  noDifferences: "没有差异",
  leftError: "错误：左侧不是合法 JSON。",
  rightError: "错误：右侧不是合法 JSON。",
  visualDiff: "可视化差异",
  hideEqual: "隐藏相同项",
  copyDiffList: "复制差异列表 JSON",
  diffSummary: "新增 {added} · 删除 {removed} · 变化 {changed} · 类型变化 {type}",
  fixJsonFirst: "请先修正两侧 JSON 解析错误。",
  pathHeader: "Path",
  leftHeader: "左侧",
  rightHeader: "右侧"
} as const;

type Ui = typeof DEFAULT_UI;

export default function JsonDiffViewerClient() {
  return (
    <ToolPageLayout toolSlug="json-diff-viewer" maxWidthClassName="max-w-6xl">
      <JsonDiffViewerInner />
    </ToolPageLayout>
  );
}

function JsonDiffViewerInner() {
  const config = useOptionalToolConfig("json-diff-viewer");
  const ui: Ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<Ui>) };

  const [leftText, setLeftText] = useState('{\n  "a": 1,\n  "b": { "c": true }\n}\n');
  const [rightText, setRightText] = useState('{\n  "a": 2,\n  "b": { "c": true, "d": "new" }\n}\n');
  const [hideEqual, setHideEqual] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "": true });

  const parsed = useMemo(() => {
    const left = safeJsonParse(leftText);
    const right = safeJsonParse(rightText);
    return { left, right };
  }, [leftText, rightText]);

  const tree = useMemo(() => {
    if (!parsed.left.ok || !parsed.right.ok) return null;
    return buildTree(parsed.left.value, parsed.right.value, "/", "");
  }, [parsed.left.ok, parsed.left.value, parsed.right.ok, parsed.right.value]);

  const counts = useMemo(() => (tree ? countKinds(tree) : null), [tree]);

  const toggle = (path: string) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const renderNode = (node: DiffNode, depth: number) => {
    if (hideEqual && node.kind === "equal") return null;
    const hasChildren = !!node.children && node.children.length > 0;
    const isOpen = expanded[node.path] ?? depth < 2;
    const badge =
      node.kind === "added"
        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
        : node.kind === "removed"
          ? "bg-rose-50 text-rose-800 ring-rose-200"
          : node.kind === "type-changed"
            ? "bg-amber-50 text-amber-800 ring-amber-200"
            : node.kind === "changed"
              ? "bg-slate-100 text-slate-800 ring-slate-200"
              : "bg-slate-50 text-slate-600 ring-slate-200";

    return (
      <div key={node.path}>
        <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-slate-100 px-3 py-2 text-xs">
          <div className="flex items-center gap-2" style={{ paddingLeft: depth * 12 }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggle(node.path)}
                className="h-6 w-6 rounded-lg bg-slate-100 text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-200"
                aria-label={isOpen ? "collapse" : "expand"}
              >
                {isOpen ? "−" : "+"}
              </button>
            ) : (
              <div className="h-6 w-6" />
            )}
            <div className="min-w-0">
              <div className="truncate font-mono text-slate-900">{node.key}</div>
              <div className="truncate text-[11px] text-slate-500">{node.path || "/"}</div>
            </div>
            <span className={`ml-auto inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${badge}`}>
              {node.kind}
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-700 break-words">{prettyInline(node.left)}</div>
          <div className="font-mono text-[11px] text-slate-700 break-words">{prettyInline(node.right)}</div>
        </div>
        {hasChildren && isOpen && node.children!.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const copyDiffList = async () => {
    if (!tree) return;
    const list: Array<{ path: string; kind: DiffKind; left: unknown; right: unknown }> = [];
    const walk = (n: DiffNode) => {
      if (n.kind !== "equal") list.push({ path: n.path || "/", kind: n.kind, left: n.left, right: n.right });
      if (n.children) for (const c of n.children) walk(c);
    };
    walk(tree);
    await navigator.clipboard.writeText(JSON.stringify(list, null, 2));
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.leftJson}</div>
            <textarea
              value={leftText}
              onChange={(e) => setLeftText(e.target.value)}
              className="mt-3 h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
            {!parsed.left.ok && <div className="mt-2 text-sm text-rose-600">{ui.leftError}</div>}
          </div>
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.rightJson}</div>
            <textarea
              value={rightText}
              onChange={(e) => setRightText(e.target.value)}
              className="mt-3 h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
            {!parsed.right.ok && <div className="mt-2 text-sm text-rose-600">{ui.rightError}</div>}
          </div>
        </div>

        <div className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">{ui.visualDiff}</div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={hideEqual}
                  onChange={(e) => setHideEqual(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {ui.hideEqual}
              </label>
              <button
                type="button"
                onClick={() => void copyDiffList()}
                disabled={!tree}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                {ui.copyDiffList}
              </button>
              {counts && (
                <div className="text-xs text-slate-600">
                  {ui.diffSummary.replace('{added}', counts.added.toString()).replace('{removed}', counts.removed.toString()).replace('{changed}', counts.changed.toString()).replace('{type}', counts.type.toString())}
                </div>
              )}
            </div>
          </div>

          {!tree ? (
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
              {ui.fixJsonFirst}
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                <div>{ui.pathHeader}</div>
                <div>{ui.leftHeader}</div>
                <div>{ui.rightHeader}</div>
              </div>
              <div className="max-h-[520px] overflow-auto bg-white">{renderNode(tree, 0)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

