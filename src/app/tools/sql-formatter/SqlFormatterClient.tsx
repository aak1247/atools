"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Token =
  | { type: "word"; value: string }
  | { type: "string"; value: string }
  | { type: "comment"; value: string }
  | { type: "symbol"; value: string };

const KEYWORDS = new Set(
  [
    "select",
    "from",
    "where",
    "group",
    "by",
    "order",
    "having",
    "limit",
    "offset",
    "join",
    "left",
    "right",
    "inner",
    "outer",
    "full",
    "cross",
    "on",
    "and",
    "or",
    "union",
    "all",
    "distinct",
    "insert",
    "into",
    "values",
    "update",
    "set",
    "delete",
    "as",
    "case",
    "when",
    "then",
    "else",
    "end",
    "in",
    "is",
    "null",
    "not",
    "like",
    "between",
    "exists",
    "create",
    "table",
    "alter",
    "drop",
    "top",
    "returning"
  ].map((k) => k.toLowerCase()),
);

const CLAUSE_STARTS = [
  ["select"],
  ["from"],
  ["where"],
  ["on"],
  ["group", "by"],
  ["order", "by"],
  ["having"],
  ["limit"],
  ["offset"],
  ["insert", "into"],
  ["values"],
  ["update"],
  ["set"],
  ["delete", "from"],
  ["union"],
  ["union", "all"],
] as const;

const JOIN_STARTS = [
  ["join"],
  ["left", "join"],
  ["right", "join"],
  ["inner", "join"],
  ["outer", "join"],
  ["full", "join"],
  ["cross", "join"],
] as const;

const OPERATORS = new Set(["=", "<", ">", "<=", ">=", "<>", "!=", "+", "-", "*", "/", "%", "||"]);

const isWordChar = (ch: string) => /[A-Za-z0-9_$]/.test(ch);

const tokenizeSql = (sql: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;

  const peek = (offset: number) => (i + offset < sql.length ? sql[i + offset] : "");

  while (i < sql.length) {
    const ch = sql[i];
    if (!ch) break;

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === "-" && peek(1) === "-") {
      const start = i;
      i += 2;
      while (i < sql.length && sql[i] !== "\n") i += 1;
      tokens.push({ type: "comment", value: sql.slice(start, i) });
      continue;
    }

    if (ch === "/" && peek(1) === "*") {
      const start = i;
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && peek(1) === "/")) i += 1;
      i = Math.min(sql.length, i + 2);
      tokens.push({ type: "comment", value: sql.slice(start, i) });
      continue;
    }

    if (ch === "'") {
      const start = i;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && peek(1) === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      tokens.push({ type: "string", value: sql.slice(start, i) });
      continue;
    }

    if (ch === '"' || ch === "`" || ch === "[") {
      const quote = ch;
      const close = quote === "[" ? "]" : quote;
      const start = i;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === close) {
          i += 1;
          break;
        }
        i += 1;
      }
      tokens.push({ type: "string", value: sql.slice(start, i) });
      continue;
    }

    if (isWordChar(ch)) {
      const start = i;
      i += 1;
      while (i < sql.length && isWordChar(sql[i])) i += 1;
      tokens.push({ type: "word", value: sql.slice(start, i) });
      continue;
    }

    const two = `${ch}${peek(1)}`;
    if (OPERATORS.has(two)) {
      tokens.push({ type: "symbol", value: two });
      i += 2;
      continue;
    }

    tokens.push({ type: "symbol", value: ch });
    i += 1;
  }

  return tokens;
};

const matchSequence = (tokens: Token[], index: number, seq: readonly string[]) => {
  for (let j = 0; j < seq.length; j += 1) {
    const t = tokens[index + j];
    if (!t || t.type !== "word") return false;
    if (t.value.toLowerCase() !== seq[j]) return false;
  }
  return true;
};

