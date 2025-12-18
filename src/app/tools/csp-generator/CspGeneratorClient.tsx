"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type DirectiveName =
  | "default-src"
  | "script-src"
  | "style-src"
  | "img-src"
  | "font-src"
  | "connect-src"
  | "media-src"
  | "frame-src"
  | "child-src"
  | "worker-src"
  | "manifest-src"
  | "object-src"
  | "base-uri"
  | "form-action"
  | "frame-ancestors"
  | "upgrade-insecure-requests"
  | "block-all-mixed-content"
  | "report-to"
  | "report-uri";

type Directive = { name: DirectiveName; value: string };

const DEFAULT_DIRECTIVES: Directive[] = [
  { name: "default-src", value: "'self'" },
  { name: "script-src", value: "'self' 'unsafe-inline'" },
  { name: "style-src", value: "'self' 'unsafe-inline'" },
  { name: "img-src", value: "'self' data:" },
  { name: "font-src", value: "'self' data:" },
  { name: "connect-src", value: "'self'" },
  { name: "object-src", value: "'none'" },
  { name: "base-uri", value: "'self'" },
  { name: "frame-ancestors", value: "'self'" },
];

const KNOWN_DIRECTIVES: DirectiveName[] = [
  "default-src",
  "script-src",
  "style-src",
  "img-src",
  "font-src",
  "connect-src",
  "media-src",
  "frame-src",
  "child-src",
  "worker-src",
  "manifest-src",
  "object-src",
  "base-uri",
  "form-action",
  "frame-ancestors",
  "upgrade-insecure-requests",
  "block-all-mixed-content",
  "report-to",
  "report-uri",
];

const splitTokens = (value: string) =>
  value
    .trim()
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean);

const normalizeHeader = (directives: Directive[]) => {
  const parts: string[] = [];
  for (const d of directives) {
    const tokens = splitTokens(d.value);
    if (tokens.length === 0) {
      parts.push(d.name);
    } else {
      parts.push(`${d.name} ${tokens.join(" ")}`);
    }
  }
  return parts.join("; ");
};

const parseHeader = (raw: string): { directives: Directive[]; unknown: string[] } => {
  const unknown: string[] = [];
  const out: Directive[] = [];
  const pieces = raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of pieces) {
    const [nameRaw, ...rest] = p.split(/\s+/g);
    const name = nameRaw?.trim() || "";
    const value = rest.join(" ").trim();
    if (!name) continue;
    if ((KNOWN_DIRECTIVES as string[]).includes(name)) {
      out.push({ name: name as DirectiveName, value });
    } else {
      unknown.push(name);
      // still include as-is in output to avoid data loss
      out.push({ name: name as any, value } as Directive);
    }
  }
  return { directives: out, unknown };
};

const buildWarnings = (directives: Directive[]) => {
  const map = new Map<string, string[]>(directives.map((d) => [d.name, splitTokens(d.value)]));
  const warnings: string[] = [];

  const script = map.get("script-src") ?? [];
  const style = map.get("style-src") ?? [];
  const hasUnsafeInlineScript = script.includes("'unsafe-inline'");
  const hasUnsafeInlineStyle = style.includes("'unsafe-inline'");
  const hasUnsafeEval = script.includes("'unsafe-eval'");
  const hasWildcard = Array.from(map.values()).some((t) => t.includes("*"));

  if (hasUnsafeInlineScript) warnings.push("script-src 包含 'unsafe-inline'：会显著降低 XSS 防护能力（建议 nonce/hash）。");
  if (hasUnsafeInlineStyle) warnings.push("style-src 包含 'unsafe-inline'：建议使用 nonce/hash 或尽量避免内联样式。");
  if (hasUnsafeEval) warnings.push("script-src 包含 'unsafe-eval'：会允许 eval/new Function 等，风险较高。");
  if (hasWildcard) warnings.push("存在 * 源：建议仅放行必要源，避免过度授权。");

  const objectSrc = map.get("object-src");
  if (objectSrc && !objectSrc.includes("'none'")) warnings.push("建议将 object-src 设为 'none'（除非必须）。");

  if (!map.has("base-uri")) warnings.push("建议设置 base-uri（防止 <base> 注入）。");
  if (!map.has("frame-ancestors")) warnings.push("建议设置 frame-ancestors（防点击劫持）。");

  return warnings;
};

export default function CspGeneratorClient() {
  return (
    <ToolPageLayout toolSlug="csp-generator" maxWidthClassName="max-w-6xl">
      <CspGeneratorInner />
    </ToolPageLayout>
  );
}

