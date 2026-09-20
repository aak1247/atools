"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ExtendedKeyUsageExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  Pkcs10CertificateRequestGenerator,
  SubjectAlternativeNameExtension,
  type JsonGeneralName,
} from "@peculiar/x509";
import { zipSync } from "fflate";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

// 中文默认值
const DEFAULT_UI = {
  title: "CSR / 证书请求生成器",
  modeApple: "苹果开发者证书 CSR",
  modeAdvanced: "专业模式",
  generateButton: "生成 CSR",
  generating: "生成中…",
  resetButton: "重置",
  description: "说明：本工具使用浏览器 WebCrypto 生成密钥，并生成 CSR（PKCS#10）。全程本地运行，不上传私钥/CSR。请妥善保管私钥。",
  appleModeDescription:
    "Apple 开发者证书 CSR 模式：仅需填写邮箱与常用名称（Common Name），即可在本地生成 RSA 2048 私钥并创建 PKCS#10 CSR（SHA-256）。",
  appleEmailLabel: "邮箱（Email）",
  appleCommonNameLabel: "常用名称（Common Name）",
  appleEmailPlaceholder: "name@example.com",
  appleCommonNamePlaceholder: "Your Name / Company",
  appleTutorialTitle: "教程：用 CSR 申请 Apple 开发者证书",
  appleTutorialSteps: [
    "填写邮箱与常用名称，点击“生成 CSR”，下载并妥善保存“CSR 与私钥”（非常重要）。",
    "打开 Apple Developer 后台 → Certificates → “+” 创建证书，选择证书类型（iOS App Development / Apple Distribution 等），上传本工具生成的 CSR 文件。",
    "Apple 生成后下载 `.cer` 证书文件。",
    "要在 Xcode/CI 使用，需要让证书与私钥配对。可使用下方命令把 `.cer + 私钥` 打包成 `.p12` 后再导入钥匙串或用于签名。",
  ],
  appleTutorialCommandsTitle: "（可选）打包成 .p12（推荐）",
  appleTutorialCommands: [
    "openssl x509 -inform DER -in ios_development.cer -out ios_development.pem",
    "openssl pkcs12 -export -inkey private.key.pem -in ios_development.pem -out ios_development.p12",
  ],
  appleTutorialNotes: "提示：`.p12` 会要求设置导出密码；请勿把私钥/`.p12` 上传到不可信站点。",
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
  autoSanFromCnLabel: "若 SAN 为空，自动使用 CN 作为 SAN",
  autoSanFromCnHint: "很多 CA 只看 SAN（忽略 CN），建议保持开启。",
  sanAutoUsing: "SAN 将自动使用：{target}",
  keyUsageTitle: "密钥与用途",
  keyLabel: "Key",
  signHashLabel: "签名哈希",
  sha256: "SHA-256",
  sha384: "SHA-384",
  sha512: "SHA-512",
  rsa2048: "RSA 2048",
  rsa3072: "RSA 3072",
  rsa4096: "RSA 4096",
  ecP256: "EC P-256",
  ecP384: "EC P-384",
  ecP521: "EC P-521",
  ekuServerAuth: "EKU: serverAuth",
  ekuClientAuth: "EKU: clientAuth",
  kuDigitalSignature: "KU: digitalSignature",
  kuKeyEncipherment: "KU: keyEncipherment",
  kuKeyEnciphermentDisabledHint: "EC/ECDSA 一般不需要 keyEncipherment（常见为仅 digitalSignature）。",
  outputTitle: "输出",
  tip: "提示：如要申请公网证书，请将 CSR 提交给 CA；私钥请勿上传。此工具生成的是通用 PKCS#8 私钥格式。",
  copyButton: "复制",
  downloadButton: "下载",
  downloadAllZipButton: "下载全部（ZIP）",
  outputPlaceholder: "点击\"生成 CSR\"后输出…",
  emptySubject: "-",
  cnEmptyError: "CN（Common Name）不能为空。",
  emailEmptyError: "邮箱不能为空。",
  invalidEmailError: "邮箱格式不正确。",
  countryLengthError: "C（Country）建议为 2 位国家代码，例如 CN/US。",
  invalidDnsError: "DNS SAN 格式不正确：",
  invalidIpError: "IP SAN 格式不正确：",
  webcryptoUnavailableError: "当前环境不支持 WebCrypto（crypto.subtle）。请使用 HTTPS 或现代浏览器。",
  generationError: "生成失败",
  subjectTitle: "Subject（DN）",
  csrTitle: "CSR (PEM)",
  privateKeyTitle: "Private Key (PKCS#8 PEM)",
  publicKeyTitle: "Public Key (SPKI PEM)",
  dnsPlaceholder: "example.com\nwww.example.com",
  ipPlaceholder: "192.168.1.1\n2001:db8::1",
  copiedToast: "已复制到剪贴板",
} as const;

