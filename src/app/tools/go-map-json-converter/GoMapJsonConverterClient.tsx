"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Direction = "mapToJson" | "jsonToMap";

const DEFAULT_UI = {
  mapToJson: "Map → JSON",
  jsonToMap: "JSON → Map",
  jsonIndent: "JSON 缩进",
  copyResult: "复制结果",
  inputMap: "Go Map 输入",
  inputJson: "JSON 输入",
  outputJson: "JSON 输出",
  outputMap: "Go Map 输出",
  pasteMap: "粘贴 Go Map 打印结果…",
  pasteJson: "粘贴 JSON…",
  resultPlaceholder: "结果会显示在这里…",
  errorPrefix: "错误：",
  convertFailed: "转换失败",
  hint: "提示：支持解析 Go map 的标准打印格式，如 map[string]interface {}{\"key\":\"value\"}、map[1:\"one\",2:\"two\"] 等。对于复杂嵌套结构，请确保格式正确。",
  examples: {
    simple: 'map[string]interface {}{"name":"张三","age":25}',
    nested: 'map[string]interface {}{"user":map[string]interface {}{"name":"Alice","age":30},"tags":["dev","go"]}',
    sliceKey: 'map[interface {}]interface {}{1:"one","two":2,true:"yes"}',
  }
} as const;

type GoMapJsonUi = typeof DEFAULT_UI;

const parseGoMap = (input: string): unknown => {
  const trimmed = input.trim();

  // Handle simple cases
  if (trimmed === "nil" || trimmed === "map[]") {
    return null;
  }

  // Extract the map content
  let mapContent = trimmed;

  // Remove map type declaration if present
  const mapTypeMatch = trimmed.match(/^map\[([^\]]*)\]\{(.*)\}$/);
  if (mapTypeMatch) {
    mapContent = mapTypeMatch[2];
  } else if (trimmed.startsWith("map[")) {
    const contentMatch = trimmed.match(/^map\[(.*)\]$/);
    if (contentMatch) {
      mapContent = contentMatch[1];
    }
  } else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    // Handle just the content part
    mapContent = trimmed.slice(1, -1);
  }

  if (!mapContent.trim()) {
    return {};
  }

  // Parse key-value pairs
  const result: Record<string, unknown> = {};
  const pairs = parseKeyValuePairs(mapContent);

  for (const [key, value] of pairs) {
    result[key] = parseValue(value);
  }

  return result;
};

const parseKeyValuePairs = (content: string): Array<[string, string]> => {
  const pairs: Array<[string, string]> = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];

    if (escapeNext) {
      current += char;
      escapeNext = false;
      i++;
      continue;
    }

    if (char === '\\') {
      current += char;
      escapeNext = true;
      i++;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      current += char;
      i++;
      continue;
    }

    if (!inString) {
      if (char === '{' || char === '[') {
        depth++;
        current += char;
        i++;
        continue;
      }

      if (char === '}' || char === ']') {
        depth--;
        current += char;
        i++;
        continue;
      }

      if (char === ',' && depth === 0) {
        const pair = current.trim();
        if (pair) {
          const colonIndex = pair.indexOf(':');
          if (colonIndex > 0) {
            const key = pair.slice(0, colonIndex).trim();
            const value = pair.slice(colonIndex + 1).trim();
            pairs.push([parseKey(key), value]);
          }
        }
        current = "";
        i++;
        continue;
      }
    }

    current += char;
    i++;
  }

  // Add the last pair
  const pair = current.trim();
  if (pair) {
    const colonIndex = pair.indexOf(':');
    if (colonIndex > 0) {
      const key = pair.slice(0, colonIndex).trim();
      const value = pair.slice(colonIndex + 1).trim();
      pairs.push([parseKey(key), value]);
    }
  }

  return pairs;
};

const parseKey = (key: string): string => {
  // Handle quoted keys
  if (key.startsWith('"') && key.endsWith('"')) {
    return key.slice(1, -1);
  }

  // Handle numeric keys
  if (/^\d+(\.\d+)?$/.test(key)) {
    return key;
  }

  // Handle boolean keys
  if (key === "true" || key === "false") {
    return key;
  }

  // Handle interface{} keys
  if (key.startsWith("interface {}(") && key.endsWith(")")) {
    const inner = key.slice(14, -1);
    return parseKey(inner);
  }

  // For unquoted keys, return as is
  return key;
};

