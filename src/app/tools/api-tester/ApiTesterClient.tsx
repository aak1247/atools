"use client";

import { useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
type Mode = "cors" | "no-cors";

const parseHeaders = (raw: string): Headers => {
  const headers = new Headers();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf(":");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key) headers.append(key, value);
  }
  return headers;
};

const formatHeaders = (headers: Headers): string => {
  const pairs: string[] = [];
  headers.forEach((value, key) => pairs.push(`${key}: ${value}`));
  pairs.sort((a, b) => a.localeCompare(b, "en"));
  return pairs.join("\n");
};

const tryPrettyJson = (text: string): { ok: true; text: string } | { ok: false } => {
  try {
    const parsed = JSON.parse(text) as unknown;
    return { ok: true, text: JSON.stringify(parsed, null, 2) };
  } catch {
    return { ok: false };
  }
};

export default function ApiTesterClient() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";
  const ui =
    locale === "en-us"
      ? {
          request: "Request",
          response: "Response",
          method: "Method",
          url: "URL",
          mode: "Mode",
          modeCors: "cors (default)",
          modeNoCors: "no-cors (opaque, unreadable response)",
          timeoutMs: "Timeout (ms)",
          headers: "Request headers (one per line: Key: Value)",
          body: "Request body",
          send: "Send request",
          sending: "Sending...",
          cancel: "Cancel",
          raw: "Raw",
          jsonPreview: "JSON preview",
          responseHeaders: "Response headers",
          responseBody: "Response body",
          copy: "Copy",
          responsePlaceholder: "Response content will appear here...",
          errorPrefix: "Error:",
          errUrlRequired: "Please enter a URL.",
          errUrlProtocol: "Only http/https URLs are supported.",
          errUrlInvalid: "Invalid URL format.",
          errAborted: "Request canceled or timed out.",
          errRequestFailed: "Request failed (possible CORS or network issue).",
        }
      : {
          request: "请求",
          response: "响应",
          method: "方法",
          url: "URL",
          mode: "mode",
          modeCors: "cors（默认）",
          modeNoCors: "no-cors（opaque，读不到响应）",
          timeoutMs: "超时（ms）",
          headers: "请求头（每行一条：Key: Value）",
          body: "请求体",
          send: "发送请求",
          sending: "发送中...",
          cancel: "取消",
          raw: "原始",
          jsonPreview: "JSON 预览",
          responseHeaders: "响应头",
          responseBody: "响应体",
          copy: "复制",
          responsePlaceholder: "响应内容会显示在这里…",
          errorPrefix: "错误：",
          errUrlRequired: "请输入 URL。",
          errUrlProtocol: "仅支持 http/https URL。",
          errUrlInvalid: "URL 格式不正确。",
          errAborted: "请求已取消或超时。",
          errRequestFailed: "请求失败（可能是 CORS 或网络问题）。",
        };

  const abortRef = useRef<AbortController | null>(null);

  const [method, setMethod] = useState<HttpMethod>("GET");
  const [mode, setMode] = useState<Mode>("cors");
  const [url, setUrl] = useState("https://httpbin.org/get");
  const [headersRaw, setHeadersRaw] = useState("accept: application/json");
  const [body, setBody] = useState('{"hello":"world"}');
  const [timeoutMs, setTimeoutMs] = useState(15000);

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<string>("");
  const [responseBody, setResponseBody] = useState<string>("");
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [view, setView] = useState<"raw" | "json">("raw");

  const canHaveBody = method !== "GET" && method !== "HEAD";

  const preview = useMemo(() => {
    const headers = parseHeaders(headersRaw);
    const init: RequestInit = { method, headers, mode };
    if (canHaveBody && body.trim()) init.body = body;
    return init;
  }, [body, canHaveBody, headersRaw, method, mode]);

  const send = async () => {
    setError(null);
    setStatusLine(null);
    setResponseHeaders("");
    setResponseBody("");
    setDurationMs(null);
    setView("raw");

    const target = url.trim();
    if (!target) {
      setError(ui.errUrlRequired);
      return;
    }

    try {
      const parsed = new URL(target);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError(ui.errUrlProtocol);
        return;
      }
    } catch {
      setError(ui.errUrlInvalid);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const started = performance.now();
    setIsSending(true);

    const timeout = window.setTimeout(() => controller.abort(), Math.max(0, timeoutMs));

    try {
      const res = await fetch(target, { ...preview, signal: controller.signal });
      const elapsed = performance.now() - started;
      setDurationMs(elapsed);
      setStatusLine(`${res.status} ${res.statusText || ""}`.trim());
      setResponseHeaders(formatHeaders(res.headers));

      // NOTE: no-cors 模式会得到 opaque response，读不到内容
      const text = await res.text();
      setResponseBody(text);

      const pretty = tryPrettyJson(text);
      if (pretty.ok) setView("json");
    } catch (e) {
      const elapsed = performance.now() - started;
      setDurationMs(elapsed);
      if (e instanceof DOMException && e.name === "AbortError") {
        setError(ui.errAborted);
      } else {
        setError(e instanceof Error ? e.message : ui.errRequestFailed);
      }
    } finally {
      window.clearTimeout(timeout);
      setIsSending(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const copyResponse = async () => {
    await navigator.clipboard.writeText(responseBody);
  };

  const displayedBody = useMemo(() => {
    if (view !== "json") return responseBody;
    const pretty = tryPrettyJson(responseBody);
    return pretty.ok ? pretty.text : responseBody;
  }, [responseBody, view]);

  return (
    <ToolPageLayout toolSlug="api-tester" maxWidthClassName="max-w-6xl">
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.request}</div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr]">
                <label className="block text-sm text-slate-700">
                  {ui.method}
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as HttpMethod)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    {(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.url}
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/api"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  {ui.mode}
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as Mode)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value="cors">{ui.modeCors}</option>
                    <option value="no-cors">{ui.modeNoCors}</option>
                  </select>
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.timeoutMs}
                  <input
                    type="number"
                    min={1000}
                    step={500}
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
              </div>

              <div className="mt-4">
                <div className="text-sm font-semibold text-slate-900">{ui.headers}</div>
                <textarea
                  value={headersRaw}
                  onChange={(e) => setHeadersRaw(e.target.value)}
                  className="mt-2 h-28 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  placeholder="content-type: application/json"
                />
              </div>

              {canHaveBody && (
                <div className="mt-4">
                  <div className="text-sm font-semibold text-slate-900">{ui.body}</div>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="mt-2 h-44 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    placeholder='{"key":"value"}'
                  />
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={isSending}
                  className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {isSending ? ui.sending : ui.send}
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  disabled={!isSending}
                  className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  {ui.cancel}
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-500">
              {locale === "en-us" ? (
                <span>
                  Tip: Browsers enforce CORS. If the API does not return{" "}
                  <code className="font-mono">Access-Control-Allow-Origin</code>{" "}
                  correctly, the request may fail or the response may be unreadable.
                </span>
              ) : (
                <span>
                  提示：浏览器会强制 CORS；如果接口没有正确返回{" "}
                  <code className="font-mono">Access-Control-Allow-Origin</code>
                  ，请求会失败或读不到响应内容。
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{ui.response}</div>
                <div className="text-xs text-slate-500">
                  {durationMs == null ? "-" : `${Math.round(durationMs)} ms`}
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-800 ring-1 ring-slate-200">
                {statusLine ?? "-"}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setView("raw")}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold ring-1 transition ${
                    view === "raw" ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-800 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {ui.raw}
                </button>
                <button
                  type="button"
                  onClick={() => setView("json")}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold ring-1 transition ${
                    view === "json" ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-800 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {ui.jsonPreview}
                </button>
              </div>

              <div className="mt-4">
                <div className="text-sm font-semibold text-slate-900">{ui.responseHeaders}</div>
                <textarea
                  value={responseHeaders}
                  readOnly
                  className="mt-2 h-28 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                />
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">{ui.responseBody}</div>
                  <button
                    type="button"
                    onClick={() => void copyResponse()}
                    disabled={!responseBody}
                    className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    {ui.copy}
                  </button>
                </div>
                <textarea
                  value={displayedBody}
                  readOnly
                  className="mt-2 h-72 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                  placeholder={ui.responsePlaceholder}
                />
              </div>

              {error && (
                <div className="mt-4 text-sm text-rose-600">
                  {ui.errorPrefix}
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
