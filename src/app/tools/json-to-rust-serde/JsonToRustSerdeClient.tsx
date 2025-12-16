"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Schema =
  | { kind: "string"; nullable: boolean }
  | { kind: "number"; isInteger: boolean; nullable: boolean }
  | { kind: "boolean"; nullable: boolean }
  | { kind: "null"; nullable: true }
  | { kind: "array"; item: Schema; nullable: boolean }
  | { kind: "object"; fields: Record<string, Schema>; nullable: boolean }
  | { kind: "any"; nullable: boolean };

const safeJsonParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mergeSchemas = (a: Schema, b: Schema): Schema => {
  const nullable = a.nullable || b.nullable;

  if (a.kind === "null") return { ...b, nullable: true };
  if (b.kind === "null") return { ...a, nullable: true };

  if (a.kind === "any" || b.kind === "any") return { kind: "any", nullable };
  if (a.kind !== b.kind) return { kind: "any", nullable };

  if (a.kind === "string" && b.kind === "string") return { kind: "string", nullable };
  if (a.kind === "boolean" && b.kind === "boolean") return { kind: "boolean", nullable };
  if (a.kind === "number" && b.kind === "number") return { kind: "number", isInteger: a.isInteger && b.isInteger, nullable };

  if (a.kind === "array" && b.kind === "array") return { kind: "array", item: mergeSchemas(a.item, b.item), nullable };

  if (a.kind === "object" && b.kind === "object") {
    const keys = Array.from(new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])).sort();
    const fields: Record<string, Schema> = {};
    for (const key of keys) {
      const left = a.fields[key] ?? { kind: "null", nullable: true };
      const right = b.fields[key] ?? { kind: "null", nullable: true };
      fields[key] = mergeSchemas(left, right);
    }
    return { kind: "object", fields, nullable };
  }

  return { kind: "any", nullable };
};

const inferSchema = (value: unknown): Schema => {
  if (value === null) return { kind: "null", nullable: true };

  if (typeof value === "string") return { kind: "string", nullable: false };
  if (typeof value === "boolean") return { kind: "boolean", nullable: false };
  if (typeof value === "number") return { kind: "number", isInteger: Number.isInteger(value), nullable: false };

  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: "array", item: { kind: "any", nullable: false }, nullable: false };
    const merged = value.map(inferSchema).reduce<Schema>((acc, cur) => mergeSchemas(acc, cur), { kind: "null", nullable: true });
    return { kind: "array", item: merged.kind === "null" ? { kind: "any", nullable: true } : merged, nullable: false };
  }

  if (isRecord(value)) {
    const fields: Record<string, Schema> = {};
    for (const [k, v] of Object.entries(value)) fields[k] = inferSchema(v);
    return { kind: "object", fields, nullable: false };
  }

  return { kind: "any", nullable: false };
};

const rustKeywords = new Set([
  "as",
  "break",
  "const",
  "continue",
  "crate",
  "else",
  "enum",
  "extern",
  "false",
  "fn",
  "for",
  "if",
  "impl",
  "in",
  "let",
  "loop",
  "match",
  "mod",
  "move",
  "mut",
  "pub",
  "ref",
  "return",
  "self",
  "Self",
  "static",
  "struct",
  "super",
  "trait",
  "true",
  "type",
  "unsafe",
  "use",
  "where",
  "while",
  "async",
  "await",
  "dyn",
]);

const toPascal = (input: string) => {
  const parts = input
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
  let out = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  out = out.replace(/^[^A-Za-z_]+/, "");
  if (!out) out = "Root";
  if (/^[0-9]/.test(out)) out = `Type${out}`;
  if (rustKeywords.has(out)) out = `${out}Type`;
  return out;
};

const toSnake = (input: string) => {
  const cleaned = input.trim().replace(/[^a-zA-Z0-9]+/g, "_");
  const withUnderscore = cleaned.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  let out = withUnderscore.toLowerCase().replace(/^_+|_+$/g, "").replace(/__+/g, "_");
  if (!out) out = "field";
  if (/^[0-9]/.test(out)) out = `field_${out}`;
  if (rustKeywords.has(out)) out = `r#${out}`;
  return out;
};

type FieldDef = { jsonKey: string; name: string; type: string; needsRename: boolean };
type StructDef = { name: string; fields: FieldDef[] };

type EmitCtx = { usedTypeNames: Set<string>; order: string[]; defs: Map<string, StructDef> };

const uniqueTypeName = (ctx: EmitCtx, desired: string) => {
  const base = desired || "Root";
  if (!ctx.usedTypeNames.has(base)) {
    ctx.usedTypeNames.add(base);
    return base;
  }
  let i = 2;
  while (ctx.usedTypeNames.has(`${base}${i}`)) i += 1;
  const next = `${base}${i}`;
  ctx.usedTypeNames.add(next);
  return next;
};

const ensureStruct = (ctx: EmitCtx, desiredName: string, schema: Extract<Schema, { kind: "object" }>) => {
  const name = uniqueTypeName(ctx, desiredName);
  if (ctx.defs.has(name)) return name;

  const usedFieldNames = new Set<string>();
  const fields: FieldDef[] = Object.keys(schema.fields)
    .sort()
    .map((jsonKey) => {
      const child = schema.fields[jsonKey] ?? { kind: "any", nullable: true };
      const base = toSnake(jsonKey);
      let candidate = base;
      let i = 2;
      while (usedFieldNames.has(candidate)) {
        candidate = `${base}_${i}`;
        i += 1;
      }
      usedFieldNames.add(candidate);

      const compareName = candidate.startsWith("r#") ? candidate.slice(2) : candidate;
      const needsRename = jsonKey !== compareName;
      const type = typeFromSchema(child, `${name}${toPascal(jsonKey)}`, ctx);
      return { jsonKey, name: candidate, type, needsRename };
    });

  ctx.defs.set(name, { name, fields });
  ctx.order.push(name);
  return name;
};

