"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type AllOriginsResponse = {
  contents: string;
  status: {
    url: string;
    content_type: string;
    http_code: number;
    response_time: number;
    content_length: number;
  };
};

const normalizeInput = (raw: string): { hostOrUrl: string; httpsUrl: string; httpUrl: string } => {
  const s = raw.trim();
  if (!s) return { hostOrUrl: "", httpsUrl: "", httpUrl: "" };
  const withProto = s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    return { hostOrUrl: s, httpsUrl: "", httpUrl: "" };
  }
  const host = url.host;
  const path = url.pathname && url.pathname !== "/" ? url.pathname : "/";
  const search = url.search || "";
  const hash = ""; // ignore
  return {
    hostOrUrl: s,
    httpsUrl: `https://${host}${path}${search}${hash}`,
    httpUrl: `http://${host}${path}${search}${hash}`,
  };
};

const fetchStatus = async (url: string): Promise<AllOriginsResponse["status"]> => {
  const api = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const resp = await fetch(api);
  if (!resp.ok) throw new Error(`Proxy request failed: ${resp.status}`);
  const data = (await resp.json()) as AllOriginsResponse;
  return data.status;
};

const DEFAULT_UI = {
  title: "SSL / HTTPS 检查",
  description:
    "说明：由于纯静态站点无法直接读取 TLS 证书细节，本工具通过公共代理获取 HTTP/HTTPS 可达性与响应状态，用于快速判断 HTTPS 是否可用/是否存在异常跳转。",
  inputPlaceholder: "example.com 或 https://example.com/path",
  check: "开始检查",
  checking: "检查中…",
  clear: "清空",
  invalidInput: "请输入有效的域名或网址",
  error: "检查失败",
  resultsTitle: "结果",
  verdictOk: "HTTPS 可用",
  verdictBad: "HTTPS 可能不可用",
  tableProtocol: "协议",
  tableFinalUrl: "最终 URL",
  tableStatusCode: "状态码",
  tableResponseTimeMs: "耗时 (ms)",
  tableContentType: "Content-Type",
  footerNote: "注：这里只能检查“HTTPS 是否可访问/是否自动跳转”等现象，无法在浏览器端直接读取证书颁发机构、过期时间等字段。"
} as const;

type Ui = typeof DEFAULT_UI;

export default function SslCheckerClient() {
  return (
    <ToolPageLayout toolSlug="ssl-checker" maxWidthClassName="max-w-5xl">
      <SslCheckerInner />
    </ToolPageLayout>
  );
}

function SslCheckerInner() {
  const config = useOptionalToolConfig("ssl-checker");
  const ui: Ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<Ui>) };

  const [input, setInput] = useState("example.com");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<AllOriginsResponse["status"] | null>(null);
  const [httpsStatus, setHttpsStatus] = useState<AllOriginsResponse["status"] | null>(null);

  const normalized = useMemo(() => normalizeInput(input), [input]);

  const run = async () => {
    setError(null);
    setHttpStatus(null);
    setHttpsStatus(null);
    if (!normalized.httpsUrl || !normalized.httpUrl) {
      setError(ui.invalidInput);
      return;
    }
    setIsWorking(true);
    try {
      const [https, http] = await Promise.all([fetchStatus(normalized.httpsUrl), fetchStatus(normalized.httpUrl)]);
      setHttpsStatus(https);
      setHttpStatus(http);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.error);
    } finally {
      setIsWorking(false);
    }
  };

  const verdict = useMemo(() => {
    if (!httpsStatus) return null;
    const ok = httpsStatus.http_code >= 200 && httpsStatus.http_code < 400;
    return { ok, text: ok ? ui.verdictOk : ui.verdictBad };
  }, [httpsStatus, ui.verdictBad, ui.verdictOk]);

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="text-sm font-semibold text-slate-900">{ui.title}</div>
        <div className="mt-2 text-xs text-slate-600">{ui.description}</div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-w-[240px] flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            placeholder={ui.inputPlaceholder}
          />
          <button
            type="button"
            onClick={() => void run()}
            disabled={isWorking}
            className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {isWorking ? ui.checking : ui.check}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        {(httpsStatus || httpStatus) && (
          <div className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">{ui.resultsTitle}</div>
              {verdict && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    verdict.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {verdict.text}
                </span>
              )}
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <table className="w-full table-fixed border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="w-20 border-b border-slate-200 px-3 py-2">{ui.tableProtocol}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{ui.tableFinalUrl}</th>
                    <th className="w-24 border-b border-slate-200 px-3 py-2">{ui.tableStatusCode}</th>
                    <th className="w-28 border-b border-slate-200 px-3 py-2">{ui.tableResponseTimeMs}</th>
                    <th className="w-40 border-b border-slate-200 px-3 py-2">{ui.tableContentType}</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {[
                    { label: "HTTPS", status: httpsStatus },
                    { label: "HTTP", status: httpStatus },
                  ].map((row) => (
                    <tr key={row.label} className="odd:bg-white even:bg-slate-50/40">
                      <td className="border-b border-slate-100 px-3 py-2 font-semibold">{row.label}</td>
                      <td className="border-b border-slate-100 px-3 py-2 font-mono break-all">{row.status?.url ?? "-"}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{row.status?.http_code ?? "-"}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{row.status?.response_time ?? "-"}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{row.status?.content_type ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-xs text-slate-500">
              {ui.footerNote}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
