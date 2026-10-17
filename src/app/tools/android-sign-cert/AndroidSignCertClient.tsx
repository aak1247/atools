"use client";

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  Copy,
  Download,
  FileBadge,
  FileKey2,
  Info,
  KeyRound,
  Package,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import type { ParsedCertificate } from "./lib/cert";

// 中文默认值
const DEFAULT_UI = {
  title: "安卓签名证书生成器",
  description: "说明：本工具在浏览器本地生成/解析安卓签名密钥库，用于 App 备案（公钥、签名 MD5、包名）。密钥库与密码全程不会上传。",
  tabGenerate: "生成密钥库",
  tabParseKeystore: "解析密钥库",
  tabParseApk: "解析 APK",
  generating: "生成中…",
  parsing: "解析中…",
  generateButton: "生成密钥库",
  parseButton: "解析",
  resetButton: "重置",
  copyButton: "复制",
  copiedToast: "已复制到剪贴板",
  downloadButton: "下载",
  chooseFileButton: "选择文件",
  beianInfoTitle: "App 备案信息（安卓平台）",
  beianInfoHint: "在工信部 App 备案表单（安卓平台）中需要填写：包名、公钥、签名 MD5。公钥为签名证书的 RSA 模数（十六进制，即 jadx 等工具显示的“模数”）；签名 MD5 为签名证书的 MD5 指纹（32 位十六进制，不带冒号）。",
  packageNameLabel: "包名",
  publicKeyLabel: "公钥（模数，十六进制）",
  publicKeyHint: "签名证书的 RSA 模数（即 jadx 等工具显示的“模数”），RSA 2048 为 512 个十六进制字符",
  signatureMd5Label: "签名 MD5",
  signatureMd5Hint: "证书 MD5 指纹（32 位十六进制，不带冒号）",
  fingerprintsTitle: "证书指纹",
  certMd5Label: "MD5（签名 MD5）",
  certSha1Label: "SHA-1",
  certSha256Label: "SHA-256",
  pubKeyMd5Label: "公钥 MD5",
  certInfoTitle: "证书信息",
  subjectLabel: "主体（Subject）",
  issuerLabel: "签发者（Issuer）",
  validFromLabel: "生效时间",
  validToLabel: "过期时间",
  serialLabel: "序列号",
  sigAlgLabel: "签名算法",
  aliasLabel: "别名",
  downloadKeystoreButton: "下载密钥库",
  downloadCertPemButton: "下载证书（PEM）",
  keystoreSavedTitle: "请妥善保管密钥库",
  keystoreSavedHint: "密钥库文件和密码丢失后无法补办：请备份到安全的位置。App 备案只需填写上方公钥与签名 MD5，无需上传密钥库。",
  genSettingsTitle: "密钥库设置",
  aliasFieldLabel: "别名（alias）",
  aliasPlaceholder: "例如：upload",
  passwordLabel: "密钥库密码",
  passwordConfirmLabel: "确认密码",
  validityLabel: "有效期（年）",
  keySizeLabel: "密钥长度",
  formatLabel: "密钥库格式",
  formatJks: "JKS（.jks，传统格式，兼容性最好）",
  formatPkcs12: "PKCS12（.p12，行业标准格式）",
  subjectTitle: "证书主体（DN）",
  cnLabel: "CN（常用名称，建议用包名或应用名）",
  cnPlaceholder: "com.example.app",
  ouLabel: "OU（部门，可选）",
  oLabel: "O（组织，可选）",
  lLabel: "L（城市，可选）",
  stLabel: "ST（省份，可选）",
  cLabel: "C（国家代码，如 CN）",
  parseKeystoreTitle: "解析已有密钥库",
  parseKeystoreHint: "支持 keytool / Android Studio 生成的 .jks、.keystore、.p12、.pfx 文件。密码仅用于本地解密，不会上传。",
  keystorePasswordLabel: "密钥库密码",
  keystoreEntriesTitle: "密钥库条目",
  keyEntryLabel: "私钥条目",
  certEntryLabel: "证书条目",
  noKeyCertError: "未找到可用的私钥或证书",
  parseApkTitle: "解析 APK 签名",
  parseApkHint: "上传已签名的 .apk 安装包，本地解析包名、版本与签名证书（v1/v2/v3）。文件不会上传。",
  apkInfoTitle: "应用信息",
  versionNameLabel: "版本名称",
  versionCodeLabel: "版本号",
  signatureSchemesTitle: "签名方案与证书",
  signatureSchemeV1: "v1（JAR 签名）",
  signatureSchemeV2: "v2",
  signatureSchemeV3: "v3",
  signatureSchemeV31: "v3.1",
  noSignatureFoundError: "未在 APK 中找到签名信息，请确认这是已签名的 APK 文件。",
  noFileSelectedError: "请先选择文件。",
  passwordTooShortError: "密码长度至少 6 位。",
  passwordMismatchError: "两次输入的密码不一致。",
  aliasEmptyError: "别名不能为空。",
  cnEmptyError: "CN（常用名称）不能为空。",
  validityRangeError: "有效期需在 1-99 年之间。",
  parseFailedError: "解析失败",
  generateFailedError: "生成失败",
  webcryptoUnavailableError: "当前环境不支持 WebCrypto（crypto.subtle）。请使用 HTTPS 或现代浏览器。",
  localOnlyBadge: "本地计算 · 不上传",
} as const;