const typeFromSchema = (schema: Schema, typeNameHint: string, ctx: EmitCtx): string => {
  const base = (() => {
    if (schema.kind === "string") return "String";
    if (schema.kind === "boolean") return "bool";
    if (schema.kind === "number") return schema.isInteger ? "i64" : "f64";
    if (schema.kind === "null") return "Value";
    if (schema.kind === "any") return "Value";
    if (schema.kind === "array") return `Vec<${typeFromSchema(schema.item, `${typeNameHint}Item`, ctx)}>`;
    if (schema.kind === "object") return ensureStruct(ctx, toPascal(typeNameHint), schema);
    return "Value";
  })();

  const nullable = schema.nullable;
  return nullable ? `Option<${base}>` : base;
};

const escapeRustString = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const generateRust = (value: unknown, rootName: string) => {
  const ctx: EmitCtx = { usedTypeNames: new Set<string>(), order: [], defs: new Map<string, StructDef>() };
  const rootTypeName = toPascal(rootName || "Root");
  const schema = inferSchema(value);

  if (schema.kind === "object") {
    ensureStruct(ctx, rootTypeName, schema);
  } else if (schema.kind === "array") {
    const itemType = typeFromSchema(schema.item, `${rootTypeName}Item`, ctx);
    const rootAlias = `Vec<${itemType}>`;
    const usesValue = rootAlias.includes("Value") || Array.from(ctx.defs.values()).some((d) => d.fields.some((f) => f.type.includes("Value")));
    const imports = [
      "use serde::{Deserialize, Serialize};",
      usesValue ? "use serde_json::Value;" : null,
    ].filter(Boolean);

    const structs = ctx.order
      .map((name) => ctx.defs.get(name))
      .filter(Boolean)
      .map((def) => {
        const lines: string[] = [];
        lines.push("#[derive(Debug, Clone, Serialize, Deserialize)]", `pub struct ${def!.name} {`);
        for (const f of def!.fields) {
          if (f.needsRename) lines.push(`  #[serde(rename = "${escapeRustString(f.jsonKey)}")]`);
          lines.push(`  pub ${f.name}: ${f.type},`);
        }
        lines.push("}");
        return lines.join("\n");
      })
      .join("\n\n");

    return `${imports.join("\n")}\n\npub type ${rootTypeName} = ${rootAlias};\n\n${structs}`.trim();
  } else {
    const rootType = typeFromSchema(schema, rootTypeName, ctx);
    const usesValue = rootType.includes("Value") || Array.from(ctx.defs.values()).some((d) => d.fields.some((f) => f.type.includes("Value")));
    const imports = [
      "use serde::{Deserialize, Serialize};",
      usesValue ? "use serde_json::Value;" : null,
    ].filter(Boolean);
    return `${imports.join("\n")}\n\npub type ${rootTypeName} = ${rootType};`.trim();
  }

  const usesValue = Array.from(ctx.defs.values()).some((d) => d.fields.some((f) => f.type.includes("Value")));
  const imports = [
    "use serde::{Deserialize, Serialize};",
    usesValue ? "use serde_json::Value;" : null,
  ].filter(Boolean);

  const structs = ctx.order
    .map((name) => ctx.defs.get(name))
    .filter(Boolean)
    .map((def) => {
      const lines: string[] = [];
      lines.push("#[derive(Debug, Clone, Serialize, Deserialize)]", `pub struct ${def!.name} {`);
      for (const f of def!.fields) {
        if (f.needsRename) lines.push(`  #[serde(rename = "${escapeRustString(f.jsonKey)}")]`);
        lines.push(`  pub ${f.name}: ${f.type},`);
      }
      lines.push("}");
      return lines.join("\n");
    })
    .join("\n\n");

  return `${imports.join("\n")}\n\n${structs}`.trim();
};

export default function JsonToRustSerdeClient() {
  const [rootName, setRootName] = useState("Root");
  const [input, setInput] = useState('{\n  "id": 1,\n  "name": "Alice",\n  "tags": ["a", "b"],\n  "profile": { "email": "a@example.com" }\n}\n');

  const result = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed) return { ok: true as const, code: "" };
    const parsed = safeJsonParse(trimmed);
    if (parsed === null && trimmed !== "null") return { ok: false as const, error: "JSON 解析失败，请检查格式。" };
    try {
      return { ok: true as const, code: generateRust(parsed, rootName) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "生成失败" };
    }
  }, [input, rootName]);

  const formatInput = () => {
    const parsed = safeJsonParse(input);
    if (parsed === null && input.trim() !== "null") return;
    setInput(JSON.stringify(parsed, null, 2));
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  return (
    <ToolPageLayout toolSlug="json-to-rust-serde">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                根类型名
                <input
                  value={rootName}
                  onChange={(e) => setRootName(e.target.value)}
                  className="w-44 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <button
                type="button"
                onClick={formatInput}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
              >
                格式化 JSON
              </button>
            </div>

            <button
              type="button"
              onClick={() => void copy(result.ok ? result.code : "")}
              disabled={!result.ok || !result.code}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              复制 Rust 代码
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">JSON 输入</div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              {!result.ok && <div className="mt-2 text-sm text-rose-600">错误：{result.error}</div>}
              <div className="mt-3 text-xs text-slate-500">
                说明：混合类型/混合数组会降级为 <span className="font-mono">serde_json::Value</span>；字段缺失/为 null 会生成 Option。
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">Rust 输出</div>
              <textarea
                value={result.ok ? result.code : ""}
                readOnly
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
