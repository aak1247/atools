"use client";

import type { ChangeEvent } from "react";
import { X509Certificate } from "@peculiar/x509";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

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
  const dnsNames = cert.subjectAltName?.dns ?? [];
  const ipAddresses = cert.subjectAltName?.ip ?? [];
  const uris = cert.subjectAltName?.uri ?? [];
  const emailAddresses = cert.subjectAltName?.email ?? [];
  return {
    subject: cert.subject,
    issuer: cert.issuer,
    serialNumber: cert.serialNumber,
    notBefore: cert.notBefore.toISOString(),
    notAfter: cert.notAfter.toISOString(),
    signatureAlgorithm: cert.signatureAlgorithm.name,
    publicKeyAlgorithm: cert.publicKey.algorithm.name,
    publicKeySize: (cert.publicKey.algorithm as any).modulusLength ?? (cert.publicKey.algorithm as any).namedCurve ?? undefined,
    thumbprintSha1: cert.thumbprint,
    thumbprintSha256: cert.thumbprint256,
    dnsNames: dnsNames.length ? dnsNames : undefined,
    ipAddresses: ipAddresses.length ? ipAddresses : undefined,
    uris: uris.length ? uris : undefined,
    emailAddresses: emailAddresses.length ? emailAddresses : undefined,
  };
};

export default function X509CertificateViewerClient() {
  return (
    <ToolPageLayout toolSlug="x509-certificate-viewer" maxWidthClassName="max-w-6xl">
      <X509CertificateViewerInner />
    </ToolPageLayout>
  );
}

function X509CertificateViewerInner() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);

  const parsed = useMemo(() => {
    setError(null);
    const trimmed = input.trim();
    if (!trimmed) return { certs: [] as ParsedCert[], raw: [] as X509Certificate[] };
    try {
      const pems = splitPemChain(trimmed);
      if (pems.length > 0) {
        const raw = pems.map((pem) => new X509Certificate(pem));
        const certs = raw.map(parseOne);
        return { certs, raw };
      }
      // if not PEM, try base64 DER (common copy style)
      const maybeB64 = trimmed.replace(/\s+/g, "");
      if (/^[A-Za-z0-9+/=]+$/.test(maybeB64) && maybeB64.length > 64) {
        const bin = atob(maybeB64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        const rawCert = new X509Certificate(bytes.buffer);
        return { certs: [parseOne(rawCert)], raw: [rawCert] };
      }

      throw new Error("未检测到 PEM/DER 证书内容。请输入 PEM（含 BEGIN CERTIFICATE）或上传 DER/PEM 文件。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析失败");
      return { certs: [] as ParsedCert[], raw: [] as X509Certificate[] };
    }
  }, [input]);

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
      setError(err instanceof Error ? err.message : "DER 解析失败");
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
              上传证书（PEM/DER）
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              清空
            </button>
            {fileName && <div className="text-sm text-slate-600">文件：{fileName}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeRaw && (
              <>
                <button
                  type="button"
                  onClick={() => void copy(activeRaw.toString("pem"))}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  复制 PEM
                </button>
                <button
                  type="button"
                  onClick={() => void copy(JSON.stringify(active, null, 2))}
                  className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
                >
                  复制 JSON
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          支持解析 X.509 证书（PEM/DER），展示 Subject/Issuer/有效期/指纹/SAN 等信息。纯前端本地运行，不上传证书内容。
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">输入 PEM / Base64 DER</div>
              <div className="text-xs text-slate-500">支持粘贴证书链（多个 BEGIN CERTIFICATE）</div>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="mt-3 h-[520px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              placeholder="粘贴证书 PEM（-----BEGIN CERTIFICATE----- ...）或 base64 DER…"
            />
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">解析结果</div>
                {parsed.certs.length > 1 && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span>证书：</span>
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
                  输入证书后显示解析结果。
                </div>
              ) : (
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold text-slate-700">Subject</div>
                    <div className="mt-1 font-mono text-xs break-words">{active.subject}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold text-slate-700">Issuer</div>
                    <div className="mt-1 font-mono text-xs break-words">{active.issuer}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      序列号
                      <div className="mt-1 font-mono break-words">{active.serialNumber}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      签名算法
                      <div className="mt-1 font-mono break-words">{active.signatureAlgorithm}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      生效时间
                      <div className="mt-1 font-mono break-words">{active.notBefore}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      过期时间
                      <div className="mt-1 font-mono break-words">{active.notAfter}</div>
                    </div>
                  </div>

                  <div className="grid gap-3 text-xs">
                    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      公钥算法
                      <div className="mt-1 font-mono break-words">{active.publicKeyAlgorithm}</div>
                    </div>
                    {active.thumbprintSha1 && (
                      <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                        SHA-1 指纹
                        <div className="mt-1 font-mono break-words">{hexSpaced(active.thumbprintSha1)}</div>
                      </div>
                    )}
                    {active.thumbprintSha256 && (
                      <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                        SHA-256 指纹
                        <div className="mt-1 font-mono break-words">{hexSpaced(active.thumbprintSha256)}</div>
                      </div>
                    )}
                  </div>

                  {(active.dnsNames?.length || active.ipAddresses?.length || active.uris?.length || active.emailAddresses?.length) && (
                    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                      <div className="text-xs font-semibold text-slate-700">Subject Alternative Name (SAN)</div>
                      <div className="mt-3 space-y-2 text-xs text-slate-700">
                        {active.dnsNames?.length ? (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                            DNS：{active.dnsNames.join(", ")}
                          </div>
                        ) : null}
                        {active.ipAddresses?.length ? (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                            IP：{active.ipAddresses.join(", ")}
                          </div>
                        ) : null}
                        {active.uris?.length ? (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                            URI：{active.uris.join(", ")}
                          </div>
                        ) : null}
                        {active.emailAddresses?.length ? (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                            Email：{active.emailAddresses.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-600">
              提示：证书解析不等于“信任验证”。若要验证链路/吊销状态，需要额外的信任锚、CRL/OCSP 等信息与网络请求。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

