"use client";

import { useMemo, useState } from "react";
import YAML from "yaml";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";

type Direction = "jsonToYaml" | "yamlToJson";

export default function JsonYamlConverterClient() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";
  const ui =
    locale === "en-us"
      ? {
          jsonToYaml: "JSON → YAML",
          yamlToJson: "YAML → JSON",
          jsonIndent: "JSON indent",
          copyResult: "Copy result",
          inputJson: "JSON input",
          inputYaml: "YAML input",
          outputYaml: "YAML output",
          outputJson: "JSON output",
          pasteJson: "Paste JSON...",
          pasteYaml: "Paste YAML...",
          resultPlaceholder: "Result will appear here...",
          errorPrefix: "Error:",
          convertFailed: "Conversion failed",
          hint:
            "Tip: YAML supports many syntax features. If parsing fails, double-check indentation and special characters.",
        }
      : {
          jsonToYaml: "JSON → YAML",
          yamlToJson: "YAML → JSON",
          jsonIndent: "JSON 缩进",
          copyResult: "复制结果",
          inputJson: "JSON 输入",
          inputYaml: "YAML 输入",
          outputYaml: "YAML 输出",
          outputJson: "JSON 输出",
          pasteJson: "粘贴 JSON…",
          pasteYaml: "粘贴 YAML…",
          resultPlaceholder: "结果会显示在这里…",
          errorPrefix: "错误：",
          convertFailed: "转换失败",
          hint: "提示：YAML 支持多种语法特性，若解析失败请检查缩进与特殊字符。",
        };

  const [direction, setDirection] = useState<Direction>("jsonToYaml");
  const [indent, setIndent] = useState(2);
  const [input, setInput] = useState('{"hello":"world","arr":[1,2,3]}');

  const result = useMemo(() => {
    const raw = input.trim();
    if (!raw) return { ok: true as const, text: "" };
    try {
      if (direction === "jsonToYaml") {
        const value = JSON.parse(raw) as unknown;
        return { ok: true as const, text: YAML.stringify(value) };
      }
      const value = YAML.parse(raw) as unknown;
      return { ok: true as const, text: JSON.stringify(value, null, indent) };
    } catch (e) {
      return {
        ok: false as const,
        text: "",
        error: e instanceof Error ? e.message : ui.convertFailed,
      };
    }
  }, [direction, indent, input, locale]);

  const copy = async () => {
    if (!result.ok) return;
    await navigator.clipboard.writeText(result.text);
  };

  return (
    <ToolPageLayout toolSlug="json-yaml-converter" maxWidthClassName="max-w-5xl">
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-2xl bg-slate-100/60 p-1">
            <button
              type="button"
              onClick={() => setDirection("jsonToYaml")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                direction === "jsonToYaml"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {ui.jsonToYaml}
            </button>
            <button
              type="button"
              onClick={() => setDirection("yamlToJson")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                direction === "yamlToJson"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {ui.yamlToJson}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              {ui.jsonIndent}
              <select
                value={indent}
                disabled={direction !== "yamlToJson"}
                onChange={(e) => setIndent(Number(e.target.value))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
              >
                <option value={2}>2</option>
                <option value={4}>4</option>
                <option value={8}>8</option>
              </select>
            </label>
            <button
              type="button"
              disabled={!result.ok}
              onClick={copy}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 disabled:opacity-60 active:scale-[0.99]"
            >
              {ui.copyResult}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {direction === "jsonToYaml" ? ui.inputJson : ui.inputYaml}
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={direction === "jsonToYaml" ? ui.pasteJson : ui.pasteYaml}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {direction === "jsonToYaml" ? ui.outputYaml : ui.outputJson}
            </div>
            <textarea
              value={result.ok ? result.text : ""}
              readOnly
              placeholder={ui.resultPlaceholder}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
            {!result.ok && (
              <div className="mt-2 text-sm text-rose-600">
                {ui.errorPrefix}
                {result.error}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">{ui.hint}</div>
      </div>
    </ToolPageLayout>
  );
}