function CspGeneratorInner() {
  const [mode, setMode] = useState<"builder" | "parser">("builder");
  const [directives, setDirectives] = useState<Directive[]>(DEFAULT_DIRECTIVES);
  const [rawHeader, setRawHeader] = useState(
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'",
  );

  const built = useMemo(() => normalizeHeader(directives), [directives]);
  const parsed = useMemo(() => parseHeader(rawHeader), [rawHeader]);

  const warnings = useMemo(
    () => buildWarnings(mode === "builder" ? directives : parsed.directives),
    [directives, mode, parsed.directives],
  );

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const addDirective = () => {
    const used = new Set(directives.map((d) => d.name));
    const next = KNOWN_DIRECTIVES.find((d) => !used.has(d)) ?? "connect-src";
    setDirectives((prev) => [...prev, { name: next, value: "" }]);
  };

  const removeDirective = (idx: number) => {
    setDirectives((prev) => prev.filter((_, i) => i !== idx));
  };

  const applyParsedToBuilder = () => {
    setDirectives(parsed.directives.filter((d) => (KNOWN_DIRECTIVES as string[]).includes(d.name)) as Directive[]);
    setMode("builder");
  };

  const reset = () => {
    setDirectives(DEFAULT_DIRECTIVES);
    setRawHeader(DEFAULT_DIRECTIVES.map((d) => `${d.name} ${d.value}`.trim()).join("; "));
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("builder")}
              className={`rounded-2xl px-4 py-2 font-semibold transition ${
                mode === "builder" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              生成器
            </button>
            <button
              type="button"
              onClick={() => setMode("parser")}
              className={`rounded-2xl px-4 py-2 font-semibold transition ${
                mode === "parser" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              解析/校验
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              重置
            </button>
            <button
              type="button"
              onClick={() => void copy(mode === "builder" ? built : normalizeHeader(parsed.directives))}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              复制 CSP
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          说明：Content-Security-Policy 用于限制资源加载与脚本执行，提升 XSS 防护。建议配合 `nonce-`/`sha256-` 等安全策略。
        </div>

        {warnings.length > 0 && (
          <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-100">
            <div className="font-semibold">提示/风险点</div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {warnings.slice(0, 8).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {mode === "builder" ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">指令列表</div>
                <button
                  type="button"
                  onClick={addDirective}
                  className="rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                >
                  添加指令
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {directives.map((d, idx) => (
                  <div key={`${d.name}-${idx}`} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={d.name}
                        onChange={(e) =>
                          setDirectives((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, name: e.target.value as DirectiveName } : p)),
                          )
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none"
                      >
                        {KNOWN_DIRECTIVES.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <input
                        value={d.value}
                        onChange={(e) =>
                          setDirectives((prev) => prev.map((p, i) => (i === idx ? { ...p, value: e.target.value } : p)))
                        }
                        className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                        placeholder="例如：'self' https: data: 'nonce-...'"
                      />
                      <button
                        type="button"
                        onClick={() => removeDirective(idx)}
                        className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
                      >
                        删除
                      </button>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">tokens：{splitTokens(d.value).join(" · ") || "-"}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">CSP 输出</div>
                  <button
                    type="button"
                    onClick={() => setRawHeader(built)}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                  >
                    填入解析器
                  </button>
                </div>
                <textarea
                  value={built}
                  readOnly
                  className="mt-3 h-56 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                />
              </div>

              <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-600">
                常用源：<span className="font-mono">'self'</span> / <span className="font-mono">https:</span> /{" "}
                <span className="font-mono">data:</span> / <span className="font-mono">blob:</span> /{" "}
                <span className="font-mono">'none'</span> / <span className="font-mono">'unsafe-inline'</span> /{" "}
                <span className="font-mono">'nonce-...'</span> / <span className="font-mono">'sha256-...'</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">输入 CSP Header</div>
              <textarea
                value={rawHeader}
                onChange={(e) => setRawHeader(e.target.value)}
                className="mt-3 h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                placeholder="default-src 'self'; script-src 'self' ..."
              />
              {parsed.unknown.length > 0 && (
                <div className="mt-3 text-xs text-amber-800">
                  未识别的指令：{parsed.unknown.join(", ")}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={applyParsedToBuilder}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  应用到生成器
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">解析结果</div>
              <div className="mt-3 max-h-64 overflow-auto rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                {parsed.directives.length === 0 ? (
                  <div className="text-xs text-slate-500">暂无解析结果</div>
                ) : (
                  <div className="space-y-2">
                    {parsed.directives.map((d, idx) => (
                      <div key={`${d.name}-${idx}`} className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                        <div className="text-xs font-semibold text-slate-900">{d.name}</div>
                        <div className="mt-1 font-mono text-[11px] text-slate-700 break-words">{d.value || "(empty)"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-3 text-xs text-slate-500">
                标准化输出（用于 header）：<span className="font-mono break-words">{normalizeHeader(parsed.directives)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