const formatSql = (
  sql: string,
  options: { uppercaseKeywords: boolean; indentSize: number },
): { ok: true; text: string } | { ok: false; error: string; text: string } => {
  try {
    const tokens = tokenizeSql(sql);
    if (tokens.length === 0) return { ok: true, text: "" };

    const indentSize = Math.max(1, Math.min(8, Math.round(options.indentSize)));

    let parenDepth = 0;
    let clause: "select" | "set" | "values" | "where" | "on" | null = null;
    let clauseParenDepth = 0;

    const lines: string[] = [];
    let line = "";

    const indent = (level: number) => " ".repeat(level * indentSize);

    const commitLine = () => {
      const trimmed = line.trimEnd();
      if (trimmed.length > 0) lines.push(trimmed);
      line = "";
    };

    const newline = (level: number) => {
      commitLine();
      line = indent(level);
    };

    const append = (value: string, { spaceBefore }: { spaceBefore?: boolean } = {}) => {
      const needsSpace = spaceBefore && line.length > 0 && !/\s$/.test(line);
      if (needsSpace) line += " ";
      line += value;
    };

    const normalizeWord = (value: string) => {
      const lower = value.toLowerCase();
      if (!options.uppercaseKeywords) return value;
      return KEYWORDS.has(lower) ? value.toUpperCase() : value;
    };

    newline(0);

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];

      if (token.type === "comment") {
        if (line.trim().length > 0) newline(Math.max(0, parenDepth));
        append(token.value.trim(), { spaceBefore: false });
        newline(Math.max(0, parenDepth));
        continue;
      }

      if (token.type === "word") {
        const lower = token.value.toLowerCase();

        const joinMatch = JOIN_STARTS.find((seq) => matchSequence(tokens, i, seq));
        if (joinMatch) {
          newline(Math.max(0, parenDepth));
          append(
            joinMatch.map((_w, idx) => normalizeWord(tokens[i + idx]?.type === "word" ? tokens[i + idx].value : "")).join(" "),
            { spaceBefore: false },
          );
          i += joinMatch.length - 1;
          clause = null;
          continue;
        }

        const clauseMatch = CLAUSE_STARTS.find((seq) => matchSequence(tokens, i, seq));
        if (clauseMatch) {
          newline(Math.max(0, parenDepth));
          append(
            clauseMatch.map((_w, idx) => normalizeWord(tokens[i + idx]?.type === "word" ? tokens[i + idx].value : "")).join(" "),
            { spaceBefore: false },
          );
          i += clauseMatch.length - 1;

          const head = clauseMatch[0];
          clause = head === "select" ? "select" : head === "set" ? "set" : head === "values" ? "values" : null;
          if (head === "where" || head === "on") clause = head;
          clauseParenDepth = parenDepth;
          continue;
        }

        if ((clause === "where" || clause === "on") && (lower === "and" || lower === "or") && parenDepth === clauseParenDepth) {
          newline(Math.max(0, parenDepth) + 1);
          append(normalizeWord(token.value), { spaceBefore: false });
          continue;
        }

        append(normalizeWord(token.value), { spaceBefore: true });
        continue;
      }

      if (token.type === "string") {
        append(token.value, { spaceBefore: true });
        continue;
      }

      const sym = token.value;

      if (sym === "(") {
        append("(", { spaceBefore: false });
        parenDepth += 1;
        continue;
      }

      if (sym === ")") {
        parenDepth = Math.max(0, parenDepth - 1);
        append(")", { spaceBefore: false });
        continue;
      }

      if (sym === ",") {
        append(",", { spaceBefore: false });
        if (clause && parenDepth === clauseParenDepth) {
          newline(Math.max(0, parenDepth) + 1);
        } else {
          append(" ", { spaceBefore: false });
        }
        continue;
      }

      if (sym === ";") {
        append(";", { spaceBefore: false });
        newline(0);
        clause = null;
        clauseParenDepth = 0;
        continue;
      }

      if (OPERATORS.has(sym)) {
        append(sym, { spaceBefore: true });
        continue;
      }

      append(sym, { spaceBefore: false });
    }

    commitLine();
    return { ok: true, text: lines.join("\n") };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "格式化失败。", text: "" };
  }
};

export default function SqlFormatterClient() {
  const [input, setInput] = useState("");
  const [uppercaseKeywords, setUppercaseKeywords] = useState(true);
  const [indentSize, setIndentSize] = useState(2);

  const result = useMemo(() => formatSql(input, { uppercaseKeywords, indentSize }), [input, indentSize, uppercaseKeywords]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <ToolPageLayout toolSlug="sql-formatter">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={uppercaseKeywords}
                  onChange={(e) => setUppercaseKeywords(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                关键字大写
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                缩进
                <select
                  value={indentSize}
                  onChange={(e) => setIndentSize(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              disabled={!result.ok || !result.text}
              onClick={() => void copy(result.ok ? result.text : "")}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              复制结果
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">SQL 输入</div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="SELECT a,b,c FROM t WHERE a=1 AND b='x' ORDER BY c DESC;"
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">格式化结果</div>
                {!result.ok && <div className="text-xs text-rose-600">错误：{result.error}</div>}
              </div>
              <textarea
                value={result.ok ? result.text : ""}
                readOnly
                placeholder="格式化结果会显示在这里…"
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
              <div className="mt-3 text-xs text-slate-500">
                提示：该格式化器为轻量实现，复杂 SQL（多层子查询/窗口函数）可能需要手动微调。
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