type SignCertUi = typeof DEFAULT_UI;

type TabKey = "generate" | "keystore" | "apk";

interface CertDisplayData {
  alias?: string;
  certDer: Uint8Array;
  info: ParsedCertificate;
  md5: string;
  sha1: string;
  sha256: string;
  publicKeyMd5: string;
  /** 备案“公钥”字段：RSA 模数的十六进制 */
  publicKeyHex: string;
}

interface GenerateResult {
  format: "jks" | "pkcs12";
  filename: string;
  keystoreBytes: Uint8Array;
  cert: CertDisplayData;
}

interface KeystoreEntryResult {
  kind: "key" | "cert";
  alias: string;
  cert?: CertDisplayData;
}

interface ApkSchemeResult {
  scheme: "v1" | "v2" | "v3" | "v3.1";
  certs: CertDisplayData[];
}

interface ApkResult {
  packageName: string | null;
  versionName: string | null;
  versionCode: string | null;
  schemes: ApkSchemeResult[];
}

const bytesEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const formatDate = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const tryCopyText = async (text: string) => {
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

const downloadBytes = (bytes: Uint8Array, filename: string, mime: string) => {
  const blob = new Blob([bytes.slice().buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const inputClass =
  "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30";
const cardClass = "rounded-3xl bg-white p-5 ring-1 ring-slate-200";
const sectionTitleClass = "text-sm font-semibold text-slate-900";

export default function AndroidSignCertClient() {
  return (
    <ToolPageLayout toolSlug="android-sign-cert" maxWidthClassName="max-w-6xl">
      <AndroidSignCertInner />
    </ToolPageLayout>
  );
}

function AndroidSignCertInner() {
  const config = useOptionalToolConfig("android-sign-cert");
  const ui: SignCertUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<SignCertUi>) };

  const [tab, setTab] = useState<TabKey>("generate");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const copy = useCallback(
    async (text: string) => {
      if (await tryCopyText(text)) {
        setToast(ui.copiedToast);
        window.setTimeout(() => setToast(null), 2000);
      }
    },
    [ui.copiedToast],
  );

  // —— 生成表单状态 ——
  const [alias, setAlias] = useState("upload");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [validityYears, setValidityYears] = useState(25);
  const [keySize, setKeySize] = useState(2048);
  const [format, setFormat] = useState<"jks" | "pkcs12">("jks");
  const [cn, setCn] = useState("");
  const [orgUnit, setOrgUnit] = useState("");
  const [organization, setOrganization] = useState("");
  const [locality, setLocality] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("CN");
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);

  // —— 密钥库解析状态 ——
  const [keystoreFile, setKeystoreFile] = useState<File | null>(null);
  const [keystorePassword, setKeystorePassword] = useState("");
  const [keystoreEntries, setKeystoreEntries] = useState<KeystoreEntryResult[] | null>(null);
  const keystoreFileRef = useRef<HTMLInputElement>(null);

  // —— APK 解析状态 ——
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [apkResult, setApkResult] = useState<ApkResult | null>(null);
  const apkFileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setError(null);
    setToast(null);
    if (tab === "generate") {
      setGenerateResult(null);
      setPassword("");
      setPasswordConfirm("");
    } else if (tab === "keystore") {
      setKeystoreFile(null);
      setKeystorePassword("");
      setKeystoreEntries(null);
      if (keystoreFileRef.current) keystoreFileRef.current.value = "";
    } else {
      setApkFile(null);
      setApkResult(null);
      if (apkFileRef.current) apkFileRef.current.value = "";
    }
  };

  const buildSubject = () => {
    const parts: string[] = [];
    const push = (key: string, value: string) => {
      const trimmed = value.trim();
      if (trimmed) parts.push(`${key}=${trimmed.replace(/,/g, "\\,")}`);
    };
    push("C", country);
    push("ST", state);
    push("L", locality);
    push("O", organization);
    push("OU", orgUnit);
    push("CN", cn);
    return parts.join(", ");
  };

  const showCertCard = (cert: CertDisplayData, extraDownload?: React.ReactNode) => (
    <div className="space-y-4">
      <div className="rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 p-5 ring-1 ring-blue-100">
        <div className="flex items-center gap-2">
          <FileBadge className="h-4 w-4 text-blue-600" />
          <div className="text-sm font-semibold text-slate-900">{ui.beianInfoTitle}</div>
        </div>
        <div className="mt-3 space-y-3">
          <FieldValue label={ui.publicKeyLabel} value={cert.publicKeyHex || "-"} onCopy={() => void copy(cert.publicKeyHex)} hint={ui.publicKeyHint} highlight />
          <FieldValue label={ui.signatureMd5Label} value={cert.md5} onCopy={() => void copy(cert.md5)} hint={ui.signatureMd5Hint} highlight />
        </div>
        <div className="mt-3 rounded-2xl bg-white/70 px-3 py-2 text-xs text-slate-600">{ui.beianInfoHint}</div>
      </div>

      <div className={cardClass}>
        <div className={sectionTitleClass}>{ui.fingerprintsTitle}</div>
        <div className="mt-3 space-y-2">
          <FingerprintRow label={ui.certMd5Label} value={cert.md5} onCopy={() => void copy(cert.md5)} />
          <FingerprintRow label={ui.certSha1Label} value={cert.sha1} onCopy={() => void copy(cert.sha1)} />
          <FingerprintRow label={ui.certSha256Label} value={cert.sha256} onCopy={() => void copy(cert.sha256)} />
          <FingerprintRow label={ui.pubKeyMd5Label} value={cert.publicKeyMd5} onCopy={() => void copy(cert.publicKeyMd5)} />
        </div>
      </div>

      <div className={cardClass}>
        <div className={sectionTitleClass}>{ui.certInfoTitle}</div>
        <dl className="mt-3 space-y-2 text-sm">
          {cert.alias && <InfoRow label={ui.aliasLabel} value={cert.alias} />}
          <InfoRow label={ui.subjectLabel} value={cert.info.subject || "-"} />
          <InfoRow label={ui.issuerLabel} value={cert.info.issuer || "-"} />
          <InfoRow label={ui.validFromLabel} value={formatDate(cert.info.notBefore)} />
          <InfoRow label={ui.validToLabel} value={formatDate(cert.info.notAfter)} />
          <InfoRow label={ui.serialLabel} value={cert.info.serialNumber} mono />
          <InfoRow label={ui.sigAlgLabel} value={cert.info.signatureAlgorithm} />
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              downloadBytes(
                new TextEncoder().encode(pemEncodeCertificate(cert.certDer)),
                `certificate.pem`,
                "application/x-pem-file",
              )
            }
            className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <span className="inline-flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" />
              {ui.downloadCertPemButton}
            </span>
          </button>
          {extraDownload}
        </div>
      </div>
    </div>
  );

  // —— 生成 ——
  const generate = async () => {
    setError(null);
    setGenerateResult(null);
    const aliasTrimmed = alias.trim();
    if (!aliasTrimmed) {
      setError(ui.aliasEmptyError);
      return;
    }
    if (password.length < 6) {
      setError(ui.passwordTooShortError);
      return;
    }
    if (password !== passwordConfirm) {
      setError(ui.passwordMismatchError);
      return;
    }
    if (!cn.trim()) {
      setError(ui.cnEmptyError);
      return;
    }
    if (!Number.isInteger(validityYears) || validityYears < 1 || validityYears > 99) {
      setError(ui.validityRangeError);
      return;
    }
    if (!crypto?.subtle) {
      setError(ui.webcryptoUnavailableError);
      return;
    }

    setIsWorking(true);
    try {
      const [{ X509CertificateGenerator }, certLib, jksLib, pkcs12Lib] = await Promise.all([
        import("@peculiar/x509"),
        import("./lib/cert"),
        import("./lib/jks"),
        import("./lib/pkcs12"),
      ]);

      const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", publicExponent: new Uint8Array([1, 0, 1]), modulusLength: keySize };
      const keys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
      const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));

      const notBefore = new Date();
      const notAfter = new Date(notBefore.getTime() + validityYears * 365.25 * 24 * 3600 * 1000);
      const certificate = await X509CertificateGenerator.createSelfSigned({
        name: buildSubject(),
        keys,
        signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        notBefore,
        notAfter,
      });
      const certDer = new Uint8Array(certificate.rawData);

      const keystoreBytes =
        format === "jks"
          ? jksLib.writeJks({ alias: aliasTrimmed, pkcs8, certificateChain: [certDer] }, password)
          : await pkcs12Lib.writePkcs12({ alias: aliasTrimmed, pkcs8, certDer, password });

      const info = certLib.parseX509Certificate(certDer);
      const md5 = await certLib.md5Hex(certDer);
      const sha1 = await certLib.sha1Hex(certDer);
      const sha256 = await certLib.sha256Hex(certDer);
      const publicKeyMd5 = await certLib.md5Hex(info.spkiDer);
      const publicKeyHex = certLib.rsaModulusHexFromSpki(info.spkiDer);

      const extension = format === "jks" ? "jks" : "p12";
      setGenerateResult({
        format,
        filename: `${aliasTrimmed.replace(/[\\/:*?"<>|]/g, "_")}.${extension}`,
        keystoreBytes,
        cert: { alias: aliasTrimmed, certDer, info, md5, sha1, sha256, publicKeyMd5, publicKeyHex },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.generateFailedError);
    } finally {
      setIsWorking(false);
    }
  };

  // —— 解析密钥库 ——
  const parseKeystore = async () => {
    setError(null);
    setKeystoreEntries(null);
    if (!keystoreFile) {
      setError(ui.noFileSelectedError);
      return;
    }
    if (keystorePassword.length < 6) {
      setError(ui.passwordTooShortError);
      return;
    }

    setIsWorking(true);
    try {
      const [certLib, jksLib, pkcs12Lib] = await Promise.all([import("./lib/cert"), import("./lib/jks"), import("./lib/pkcs12")]);
      const data = new Uint8Array(await keystoreFile.arrayBuffer());

      const makeCertData = async (certDer: Uint8Array, entryAlias: string): Promise<CertDisplayData> => {
        const info = certLib.parseX509Certificate(certDer);
        const [md5, sha1, sha256, publicKeyMd5] = await Promise.all([
          certLib.md5Hex(certDer),
          certLib.sha1Hex(certDer),
          certLib.sha256Hex(certDer),
          certLib.md5Hex(info.spkiDer),
        ]);
        return { alias: entryAlias, certDer, info, md5, sha1, sha256, publicKeyMd5, publicKeyHex: certLib.rsaModulusHexFromSpki(info.spkiDer) };
      };

      const results: KeystoreEntryResult[] = [];
      let lastError: unknown = null;

      // 先按 JKS 魔数判断，否则依次尝试两种格式
      const isJks = data.length > 4 && data[0] === 0xfe && data[1] === 0xed && data[2] === 0xfe && data[3] === 0xed;
      const attempts: Array<() => Promise<void>> = [];
      if (isJks) {
        attempts.push(async () => {
          const keystore = jksLib.readJks(data, keystorePassword);
          for (const entry of keystore.entries) {
            if (entry.kind === "privateKey" && entry.certificateChain[0]) {
              results.push({ kind: "key", alias: entry.alias, cert: await makeCertData(entry.certificateChain[0], entry.alias) });
            } else if (entry.kind === "trustedCert") {
              results.push({ kind: "cert", alias: entry.alias, cert: await makeCertData(entry.certificate, entry.alias) });
            }
          }
        });
      } else {
        attempts.push(async () => {
          const parsed = pkcs12Lib.readPkcs12(data, keystorePassword);
          if (parsed.key?.certDer) {
            results.push({ kind: "key", alias: parsed.key.alias, cert: await makeCertData(parsed.key.certDer, parsed.key.alias) });
          } else if (parsed.key) {
            results.push({ kind: "key", alias: parsed.key.alias });
          }
          for (const cert of parsed.certificates) {
            if (parsed.key?.certDer && bytesEqual(cert.certDer, parsed.key.certDer)) continue;
            results.push({ kind: "cert", alias: cert.alias, cert: await makeCertData(cert.certDer, cert.alias) });
          }
        });
        attempts.push(async () => {
          const keystore = jksLib.readJks(data, keystorePassword);
          for (const entry of keystore.entries) {
            if (entry.kind === "privateKey" && entry.certificateChain[0]) {
              results.push({ kind: "key", alias: entry.alias, cert: await makeCertData(entry.certificateChain[0], entry.alias) });
            } else if (entry.kind === "trustedCert") {
              results.push({ kind: "cert", alias: entry.alias, cert: await makeCertData(entry.certificate, entry.alias) });
            }
          }
        });
      }

      for (const attempt of attempts) {
        try {
          results.length = 0;
          await attempt();
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
        }
      }
      if (lastError) throw lastError;
      if (!results.length) throw new Error(ui.noKeyCertError);
      setKeystoreEntries(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.parseFailedError);
    } finally {
      setIsWorking(false);
    }
  };

  // —— 解析 APK ——
  const parseApk = async () => {
    setError(null);
    setApkResult(null);
    if (!apkFile) {
      setError(ui.noFileSelectedError);
      return;
    }

    setIsWorking(true);
    try {
      const [apkLib, certLib] = await Promise.all([import("./lib/apk"), import("./lib/cert")]);
      const data = new Uint8Array(await apkFile.arrayBuffer());
      const parsed = apkLib.parseApkSignatures(data);

      const makeCertData = async (certDer: Uint8Array): Promise<CertDisplayData> => {
        const info = certLib.parseX509Certificate(certDer);
        const [md5, sha1, sha256, publicKeyMd5] = await Promise.all([
          certLib.md5Hex(certDer),
          certLib.sha1Hex(certDer),
          certLib.sha256Hex(certDer),
          certLib.md5Hex(info.spkiDer),
        ]);
        return { certDer, info, md5, sha1, sha256, publicKeyMd5, publicKeyHex: certLib.rsaModulusHexFromSpki(info.spkiDer) };
      };

      const seen = new Set<string>();
      const buildCerts = async (ders: Uint8Array[]) => {
        const certs: CertDisplayData[] = [];
        for (const der of ders) {
          const key = Array.from(der.slice(0, 64)).toString() + der.length.toString();
          if (seen.has(key)) continue;
          seen.add(key);
          certs.push(await makeCertData(der));
        }
        return certs;
      };

      const schemes: ApkSchemeResult[] = [];
      for (const scheme of parsed.signatureSchemes) {
        const certs = await buildCerts(scheme.certificates);
        if (certs.length) {
          schemes.push({ scheme: scheme.scheme === "v2" ? "v2" : scheme.scheme === "v3" ? "v3" : "v3.1", certs });
        }
      }
      const v1Certs = await buildCerts(parsed.v1Certificates);
      if (v1Certs.length) schemes.unshift({ scheme: "v1", certs: v1Certs });

      if (!schemes.length && !parsed.packageName) {
        throw new Error(ui.noSignatureFoundError);
      }
      setApkResult({
        packageName: parsed.packageName,
        versionName: parsed.versionName,
        versionCode: parsed.versionCode,
        schemes,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.parseFailedError);
    } finally {
      setIsWorking(false);
    }
  };

  const primaryKeystoreCert = keystoreEntries?.find((entry) => entry.cert)?.cert ?? null;

  const schemeLabel = (scheme: ApkSchemeResult["scheme"]) =>
    scheme === "v1" ? ui.signatureSchemeV1 : scheme === "v2" ? ui.signatureSchemeV2 : scheme === "v3" ? ui.signatureSchemeV3 : ui.signatureSchemeV31;

  const tabs: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
    { key: "generate", label: ui.tabGenerate, icon: <KeyRound className="h-4 w-4" /> },
    { key: "keystore", label: ui.tabParseKeystore, icon: <FileKey2 className="h-4 w-4" /> },
    { key: "apk", label: ui.tabParseApk, icon: <Smartphone className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTab(item.key);
                setError(null);
                setToast(null);
              }}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                tab === item.key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
          <ShieldCheck className="h-3.5 w-3.5" />
          {ui.localOnlyBadge}
        </span>
      </div>

      {toast && (
        <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">{toast}</div>
      )}
      {error && (
        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">{error}</div>
      )}

      {tab === "generate" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="space-y-4">
            <div className={cardClass}>
              <div className={sectionTitleClass}>{ui.genSettingsTitle}</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  {ui.aliasFieldLabel}
                  <input value={alias} onChange={(e) => setAlias(e.target.value)} className={inputClass} placeholder={ui.aliasPlaceholder} />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.validityLabel}
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={validityYears}
                    onChange={(e) => setValidityYears(Number(e.target.value))}
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.passwordLabel}
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    autoComplete="new-password"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.passwordConfirmLabel}
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    className={inputClass}
                    autoComplete="new-password"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.keySizeLabel}
                  <select value={keySize} onChange={(e) => setKeySize(Number(e.target.value))} className={inputClass}>
                    <option value={2048}>RSA 2048</option>
                    <option value={3072}>RSA 3072</option>
                    <option value={4096}>RSA 4096</option>
                  </select>
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.formatLabel}
                  <select value={format} onChange={(e) => setFormat(e.target.value as "jks" | "pkcs12")} className={inputClass}>
                    <option value="jks">{ui.formatJks}</option>
                    <option value="pkcs12">{ui.formatPkcs12}</option>
                  </select>
                </label>
              </div>
            </div>

            <div className={cardClass}>
              <div className={sectionTitleClass}>{ui.subjectTitle}</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-700 sm:col-span-2">
                  {ui.cnLabel}
                  <input value={cn} onChange={(e) => setCn(e.target.value)} className={inputClass} placeholder={ui.cnPlaceholder} />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.ouLabel}
                  <input value={orgUnit} onChange={(e) => setOrgUnit(e.target.value)} className={inputClass} />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.oLabel}
                  <input value={organization} onChange={(e) => setOrganization(e.target.value)} className={inputClass} />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.lLabel}
                  <input value={locality} onChange={(e) => setLocality(e.target.value)} className={inputClass} />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.stLabel}
                  <input value={state} onChange={(e) => setState(e.target.value)} className={inputClass} />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.cLabel}
                  <input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={2} className={inputClass} />
                </label>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 font-mono text-xs break-words text-slate-600 ring-1 ring-slate-200">
                {buildSubject() || "-"}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                disabled={isWorking}
                className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {ui.resetButton}
              </button>
              <button
                type="button"
                onClick={() => void generate()}
                disabled={isWorking}
                className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {isWorking ? ui.generating : ui.generateButton}
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.description}</div>
          </div>

          <div className="space-y-4">
            {generateResult ? (
              <>
                {showCertCard(
                  generateResult.cert,
                  <button
                    type="button"
                    onClick={() => downloadBytes(generateResult.keystoreBytes, generateResult.filename, "application/octet-stream")}
                    className="rounded-2xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Download className="h-3.5 w-3.5" />
                      {ui.downloadKeystoreButton}（{generateResult.filename}）
                    </span>
                  </button>,
                )}
                <div className="rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-100">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <Info className="h-4 w-4" />
                    {ui.keystoreSavedTitle}
                  </div>
                  <div className="mt-2 text-xs leading-relaxed text-amber-800">{ui.keystoreSavedHint}</div>
                </div>
              </>
            ) : (
              <div className={cardClass}>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <KeyRound className="h-4 w-4" />
                  {ui.tabGenerate}
                </div>
                <div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-500">
                  <p>1. {ui.beianInfoHint}</p>
                  <p>2. {ui.keystoreSavedHint}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "keystore" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className={cardClass}>
              <div className={sectionTitleClass}>{ui.parseKeystoreTitle}</div>
              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.parseKeystoreHint}</div>
              <div className="mt-4 space-y-4">
                <label className="block text-sm text-slate-700">
                  {ui.chooseFileButton}
                  <input
                    ref={keystoreFileRef}
                    type="file"
                    accept=".jks,.keystore,.p12,.pfx,.pkcs12"
                    onChange={(e) => setKeystoreFile(e.target.files?.[0] ?? null)}
                    className={`${inputClass} file:mr-3 file:rounded-xl file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-700`}
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.keystorePasswordLabel}
                  <input
                    type="password"
                    value={keystorePassword}
                    onChange={(e) => setKeystorePassword(e.target.value)}
                    className={inputClass}
                    autoComplete="off"
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={reset}
                    disabled={isWorking}
                    className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {ui.resetButton}
                  </button>
                  <button
                    type="button"
                    onClick={() => void parseKeystore()}
                    disabled={isWorking}
                    className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {isWorking ? ui.parsing : ui.parseButton}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {keystoreEntries?.length ? (
              <>
                <div className={cardClass}>
                  <div className="flex items-center gap-2">
                    <FileKey2 className="h-4 w-4 text-blue-600" />
                    <div className={sectionTitleClass}>{ui.keystoreEntriesTitle}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {keystoreEntries.map((entry, index) => (
                      <span
                        key={`${entry.alias}-${index}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-700"
                      >
                        {entry.kind === "key" ? <KeyRound className="h-3 w-3" /> : <BadgeCheck className="h-3 w-3" />}
                        {entry.kind === "key" ? ui.keyEntryLabel : ui.certEntryLabel}：{entry.alias || "-"}
                      </span>
                    ))}
                  </div>
                </div>
                {primaryKeystoreCert && showCertCard(primaryKeystoreCert)}
              </>
            ) : (
              <div className={cardClass}>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <FileKey2 className="h-4 w-4" />
                  {ui.parseKeystoreTitle}
                </div>
                <div className="mt-3 text-xs leading-relaxed text-slate-500">{ui.beianInfoHint}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "apk" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className={cardClass}>
              <div className={sectionTitleClass}>{ui.parseApkTitle}</div>
              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.parseApkHint}</div>
              <div className="mt-4 space-y-4">
                <label className="block text-sm text-slate-700">
                  {ui.chooseFileButton}
                  <input
                    ref={apkFileRef}
                    type="file"
                    accept=".apk"
                    onChange={(e) => setApkFile(e.target.files?.[0] ?? null)}
                    className={`${inputClass} file:mr-3 file:rounded-xl file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-700`}
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={reset}
                    disabled={isWorking}
                    className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {ui.resetButton}
                  </button>
                  <button
                    type="button"
                    onClick={() => void parseApk()}
                    disabled={isWorking}
                    className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {isWorking ? ui.parsing : ui.parseButton}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {apkResult ? (
              <>
                <div className="rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 p-5 ring-1 ring-blue-100">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-600" />
                    <div className="text-sm font-semibold text-slate-900">{ui.apkInfoTitle}</div>
                  </div>
                  <div className="mt-3 space-y-3">
                    <FieldValue label={ui.packageNameLabel} value={apkResult.packageName ?? "-"} onCopy={() => void copy(apkResult.packageName ?? "")} highlight />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FieldValue label={ui.versionNameLabel} value={apkResult.versionName ?? "-"} onCopy={() => void copy(apkResult.versionName ?? "")} />
                      <FieldValue label={ui.versionCodeLabel} value={apkResult.versionCode ?? "-"} onCopy={() => void copy(apkResult.versionCode ?? "")} />
                    </div>
                  </div>
                </div>

                {apkResult.schemes.map((scheme) => (
                  <div key={scheme.scheme} className={cardClass}>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      <div className={sectionTitleClass}>{schemeLabel(scheme.scheme)}</div>
                    </div>
                    {scheme.certs.map((cert, index) => (
                      <div key={index} className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                        <div className="space-y-2">
                          <FingerprintRow label={ui.signatureMd5Label} value={cert.md5} onCopy={() => void copy(cert.md5)} />
                          <FingerprintRow label={ui.publicKeyLabel} value={cert.publicKeyHex || "-"} onCopy={() => void copy(cert.publicKeyHex)} />
                          <FingerprintRow label={ui.pubKeyMd5Label} value={cert.publicKeyMd5} onCopy={() => void copy(cert.publicKeyMd5)} />
                          <FingerprintRow label={ui.certSha256Label} value={cert.sha256} onCopy={() => void copy(cert.sha256)} />
                          <InfoRow label={ui.subjectLabel} value={cert.info.subject || "-"} />
                          <InfoRow label={ui.validToLabel} value={formatDate(cert.info.notAfter)} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.beianInfoHint}</div>
              </>
            ) : (
              <div className={cardClass}>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Smartphone className="h-4 w-4" />
                  {ui.parseApkTitle}
                </div>
                <div className="mt-3 text-xs leading-relaxed text-slate-500">{ui.beianInfoHint}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldValue({
  label,
  value,
  onCopy,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${highlight ? "bg-white ring-1 ring-blue-100" : "bg-white/70 ring-1 ring-slate-100"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-1 font-mono text-sm break-all text-slate-900 select-all">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function FingerprintRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
      <span className="w-36 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 font-mono text-xs break-all text-slate-800 select-all">{value}</span>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-xl p-1.5 text-slate-400 transition hover:bg-white hover:text-blue-600"
        aria-label="copy"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      <dt className="w-36 shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className={`min-w-0 flex-1 text-sm text-slate-800 ${mono ? "font-mono break-all" : "break-words"}`}>{value}</dd>
    </div>
  );
}

function pemEncodeCertificate(der: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < der.length; i += chunkSize) {
    binary += String.fromCharCode(...der.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}
