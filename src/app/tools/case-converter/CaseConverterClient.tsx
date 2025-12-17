"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Mode =
  | "upper"
  | "lower"
  | "title"
  | "sentence"
  | "camel"
  | "pascal"
  | "snake"
  | "kebab"
  | "constant";

const splitWords = (text: string): string[] => {
  const normalized = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return normalized ? normalized.split(/\s+/) : [];
};

const capitalize = (word: string): string =>
  word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : "";

const toCamel = (words: string[]): string =>
  words.length === 0 ? "" : words[0].toLowerCase() + words.slice(1).map(capitalize).join("");

const toPascal = (words: string[]): string => words.map(capitalize).join("");
const toSnake = (words: string[]): string => words.map((w) => w.toLowerCase()).join("_");
const toKebab = (words: string[]): string => words.map((w) => w.toLowerCase()).join("-");
const toConstant = (words: string[]): string => words.map((w) => w.toUpperCase()).join("_");

const toTitle = (text: string): string =>
  text
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, s: string, c: string) => `${s}${c.toUpperCase()}`);

const toSentence = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const DEFAULT_UI = {
  modeLabel: "转换模式",
  copyResult: "复制结果",
  inputLabel: "输入",
  outputLabel: "输出",
  inputPlaceholder: "输入或粘贴文本…",
  outputPlaceholder: "结果会显示在这里…",
} as const;

type CaseConverterUi = typeof DEFAULT_UI;

export default function CaseConverterClient() {
  const config = useOptionalToolConfig("case-converter");
  const ui: CaseConverterUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<CaseConverterUi>) };

  const [mode, setMode] = useState<Mode>("upper");
  const [input, setInput] = useState("hello world\nfoo_bar Baz");

  const output = useMemo(() => {
    if (mode === "upper") return input.toUpperCase();
    if (mode === "lower") return input.toLowerCase();
    if (mode === "title") return toTitle(input);
    if (mode === "sentence") return toSentence(input);

    const words = splitWords(input);
    if (mode === "camel") return toCamel(words);
    if (mode === "pascal") return toPascal(words);
    if (mode === "snake") return toSnake(words);
    if (mode === "kebab") return toKebab(words);
    return toConstant(words);
  }, [input, mode]);

  const copy = async () => {
    await navigator.clipboard.writeText(output);
  };

  return (
    <ToolPageLayout toolSlug="case-converter">
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">{ui.modeLabel}</div>
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {ui.copyResult}
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {([
            { id: "upper", label: "UPPER" },
            { id: "lower", label: "lower" },
            { id: "title", label: "Title" },
            { id: "sentence", label: "Sentence" },
            { id: "camel", label: "camelCase" },
            { id: "pascal", label: "PascalCase" },
            { id: "snake", label: "snake_case" },
            { id: "kebab", label: "kebab-case" },
            { id: "constant", label: "CONSTANT_CASE" },
          ] as const).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold ring-1 transition ${
                mode === m.id
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-800 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.inputLabel}</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={ui.inputPlaceholder}
              className="h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.outputLabel}</div>
            <textarea
              value={output}
              readOnly
              placeholder={ui.outputPlaceholder}
              className="h-72 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
            />
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
