"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type OutputMode = "interface" | "type";

type TypeNode =
  | { kind: "any" }
  | { kind: "unknown" }
  | { kind: "null" }
  | { kind: "boolean" }
  | { kind: "number" }
  | { kind: "string" }
  | { kind: "array"; item: TypeNode }
  | { kind: "object"; props: Record<string, { node: TypeNode; optional: boolean }> }
  | { kind: "union"; members: TypeNode[] }
  | { kind: "ref"; name: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const uniqueBy = <T,>(items: T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
};

const stableStringify = (node: TypeNode): string => {
  if (node.kind === "object") {
    const keys = Object.keys(node.props).sort();
    const entries = keys.map((k) => `${k}:${node.props[k]?.optional ? "?" : ""}${stableStringify(node.props[k]!.node)}`);
    return `obj{${entries.join(",")}}`;
  }
  if (node.kind === "array") return `arr(${stableStringify(node.item)})`;
  if (node.kind === "union") return `union(${node.members.map(stableStringify).sort().join("|")})`;
  if (node.kind === "ref") return `ref(${node.name})`;
  return node.kind;
};

const mergeTypes = (a: TypeNode, b: TypeNode): TypeNode => {
  if (stableStringify(a) === stableStringify(b)) return a;

  const members = uniqueBy(
    [
      ...(a.kind === "union" ? a.members : [a]),
      ...(b.kind === "union" ? b.members : [b]),
    ],
    stableStringify,
  );

  return { kind: "union", members };
};

const inferType = (value: unknown): TypeNode => {
  if (value === null) return { kind: "null" };
  if (typeof value === "string") return { kind: "string" };
  if (typeof value === "number") return { kind: "number" };
  if (typeof value === "boolean") return { kind: "boolean" };
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: "array", item: { kind: "unknown" } };
    let itemType = inferType(value[0]);
    for (let i = 1; i < value.length; i += 1) itemType = mergeTypes(itemType, inferType(value[i]));
    return { kind: "array", item: itemType };
  }
  if (isRecord(value)) {
    const props: Record<string, { node: TypeNode; optional: boolean }> = {};
    for (const [key, v] of Object.entries(value)) {
      props[key] = { node: inferType(v), optional: false };
    }
    return { kind: "object", props };
  }
  return { kind: "unknown" };
};