const parseValue = (value: string): unknown => {
  const trimmed = value.trim();

  // Handle nil values
  if (trimmed === "nil") {
    return null;
  }

  // Handle quoted strings
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  // Handle numeric values
  if (/^-?\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // Handle boolean values
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Handle maps
  if (trimmed.startsWith("map[")) {
    return parseGoMap(trimmed);
  }

  // Handle slices/arrays
  if (trimmed.startsWith("[]") || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return parseSlice(trimmed);
  }

  // Handle interface{} wrapper
  if (trimmed.startsWith("interface {}(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice(14, -1);
    return parseValue(inner);
  }

  // For complex structures, try to parse as map
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return parseGoMap(trimmed);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
};

const parseSlice = (sliceStr: string): unknown[] => {
  const content = sliceStr.startsWith("[]") ? "" : sliceStr.slice(1, -1);
  if (!content.trim()) {
    return [];
  }

  const items: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];

    if (escapeNext) {
      current += char;
      escapeNext = false;
      i++;
      continue;
    }

    if (char === '\\') {
      current += char;
      escapeNext = true;
      i++;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      current += char;
      i++;
      continue;
    }

    if (!inString) {
      if (char === '{' || char === '[') {
        depth++;
        current += char;
        i++;
        continue;
      }

      if (char === '}' || char === ']') {
        depth--;
        current += char;
        i++;
        continue;
      }

      if (char === ',' && depth === 0) {
        items.push(current.trim());
        current = "";
        i++;
        continue;
      }
    }

    current += char;
    i++;
  }

  // Add the last item
  if (current.trim()) {
    items.push(current.trim());
  }

  return items.map(item => parseValue(item));
};

const formatAsGoMap = (obj: unknown, indent = 0): string => {
  const spaces = "  ".repeat(indent);

  if (obj === null) {
    return "nil";
  }

  if (typeof obj === "string") {
    return `"${obj}"`;
  }

  if (typeof obj === "number" || typeof obj === "boolean") {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return "[]interface {}{}";
    }

    const items = obj.map(item => formatAsGoMap(item, indent + 1));
    return `[]interface {}{\n${spaces}  ${items.join(",\n" + spaces +  " ")}\n${spaces}}`;
  }

  if (typeof obj === "object" && obj !== null) {
    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return "map[string]interface {}{}";
    }

    const pairs = entries.map(([key, value]) => {
      const quotedKey = /^\w+$/.test(key) ? key : `"${key}"`;
      return `${spaces}  ${quotedKey}: ${formatAsGoMap(value, indent + 1)}`;
    });

    return `map[string]interface {}{\n${pairs.join(",\n")}\n${spaces}}`;
  }

  return "interface {}(nil)";
};

export default function GoMapJsonConverterClient() {
  const [direction, setDirection] = useState<Direction>("mapToJson");
  const [indent, setIndent] = useState(2);
  const [input, setInput] = useState('map[string]interface {}{"name":"张三","age":25,"tags":[]interface {}{"dev","go"},"profile":map[string]interface {}{"email":"zhang@example.com","active":true}}');

  const result = useMemo(() => {
    const raw = input.trim();
    if (!raw) return { ok: true as const, text: "" };

    try {
      if (direction === "mapToJson") {
        const parsed = parseGoMap(raw);
        return { ok: true as const, text: JSON.stringify(parsed, null, indent) };
      } else {
        const parsed = JSON.parse(raw) as unknown;
        return { ok: true as const, text: formatAsGoMap(parsed) };
      }
    } catch (e) {
      return {
        ok: false as const,
        text: "",
        error: e instanceof Error ? e.message : "转换失败",
      };
    }
  }, [direction, indent, input]);

  const copy = async () => {
    if (!result.ok) return;
    await navigator.clipboard.writeText(result.text);
  };

  const loadExample = (example: string) => {
    setInput(example);
  };

  const config = useOptionalToolConfig("go-map-json-converter");
  const ui: GoMapJsonUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<GoMapJsonUi>) };

  return (
    <ToolPageLayout toolSlug="go-map-json-converter" maxWidthClassName="max-w-6xl">
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-2xl bg-slate-100/60 p-1">
            <button
              type="button"
              onClick={() => setDirection("mapToJson")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                direction === "mapToJson"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {ui.mapToJson}
            </button>
            <button
              type="button"
              onClick={() => setDirection("jsonToMap")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                direction === "jsonToMap"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {config.jsonToMap}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {direction === "jsonToMap" && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {config.jsonIndent}
                <select
                  value={indent}
                  disabled={direction !== "jsonToMap"}
                  onChange={(e) => setIndent(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                  <option value={8}>8</option>
                </select>
              </label>
            )}
            <button
              type="button"
              disabled={!result.ok}
              onClick={copy}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 disabled:opacity-60 active:scale-[0.99]"
            >
              {config.copyResult}
            </button>
          </div>
        </div>

        {direction === "mapToJson" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-xs text-slate-600">示例：</span>
            <button
              type="button"
              onClick={() => loadExample(config.examples.simple)}
              className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              简单 Map
            </button>
            <button
              type="button"
              onClick={() => loadExample(config.examples.nested)}
              className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              嵌套结构
            </button>
            <button
              type="button"
              onClick={() => loadExample(config.examples.sliceKey)}
              className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              包含切片
            </button>
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {direction === "mapToJson" ? config.inputMap : config.inputJson}
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={direction === "mapToJson" ? config.pasteMap : config.pasteJson}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {direction === "mapToJson" ? config.outputJson : config.outputMap}
            </div>
            <textarea
              value={result.ok ? result.text : ""}
              readOnly
              placeholder={config.resultPlaceholder}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
            {!result.ok && (
              <div className="mt-2 text-sm text-rose-600">
                {config.errorPrefix}
                {result.error}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">{config.hint}</div>
      </div>
    </ToolPageLayout>
  );
}