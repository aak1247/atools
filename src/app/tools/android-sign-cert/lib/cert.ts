import { md5, sha1, sha256 } from "hash-wasm";
import {
  DER_TAG,
  DerWriter,
  concatBytes,
  derChildren,
  derIntegerBytes,
  derOidToString,
  derRead,
  derWrap,
} from "./der";
import type { DerElement } from "./der";

export async function md5Hex(data: Uint8Array): Promise<string> {
  return md5(data);
}

export async function sha1Hex(data: Uint8Array): Promise<string> {
  return sha1(data);
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  return sha256(data);
}

export interface CertificateFingerprints {
  md5: string;
  sha1: string;
  sha256: string;
}

export async function certificateFingerprints(certDer: Uint8Array): Promise<CertificateFingerprints> {
  return {
    md5: await md5Hex(certDer),
    sha1: await sha1Hex(certDer),
    sha256: await sha256Hex(certDer),
  };
}

export function bytesToHex(data: Uint8Array, separator = ""): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(separator);
}

export function bytesToBase64(data: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < data.length; i += chunkSize) {
    binary += String.fromCharCode(...data.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function pemEncode(label: string, der: Uint8Array): string {
  const base64 = bytesToBase64(der);
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

export interface ParsedCertificate {
  serialNumber: string;
  subject: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  /** SubjectPublicKeyInfo 的完整 DER 编码（公钥 MD5 基于此计算） */
  spkiDer: Uint8Array;
  signatureAlgorithm: string;
}

function nameToString(nameElement: DerElement): string {
  const rdns = derChildren(nameElement);
  const parts: string[] = [];
  for (const rdn of rdns) {
    for (const atv of derChildren(rdn)) {
      const [oidEl, valueEl] = derChildren(atv);
      if (!oidEl || !valueEl) continue;
      const oid = derOidToString(oidEl);
      const text = new TextDecoder().decode(valueEl.content);
      const label = DN_OID_LABELS[oid] ?? oid;
      parts.push(`${label}=${text}`);
    }
  }
  return parts.join(", ");
}

const DN_OID_LABELS: Record<string, string> = {
  "2.5.4.3": "CN",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "1.2.840.113549.1.9.1": "emailAddress",
};

const SIGNATURE_ALGORITHM_NAMES: Record<string, string> = {
  "1.2.840.113549.1.1.5": "SHA1withRSA",
  "1.2.840.113549.1.1.11": "SHA256withRSA",
  "1.2.840.113549.1.1.12": "SHA384withRSA",
  "1.2.840.113549.1.1.13": "SHA512withRSA",
  "1.2.840.10045.4.3.2": "SHA256withECDSA",
  "1.2.840.10045.4.3.3": "SHA384withECDSA",
  "1.2.840.10045.4.3.4": "SHA512withECDSA",
};

/** 解析 X.509 证书 DER，提取备案/展示所需的字段。 */
export function parseX509Certificate(certDer: Uint8Array): ParsedCertificate {
  const certChildren = derChildren(derRead(certDer));
  const tbs = certChildren[0];
  if (!tbs) throw new Error("证书数据无效：缺少 tbsCertificate");
  const tbsChildren = derChildren(tbs);

  let index = 0;
  const first = tbsChildren[index];
  if (first && first.tag === 0xa0) index += 1; // [0] EXPLICIT version

  const serialElement = tbsChildren[index];
  index += 1;
  const signatureAlgorithmElement = tbsChildren[index];
  index += 1;
  const issuerElement = tbsChildren[index];
  index += 1;
  const validityElement = tbsChildren[index];
  index += 1;
  const subjectElement = tbsChildren[index];
  index += 1;
  const spkiElement = tbsChildren[index];
  if (!serialElement || !signatureAlgorithmElement || !issuerElement || !validityElement || !subjectElement || !spkiElement) {
    throw new Error("证书数据无效：字段缺失");
  }

  const validityChildren = derChildren(validityElement);
  const notBeforeElement = validityChildren[0];
  const notAfterElement = validityChildren[1];
  if (!notBeforeElement || !notAfterElement) throw new Error("证书数据无效：有效期字段缺失");

  return {
    serialNumber: bytesToHex(derIntegerBytes(serialElement)),
    subject: nameToString(subjectElement),
    issuer: nameToString(issuerElement),
    notBefore: parseAsn1Time(notBeforeElement),
    notAfter: parseAsn1Time(notAfterElement),
    spkiDer: spkiElement.full,
    signatureAlgorithm:
      SIGNATURE_ALGORITHM_NAMES[derOidToString(derChildren(signatureAlgorithmElement)[0])] ??
      "未知算法",
  };
}

function parseAsn1Time(element: DerElement): Date {
  const text = new TextDecoder().decode(element.content);
  const match = /^(\d{2}|\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/.exec(text);
  if (!match) throw new Error(`无法解析证书时间：${text}`);
  const [, year, month, day, hour, minute, second] = match;
  let fullYear = Number(year);
  if (year.length === 2) fullYear += fullYear < 50 ? 2000 : 1900;
  return new Date(Date.UTC(fullYear, Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
}

/** 从 PKCS#8 私钥（RSA）推导出 SubjectPublicKeyInfo DER。 */
export function spkiDerFromPkcs8(pkcs8: Uint8Array): Uint8Array {
  const pkcs8Children = derChildren(derRead(pkcs8));
  // PKCS#8: SEQUENCE { version, privateKeyAlgorithm, privateKey OCTET STRING }
  const privateKeyElement = pkcs8Children[2];
  if (!privateKeyElement) throw new Error("PKCS#8 数据无效");
  const rsaPrivateKey = derRead(privateKeyElement.content);
  const rsaChildren = derChildren(rsaPrivateKey);
  const modulusElement = rsaChildren[1];
  const publicExponentElement = rsaChildren[2];
  if (!modulusElement || !publicExponentElement) throw new Error("PKCS#8 数据无效：缺少 RSA 公钥分量");

  const inner = new DerWriter().integerBytes(derIntegerBytes(modulusElement)).integerBytes(derIntegerBytes(publicExponentElement)).bytes();
  const algId = derWrap(DER_TAG.SEQUENCE, new DerWriter().oid("1.2.840.113549.1.1.1").nullValue().bytes());
  const publicKeyBits = derWrap(DER_TAG.SEQUENCE, inner);
  const bitString = new DerWriter().bitString(publicKeyBits).bytes();
  return derWrap(DER_TAG.SEQUENCE, concatBytes([algId, bitString]));
}

export function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export { DER_TAG, DerWriter, derChildren, derRead, derOidToString };

const RSA_ENCRYPTION_OID = "1.2.840.113549.1.1.1";

/**
 * 从 SPKI DER 提取 RSA 模数的十六进制值。
 * 这是 App 备案表单（如阿里云/腾讯云）中"公钥"字段要求的格式，
 * 即 jadx 等工具在签名信息中显示的"模数"（RSA 2048 为 512 个十六进制字符）。
 * 非 RSA 证书返回空字符串。
 */
export function rsaModulusHexFromSpki(spkiDer: Uint8Array): string {
  try {
    const spki = derRead(spkiDer);
    const [algElement, keyElement] = derChildren(spki);
    if (!algElement || !keyElement || keyElement.tag !== DER_TAG.BIT_STRING) return "";
    const algOidElement = derChildren(algElement)[0];
    if (!algOidElement || derOidToString(algOidElement) !== RSA_ENCRYPTION_OID) return "";
    // BIT STRING 内容首字节为未使用位数（公钥恒为 0），其后是 RSAPublicKey SEQUENCE
    const rsaPublicKey = derRead(keyElement.content.subarray(1));
    const modulusElement = derChildren(rsaPublicKey)[0];
    if (!modulusElement) return "";
    return bytesToHex(derIntegerBytes(modulusElement));
  } catch {
    return "";
  }
}
