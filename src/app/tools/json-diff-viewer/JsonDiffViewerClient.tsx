"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

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

export default function JsonDiffViewerClient() {
  return (
    <ToolPageLayout toolSlug="json-diff-viewer" maxWidthClassName="max-w-6xl">
      <JsonDiffViewerInner />
    </ToolPageLayout>
  );
}

function JsonDiffViewerInner() {
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
            <div className="text-sm font-semibold text-slate-900">左侧 JSON</div>
            <textarea
              value={leftText}
              onChange={(e) => setLeftText(e.target.value)}
              className="mt-3 h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
            {!parsed.left.ok && <div className="mt-2 text-sm text-rose-600">错误：左侧不是合法 JSON。</div>}
          </div>
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">右侧 JSON</div>
            <textarea
              value={rightText}
              onChange={(e) => setRightText(e.target.value)}
              className="mt-3 h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
            {!parsed.right.ok && <div className="mt-2 text-sm text-rose-600">错误：右侧不是合法 JSON。</div>}
          </div>
        </div>

        <div className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">可视化差异</div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={hideEqual}
                  onChange={(e) => setHideEqual(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                隐藏相同项
              </label>
              <button
                type="button"
                onClick={() => void copyDiffList()}
                disabled={!tree}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                复制差异列表 JSON
              </button>
              {counts && (
                <div className="text-xs text-slate-600">
                  新增 {counts.added} · 删除 {counts.removed} · 变化 {counts.changed} · 类型变化 {counts.type}
                </div>
              )}
            </div>
          </div>

          {!tree ? (
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
              请先修正两侧 JSON 解析错误。
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                <div>Path</div>
                <div>左侧</div>
                <div>右侧</div>
              </div>
              <div className="max-h-[520px] overflow-auto bg-white">{renderNode(tree, 0)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

