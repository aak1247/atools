"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type ValidationError = { path: string; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isJsonSchema = (value: unknown): value is Record<string, unknown> => isRecord(value);

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const typeOfJson = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

const matchesType = (value: unknown, schemaType: unknown): boolean => {
  const t = typeOfJson(value);
  const types = Array.isArray(schemaType) ? schemaType : [schemaType];
  const normalized = types.filter((x) => typeof x === "string") as string[];
  if (normalized.length === 0) return true;

  return normalized.some((want) => {
    if (want === "integer") return typeof value === "number" && Number.isInteger(value);
    if (want === "object") return t === "object";
    if (want === "array") return t === "array";
    if (want === "null") return t === "null";
    if (want === "number") return t === "number";
    if (want === "string") return t === "string";
    if (want === "boolean") return t === "boolean";
    return true;
  });
};

const validateAgainstSchema = (value: unknown, schema: Record<string, unknown>, path: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if ("$ref" in schema) {
    errors.push({ path, message: "暂不支持 $ref（请展开 schema 后再校验）。" });
    return errors;
  }

  if ("allOf" in schema) {
    const all = asArray(schema.allOf).filter(isJsonSchema);
    for (const sub of all) errors.push(...validateAgainstSchema(value, sub, path));
  }

  if ("anyOf" in schema) {
    const any = asArray(schema.anyOf).filter(isJsonSchema);
    if (any.length > 0) {
      const ok = any.some((sub) => validateAgainstSchema(value, sub, path).length === 0);
      if (!ok) errors.push({ path, message: "不满足 anyOf 的任一子规则" });
    }
  }

  if ("oneOf" in schema) {
    const one = asArray(schema.oneOf).filter(isJsonSchema);
    if (one.length > 0) {
      const count = one.filter((sub) => validateAgainstSchema(value, sub, path).length === 0).length;
      if (count !== 1) errors.push({ path, message: `oneOf 命中 ${count} 项（应为 1 项）` });
    }
  }

  if ("const" in schema) {
    if (JSON.stringify(value) !== JSON.stringify(schema.const)) {
      errors.push({ path, message: "不满足 const 约束" });
    }
  }

  if ("enum" in schema && Array.isArray(schema.enum)) {
    const ok = schema.enum.some((v) => JSON.stringify(v) === JSON.stringify(value));
    if (!ok) errors.push({ path, message: "不在 enum 枚举范围内" });
  }

  if ("type" in schema && !matchesType(value, schema.type)) {
    const expected = Array.isArray(schema.type) ? schema.type.join(" | ") : String(schema.type);
    errors.push({ path, message: `类型不匹配：期望 ${expected}，实际 ${typeOfJson(value)}` });
    return errors;
  }

  if (typeof value === "string") {
    const minLength = typeof schema.minLength === "number" ? schema.minLength : null;
    const maxLength = typeof schema.maxLength === "number" ? schema.maxLength : null;
    if (minLength != null && value.length < minLength) errors.push({ path, message: `minLength 期望 >= ${minLength}` });
    if (maxLength != null && value.length > maxLength) errors.push({ path, message: `maxLength 期望 <= ${maxLength}` });
    if (typeof schema.pattern === "string") {
      try {
        const re = new RegExp(schema.pattern);
        if (!re.test(value)) errors.push({ path, message: `pattern 不匹配：/${schema.pattern}/` });
      } catch {
        errors.push({ path, message: "pattern 正则无效" });
      }
    }
  }

  if (typeof value === "number") {
    const min = typeof schema.minimum === "number" ? schema.minimum : null;
    const max = typeof schema.maximum === "number" ? schema.maximum : null;
    if (min != null && value < min) errors.push({ path, message: `minimum 期望 >= ${min}` });
    if (max != null && value > max) errors.push({ path, message: `maximum 期望 <= ${max}` });
  }

  if (Array.isArray(value)) {
    const minItems = typeof schema.minItems === "number" ? schema.minItems : null;
    const maxItems = typeof schema.maxItems === "number" ? schema.maxItems : null;
    if (minItems != null && value.length < minItems) errors.push({ path, message: `minItems 期望 >= ${minItems}` });
    if (maxItems != null && value.length > maxItems) errors.push({ path, message: `maxItems 期望 <= ${maxItems}` });

    if (isJsonSchema(schema.items)) {
      for (let i = 0; i < value.length; i += 1) {
        errors.push(...validateAgainstSchema(value[i], schema.items, `${path}[${i}]`));
      }
    }
  }

  if (isRecord(value)) {
    const required = Array.isArray(schema.required) ? (schema.required.filter((k) => typeof k === "string") as string[]) : [];
    for (const key of required) {
      if (!(key in value)) errors.push({ path, message: `缺少 required 字段：${key}` });
    }

    const properties = isRecord(schema.properties) ? (schema.properties as Record<string, unknown>) : null;
    if (properties) {
      for (const [key, propSchema] of Object.entries(properties)) {
        if (!(key in value)) continue;
        if (isJsonSchema(propSchema)) errors.push(...validateAgainstSchema(value[key], propSchema, `${path}.${key}`));
      }
    }

    if (schema.additionalProperties === false && properties) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push({ path: `${path}.${key}`, message: "不允许的额外字段（additionalProperties=false）" });
      }
    }
  }

  return errors;
};