const sanitizeTypeName = (raw: string): string => {
  const cleaned = raw.replace(/[^A-Za-z0-9_]+/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const pascal = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return pascal || "Root";
};

const isValidIdentifier = (key: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);

type GenOptions = {
  rootName: string;
  mode: OutputMode;
  quoteKeys: boolean;
  useSemicolons: boolean;
};

const generate = (value: unknown, options: GenOptions): { ok: true; text: string } | { ok: false; error: string; text: string } => {
  try {
    const root = inferType(value);
    const rootName = sanitizeTypeName(options.rootName);

    const declarations: Array<{ name: string; node: TypeNode }> = [];
    const seen = new Map<string, string>();

    const ensureRef = (nameHint: string, node: TypeNode): TypeNode => {
      if (node.kind !== "object") return node;
      const signature = stableStringify(node);
      const existing = seen.get(signature);
      if (existing) return { kind: "ref", name: existing };
      const name = sanitizeTypeName(nameHint);
      seen.set(signature, name);
      declarations.push({ name, node });
      return { kind: "ref", name };
    };

    const walk = (node: TypeNode, nameHint: string): TypeNode => {
      if (node.kind === "object") {
        const refined: Record<string, { node: TypeNode; optional: boolean }> = {};
        for (const [k, v] of Object.entries(node.props)) {
          refined[k] = { ...v, node: walk(v.node, `${nameHint}${sanitizeTypeName(k)}`) };
        }
        return ensureRef(nameHint, { kind: "object", props: refined });
      }
      if (node.kind === "array") return { kind: "array", item: walk(node.item, `${nameHint}Item`) };
      if (node.kind === "union") return { kind: "union", members: node.members.map((m) => walk(m, nameHint)) };
      return node;
    };

    const rootRef = walk(root, rootName);

    const toTs = (node: TypeNode): string => {
      if (node.kind === "ref") return node.name;
      if (node.kind === "string") return "string";
      if (node.kind === "number") return "number";
      if (node.kind === "boolean") return "boolean";
      if (node.kind === "null") return "null";
      if (node.kind === "any") return "any";
      if (node.kind === "unknown") return "unknown";
      if (node.kind === "array") return `${toTs(node.item)}[]`;
      if (node.kind === "union") return node.members.map(toTs).join(" | ");
      if (node.kind === "object") return "{ [key: string]: unknown }";
      return "unknown";
    };

    const propKey = (key: string) => {
      if (options.quoteKeys) return JSON.stringify(key);
      return isValidIdentifier(key) ? key : JSON.stringify(key);
    };

    const lineEnd = options.useSemicolons ? ";" : "";

    const renderDecl = (decl: { name: string; node: TypeNode }) => {
      if (decl.node.kind !== "object") return "";
      const entries = Object.entries(decl.node.props).sort(([a], [b]) => a.localeCompare(b, "en"));
      const lines = entries.map(([k, v]) => `  ${propKey(k)}${v.optional ? "?" : ""}: ${toTs(v.node)}${lineEnd}`);

      if (options.mode === "interface") {
        return `export interface ${decl.name} {\n${lines.join("\n")}\n}\n`;
      }
      return `export type ${decl.name} = {\n${lines.join("\n")}\n}${lineEnd}\n`;
    };

    const rootTypeText = (() => {
      if (rootRef.kind === "ref") return "";
      if (options.mode === "interface" && root.kind === "object") return "";
      return `export type ${rootName} = ${toTs(rootRef)}${lineEnd}\n`;
    })();

    const body = declarations.map(renderDecl).join("\n") + rootTypeText;
    if (!body.trim()) {
      return { ok: true, text: `export type ${rootName} = ${toTs(rootRef)}${lineEnd}\n` };
    }
    return { ok: true, text: body.trimEnd() + "\n" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "生成失败", text: "" };
  }
};

export default function JsonToTypeScriptClient() {
  const [input, setInput] = useState("");
  const [rootName, setRootName] = useState("Root");
  const [mode, setMode] = useState<OutputMode>("interface");
  const [quoteKeys, setQuoteKeys] = useState(true);
  const [useSemicolons, setUseSemicolons] = useState(true);

  const result = useMemo(() => {
    if (!input.trim()) return { ok: true as const, text: "", warnings: [] as string[] };
    try {
      const value = JSON.parse(input);
      const generated = generate(value, { rootName, mode, quoteKeys, useSemicolons });
      if (!generated.ok) return { ok: false as const, error: generated.error, text: "" };
      return { ok: true as const, text: generated.text, warnings: [] as string[] };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "JSON 解析失败", text: "" };
    }
  }, [input, mode, quoteKeys, rootName, useSemicolons]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <ToolPageLayout toolSlug="json-to-typescript">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                根类型名
                <input
                  value={rootName}
                  onChange={(e) => setRootName(e.target.value)}
                  className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                输出
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as OutputMode)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="interface">interface</option>
                  <option value="type">type</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={quoteKeys}
                  onChange={(e) => setQuoteKeys(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                引号键名
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={useSemicolons}
                  onChange={(e) => setUseSemicolons(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                分号
              </label>
            </div>

            <button
              type="button"
              onClick={() => void copy(result.ok ? result.text : "")}
              disabled={!result.ok || !result.text}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              复制结果
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">JSON 输入</div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder='{"id":1,"name":"Alice","tags":["a","b"]}'
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              {!result.ok && <div className="mt-2 text-sm text-rose-600">错误：{result.error}</div>}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">TypeScript 输出</div>
              </div>
              <textarea
                value={result.ok ? result.text : ""}
                readOnly
                placeholder="生成结果会显示在这里…"
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
              <div className="mt-3 text-xs text-slate-500">
                提示：该工具以“示例 JSON”推断类型；混合数组/动态键可能推断为 union/unknown。
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}

