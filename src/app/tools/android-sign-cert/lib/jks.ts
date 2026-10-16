// JKS（Java KeyStore）读写实现。
// 格式依据 OpenJDK sun/security/provider/JavaKeyStore.java 与 KeyProtector.java：
// - 容器：MAGIC 0xFEEDFEED、VERSION 2、条目数、条目、末尾 20 字节完整性摘要
// - 完整性摘要：SHA1(密码字节(每字符高/低两字节) + "Mighty Aphrodite" + 文件主体)
// - 私钥加密：KeyProtector（SHA-1 密钥流 XOR）。
//   JDK 9+ 存储为 EncryptedPrivateKeyInfo（OID 1.3.6.1.4.1.42.2.17.1.1）包裹的 blob；
//   JDK 8 及更早直接存储原始 blob（salt || 密文 || 校验摘要），读取时两种都兼容。
import CryptoJS from "crypto-js";
import { DER_TAG, DerWriter, concatBytes, derChildren, derRead, derOidToString, derWrap } from "./der";

export const JKS_MAGIC = 0xfeedfeed;
const JKS_VERSION = 2;
const KEY_PROTECTOR_OID = "1.3.6.1.4.1.42.2.17.1.1";
const SALT_LEN = 20;
const DIGEST_LEN = 20;

export interface JksPrivateKeyEntry {
  kind: "privateKey";
  alias: string;
  createdAt: number;
  pkcs8: Uint8Array;
  certificateChain: Uint8Array[];
}

export interface JksTrustedCertEntry {
  kind: "trustedCert";
  alias: string;
  createdAt: number;
  certificate: Uint8Array;
}

export type JksEntry = JksPrivateKeyEntry | JksTrustedCertEntry;

export interface JksKeystore {
  entries: JksEntry[];
}

/** Java DataOutputStream.writeUTF 的 modified UTF-8 编码（按 UTF-16 码元逐个编码）。 */
function javaUtf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0x01 && code <= 0x7f) {
      bytes.push(code);
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return Uint8Array.from(bytes);
}

function javaUtf8Decode(bytes: Uint8Array): string {
  let text = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 === undefined) break;
    if (b0 < 0x80) {
      text += String.fromCharCode(b0);
      i += 1;
    } else if ((b0 & 0xe0) === 0xc0) {
      const b1 = bytes[i + 1] ?? 0;
      text += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
      i += 2;
    } else if ((b0 & 0xf0) === 0xe0) {
      const b1 = bytes[i + 1] ?? 0;
      const b2 = bytes[i + 2] ?? 0;
      text += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
      i += 3;
    } else {
      i += 1;
    }
  }
  return text;
}

class ByteWriter {
  private readonly chunks: number[] = [];

  push(bytes: number[]): this {
    for (const b of bytes) this.chunks.push(b);
    return this;
  }

