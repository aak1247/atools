"use client";

import { useMemo, useState } from "react";
import YAML from "yaml";

type Direction = "jsonToYaml" | "yamlToJson";

export default function JsonYamlConverterClient() {
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
        error: e instanceof Error ? e.message : "转换失败",
      };
    }
  }, [direction, indent, input]);

  const copy = async () => {
    if (!result.ok) return;
    await navigator.clipboard.writeText(result.text);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">JSON-YAML 转换器</h1>
        <p className="mt-2 text-sm text-slate-500">JSON 与 YAML 互转，纯本地处理</p>
      </div>

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
              JSON → YAML
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
              YAML → JSON
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              JSON 缩进
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
              复制结果
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {direction === "jsonToYaml" ? "JSON 输入" : "YAML 输入"}
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={direction === "jsonToYaml" ? "粘贴 JSON…" : "粘贴 YAML…"}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {direction === "jsonToYaml" ? "YAML 输出" : "JSON 输出"}
            </div>
            <textarea
              value={result.ok ? result.text : ""}
              readOnly
              placeholder="结果会显示在这里…"
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
            {!result.ok && (
              <div className="mt-2 text-sm text-rose-600">错误：{result.error}</div>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          提示：YAML 支持多种语法特性，若解析失败请检查缩进与特殊字符。
        </div>
      </div>
    </div>
  );
}

