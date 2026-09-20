"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type JsonSchema = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const inferSchema = (value: unknown, options: { forbidAdditional: boolean }): JsonSchema => {
  if (value === null) return { type: "null" };
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "number") return { type: "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: "array", items: {} };
    const itemSchemas = value.map((v) => inferSchema(v, options));
    const signature = (s: JsonSchema) => JSON.stringify(s);
    const unique = Array.from(new Map(itemSchemas.map((s) => [signature(s), s])).values());
    if (unique.length === 1) return { type: "array", items: unique[0] };
    return { type: "array", items: { anyOf: unique } };
  }
  if (isRecord(value)) {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(value)) {
      properties[k] = inferSchema(v, options);
      required.push(k);
    }
    const out: JsonSchema = {
      type: "object",
      properties,
      required,
    };
    if (options.forbidAdditional) out.additionalProperties = false;
    return out;
  }
  return {};
};

const DEFAULT_UI = {
  title: "标题",
  forbidAdditional: "禁止额外字段",
  indent: "缩进",
  copySchema: "复制 Schema",
  jsonInput: "JSON 输入",
  jsonPlaceholder: '{"id":1,"name":"Alice","tags":["a","b"]}',
  schemaOutput: "JSON Schema 输出",
  outputPlaceholder: "生成的 JSON Schema 会显示在这里…",
  errorPrefix: "错误：",
  jsonParseError: "JSON 解析失败",
  tip: "提示：Schema 基于“示例 JSON”推断；空数组会生成空 items（{}），需要你按业务补充约束。",
} as const;

type Ui = typeof DEFAULT_UI;

export default function JsonToJsonSchemaClient() {
  const config = useOptionalToolConfig("json-to-json-schema");
  const ui: Ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<Ui>) };

  const [input, setInput] = useState("");
  const [title, setTitle] = useState("Schema");
  const [forbidAdditional, setForbidAdditional] = useState(false);
  const [indent, setIndent] = useState(2);

  const result = useMemo(() => {
    if (!input.trim()) return { ok: true as const, text: "" };
    try {
      const value = JSON.parse(input);
      const schema = inferSchema(value, { forbidAdditional });
      const root: JsonSchema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        title: title.trim() || "Schema",
        ...schema,
      };
      return { ok: true as const, text: `${JSON.stringify(root, null, indent)}\n` };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : ui.jsonParseError, text: "" };
    }
  }, [forbidAdditional, indent, input, title, ui.jsonParseError]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <ToolPageLayout toolSlug="json-to-json-schema">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {ui.title}
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-44 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={forbidAdditional}
                  onChange={(e) => setForbidAdditional(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {ui.forbidAdditional}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {ui.indent}
                <select
                  value={indent}
                  onChange={(e) => setIndent(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                  <option value={0}>0</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={() => void copy(result.ok ? result.text : "")}
              disabled={!result.ok || !result.text}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {ui.copySchema}
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">{ui.jsonInput}</div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={ui.jsonPlaceholder}
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              {!result.ok && <div className="mt-2 text-sm text-rose-600">{ui.errorPrefix}{result.error}</div>}
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">{ui.schemaOutput}</div>
              <textarea
                value={result.ok ? result.text : ""}
                readOnly
                placeholder={ui.outputPlaceholder}
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
              <div className="mt-3 text-xs text-slate-500">
                {ui.tip}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