type CsrGeneratorUi = typeof DEFAULT_UI;

type CsrMode = "apple" | "advanced";

type KeyAlg = "rsa-2048" | "rsa-3072" | "rsa-4096" | "ec-p256" | "ec-p384" | "ec-p521";

type HashAlg = "SHA-256" | "SHA-384" | "SHA-512";

const splitLines = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const uniq = (arr: string[]) => Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));

const textToBytes = (text: string) => new TextEncoder().encode(text);

const normalizeDnsCandidate = (text: string) => text.trim().toLowerCase().replace(/\.$/u, "");

const isValidIpv4 = (text: string) => {
  const parts = text.split(".");
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return false;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return false;
  }
  return true;
};

const isValidIpv6 = (text: string) => {
  const t = text.trim();
  if (!t) return false;
  if (!/^[0-9a-fA-F:]+$/u.test(t)) return false;
  if (t.includes(":::")) return false;
  const parts = t.split("::");
  if (parts.length > 2) return false;
  const left = parts[0] ? parts[0].split(":").filter(Boolean) : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(":").filter(Boolean) : [];
  if (left.length + right.length > 8) return false;
  for (const group of [...left, ...right]) {
    if (!/^[0-9a-fA-F]{1,4}$/u.test(group)) return false;
  }
  return true;
};

const isValidIp = (text: string) => isValidIpv4(text) || isValidIpv6(text);

const isValidEmail = (text: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text.trim());

const validateDnsName = (dns: string) => {
  const t = normalizeDnsCandidate(dns);
  if (!t) return { ok: false as const, normalized: t };

  const wildcard = t.startsWith("*.");
  const base = wildcard ? t.slice(2) : t;
  if (!base) return { ok: false as const, normalized: t };
  if (base.length > 253) return { ok: false as const, normalized: t };

  const labels = base.split(".");
  if (labels.some((l) => !l)) return { ok: false as const, normalized: t };

  for (const label of labels) {
    if (label.length > 63) return { ok: false as const, normalized: t };
    if (label.startsWith("-") || label.endsWith("-")) return { ok: false as const, normalized: t };
    if (!/^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/u.test(label))
      return { ok: false as const, normalized: t };
  }
  return { ok: true as const, normalized: wildcard ? `*.${base}` : base };
};

