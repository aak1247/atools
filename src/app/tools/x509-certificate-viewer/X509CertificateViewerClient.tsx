"use client";

import type { ChangeEvent } from "react";
import { X509Certificate } from "@peculiar/x509";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type ParsedCert = {
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
  publicKeySize?: number;
  thumbprintSha1?: string;
  thumbprintSha256?: string;
  dnsNames?: string[];
  ipAddresses?: string[];
  uris?: string[];
  emailAddresses?: string[];
};

type SubjectAltNameLike = {
  dns?: string[];
  ip?: string[];
  uri?: string[];
  email?: string[];
};

type X509CertificateWithSan = X509Certificate & {
  subjectAltName?: SubjectAltNameLike;
  thumbprint?: string;
  thumbprint256?: string;
};

const splitPemChain = (text: string): string[] => {
  const matches = text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  return matches ? matches.map((m) => m.trim()) : [];
};

const hexSpaced = (hex: string) =>
  hex
    .toUpperCase()
    .replace(/[^0-9A-F]/g, "")
    .replace(/(.{2})/g, "$1:")
    .replace(/:$/, "");

const parseOne = (cert: X509Certificate): ParsedCert => {
  const extended = cert as X509CertificateWithSan;
  const san = extended.subjectAltName;
  const dnsNames = san?.dns ?? [];
  const ipAddresses = san?.ip ?? [];
  const uris = san?.uri ?? [];
  const emailAddresses = san?.email ?? [];
  return {
    subject: cert.subject,
    issuer: cert.issuer,
    serialNumber: cert.serialNumber,
    notBefore: cert.notBefore.toISOString(),
    notAfter: cert.notAfter.toISOString(),
    signatureAlgorithm: cert.signatureAlgorithm.name,
    publicKeyAlgorithm: cert.publicKey.algorithm.name,
    publicKeySize: (cert.publicKey.algorithm as any).modulusLength ?? (cert.publicKey.algorithm as any).namedCurve ?? undefined,
    thumbprintSha1: extended.thumbprint,
    thumbprintSha256: extended.thumbprint256,
    dnsNames: dnsNames.length ? dnsNames : undefined,
    ipAddresses: ipAddresses.length ? ipAddresses : undefined,
    uris: uris.length ? uris : undefined,
    emailAddresses: emailAddresses.length ? emailAddresses : undefined,
  };
};

const DEFAULT_UI = {
  pasteCertificate: "粘贴证书内容",
  clear: "清空",
  parse: "解析",
  selectFile: "选择证书文件",
  title: "X.509 证书查看器",
  certificateChain: "证书链",
  totalCerts: "共",
  certs: "个证书",
  invalidCertificate: "无效证书（请检查格式）",
  certificateDetails: "证书详情",
  subject: "主体",
  issuer: "颁发者",
  serialNumber: "序列号",
  validityPeriod: "有效期",
  notBefore: "生效时间",
  notAfter: "失效时间",
  signature: "签名信息",
  signatureAlgorithm: "签名算法",
  publicKey: "公钥信息",
  publicKeyAlgorithm: "公钥算法",
  publicKeySize: "密钥长度",
  thumbprints: "指纹",
  thumbprintSha1: "SHA1 指纹",
  thumbprintSha256: "SHA256 指纹",
  subjectAlternativeNames: "主体备用名称",
  dnsNames: "DNS 名称",
  ipAddresses: "IP 地址",
  uris: "URI",
  emailAddresses: "邮箱地址",
  copyToClipboard: "复制到剪贴板",
  uploadCertificate: "上传证书（PEM/DER）",
  copyPem: "复制 PEM",
  copyJson: "复制 JSON",
  fileLabel: "文件：",
  descriptionHint: "支持解析 X.509 证书（PEM/DER），展示 Subject/Issuer/有效期/指纹/SAN 等信息。纯前端本地运行，不上传证书内容。",
  inputPemBase64: "输入 PEM / Base64 DER",
  inputHint: "支持粘贴证书链（多个 BEGIN CERTIFICATE）",
  placeholder: "粘贴证书 PEM（-----BEGIN CERTIFICATE----- ...）或 base64 DER…",
  parseResults: "解析结果",
  certificateSelect: "证书：",
  inputHintEmpty: "输入证书后显示解析结果。",
  noteDisclaimer: "提示：证书解析不等于\"信任验证\"。若要验证链路/吊销状态，需要额外的信任锚、CRL/OCSP 等信息与网络请求。",
  detectionError: "未检测到 PEM/DER 证书内容。请输入 PEM（含 BEGIN CERTIFICATE）或上传 DER/PEM 文件。",
  parseError: "解析失败",
  derParseError: "DER 解析失败",
  subjectAlternativeName: "Subject Alternative Name (SAN)",
  dnsLabel: "DNS：",
  ipLabel: "IP：",
  uriLabel: "URI：",
  emailLabel: "Email："
} as const;

type Ui = typeof DEFAULT_UI;

export default function X509CertificateViewerClient() {
  return (
    <ToolPageLayout toolSlug="x509-certificate-viewer" maxWidthClassName="max-w-6xl">
      <X509CertificateViewerInner />
    </ToolPageLayout>
  );
}

