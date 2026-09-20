"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { X509Certificate } from "@peculiar/x509";
import {
  ShieldCheck,
  ShieldAlert,
  Globe,
  FileCheck,
  Upload,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Mode = "domain" | "certificate";

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

type ParsedCertInfo = {
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  isExpired: boolean;
  daysRemaining: number;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
  publicKeySize?: string;
  dnsNames?: string[];
};

const normalizeInput = (raw: string): { host: string; httpsUrl: string; httpUrl: string } => {
  const s = raw.trim();
  if (!s) return { host: "", httpsUrl: "", httpUrl: "" };
  const withProto = s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    return { host: s, httpsUrl: "", httpUrl: "" };
  }
  const host = url.hostname;
  const path = url.pathname && url.pathname !== "/" ? url.pathname : "/";
  const search = url.search || "";
  return {
    host,
    httpsUrl: `https://${host}${path}${search}`,
    httpUrl: `http://${host}${path}${search}`,
  };
};

const fetchStatus = async (url: string): Promise<AllOriginsResponse["status"]> => {
  const api = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const resp = await fetch(api);
  if (!resp.ok) throw new Error(`Proxy request failed: ${resp.status}`);
  const data = (await resp.json()) as AllOriginsResponse;
  return data.status;
};

const parseCertPem = (pemText: string): ParsedCertInfo => {
  const cert = new X509Certificate(pemText);
  const now = new Date();
  const notBefore = cert.notBefore;
  const notAfter = cert.notAfter;
  const isExpired = now > notAfter;
  const diffTime = notAfter.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  const san = (cert as unknown as { subjectAltName?: { dns?: string[] } }).subjectAltName;
  const dnsNames = san?.dns ?? [];
  const algorithm = cert.publicKey.algorithm as unknown as { modulusLength?: number; namedCurve?: string };

  return {
    subject: cert.subject,
    issuer: cert.issuer,
    serialNumber: cert.serialNumber,
    notBefore,
    notAfter,
    isExpired,
    daysRemaining,
    signatureAlgorithm: cert.signatureAlgorithm.name,
    publicKeyAlgorithm: cert.publicKey.algorithm.name,
    publicKeySize:
      typeof algorithm.modulusLength === "number"
        ? `${algorithm.modulusLength} bits`
        : algorithm.namedCurve ?? undefined,
    dnsNames: dnsNames.length > 0 ? dnsNames : undefined,
  };
};

const DEFAULT_UI = {
  tabDomain: "域名 HTTPS 连通检测",
  tabCert: "SSL 证书文件解析",
  note:
    "说明：浏览器沙箱内无法直接截获外部网站的原始 TLS 握手证书数据。本工具提供：① 在线检测域名的 HTTPS 连通性、重定向与权威报告直达；② 本地免上传秒级解析 SSL 证书文件（.crt/.cer/.pem）的详细字段与有效期倒计时。",
  domainInputPlaceholder: "输入域名，例如 example.com 或 https://my-site.com",
  checkDomain: "开始检查域名",
  checking: "检查中…",
  clear: "清空",
  invalidDomain: "请输入有效的域名或网址",
  checkFailed: "检查失败，可能目标站点限制了代理访问",
  domainResultsTitle: "HTTPS 连通性检测结果",
  verdictHttpsOk: "HTTPS 连通正常",
  verdictHttpsBad: "HTTPS 连接异常",
  tableProtocol: "协议",
  tableStatusCode: "状态码",
  tableResponseTime: "响应时间",
  externalAuditTitle: "权威第三方 SSL 深度报告直达",
  externalAuditDesc: "如需查看该域名线上证书链完整性、加密套件等级、OCSP 装订等专业评分：",
  sslLabsLabel: "Qualys SSL Labs 深度评测",
  mySslLabel: "MySSL 证书安全评级",
  crtShLabel: "crt.sh 证书透明度日志查询",
  certUploadTitle: "上传证书文件",
  certUploadHint: "拖拽 .crt / .cer / .pem 证书到此处，或点击按钮选择",
  pickCertFile: "选择证书文件",
  pasteCertTitle: "或直接粘贴 PEM 证书内容：",
  pasteCertPlaceholder: "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  parseCert: "解析证书",
  certDetailsTitle: "SSL 证书详细信息",
  certSubject: "颁发对象 (Subject / CN)",
  certIssuer: "颁发机构 (Issuer CA)",
  certValidity: "有效期限",
  certStatusValid: "证书有效中",
  certStatusExpired: "证书已过期",
  certDaysRemaining: "剩余 {days} 天",
  certSan: "覆盖域名 (SAN)",
  certKey: "公钥算法与长度",
  certSigAlg: "签名算法",
  certSerial: "证书序列号",
} as const;