const tryCopyText = async (text: string) => {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  }
};

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

  const [mode, setMode] = useState<CsrMode>("apple");
  const [appleEmail, setAppleEmail] = useState("");
  const [appleCommonName, setAppleCommonName] = useState("");

  const [keyAlg, setKeyAlg] = useState<KeyAlg>("rsa-2048");
  const [signHash, setSignHash] = useState<HashAlg>("SHA-256");
  const [commonName, setCommonName] = useState("example.com");
  const [organization, setOrganization] = useState("");
  const [orgUnit, setOrgUnit] = useState("");
  const [country, setCountry] = useState("CN");
  const [state, setState] = useState("");
  const [locality, setLocality] = useState("");

  const [dnsNamesText, setDnsNamesText] = useState("example.com\nwww.example.com\n");
  const [ipText, setIpText] = useState("");
  const [autoSanFromCn, setAutoSanFromCn] = useState(true);

  const [enableServerAuth, setEnableServerAuth] = useState(true);
  const [enableClientAuth, setEnableClientAuth] = useState(false);
  const [keyUsageDigitalSignature, setKeyUsageDigitalSignature] = useState(true);
  const [keyUsageKeyEncipherment, setKeyUsageKeyEncipherment] = useState(true);

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [csrPem, setCsrPem] = useState("");
  const [privateKeyPem, setPrivateKeyPem] = useState("");
  const [publicKeyPem, setPublicKeyPem] = useState("");

  const appleEmailCandidate = useMemo(() => appleEmail.trim(), [appleEmail]);
  const appleCnCandidate = useMemo(() => appleCommonName.trim(), [appleCommonName]);

  const subjectString = useMemo(() => {
    const parts: string[] = [];
    const push = (k: string, v: string) => {
      const s = v.trim();
      if (s) parts.push(`${k}=${s.replace(/,/g, "\\,")}`);
    };
    if (mode === "apple") {
      push("CN", appleCnCandidate);
      push("E", appleEmailCandidate);
      return parts.join(", ");
    }
    push("C", country);
    push("ST", state);
    push("L", locality);
    push("O", organization);
    push("OU", orgUnit);
    push("CN", commonName);
    return parts.join(", ");
  }, [appleCnCandidate, appleEmailCandidate, commonName, country, locality, mode, orgUnit, organization, state]);

  const cnCandidate = useMemo(() => (mode === "apple" ? appleCnCandidate : commonName.trim()), [appleCnCandidate, commonName, mode]);

  const requestedDnsNames = useMemo(
    () => (mode === "apple" ? [] : uniq(splitLines(dnsNamesText).map(normalizeDnsCandidate))),
    [dnsNamesText, mode],
  );
  const requestedIps = useMemo(() => (mode === "apple" ? [] : uniq(splitLines(ipText))), [ipText, mode]);

  const effectiveSan = useMemo(() => {
    if (mode === "apple") return { dns: [], ips: [], autoAdded: false };

    const dns = requestedDnsNames;
    const ips = requestedIps;
    if (!autoSanFromCn || dns.length || ips.length) return { dns, ips, autoAdded: false };

    if (isValidIp(cnCandidate)) return { dns: [], ips: [cnCandidate], autoAdded: true };
    const dnsCheck = validateDnsName(cnCandidate);
    if (dnsCheck.ok) return { dns: [dnsCheck.normalized], ips: [], autoAdded: true };
    return { dns, ips, autoAdded: false };
  }, [autoSanFromCn, cnCandidate, mode, requestedDnsNames, requestedIps]);

  useEffect(() => {
    if (keyAlg.startsWith("ec-") && keyUsageKeyEncipherment) setKeyUsageKeyEncipherment(false);
  }, [keyAlg, keyUsageKeyEncipherment]);

  const effectiveKeyAlg: KeyAlg = mode === "apple" ? "rsa-2048" : keyAlg;
  const effectiveSignHash: HashAlg = mode === "apple" ? "SHA-256" : signHash;

  const createKeys = async (): Promise<CryptoKeyPair> => {
    if (!crypto?.subtle) throw new Error(ui.webcryptoUnavailableError);

    if (effectiveKeyAlg.startsWith("rsa-")) {
      const modulusLength =
        effectiveKeyAlg === "rsa-4096" ? 4096 : effectiveKeyAlg === "rsa-3072" ? 3072 : 2048;
      return crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: effectiveSignHash,
        },
        true,
        ["sign", "verify"],
      );
    }

    const namedCurve = effectiveKeyAlg === "ec-p521" ? "P-521" : effectiveKeyAlg === "ec-p384" ? "P-384" : "P-256";
    return crypto.subtle.generateKey({ name: "ECDSA", namedCurve }, true, ["sign", "verify"]);
  };

  const buildExtensions = () => {
    if (mode === "apple") return [];

    const extensions: (SubjectAlternativeNameExtension | ExtendedKeyUsageExtension | KeyUsagesExtension)[] = [];

    if (effectiveSan.dns.length || effectiveSan.ips.length) {
      const items: JsonGeneralName[] = [
        ...effectiveSan.dns.map<JsonGeneralName>((d) => ({ type: "dns", value: d })),
        ...effectiveSan.ips.map<JsonGeneralName>((ip) => ({ type: "ip", value: ip })),
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

  const validateInputs = () => {
    if (!cnCandidate) throw new Error(ui.cnEmptyError);

    if (mode === "apple") {
      if (!appleEmailCandidate) throw new Error(ui.emailEmptyError);
      if (!isValidEmail(appleEmailCandidate)) throw new Error(ui.invalidEmailError);
      return;
    }

    if (country.trim() && country.trim().length !== 2) throw new Error(ui.countryLengthError);

    for (const dns of effectiveSan.dns) {
      const check = validateDnsName(dns);
      if (!check.ok) throw new Error(`${ui.invalidDnsError}${dns}`);
    }
    for (const ip of effectiveSan.ips) {
      if (!isValidIp(ip)) throw new Error(`${ui.invalidIpError}${ip}`);
    }
  };

  const generate = async () => {
    setIsWorking(true);
    setError(null);
    setToast(null);
    setCsrPem("");
    setPrivateKeyPem("");
    setPublicKeyPem("");

    try {
      validateInputs();

      const keys = await createKeys();
      const extensions = buildExtensions();

      const signingAlgorithm = effectiveKeyAlg.startsWith("ec-")
        ? ({ name: "ECDSA", hash: effectiveSignHash } as const)
        : ({ name: "RSASSA-PKCS1-v1_5", hash: effectiveSignHash } as const);

      const csr = await Pkcs10CertificateRequestGenerator.create({
        name: subjectString,
        keys,
        signingAlgorithm,
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
    const ok = await tryCopyText(text);
    if (!ok) return;
    setToast(ui.copiedToast);
    window.setTimeout(() => setToast(null), 1200);
  };

  const downloadBlob = (filename: string, blob: Blob) => {
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

  const downloadText = (filename: string, text: string) => {
    downloadBlob(filename, new Blob([text], { type: "text/plain;charset=utf-8" }));
  };

  const downloadAllZip = () => {
    if (!csrPem || !privateKeyPem || !publicKeyPem) return;
    const files: Record<string, Uint8Array> = {
      "request.csr.pem": textToBytes(csrPem),
      "private.key.pem": textToBytes(privateKeyPem),
      "public.key.pem": textToBytes(publicKeyPem),
    };
    const zipped = zipSync(files, { level: 6 });
    downloadBlob("csr-output.zip", new Blob([new Uint8Array(zipped)], { type: "application/zip" }));
  };

  const resetAll = () => {
    setMode("apple");
    setAppleEmail("");
    setAppleCommonName("");
    setKeyAlg("rsa-2048");
    setSignHash("SHA-256");
    setCommonName("example.com");
    setOrganization("");
    setOrgUnit("");
    setCountry("CN");
    setState("");
    setLocality("");
    setDnsNamesText("example.com\nwww.example.com\n");
    setIpText("");
    setAutoSanFromCn(true);
    setEnableServerAuth(true);
    setEnableClientAuth(false);
    setKeyUsageDigitalSignature(true);
    setKeyUsageKeyEncipherment(true);
    setError(null);
    setToast(null);
    setCsrPem("");
    setPrivateKeyPem("");
    setPublicKeyPem("");
  };

  return (
    <div className="w-full px-4">
      <a ref={downloadRef} className="hidden" />
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-semibold text-slate-900">{ui.title}</div>
            <div className="inline-flex rounded-2xl bg-slate-100 p-1 ring-1 ring-slate-200">
              <button
                type="button"
                onClick={() => setMode("apple")}
                disabled={isWorking}
                className={[
                  "rounded-2xl px-3 py-1.5 text-xs font-semibold transition",
                  mode === "apple" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                ].join(" ")}
              >
                {ui.modeApple}
              </button>
              <button
                type="button"
                onClick={() => setMode("advanced")}
                disabled={isWorking}
                className={[
                  "rounded-2xl px-3 py-1.5 text-xs font-semibold transition",
                  mode === "advanced" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                ].join(" ")}
              >
                {ui.modeAdvanced}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetAll}
              disabled={isWorking}
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {ui.resetButton}
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={isWorking}
              className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {isWorking ? ui.generating : ui.generateButton}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          {ui.description}
        </div>

        {mode === "apple" && (
          <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-100">
            {ui.appleModeDescription}
          </div>
        )}

        {toast && (
          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
            {toast}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="space-y-4">
            {mode === "apple" ? (
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.subjectTitle}</div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    {ui.appleEmailLabel}
                    <input
                      value={appleEmail}
                      onChange={(e) => setAppleEmail(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      placeholder={ui.appleEmailPlaceholder}
                      inputMode="email"
                      autoComplete="email"
                    />
                  </label>
                  <label className="block text-sm text-slate-700">
                    {ui.appleCommonNameLabel}
                    <input
                      value={appleCommonName}
                      onChange={(e) => setAppleCommonName(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      placeholder={ui.appleCommonNamePlaceholder}
                    />
                  </label>
                </div>
                <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                  {ui.previewLabel}<span className="font-mono break-words">{subjectString || ui.emptySubject}</span>
                </div>
              </div>
            ) : (
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
            )}

            {mode === "apple" && (
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.appleTutorialTitle}</div>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
                  {ui.appleTutorialSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div className="mt-4 text-sm font-semibold text-slate-900">{ui.appleTutorialCommandsTitle}</div>
                <div className="mt-2 space-y-2">
                  {ui.appleTutorialCommands.map((cmd) => (
                    <pre
                      key={cmd}
                      className="overflow-x-auto rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-800 ring-1 ring-slate-200"
                    >
                      <code>{cmd}</code>
                    </pre>
                  ))}
                </div>
                <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-100">
                  {ui.appleTutorialNotes}
                </div>
              </div>
            )}

            {mode === "advanced" && (
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
                <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={autoSanFromCn}
                      onChange={(e) => setAutoSanFromCn(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {ui.autoSanFromCnLabel}
                  </label>
                  <div className="text-xs text-slate-600">{ui.autoSanFromCnHint}</div>
                </div>
                {effectiveSan.autoAdded && (
                  <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800 ring-1 ring-amber-100">
                    {ui.sanAutoUsing.replace("{target}", effectiveSan.dns.length ? `DNS=${effectiveSan.dns[0]}` : `IP=${effectiveSan.ips[0]}`)}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {mode === "advanced" && (
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
                      <option value="ec-p256">{ui.ecP256}</option>
                      <option value="ec-p384">{ui.ecP384}</option>
                      <option value="ec-p521">{ui.ecP521}</option>
                    </select>
                  </label>

                  <label className="block text-sm text-slate-700">
                    {ui.signHashLabel}
                    <select
                      value={signHash}
                      onChange={(e) => setSignHash(e.target.value as HashAlg)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="SHA-256">{ui.sha256}</option>
                      <option value="SHA-384">{ui.sha384}</option>
                      <option value="SHA-512">{ui.sha512}</option>
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
                        disabled={keyAlg.startsWith("ec-")}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      {ui.kuKeyEncipherment}
                    </label>
                  </div>
                  {keyAlg.startsWith("ec-") && (
                    <div className="text-xs text-slate-500">{ui.kuKeyEnciphermentDisabledHint}</div>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.outputTitle}</div>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={downloadAllZip}
                  disabled={!csrPem || !privateKeyPem || !publicKeyPem}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {ui.downloadAllZipButton}
                </button>
              </div>
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