function X509CertificateViewerInner() {
  const config = useOptionalToolConfig("x509-certificate-viewer");
  const ui: Ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<Ui>) };

  const fileRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);

  const parsed = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed) return { certs: [] as ParsedCert[], raw: [] as X509Certificate[], error: null };
    try {
      const pems = splitPemChain(trimmed);
      if (pems.length > 0) {
        const raw = pems.map((pem) => new X509Certificate(pem));
        const certs = raw.map(parseOne);
        return { certs, raw, error: null };
      }
      // if not PEM, try base64 DER (common copy style)
      const maybeB64 = trimmed.replace(/\s+/g, "");
      if (/^[A-Za-z0-9+/=]+$/.test(maybeB64) && maybeB64.length > 64) {
        const bin = atob(maybeB64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        const rawCert = new X509Certificate(bytes.buffer);
        return { certs: [parseOne(rawCert)], raw: [rawCert], error: null };
      }

      return { certs: [] as ParsedCert[], raw: [] as X509Certificate[], error: ui.detectionError };
    } catch (e) {
      return { certs: [] as ParsedCert[], raw: [] as X509Certificate[], error: e instanceof Error ? e.message : ui.parseError };
    }
  }, [input, ui.detectionError, ui.parseError]);

  // Handle errors separately using useEffect
  useEffect(() => {
    setError(parsed.error);
  }, [parsed.error]);

  const active = parsed.certs[activeIndex] ?? null;
  const activeRaw = parsed.raw[activeIndex] ?? null;

  useEffect(() => {
    setActiveIndex(0);
  }, [fileName]);

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".pem")) {
      setInput(await file.text());
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const cert = new X509Certificate(bytes.buffer);
      // keep PEM-like view for display/copy
      setInput(cert.toString("pem"));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.derParseError);
      setInput("");
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const clear = () => {
    setInput("");
    setFileName(null);
    setError(null);
    setActiveIndex(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".pem,.cer,.crt,.der,application/x-x509-ca-cert,application/pkix-cert" className="hidden" onChange={(e) => void onUpload(e)} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {ui.uploadCertificate}
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {ui.clear}
            </button>
            {fileName && <div className="text-sm text-slate-600">{ui.fileLabel}{fileName}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeRaw && (
              <>
                <button
                  type="button"
                  onClick={() => void copy(activeRaw.toString("pem"))}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {ui.copyPem}
                </button>
                <button
                  type="button"
                  onClick={() => void copy(JSON.stringify(active, null, 2))}
                  className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
                >
                  {ui.copyJson}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          {ui.descriptionHint}
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">{ui.inputPemBase64}</div>
              <div className="text-xs text-slate-500">{ui.inputHint}</div>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="mt-3 h-[520px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              placeholder={ui.placeholder}
            />
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{ui.parseResults}</div>
                {parsed.certs.length > 1 && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span>{ui.certificateSelect}</span>
                    <select
                      value={activeIndex}
                      onChange={(e) => setActiveIndex(Number(e.target.value))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                    >
                      {parsed.certs.map((_, idx) => (
                        <option key={idx} value={idx}>
                          #{idx + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {!active ? (
                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                  {ui.inputHintEmpty}
                </div>
              ) : (
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold text-slate-700">{ui.subject}</div>
                    <div className="mt-1 font-mono text-xs break-words">{active.subject}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold text-slate-700">{ui.issuer}</div>
                    <div className="mt-1 font-mono text-xs break-words">{active.issuer}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      {ui.serialNumber}
                      <div className="mt-1 font-mono break-words">{active.serialNumber}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      {ui.signatureAlgorithm}
                      <div className="mt-1 font-mono break-words">{active.signatureAlgorithm}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      {ui.notBefore}
                      <div className="mt-1 font-mono break-words">{active.notBefore}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      {ui.notAfter}
                      <div className="mt-1 font-mono break-words">{active.notAfter}</div>
                    </div>
                  </div>

                  <div className="grid gap-3 text-xs">
                    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      {ui.publicKeyAlgorithm}
                      <div className="mt-1 font-mono break-words">{active.publicKeyAlgorithm}</div>
                    </div>
                    {active.thumbprintSha1 && (
                      <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                        {ui.thumbprintSha1}
                        <div className="mt-1 font-mono break-words">{hexSpaced(active.thumbprintSha1)}</div>
                      </div>
                    )}
                    {active.thumbprintSha256 && (
                      <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                        {ui.thumbprintSha256}
                        <div className="mt-1 font-mono break-words">{hexSpaced(active.thumbprintSha256)}</div>
                      </div>
                    )}
                  </div>

                  {(active.dnsNames?.length || active.ipAddresses?.length || active.uris?.length || active.emailAddresses?.length) && (
                    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                      <div className="text-xs font-semibold text-slate-700">{ui.subjectAlternativeName}</div>
                      <div className="mt-3 space-y-2 text-xs text-slate-700">
                        {active.dnsNames?.length ? (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                            {ui.dnsLabel}{active.dnsNames.join(", ")}
                          </div>
                        ) : null}
                        {active.ipAddresses?.length ? (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                            {ui.ipLabel}{active.ipAddresses.join(", ")}
                          </div>
                        ) : null}
                        {active.uris?.length ? (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                            {ui.uriLabel}{active.uris.join(", ")}
                          </div>
                        ) : null}
                        {active.emailAddresses?.length ? (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                            {ui.emailLabel}{active.emailAddresses.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-600">
              {ui.noteDisclaimer}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
