"use client";

import { useMemo, useRef, useState } from "react";
import {
  ExtendedKeyUsageExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  Pkcs10CertificateRequestGenerator,
  SubjectAlternativeNameExtension,
  type JsonGeneralName,
} from "@peculiar/x509";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

// 中文默认值
const DEFAULT_UI = {
  title: "CSR / 证书请求生成器",
  generateButton: "生成 CSR",
  generating: "生成中…",
  description: "说明：本工具使用浏览器 WebCrypto 生成密钥，并生成 CSR（PKCS#10）。全程本地运行，不上传私钥/CSR。请妥善保管私钥。",
  commonNameLabel: "CN（域名/名称）",
  countryLabel: "C（国家）",
  stateLabel: "ST（省/州）",
  localityLabel: "L（城市）",
  organizationLabel: "O（组织）",
  orgUnitLabel: "OU（部门）",
  previewLabel: "预览：",
  sanTitle: "SAN（可选）",
  dnsNamesLabel: "DNS Names（一行一个）",
  ipLabel: "IP（一行一个）",
  keyUsageTitle: "密钥与用途",
  serverAuthLabel: "服务器身份验证",
  clientAuthLabel: "客户端身份验证",
  digitalSignatureLabel: "数字签名",
  keyEnciphermentLabel: "密钥加密",
  outputTitle: "输出",
  tip: "提示：如要申请公网证书，请将 CSR 提交给 CA；私钥请勿上传。此工具生成的是通用 PKCS#8 私钥格式。",
  copyButton: "复制",
  downloadButton: "下载",
  outputPlaceholder: "点击\"生成 CSR\"后输出…",
  emptySubject: "-",
  cnEmptyError: "CN（Common Name）不能为空。",
  countryLengthError: "C（Country）建议为 2 位国家代码，例如 CN/US。",
  generationError: "生成失败",
  rsa2048: "RSA 2048",
  rsa3072: "RSA 3072",
  rsa4096: "RSA 4096",
  subjectTitle: "Subject（DN）",
  keyLabel: "Key",
  ekuServerAuth: "EKU: serverAuth",
  ekuClientAuth: "EKU: clientAuth",
  kuDigitalSignature: "KU: digitalSignature",
  kuKeyEncipherment: "KU: keyEncipherment",
  csrTitle: "CSR (PEM)",
  privateKeyTitle: "Private Key (PKCS#8 PEM)",
  publicKeyTitle: "Public Key (SPKI PEM)",
  dnsPlaceholder: "example.com\nwww.example.com",
  ipPlaceholder: "192.168.1.1\n2001:db8::1"
} as const;

type CsrGeneratorUi = typeof DEFAULT_UI;

type KeyAlg = "rsa-2048" | "rsa-3072" | "rsa-4096";

const splitLines = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const uniq = (arr: string[]) => Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));

const base64 = (bytes: Uint8Array) => {
  let bin = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    bin += String.fromCharCode(...chunk);
  }
  return btoa(bin);
};

const pemWrap = (label: string, der: Uint8Array) => {
  const b64 = base64(der);
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
};

const exportPkcs8Pem = async (privateKey: CryptoKey) => {
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
  return pemWrap("PRIVATE KEY", der);
};

const exportSpkiPem = async (publicKey: CryptoKey) => {
  const der = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));
  return pemWrap("PUBLIC KEY", der);
};

export default function CsrGeneratorClient() {
  return (
    <ToolPageLayout toolSlug="csr-generator" maxWidthClassName="max-w-6xl">
      <CsrGeneratorInner />
    </ToolPageLayout>
  );
}

