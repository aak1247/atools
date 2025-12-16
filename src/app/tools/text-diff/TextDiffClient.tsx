"use client";

import { useMemo, useState } from "react";

type DiffOp =
  | { type: "equal"; value: string }
  | { type: "insert"; value: string }
  | { type: "delete"; value: string };

const splitLines = (text: string): string[] => text.replace(/\r\n/g, "\n").split("\n");

const myersDiffLines = (a: string[], b: string[]): DiffOp[] => {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;

  const v = new Array<number>(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const kIndex = k + offset;
      let x = 0;
      if (k === -d || (k !== d && v[kIndex - 1] < v[kIndex + 1])) {
        x = v[kIndex + 1];
      } else {
        x = v[kIndex - 1] + 1;
      }
      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[kIndex] = x;

      if (x >= n && y >= m) {
        const ops: DiffOp[] = [];
        let bx = n;
        let by = m;

        for (let bd = d; bd > 0; bd -= 1) {
          const prevV = trace[bd - 1];
          const curK = bx - by;
          const curKIndex = curK + offset;

          let prevK: number;
          if (
            curK === -bd ||
            (curK !== bd && prevV[curKIndex - 1] < prevV[curKIndex + 1])
          ) {
            prevK = curK + 1;
          } else {
            prevK = curK - 1;
          }

          const prevX = prevV[prevK + offset];
          const prevY = prevX - prevK;

          while (bx > prevX && by > prevY) {
            ops.push({ type: "equal", value: a[bx - 1] });
            bx -= 1;
            by -= 1;
          }

          if (bx === prevX) {
            ops.push({ type: "insert", value: b[prevY] });
            by -= 1;
          } else {
            ops.push({ type: "delete", value: a[prevX] });
            bx -= 1;
          }
        }

        while (bx > 0 && by > 0) {
          ops.push({ type: "equal", value: a[bx - 1] });
          bx -= 1;
          by -= 1;
        }
        while (bx > 0) {
          ops.push({ type: "delete", value: a[bx - 1] });
          bx -= 1;
        }
        while (by > 0) {
          ops.push({ type: "insert", value: b[by - 1] });
          by -= 1;
        }

        ops.reverse();
        return ops;
      }
    }
  }

  // fallback (should not happen)
  return [
    ...a.map((line) => ({ type: "delete" as const, value: line })),
    ...b.map((line) => ({ type: "insert" as const, value: line })),
  ];
};

const buildUnifiedDiff = (ops: DiffOp[]): string => {
  const lines: string[] = ["--- a", "+++ b"];
  for (const op of ops) {
    if (op.type === "equal") lines.push(` ${op.value}`);
    if (op.type === "delete") lines.push(`-${op.value}`);
    if (op.type === "insert") lines.push(`+${op.value}`);
  }
  return lines.join("\n");
};

export default function TextDiffClient() {
  const [left, setLeft] = useState("hello\nworld\nfoo");
  const [right, setRight] = useState("hello\nWORLD\nbar\nfoo");
  const [ignoreTrailingWhitespace, setIgnoreTrailingWhitespace] = useState(false);

  const computed = useMemo(() => {
    const a = splitLines(left);
    const b = splitLines(right);
    const normA = ignoreTrailingWhitespace ? a.map((l) => l.replace(/\s+$/g, "")) : a;
    const normB = ignoreTrailingWhitespace ? b.map((l) => l.replace(/\s+$/g, "")) : b;
    const ops = myersDiffLines(normA, normB);
    const unified = buildUnifiedDiff(ops);
    const stats = ops.reduce(
      (acc, op) => {
        if (op.type === "insert") acc.insert += 1;
        if (op.type === "delete") acc.delete += 1;
        if (op.type === "equal") acc.equal += 1;
        return acc;
      },
      { insert: 0, delete: 0, equal: 0 },
    );
    return { ops, unified, stats };
  }, [ignoreTrailingWhitespace, left, right]);

  const copyUnified = async () => {
    await navigator.clipboard.writeText(computed.unified);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">文本差异对比</h1>
        <p className="mt-2 text-sm text-slate-500">按行 diff，高亮新增/删除/未变更</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={ignoreTrailingWhitespace}
              onChange={(e) => setIgnoreTrailingWhitespace(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            忽略行尾空白
          </label>

          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
              +{computed.stats.insert}
            </span>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-800">
              -{computed.stats.delete}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              ={computed.stats.equal}
            </span>
            <button
              type="button"
              onClick={() => void copyUnified()}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              复制 unified diff
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">原文</div>
            <textarea
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              className="h-60 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">新文</div>
            <textarea
              value={right}
              onChange={(e) => setRight(e.target.value)}
              className="h-60 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
        </div>

        <div className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <div className="text-sm font-semibold text-slate-900">差异预览</div>
          <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl bg-slate-50 p-4 font-mono text-xs ring-1 ring-slate-200">
            {computed.ops.map((op, idx) => {
              const key = `${idx}-${op.type}`;
              if (op.type === "equal") {
                return (
                  <div key={key} className="whitespace-pre text-slate-600">
                    <span className="select-none text-slate-400"> </span>
                    {op.value}
                  </div>
                );
              }
              if (op.type === "insert") {
                return (
                  <div key={key} className="whitespace-pre text-emerald-800 bg-emerald-50/70">
                    <span className="select-none font-bold">+</span>
                    {op.value}
                  </div>
                );
              }
              return (
                <div key={key} className="whitespace-pre text-rose-800 bg-rose-50/70">
                  <span className="select-none font-bold">-</span>
                  {op.value}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
