"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Tab = "rawToJson" | "jsonToRaw";

const normalizeKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("-");

const parseRawHeaders = (raw: string) => {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const headers: Record<string, string> = {};
  const firstLine = lines[0] ?? "";
  const startLine = firstLine.includes(":") ? "" : firstLine.trim();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = normalizeKey(line.slice(0, idx));
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
  }

  const cookieText = headers.Cookie || headers["Set-Cookie"] || "";
  const cookies: Record<string, string> = {};
  if (cookieText) {
    const parts = cookieText.split(/;\s*/);
    for (const part of parts) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      if (!k) continue;
      if (!(k in cookies)) cookies[k] = v;
    }
  }

  return { startLine, headers, cookies };
};

const jsonToRaw = (jsonText: string) => {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false as const, error: "请输入 JSON 对象（key-value）。", text: "" };
    }
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter(([k]) => typeof k === "string" && k.trim())
      .map(([k, v]) => [k.trim(), typeof v === "string" ? v : JSON.stringify(v)] as const);
    const text = entries.map(([k, v]) => `${k}: ${v}`).join("\n");
    return { ok: true as const, text };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "解析失败", text: "" };
  }
};

export default function HttpHeaderParserClient() {
  const [tab, setTab] = useState<Tab>("rawToJson");
  const [raw, setRaw] = useState("");
  const [json, setJson] = useState('{"Content-Type":"application/json","Authorization":"Bearer ..."}');

  const parsed = useMemo(() => parseRawHeaders(raw), [raw]);
  const generated = useMemo(() => jsonToRaw(json), [json]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <ToolPageLayout toolSlug="http-header-parser">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-2xl bg-slate-100/60 p-1">
              <button
                type="button"
                onClick={() => setTab("rawToJson")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  tab === "rawToJson" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Raw → JSON
              </button>
              <button
                type="button"
                onClick={() => setTab("jsonToRaw")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  tab === "jsonToRaw" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                JSON → Raw
              </button>
            </div>

            <button
              type="button"
              onClick={() => void copy(tab === "rawToJson" ? JSON.stringify(parsed.headers, null, 2) : (generated.ok ? generated.text : ""))}
              disabled={tab === "rawToJson" ? Object.keys(parsed.headers).length === 0 : !generated.ok || !generated.text}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              复制
            </button>
          </div>

          {tab === "rawToJson" ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-900">Raw Headers</div>
                <textarea
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder={"GET /path HTTP/1.1\\nHost: example.com\\nUser-Agent: ...\\nCookie: a=1; b=2"}
                  className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                  <div className="text-sm font-semibold text-slate-900">解析结果</div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600">
                    <div>
                      Start Line：<span className="font-mono">{parsed.startLine || "-"}</span>
                    </div>
                  </div>
                  <textarea
                    value={JSON.stringify(parsed.headers, null, 2)}
                    readOnly
                    className="mt-3 h-44 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                  />
                </div>

                <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                  <div className="text-sm font-semibold text-slate-900">Cookie 解析</div>
                  <textarea
                    value={JSON.stringify(parsed.cookies, null, 2)}
                    readOnly
                    className="mt-3 h-28 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                  />
                  <div className="mt-3 text-xs text-slate-500">提示：Set-Cookie 只做简单分号切分（不解析属性）。</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-900">Headers JSON</div>
                <textarea
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
                {!generated.ok && <div className="mt-2 text-sm text-rose-600">错误：{generated.error}</div>}
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-900">Raw 输出</div>
                <textarea
                  value={generated.ok ? generated.text : ""}
                  readOnly
                  className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                />
                <div className="mt-3 text-xs text-slate-500">提示：值为对象/数组时会用 JSON.stringify 输出到一行。</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolPageLayout>
  );
}

