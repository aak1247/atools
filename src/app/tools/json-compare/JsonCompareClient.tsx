"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type DiffKind = "added" | "removed" | "changed" | "type-changed";

type DiffItem = {
  path: string;
  kind: DiffKind;
  left: unknown;
  right: unknown;
};

const safeJsonParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toPointerToken = (token: string) => token.replace(/~/g, "~0").replace(/\//g, "~1");

const joinPointer = (base: string, token: string) => (base ? `${base}/${toPointerToken(token)}` : `/${toPointerToken(token)}`);

const classify = (value: unknown) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

const diffValues = (left: unknown, right: unknown, path: string, out: DiffItem[]) => {
  if (left === right) return;

  const lt = classify(left);
  const rt = classify(right);

  if (lt !== rt) {
    out.push({ path, kind: "type-changed", left, right });
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const max = Math.max(left.length, right.length);
    for (let i = 0; i < max; i += 1) {
      const childPath = joinPointer(path, String(i));
      if (i >= left.length) out.push({ path: childPath, kind: "added", left: null, right: right[i] });
      else if (i >= right.length) out.push({ path: childPath, kind: "removed", left: left[i], right: null });
      else diffValues(left[i], right[i], childPath, out);
    }
    return;
  }

  if (isRecord(left) && isRecord(right)) {
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    for (const key of keys) {
      const hasL = Object.prototype.hasOwnProperty.call(left, key);
      const hasR = Object.prototype.hasOwnProperty.call(right, key);
      const childPath = joinPointer(path, key);
      if (!hasL && hasR) out.push({ path: childPath, kind: "added", left: null, right: right[key] });
      else if (hasL && !hasR) out.push({ path: childPath, kind: "removed", left: left[key], right: null });
      else diffValues(left[key], right[key], childPath, out);
    }
    return;
  }

  out.push({ path, kind: "changed", left, right });
};

const pretty = (value: unknown) => {
  if (typeof value === "string") return JSON.stringify(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export default function JsonCompareClient() {
  const [leftText, setLeftText] = useState('{\n  "a": 1,\n  "b": { "c": true }\n}\n');
  const [rightText, setRightText] = useState('{\n  "a": 2,\n  "b": { "c": true, "d": "new" }\n}\n');

  const parsed = useMemo(() => {
    const left = safeJsonParse(leftText);
    const right = safeJsonParse(rightText);
    return {
      leftOk: left !== null || leftText.trim() === "null",
      rightOk: right !== null || rightText.trim() === "null",
      left,
      right,
    };
  }, [leftText, rightText]);

  const diffs = useMemo(() => {
    if (!parsed.leftOk || !parsed.rightOk) return [] as DiffItem[];
    const out: DiffItem[] = [];
    diffValues(parsed.left, parsed.right, "", out);
    return out;
  }, [parsed.left, parsed.leftOk, parsed.right, parsed.rightOk]);

  const counts = useMemo(() => {
    const c = { added: 0, removed: 0, changed: 0, type: 0 };
    for (const d of diffs) {
      if (d.kind === "added") c.added += 1;
      else if (d.kind === "removed") c.removed += 1;
      else if (d.kind === "changed") c.changed += 1;
      else c.type += 1;
    }
    return c;
  }, [diffs]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  return (
    <ToolPageLayout toolSlug="json-compare">
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
              {!parsed.leftOk && <div className="mt-2 text-sm text-rose-600">错误：左侧不是合法 JSON。</div>}
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">右侧 JSON</div>
              <textarea
                value={rightText}
                onChange={(e) => setRightText(e.target.value)}
                className="mt-3 h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              {!parsed.rightOk && <div className="mt-2 text-sm text-rose-600">错误：右侧不是合法 JSON。</div>}
            </div>
          </div>

          <div className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">差异结果</div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-slate-600">
                  新增 {counts.added} · 删除 {counts.removed} · 变化 {counts.changed} · 类型变化 {counts.type}
                </div>
                <button
                  type="button"
                  onClick={() => void copy(JSON.stringify(diffs, null, 2))}
                  disabled={diffs.length === 0}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  复制差异 JSON
                </button>
              </div>
            </div>

            {diffs.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
                {parsed.leftOk && parsed.rightOk ? "未发现差异。" : "请先修正两侧 JSON 解析错误。"}
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <div className="max-h-[420px] overflow-auto bg-white">
                  <table className="w-full table-fixed border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-700">
                      <tr>
                        <th className="w-44 border-b border-slate-200 px-3 py-2">Path (JSON Pointer)</th>
                        <th className="w-28 border-b border-slate-200 px-3 py-2">类型</th>
                        <th className="border-b border-slate-200 px-3 py-2">左侧</th>
                        <th className="border-b border-slate-200 px-3 py-2">右侧</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-800">
                      {diffs.map((d) => (
                        <tr key={`${d.kind}:${d.path}`} className="odd:bg-white even:bg-slate-50/40">
                          <td className="border-b border-slate-100 px-3 py-2 font-mono break-all">{d.path || "/"}</td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                                d.kind === "added"
                                  ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                                  : d.kind === "removed"
                                    ? "bg-rose-50 text-rose-800 ring-rose-200"
                                    : d.kind === "type-changed"
                                      ? "bg-amber-50 text-amber-800 ring-amber-200"
                                      : "bg-slate-100 text-slate-800 ring-slate-200"
                              }`}
                            >
                              {d.kind}
                            </span>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <pre className="whitespace-pre-wrap break-words font-mono">{pretty(d.left)}</pre>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <pre className="whitespace-pre-wrap break-words font-mono">{pretty(d.right)}</pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-4 text-xs text-slate-500">
              说明：这是结构化对比（递归比较对象/数组）。数组默认按索引比较，忽略 key 顺序（对象键会排序后比对）。
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}

