"use client";

import * as TOML from "@iarna/toml";
import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Mode = "toml-to-json" | "json-to-toml";

const DEFAULT_UI = {
  tomlToJson: "TOML → JSON",
  jsonToToml: "JSON → TOML",
  jsonPrettyPrint: "JSON 美化",
  swap: "互换",
  copyOutput: "复制输出",
  input: "输入",
  output: "输出",
  tomlPlaceholder: "粘贴 TOML…",
  jsonPlaceholder: "粘贴 JSON…",
  resultPlaceholder: "转换结果…",
  description: "说明：本工具使用 `@iarna/toml` 进行 TOML 解析/序列化，纯前端本地运行不上传内容。",
  conversionError: "转换失败"
} as const;

type TomlJsonConverterUi = typeof DEFAULT_UI;

const safeJsonParse = (text: string): { ok: boolean; value: unknown; error?: string } => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, value: null, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
};

export default function TomlJsonConverterClient() {
  return (
    <ToolPageLayout toolSlug="toml-json-converter" maxWidthClassName="max-w-6xl">
      <TomlJsonConverterInner />
    </ToolPageLayout>
  );
}

function TomlJsonConverterInner() {
  const config = useOptionalToolConfig("toml-json-converter");
  const ui: TomlJsonConverterUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<TomlJsonConverterUi>) };

  const [mode, setMode] = useState<Mode>("toml-to-json");
  const [prettyJson, setPrettyJson] = useState(true);
  const [input, setInput] = useState('title = "TOML Example"\n[owner]\nname = "Tom"\n');

  const output = useMemo(() => {
    try {
      if (mode === "toml-to-json") {
        const obj = TOML.parse(input);
        return prettyJson ? `${JSON.stringify(obj, null, 2)}\n` : `${JSON.stringify(obj)}\n`;
      }
      const parsed = safeJsonParse(input);
      if (!parsed.ok) throw new Error(parsed.error || "Invalid JSON");
      // @iarna/toml expects a plain object/array; stringify will throw on unsupported types.
      return `${TOML.stringify(parsed.value as any)}`;
    } catch (e) {
      return `/* ERROR: ${e instanceof Error ? e.message : ui.conversionError} */\n`;
    }
  }, [input, mode, prettyJson]);

  const copy = async () => {
    await navigator.clipboard.writeText(output);
  };

  const swap = () => {
    setMode((m) => (m === "toml-to-json" ? "json-to-toml" : "toml-to-json"));
    setInput(output.startsWith("/* ERROR:") ? "" : output);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("toml-to-json")}
              className={`rounded-2xl px-4 py-2 font-semibold transition ${
                mode === "toml-to-json" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {ui.tomlToJson}
            </button>
            <button
              type="button"
              onClick={() => setMode("json-to-toml")}
              className={`rounded-2xl px-4 py-2 font-semibold transition ${
                mode === "json-to-toml" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {ui.jsonToToml}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mode === "toml-to-json" && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={prettyJson}
                  onChange={(e) => setPrettyJson(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {ui.jsonPrettyPrint}
              </label>
            )}
            <button
              type="button"
              onClick={swap}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {ui.swap}
            </button>
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {ui.copyOutput}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.input}</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="mt-3 h-[520px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              placeholder={mode === "toml-to-json" ? ui.tomlPlaceholder : ui.jsonPlaceholder}
            />
          </div>
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.output}</div>
            <textarea
              value={output}
              readOnly
              className="mt-3 h-[520px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              placeholder={ui.resultPlaceholder}
            />
            <div className="mt-3 text-xs text-slate-500">
              {ui.description}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