  int32(value: number): this {
    return this.push([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
  }

  int16(value: number): this {
    return this.push([(value >>> 8) & 0xff, value & 0xff]);
  }

  /** 8 字节大端整数（毫秒时间戳，< 2^53，用 Number 安全表示）。 */
  int64(value: number): this {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`int64 仅支持非负安全整数：${value}`);
    const high = Math.floor(value / 0x100000000);
    const low = value >>> 0 === value % 0x100000000 ? value % 0x100000000 : value - high * 0x100000000;
    return this.push([
      (high >>> 24) & 0xff,
      (high >>> 16) & 0xff,
      (high >>> 8) & 0xff,
      high & 0xff,
      (low >>> 24) & 0xff,
      (low >>> 16) & 0xff,
      (low >>> 8) & 0xff,
      low & 0xff,
    ]);
  }

  bytes(data: Uint8Array): this {
    return this.push(Array.from(data));
  }

  javaUtf(text: string): this {
    const encoded = javaUtf8Encode(text);
    if (encoded.length > 0xffff) throw new Error("别名过长");
    return this.int16(encoded.length).bytes(encoded);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

class ByteReader {
  offset = 0;
  private readonly data: Uint8Array;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  int32(): number {
    const a = this.data[this.offset];
    const b = this.data[this.offset + 1];
    const c = this.data[this.offset + 2];
    const d = this.data[this.offset + 3];
    this.offset += 4;
    if (a === undefined || b === undefined || c === undefined || d === undefined) throw new Error("JKS 文件已截断");
    return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  }

  signedInt32(): number {
    return this.int32() | 0;
  }

  int64(): number {
    const high = this.int32();
    const low = this.int32();
    return high * 0x100000000 + low;
  }

  bytes(length: number): Uint8Array {
    if (length < 0 || this.offset + length > this.data.length) throw new Error("JKS 文件已截断或数据异常");
    const slice = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  javaUtf(): string {
    const length = this.int16();
    return javaUtf8Decode(this.bytes(length));
  }

  int16(): number {
    const a = this.data[this.offset];
    const b = this.data[this.offset + 1];
    this.offset += 2;
    if (a === undefined || b === undefined) throw new Error("JKS 文件已截断");
    return (a << 8) | b;
  }
}

// —— 同步 SHA-1（crypto-js，避免依赖异步 WebCrypto） ——

function wordArrayFromBytes(bytes: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    words.push(
      (((bytes[i] ?? 0) << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)) >>> 0,
    );
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function bytesFromWordArray(wordArray: CryptoJS.lib.WordArray): Uint8Array {
  const words = wordArray.words;
  const sigBytes = wordArray.sigBytes;
  const out = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i += 1) {
    out[i] = (words[i >> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

function sha1Bytes(...chunks: Uint8Array[]): Uint8Array {
  const data = concatBytes(chunks);
  return bytesFromWordArray(CryptoJS.SHA1(wordArrayFromBytes(data)));
}

/** JKS 密码字符 → 字节：每个字符拆成高/低两个字节。 */
export function passwordToBytes(password: string): Uint8Array {
  const bytes = new Uint8Array(password.length * 2);
  for (let i = 0; i < password.length; i += 1) {
    const code = password.charCodeAt(i);
    bytes[i * 2] = (code >> 8) & 0xff;
    bytes[i * 2 + 1] = code & 0xff;
  }
  return bytes;
}

const INTEGRITY_SALT_TEXT = "Mighty Aphrodite";

function computeIntegrityDigest(passwordBytes: Uint8Array, body: Uint8Array): Uint8Array {
  return sha1Bytes(passwordBytes, new TextEncoder().encode(INTEGRITY_SALT_TEXT), body);
}

// —— KeyProtector 私钥加解密 ——

function deriveXorKey(passwordBytes: Uint8Array, salt: Uint8Array, length: number): Uint8Array {
  const xorKey = new Uint8Array(length);
  const rounds = Math.ceil(length / DIGEST_LEN);
  let digest = sha1Bytes(passwordBytes, salt);
  let offset = 0;
  for (let round = 0; round < rounds; round += 1) {
    const remaining = length - offset;
    const take = round < rounds - 1 ? DIGEST_LEN : Math.min(remaining, DIGEST_LEN);
    xorKey.set(digest.subarray(0, take), offset);
    offset += take;
    if (offset < length) digest = sha1Bytes(passwordBytes, digest);
  }
  return xorKey;
}

/** 生成 KeyProtector 加密私钥（JDK 9+ 的存储形式：外包 JAVASOFT EPKI DER）。 */
export function wrapKeyProtector(pkcs8: Uint8Array, passwordBytes: Uint8Array, salt?: Uint8Array): Uint8Array {
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const xorKey = deriveXorKey(passwordBytes, actualSalt, pkcs8.length);
  const cipherText = new Uint8Array(pkcs8.length);
  for (let i = 0; i < pkcs8.length; i += 1) {
    cipherText[i] = pkcs8[i] ^ (xorKey[i] ?? 0);
  }
  const checkDigest = sha1Bytes(passwordBytes, pkcs8);
  const blob = concatBytes([actualSalt, cipherText, checkDigest]);
  // EncryptedPrivateKeyInfo ::= SEQUENCE { AlgorithmIdentifier(SEQ{OID}), OCTET STRING }
  const algorithmIdentifier = derWrap(DER_TAG.SEQUENCE, new DerWriter().oid(KEY_PROTECTOR_OID).bytes());
  const epkiContent = concatBytes([algorithmIdentifier, new DerWriter().octetString(blob).bytes()]);
  return derWrap(DER_TAG.SEQUENCE, epkiContent);
}

export function unwrapKeyProtector(blob: Uint8Array, passwordBytes: Uint8Array): Uint8Array {
  // JDK 9+：EncryptedPrivateKeyInfo DER（SEQUENCE { AlgorithmIdentifier, OCTET STRING }）
  // JDK 8-：原始 blob（salt || cipher || digest）
  let protectedBytes: Uint8Array;
  if (blob.length > 0 && blob[0] === 0x30) {
    const epki = derRead(blob);
    const [algElement, dataElement] = derChildren(epki);
    if (!algElement || !dataElement) throw new Error("JKS 私钥数据无效");
    const oidElement = derChildren(algElement)[0];
    if (!oidElement || derOidToString(oidElement) !== KEY_PROTECTOR_OID) {
      throw new Error("不支持的 JKS 私钥保护算法");
    }
    protectedBytes = dataElement.content;
  } else {
    protectedBytes = blob;
  }
  if (protectedBytes.length <= SALT_LEN + DIGEST_LEN) throw new Error("JKS 私钥数据无效");

  const salt = protectedBytes.subarray(0, SALT_LEN);
  const storedDigest = protectedBytes.subarray(protectedBytes.length - DIGEST_LEN);
  const cipherText = protectedBytes.subarray(SALT_LEN, protectedBytes.length - DIGEST_LEN);

  const xorKey = deriveXorKey(passwordBytes, salt, cipherText.length);
  const plain = new Uint8Array(cipherText.length);
  for (let i = 0; i < cipherText.length; i += 1) {
    plain[i] = cipherText[i] ^ (xorKey[i] ?? 0);
  }
  const checkDigest = sha1Bytes(passwordBytes, plain);
  for (let i = 0; i < DIGEST_LEN; i += 1) {
    if ((checkDigest[i] ?? 0) !== (storedDigest[i] ?? 0)) {
      throw new Error("密码错误或私钥数据已损坏（解密校验失败）");
    }
  }
  return plain;
}

// —— 读取 ——

export function readJks(data: Uint8Array, password: string): JksKeystore {
  const reader = new ByteReader(data);
  const magic = reader.int32();
  if (magic !== JKS_MAGIC) throw new Error("不是有效的 JKS 密钥库文件");
  const version = reader.int32();
  if (version !== JKS_VERSION) throw new Error(`不支持的 JKS 版本：${version}`);

  const passwordBytes = passwordToBytes(password);
  const bodyEnd = data.length - DIGEST_LEN;
  if (bodyEnd <= 0) throw new Error("JKS 文件已截断");
  const body = data.subarray(0, bodyEnd);
  const expectedDigest = computeIntegrityDigest(passwordBytes, body);
  const storedDigest = data.subarray(bodyEnd);
  for (let i = 0; i < DIGEST_LEN; i += 1) {
    if ((expectedDigest[i] ?? 0) !== (storedDigest[i] ?? 0)) {
      throw new Error("密码错误或文件已损坏（完整性校验失败）");
    }
  }

  const entries: JksEntry[] = [];
  const count = reader.signedInt32();
  for (let i = 0; i < count; i += 1) {
    const tag = reader.signedInt32();
    const alias = reader.javaUtf();
    const createdAt = reader.int64();
    if (tag === 1) {
      const blobLength = reader.signedInt32();
      const blob = reader.bytes(blobLength);
      const pkcs8 = unwrapKeyProtector(blob, passwordBytes);
      const chainLength = reader.signedInt32();
      const chain: Uint8Array[] = [];
      for (let c = 0; c < chainLength; c += 1) {
        reader.javaUtf(); // 证书类型，通常为 "X.509"
        const certLength = reader.signedInt32();
        chain.push(reader.bytes(certLength));
      }
      entries.push({ kind: "privateKey", alias, createdAt, pkcs8, certificateChain: chain });
    } else if (tag === 2) {
      reader.javaUtf();
      const certLength = reader.signedInt32();
      const certificate = reader.bytes(certLength);
      entries.push({ kind: "trustedCert", alias, createdAt, certificate });
    } else {
      throw new Error(`未知的 JKS 条目类型：${tag}`);
    }
  }
  return { entries };
}

// —— 写入 ——

export interface JksWriteEntry {
  alias: string;
  pkcs8: Uint8Array;
  certificateChain: Uint8Array[];
}

/** 写出 JKS v2 密钥库（兼容 keytool/Android Studio 读取）。 */
export function writeJks(entry: JksWriteEntry, password: string): Uint8Array {
  const passwordBytes = passwordToBytes(password);
  const writer = new ByteWriter();
  writer.int32(JKS_MAGIC);
  writer.int32(JKS_VERSION);
  writer.int32(1); // 条目数：1 个私钥条目
  writer.int32(1); // tag = 1（私钥条目）
  writer.javaUtf(entry.alias);
  writer.int64(Date.now());
  const protectedKey = wrapKeyProtector(entry.pkcs8, passwordBytes);
  writer.int32(protectedKey.length);
  writer.bytes(protectedKey);
  writer.int32(entry.certificateChain.length);
  for (const cert of entry.certificateChain) {
    writer.javaUtf("X.509");
    writer.int32(cert.length);
    writer.bytes(cert);
  }
  const body = writer.toBytes();
  const digest = computeIntegrityDigest(passwordBytes, body);
  return concatBytes([body, digest]);
}