function CsrGeneratorInner() {
  const config = useOptionalToolConfig("csr-generator");
  const ui: CsrGeneratorUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<CsrGeneratorUi>) };

  const downloadRef = useRef<HTMLAnchorElement>(null);

  const [keyAlg, setKeyAlg] = useState<KeyAlg>("rsa-2048");
  const [commonName, setCommonName] = useState("example.com");
  const [organization, setOrganization] = useState("");
  const [orgUnit, setOrgUnit] = useState("");
  const [country, setCountry] = useState("CN");
  const [state, setState] = useState("");
  const [locality, setLocality] = useState("");

  const [dnsNamesText, setDnsNamesText] = useState("example.com\nwww.example.com\n");
  const [ipText, setIpText] = useState("");

  const [enableServerAuth, setEnableServerAuth] = useState(true);
  const [enableClientAuth, setEnableClientAuth] = useState(false);
  const [keyUsageDigitalSignature, setKeyUsageDigitalSignature] = useState(true);
  const [keyUsageKeyEncipherment, setKeyUsageKeyEncipherment] = useState(true);

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [csrPem, setCsrPem] = useState("");
  const [privateKeyPem, setPrivateKeyPem] = useState("");
  const [publicKeyPem, setPublicKeyPem] = useState("");

  const subjectString = useMemo(() => {
    const parts: string[] = [];
    const push = (k: string, v: string) => {
      const s = v.trim();
      if (s) parts.push(`${k}=${s.replace(/,/g, "\\,")}`);
    };
    push("C", country);
    push("ST", state);
    push("L", locality);
    push("O", organization);
    push("OU", orgUnit);
    push("CN", commonName);
    return parts.join(", ");
  }, [commonName, country, locality, orgUnit, organization, state]);

  const dnsNames = useMemo(() => uniq(splitLines(dnsNamesText)), [dnsNamesText]);
  const ips = useMemo(() => uniq(splitLines(ipText)), [ipText]);

  const createKeys = async (): Promise<CryptoKeyPair> => {
    const modulusLength = keyAlg === "rsa-4096" ? 4096 : keyAlg === "rsa-3072" ? 3072 : 2048;
    return crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
  };

  const buildExtensions = () => {
    const extensions: (SubjectAlternativeNameExtension | ExtendedKeyUsageExtension | KeyUsagesExtension)[] = [];

    if (dnsNames.length || ips.length) {
      const items: JsonGeneralName[] = [
        ...dnsNames.map<JsonGeneralName>((d) => ({ type: "dns", value: d })),
        ...ips.map<JsonGeneralName>((ip) => ({ type: "ip", value: ip })),
      ];
      extensions.push(new SubjectAlternativeNameExtension(items));
    }

    const eku: string[] = [];
    if (enableServerAuth) eku.push("serverAuth");
    if (enableClientAuth) eku.push("clientAuth");
    if (eku.length) extensions.push(new ExtendedKeyUsageExtension(eku));

    let ku = 0;
    if (keyUsageDigitalSignature) ku |= KeyUsageFlags.digitalSignature;
    if (keyUsageKeyEncipherment) ku |= KeyUsageFlags.keyEncipherment;
    if (ku) extensions.push(new KeyUsagesExtension(ku));

    return extensions;
  };

  const generate = async () => {
    setIsWorking(true);
    setError(null);
    setCsrPem("");
    setPrivateKeyPem("");
    setPublicKeyPem("");

    try {
      if (!commonName.trim()) throw new Error(ui.cnEmptyError);
      if (country.trim() && country.trim().length !== 2) throw new Error(ui.countryLengthError);

      const keys = await createKeys();
      const extensions = buildExtensions();

      const csr = await Pkcs10CertificateRequestGenerator.create({
        name: subjectString,
        keys,
        signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        extensions,
      });

      const csrText = csr.toString("pem");
      const privPem = await exportPkcs8Pem(keys.privateKey);
      const pubPem = await exportSpkiPem(keys.publicKey);

      setCsrPem(csrText);
      setPrivateKeyPem(privPem);
      setPublicKeyPem(pubPem);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.generationError);
    } finally {
      setIsWorking(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const downloadText = (filename: string, text: string) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = downloadRef.current;
    if (a) {
      a.href = url;
      a.download = filename;
      a.click();
    } else {
      const tmp = document.createElement("a");
      tmp.href = url;
      tmp.download = filename;
      tmp.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="w-full px-4">
      <a ref={downloadRef} className="hidden" />
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">{ui.title}</div>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={isWorking}
            className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isWorking ? ui.generating : ui.generateButton}
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          {ui.description}
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.subjectTitle}</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  {ui.commonNameLabel}
                  <input
                    value={commonName}
                    onChange={(e) => setCommonName(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.countryLabel}
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.stateLabel}
                  <input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.localityLabel}
                  <input
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.organizationLabel}
                  <input
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.orgUnitLabel}
                  <input
                    value={orgUnit}
                    onChange={(e) => setOrgUnit(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
              </div>
              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                {ui.previewLabel}<span className="font-mono break-words">{subjectString || ui.emptySubject}</span>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.sanTitle}</div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  {ui.dnsNamesLabel}
                  <textarea
                    value={dnsNamesText}
                    onChange={(e) => setDnsNamesText(e.target.value)}
                    className="mt-2 h-32 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    placeholder={ui.dnsPlaceholder}
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.ipLabel}
                  <textarea
                    value={ipText}
                    onChange={(e) => setIpText(e.target.value)}
                    className="mt-2 h-32 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    placeholder={ui.ipPlaceholder}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.keyUsageTitle}</div>
              <div className="mt-4 grid gap-4">
                <label className="block text-sm text-slate-700">
                  {ui.keyLabel}
                  <select
                    value={keyAlg}
                    onChange={(e) => setKeyAlg(e.target.value as KeyAlg)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value="rsa-2048">{ui.rsa2048}</option>
                    <option value="rsa-3072">{ui.rsa3072}</option>
                    <option value="rsa-4096">{ui.rsa4096}</option>
                  </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={enableServerAuth}
                      onChange={(e) => setEnableServerAuth(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {ui.ekuServerAuth}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={enableClientAuth}
                      onChange={(e) => setEnableClientAuth(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {ui.ekuClientAuth}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={keyUsageDigitalSignature}
                      onChange={(e) => setKeyUsageDigitalSignature(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {ui.kuDigitalSignature}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={keyUsageKeyEncipherment}
                      onChange={(e) => setKeyUsageKeyEncipherment(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {ui.kuKeyEncipherment}
                  </label>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.outputTitle}</div>
              <div className="mt-3 grid gap-3">
                <OutputBlock
                  title={ui.csrTitle}
                  value={csrPem}
                  onCopy={() => void copy(csrPem)}
                  onDownload={() => downloadText("request.csr.pem", csrPem)}
                  copyLabel={ui.copyButton}
                  downloadLabel={ui.downloadButton}
                  placeholder={ui.outputPlaceholder}
                />
                <OutputBlock
                  title={ui.privateKeyTitle}
                  value={privateKeyPem}
                  onCopy={() => void copy(privateKeyPem)}
                  onDownload={() => downloadText("private.key.pem", privateKeyPem)}
                  copyLabel={ui.copyButton}
                  downloadLabel={ui.downloadButton}
                  placeholder={ui.outputPlaceholder}
                />
                <OutputBlock
                  title={ui.publicKeyTitle}
                  value={publicKeyPem}
                  onCopy={() => void copy(publicKeyPem)}
                  onDownload={() => downloadText("public.key.pem", publicKeyPem)}
                  copyLabel={ui.copyButton}
                  downloadLabel={ui.downloadButton}
                  placeholder={ui.outputPlaceholder}
                />
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-600">
              {ui.tip}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutputBlock(props: {
  title: string;
  value: string;
  onCopy: () => void;
  onDownload: () => void;
  copyLabel: string;
  downloadLabel: string;
  placeholder: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-800">{props.title}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={props.onCopy}
            disabled={!props.value}
            className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-60"
          >
            {props.copyLabel}
          </button>
          <button
            type="button"
            onClick={props.onDownload}
            disabled={!props.value}
            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {props.downloadLabel}
          </button>
        </div>
      </div>
      <textarea
        value={props.value}
        readOnly
        className="mt-3 h-40 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none"
        placeholder={props.placeholder}
      />
    </div>
  );
}
