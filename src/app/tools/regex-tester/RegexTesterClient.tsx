"use client";

import { useMemo, useState } from "react";

type MatchItem = {
  index: number;
  match: string;
  groups: string[];
};

const safeFlags = (raw: string) => raw.replace(/[^dgimsuvy]/g, "");

export default function RegexTesterClient() {
  const [pattern, setPattern] = useState("\\b\\w+\\b");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState("Hello world\nHello regex");
  const [replacement, setReplacement] = useState("$&");

  const compiled = useMemo(() => {
    try {
      const f = safeFlags(flags);
      return { ok: true as const, regex: new RegExp(pattern, f), flags: f };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "正则表达式无效",
      };
    }
  }, [flags, pattern]);

  const matches = useMemo(() => {
    if (!compiled.ok) return [] as MatchItem[];
    const regex = new RegExp(compiled.regex.source, compiled.regex.flags);
    const isGlobal = regex.global;

    if (!isGlobal) {
      const m = regex.exec(text);
      if (!m || m.index == null) return [];
      return [
        {
          index: m.index,
          match: m[0],
          groups: m.slice(1),
        },
      ];
    }

    const result: MatchItem[] = [];
    regex.lastIndex = 0;

    while (true) {
      const m = regex.exec(text);
      if (!m || m.index == null) break;
      result.push({
        index: m.index,
        match: m[0],
        groups: m.slice(1),
      });
      if (m[0] === "") {
        regex.lastIndex += 1;
      }
      if (result.length >= 1000) break;
    }

    return result;
  }, [compiled, text]);

  const replaced = useMemo(() => {
    if (!compiled.ok) return null;
    try {
      const regex = new RegExp(compiled.regex.source, compiled.regex.flags);
      return text.replace(regex, replacement);
    } catch (e) {
      return e instanceof Error ? e.message : "替换失败";
    }
  }, [compiled, replacement, text]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          正则表达式测试
        </h1>
        <p className="mt-2 text-sm text-slate-500">匹配、分组与替换预览（纯本地）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="block lg:col-span-2">
            <div className="text-sm font-semibold text-slate-900">表达式</div>
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="例如：\\b\\w+\\b"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </label>
          <label className="block">
            <div className="text-sm font-semibold text-slate-900">flags</div>
            <input
              value={flags}
              onChange={(e) => setFlags(e.target.value)}
              placeholder="g i m s u y"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
            <div className="mt-2 text-xs text-slate-500">
              实际使用：<span className="font-mono">{compiled.ok ? compiled.flags : "-"}</span>
            </div>
          </label>
        </div>

        {!compiled.ok && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            错误：{compiled.error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">测试文本</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">
                匹配结果（{matches.length}）
              </div>
              <button
                type="button"
                disabled={matches.length === 0}
                onClick={() =>
                  copy(
                    matches
                      .map((m) => `${m.index}\t${m.match}\t${m.groups.join("\t")}`)
                      .join("\n"),
                  )
                }
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                复制
              </button>
            </div>

            <div className="h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50">
              {matches.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  {compiled.ok ? "暂无匹配" : "请先修正正则表达式"}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {matches.map((m, idx) => (
                    <li key={`${m.index}-${idx}`} className="px-4 py-3">
                      <div className="text-xs text-slate-500">
                        #{idx + 1} @ {m.index}
                      </div>
                      <div className="mt-1 break-all font-mono text-sm text-slate-900">
                        {m.match}
                      </div>
                      {m.groups.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {m.groups.map((g, gi) => (
                            <div key={gi} className="break-all font-mono text-xs text-slate-700">
                              <span className="text-slate-500">${gi + 1}：</span>
                              {g}
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="block">
              <div className="text-sm font-semibold text-slate-900">替换为</div>
              <input
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="例如：$&"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </label>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">替换预览</div>
                <button
                  type="button"
                  disabled={typeof replaced !== "string"}
                  onClick={() => copy(replaced ?? "")}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  复制
                </button>
              </div>
              <textarea
                value={typeof replaced === "string" ? replaced : ""}
                readOnly
                placeholder="替换结果会显示在这里…"
                className="h-24 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none"
              />
              {compiled.ok && replaced == null && (
                <div className="mt-2 text-xs text-slate-500">请输入测试文本</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          提示：若未使用 g 标志，将只显示第一次匹配；为避免卡顿，最多展示 1000 条匹配。
        </div>
      </div>
    </div>
  );
}