export default function JsonSchemaValidatorClient() {
  const [jsonText, setJsonText] = useState("");
  const [schemaText, setSchemaText] = useState("");

  const result = useMemo(() => {
    if (!jsonText.trim() || !schemaText.trim()) return { ok: true as const, errors: [] as ValidationError[], warnings: [] as string[] };
    try {
      const jsonValue = JSON.parse(jsonText);
      const schemaValue = JSON.parse(schemaText);
      if (!isJsonSchema(schemaValue)) return { ok: false as const, error: "Schema 必须是 JSON 对象。", errors: [], warnings: [] as string[] };
      const errors = validateAgainstSchema(jsonValue, schemaValue, "$");
      const warnings: string[] = [];
      if ("$ref" in schemaValue) warnings.push("检测到 $ref：当前仅提示不支持。");
      return { ok: true as const, errors, warnings };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "解析失败", errors: [], warnings: [] as string[] };
    }
  }, [jsonText, schemaText]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const errorText = result.ok ? "" : result.error;
  const errorsText = result.ok ? result.errors.map((e) => `${e.path}: ${e.message}`).join("\n") : "";

  return (
    <ToolPageLayout toolSlug="json-schema-validator">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-700">
              当前为轻量校验器（支持 type/properties/required/items/enum/const/min/max/pattern 等常用规则）。
            </div>
            <button
              type="button"
              onClick={() => void copy(errorsText)}
              disabled={!result.ok || result.errors.length === 0}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              复制错误列表
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">JSON 数据</div>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder='{"id":1,"name":"Alice"}'
                className="h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">JSON Schema</div>
              <textarea
                value={schemaText}
                onChange={(e) => setSchemaText(e.target.value)}
                placeholder='{"type":"object","properties":{"id":{"type":"number"}},"required":["id"]}'
                className="h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </div>
          </div>

          {!result.ok && (
            <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
              错误：{errorText}
            </div>
          )}

          {result.ok && result.warnings.length > 0 && (
            <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-100">
              {result.warnings.join(" ")}
            </div>
          )}

          {result.ok && (
            <div className="mt-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">校验结果</div>
                <div
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    result.errors.length === 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {result.errors.length === 0 ? "通过" : `失败（${result.errors.length}）`}
                </div>
              </div>
              {result.errors.length > 0 ? (
                <textarea
                  value={errorsText}
                  readOnly
                  className="mt-3 h-48 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                />
              ) : (
                <div className="mt-3 text-sm text-slate-700">未发现错误。</div>
              )}
            </div>
          )}
        </div>
      </div>
    </ToolPageLayout>
  );
}