export default function SslCheckerClient() {
  return (
    <ToolPageLayout toolSlug="ssl-checker" maxWidthClassName="max-w-6xl">
      <SslCheckerInner />
    </ToolPageLayout>
  );
}

function SslCheckerInner() {
  const config = useOptionalToolConfig("ssl-checker");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const certFileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("domain");

  // Domain check states
  const [domainInput, setDomainInput] = useState("atools.live");
  const [isDomainWorking, setIsDomainWorking] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<AllOriginsResponse["status"] | null>(null);
  const [httpsStatus, setHttpsStatus] = useState<AllOriginsResponse["status"] | null>(null);

  // Cert inspection states
  const [certInputText, setCertInputText] = useState("");
  const [certFileName, setCertFileName] = useState<string | null>(null);
  const [parsedCert, setParsedCert] = useState<ParsedCertInfo | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const [isDraggingCert, setIsDraggingCert] = useState(false);

  const normalizedDomain = useMemo(() => normalizeInput(domainInput), [domainInput]);

  const runDomainCheck = async () => {
    setDomainError(null);
    setHttpStatus(null);
    setHttpsStatus(null);
    if (!normalizedDomain.httpsUrl || !normalizedDomain.httpUrl) {
      setDomainError(ui.invalidDomain);
      return;
    }
    setIsDomainWorking(true);
    try {
      const [https, http] = await Promise.all([
        fetchStatus(normalizedDomain.httpsUrl),
        fetchStatus(normalizedDomain.httpUrl),
      ]);
      setHttpsStatus(https);
      setHttpStatus(http);
    } catch (e) {
      setDomainError(e instanceof Error ? e.message : ui.checkFailed);
    } finally {
      setIsDomainWorking(false);
    }
  };

  const handleCertTextParse = (text: string) => {
    setCertError(null);
    setParsedCert(null);
    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      const info = parseCertPem(trimmed);
      setParsedCert(info);
    } catch (e) {
      setCertError(e instanceof Error ? e.message : "无法解析该证书，请确认格式是否为标准 X.509 PEM");
    }
  };

  const handleCertFile = async (file: File) => {
    setCertFileName(file.name);
    try {
      const text = await file.text();
      setCertInputText(text);
      handleCertTextParse(text);
    } catch {
      setCertError("读取证书文件失败");
    }
  };

  const clearDomain = () => {
    setDomainInput("");
    setHttpStatus(null);
    setHttpsStatus(null);
    setDomainError(null);
  };

  const clearCert = () => {
    setCertInputText("");
    setCertFileName(null);
    setParsedCert(null);
    setCertError(null);
    if (certFileInputRef.current) certFileInputRef.current.value = "";
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        {/* Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("domain")}
              className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 font-semibold transition ${
                mode === "domain"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Globe className="h-4 w-4" />
              {ui.tabDomain}
            </button>
            <button
              type="button"
              onClick={() => setMode("certificate")}
              className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 font-semibold transition ${
                mode === "certificate"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileCheck className="h-4 w-4" />
              {ui.tabCert}
            </button>
          </div>

          <button
            type="button"
            onClick={mode === "domain" ? clearDomain : clearCert}
            className="flex items-center gap-1.5 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            <Trash2 className="h-4 w-4" />
            {ui.clear}
          </button>
        </div>

        {/* Note Banner */}
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-blue-50/70 p-4 text-xs text-blue-900 ring-1 ring-blue-100">
          <ShieldCheck className="h-5 w-5 shrink-0 text-blue-600" />
          <div className="leading-relaxed">{ui.note}</div>
        </div>

        {/* Mode 1: Domain HTTPS check */}
        {mode === "domain" ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-12">
            {/* Left: Domain input */}
            <div className="space-y-4 lg:col-span-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="text-sm font-semibold text-slate-900">域名与网址输入</div>
                <div className="relative">
                  <input
                    type="text"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder={ui.domainInputPlaceholder}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void runDomainCheck()}
                  disabled={isDomainWorking || !domainInput.trim()}
                  className="flex items-center justify-center gap-2 w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDomainWorking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{ui.checking}</span>
                    </>
                  ) : (
                    ui.checkDomain
                  )}
                </button>

                {domainError && (
                  <div className="flex items-center gap-2 rounded-2xl bg-rose-50 p-4 text-xs text-rose-800 ring-1 ring-rose-200">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>{domainError}</span>
                  </div>
                )}
              </div>

              {/* Authoritative deep links card */}
              {normalizedDomain.host && (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <ExternalLink className="h-4 w-4 text-blue-600" />
                    {ui.externalAuditTitle}
                  </div>
                  <p className="text-xs text-slate-500">{ui.externalAuditDesc}</p>

                  <div className="grid gap-2 pt-1">
                    <a
                      href={`https://www.ssllabs.com/ssltest/analyze.html?d=${encodeURIComponent(
                        normalizedDomain.host
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 transition"
                    >
                      <span className="font-semibold text-blue-900">{ui.sslLabsLabel}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    </a>

                    <a
                      href={`https://myssl.com/${encodeURIComponent(normalizedDomain.host)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 transition"
                    >
                      <span className="font-semibold text-blue-900">{ui.mySslLabel}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    </a>

                    <a
                      href={`https://crt.sh/?q=${encodeURIComponent(normalizedDomain.host)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 transition"
                    >
                      <span className="font-semibold text-blue-900">{ui.crtShLabel}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Results */}
            <div className="space-y-4 lg:col-span-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="text-sm font-semibold text-slate-900">{ui.domainResultsTitle}</div>

                {httpsStatus ? (
                  <div className="space-y-4">
                    <div
                      className={`rounded-2xl p-4 text-xs ring-1 flex items-start gap-2.5 ${
                        httpsStatus.http_code >= 200 && httpsStatus.http_code < 400
                          ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
                          : "bg-rose-50 text-rose-900 ring-rose-200"
                      }`}
                    >
                      {httpsStatus.http_code >= 200 && httpsStatus.http_code < 400 ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
                      )}
                      <div>
                        <div className="font-semibold">
                          {httpsStatus.http_code >= 200 && httpsStatus.http_code < 400
                            ? ui.verdictHttpsOk
                            : ui.verdictHttpsBad}
                        </div>
                        <div className="mt-1 opacity-80">
                          HTTPS 响应状态码: {httpsStatus.http_code}，耗时: {httpsStatus.response_time}ms
                        </div>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50 text-xs">
                      <div className="flex justify-between p-3">
                        <span className="text-slate-500">{ui.tableProtocol}</span>
                        <span className="font-medium text-slate-800">HTTPS (443)</span>
                      </div>
                      <div className="flex justify-between p-3">
                        <span className="text-slate-500">{ui.tableStatusCode}</span>
                        <span className="font-mono font-semibold text-emerald-600">
                          {httpsStatus.http_code}
                        </span>
                      </div>
                      <div className="flex justify-between p-3">
                        <span className="text-slate-500">{ui.tableResponseTime}</span>
                        <span className="font-mono text-slate-700">
                          {httpsStatus.response_time} ms
                        </span>
                      </div>
                      {httpStatus && (
                        <div className="flex justify-between p-3">
                          <span className="text-slate-500">HTTP (80) 自动跳转状态</span>
                          <span className="font-mono text-slate-700">
                            {httpStatus.http_code === 301 || httpStatus.http_code === 302
                              ? "已配置 301/302 重定向到 HTTPS"
                              : `状态码 ${httpStatus.http_code}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                    <Globe className="h-10 w-10 stroke-1" />
                    <p className="mt-3 text-xs">输入域名并点击“开始检查域名”</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Mode 2: Certificate file inspector */
          <div className="mt-6 grid gap-6 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-6">
              {/* Drag drop zone for cert */}
              <div
                className={`rounded-3xl border-2 border-dashed p-6 transition ${
                  isDraggingCert
                    ? "border-emerald-500 bg-emerald-50/50"
                    : "border-slate-200 bg-slate-50/60 hover:bg-slate-50"
                }`}
                onDrop={(e: DragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  setIsDraggingCert(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleCertFile(file);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingCert(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingCert(false);
                }}
              >
                <input
                  ref={certFileInputRef}
                  type="file"
                  accept=".crt,.cer,.pem,.txt"
                  className="hidden"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0];
                    if (file) void handleCertFile(file);
                    e.target.value = "";
                  }}
                />

                <div className="flex flex-col items-center justify-center text-center">
                  <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-600">
                    <FileCheck className="h-8 w-8" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-800">
                    {certFileName ? `已选择证书：${certFileName}` : ui.certUploadHint}
                  </p>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => certFileInputRef.current?.click()}
                      className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      <Upload className="h-4 w-4" />
                      {ui.pickCertFile}
                    </button>
                  </div>
                </div>
              </div>

              {/* Paste textarea */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3">
                <div className="text-xs font-semibold text-slate-700">{ui.pasteCertTitle}</div>
                <textarea
                  value={certInputText}
                  onChange={(e) => {
                    setCertInputText(e.target.value);
                    handleCertTextParse(e.target.value);
                  }}
                  rows={6}
                  placeholder={ui.pasteCertPlaceholder}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3.5 font-mono text-[11px] text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              {certError && (
                <div className="flex items-center gap-2 rounded-2xl bg-rose-50 p-4 text-xs text-rose-800 ring-1 ring-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{certError}</span>
                </div>
              )}
            </div>

            {/* Right: Certificate Parsed Output */}
            <div className="space-y-4 lg:col-span-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="text-sm font-semibold text-slate-900">{ui.certDetailsTitle}</div>

                {parsedCert ? (
                  <div className="space-y-4">
                    {/* Validity Card */}
                    <div
                      className={`rounded-2xl p-4 text-xs ring-1 flex items-start gap-2.5 ${
                        parsedCert.isExpired
                          ? "bg-rose-50 text-rose-900 ring-rose-200"
                          : "bg-emerald-50 text-emerald-900 ring-emerald-200"
                      }`}
                    >
                      {parsedCert.isExpired ? (
                        <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
                      ) : (
                        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                      )}
                      <div>
                        <div className="font-semibold text-sm">
                          {parsedCert.isExpired ? ui.certStatusExpired : ui.certStatusValid}
                        </div>
                        <div className="mt-1 opacity-80">
                          {parsedCert.isExpired
                            ? `已过期（过期时间：${parsedCert.notAfter.toLocaleDateString()}）`
                            : ui.certDaysRemaining.replace("{days}", String(parsedCert.daysRemaining))}
                        </div>
                      </div>
                    </div>

                    {/* Cert Field Details */}
                    <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50 text-xs">
                      <div className="p-3">
                        <div className="text-slate-500 font-medium">{ui.certSubject}</div>
                        <div className="font-mono text-slate-800 mt-1 break-all">
                          {parsedCert.subject}
                        </div>
                      </div>

                      <div className="p-3">
                        <div className="text-slate-500 font-medium">{ui.certIssuer}</div>
                        <div className="font-mono text-slate-800 mt-1 break-all">
                          {parsedCert.issuer}
                        </div>
                      </div>

                      <div className="p-3">
                        <div className="text-slate-500 font-medium">{ui.certValidity}</div>
                        <div className="font-mono text-slate-800 mt-1">
                          {parsedCert.notBefore.toLocaleDateString()} ~{" "}
                          {parsedCert.notAfter.toLocaleDateString()}
                        </div>
                      </div>

                      {parsedCert.dnsNames && (
                        <div className="p-3">
                          <div className="text-slate-500 font-medium">{ui.certSan}</div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {parsedCert.dnsNames.map((name, i) => (
                              <span
                                key={i}
                                className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 font-mono text-[11px] text-slate-700"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between p-3">
                        <span className="text-slate-500">{ui.certKey}</span>
                        <span className="font-mono font-medium text-slate-800">
                          {parsedCert.publicKeyAlgorithm}{" "}
                          {parsedCert.publicKeySize ? `(${parsedCert.publicKeySize})` : ""}
                        </span>
                      </div>

                      <div className="flex justify-between p-3">
                        <span className="text-slate-500">{ui.certSigAlg}</span>
                        <span className="font-mono text-slate-800">{parsedCert.signatureAlgorithm}</span>
                      </div>

                      <div className="flex justify-between p-3">
                        <span className="text-slate-500">{ui.certSerial}</span>
                        <span className="font-mono text-[11px] text-slate-700 truncate max-w-[200px]">
                          {parsedCert.serialNumber}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                    <FileCheck className="h-10 w-10 stroke-1" />
                    <p className="mt-3 text-xs">上传证书或粘贴证书 PEM 文本即可查看详细信息</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
