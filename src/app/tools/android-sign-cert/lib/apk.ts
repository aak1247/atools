// APK 签名信息解析：
// - v2/v3/v3.1：解析 APK Signing Block（位于 ZIP Central Directory 之前）
// - v1（JAR 签名）：解压 META-INF/*.RSA|*.DSA|*.EC，解析 PKCS#7 SignedData 中的证书
// - AndroidManifest.xml（AXML）：提取包名、versionName、versionCode（备案需要包名）
import { inflateSync } from "fflate";
import { concatBytes, derChildren, derOidToString, derRead } from "./der";

const EOCD_SIGNATURE = 0x06054b50;
const APK_SIG_BLOCK_MAGIC = "APK Sig Block 42";
const APK_SIG_V2_BLOCK_ID = 0x7109871a;
const APK_SIG_V3_BLOCK_ID = 0xf05368c0;
const APK_SIG_V31_BLOCK_ID = 0x1b93ad61;

// —— 基础字节读取 ——

function u16(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);
}

function u32(data: Uint8Array, offset: number): number {
  return ((data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8) | ((data[offset + 2] ?? 0) << 16) | ((data[offset + 3] ?? 0) << 24)) >>> 0;
}

function u64(data: Uint8Array, offset: number): number {
  return u32(data, offset) + u32(data, offset + 4) * 0x100000000;
}

// —— ZIP Central Directory ——

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function findEocd(data: Uint8Array): number {
  const minOffset = Math.max(0, data.length - 22 - 0xffff);
  for (let i = data.length - 22; i >= minOffset; i -= 1) {
    if (u32(data, i) === EOCD_SIGNATURE) return i;
  }
  throw new Error("不是有效的 ZIP/APK 文件（未找到 End of Central Directory）");
}

function readZipEntries(data: Uint8Array): Map<string, ZipEntry> {
  const eocdOffset = findEocd(data);
  const cdOffset = u32(data, eocdOffset + 16);
  const entryCount = u16(data, eocdOffset + 10);
  const entries = new Map<string, ZipEntry>();
  let offset = cdOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (u32(data, offset) !== 0x02014b50) throw new Error("ZIP Central Directory 已损坏");
    const compressionMethod = u16(data, offset + 10);
    const compressedSize = u32(data, offset + 20);
    const nameLength = u16(data, offset + 28);
    const extraLength = u16(data, offset + 30);
    const commentLength = u16(data, offset + 32);
    const localHeaderOffset = u32(data, offset + 42);
    const name = new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, { name, compressionMethod, compressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntryData(data: Uint8Array, entry: ZipEntry): Uint8Array {
  const headerOffset = entry.localHeaderOffset;
  if (u32(data, headerOffset) !== 0x04034b50) throw new Error("ZIP Local File Header 已损坏");
  const nameLength = u16(data, headerOffset + 26);
  const extraLength = u16(data, headerOffset + 28);
  const dataOffset = headerOffset + 30 + nameLength + extraLength;
  const compressed = data.subarray(dataOffset, dataOffset + entry.compressedSize);
  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) return inflateSync(compressed);
  throw new Error(`不支持的 ZIP 压缩方式：${entry.compressionMethod}`);
}

// —— APK Signing Block（v2/v3） ——

export interface ApkSignatureSchemeResult {
  scheme: "v2" | "v3" | "v3.1";
  certificates: Uint8Array[];
}

export interface ApkParseResult {
  signatureSchemes: ApkSignatureSchemeResult[];
  v1Certificates: Uint8Array[];
  packageName: string | null;
  versionName: string | null;
  versionCode: string | null;
}

/** 解析 v2/v3/v3.1 签名块中的证书（签名者证书为 DER 编码 X.509）。 */
function parseSigningBlock(data: Uint8Array, cdOffset: number): ApkSignatureSchemeResult[] {
  const results: ApkSignatureSchemeResult[] = [];
  if (cdOffset < 32) return results;
  const magicOffset = cdOffset - 16;
  const magic = new TextDecoder().decode(data.subarray(magicOffset, cdOffset));
  if (magic !== APK_SIG_BLOCK_MAGIC) return results;
  const blockSizeAtEnd = u64(data, cdOffset - 24);
  // 块布局：[size8][pairs][size8][magic16]，size 值不含首个 size 字段自身
  const blockStart = cdOffset - 8 - blockSizeAtEnd;
  if (blockStart < 0) return results;
  const pairsStart = blockStart + 8;
  const pairsEnd = magicOffset - 8;
  let offset = pairsStart;
  while (offset + 12 <= pairsEnd) {
    const pairLength = u64(data, offset);
    const pairEnd = offset + 8 + pairLength;
    if (pairEnd > pairsEnd) break;
    const id = u32(data, offset + 8);
    if (id === APK_SIG_V2_BLOCK_ID || id === APK_SIG_V3_BLOCK_ID || id === APK_SIG_V31_BLOCK_ID) {
      const scheme: ApkSignatureSchemeResult["scheme"] = id === APK_SIG_V2_BLOCK_ID ? "v2" : id === APK_SIG_V3_BLOCK_ID ? "v3" : "v3.1";
      const value = data.subarray(offset + 12, pairEnd);
      const certificates = parseSignerSequence(value);
      if (certificates.length) results.push({ scheme, certificates });
    }
    offset = pairEnd;
  }
  return results;
}

/** signer 序列全部使用 uint32-LE 长度前缀。 */
function parseSignerSequence(value: Uint8Array): Uint8Array[] {
  const certificates: Uint8Array[] = [];
  const signersSequence = readLengthPrefixed(value, 0);
  if (!signersSequence) return certificates;
  const signersEnd = signersSequence.offset + signersSequence.length;
  let signersOffset = signersSequence.offset;
  while (signersOffset + 4 <= signersEnd) {
    const signer = readLengthPrefixed(signersSequence.data, signersOffset);
    if (!signer) break;
    const signedData = readLengthPrefixed(signer.data, signer.offset);
    if (signedData) {
      // signedData: digests(LP), certificates(LP), additional attributes(LP)
      let innerOffset = signedData.offset;
      const digests = readLengthPrefixed(signedData.data, innerOffset);
      if (digests) innerOffset = digests.offset + 4 + digests.length;
      const certList = readLengthPrefixed(signedData.data, innerOffset);
      if (certList) {
        let certOffset = certList.offset;
        const certEnd = certList.offset + certList.length;
        while (certOffset + 4 <= certEnd) {
          const cert = readLengthPrefixed(certList.data, certOffset);
          if (!cert) break;
          certificates.push(certList.data.slice(cert.offset, cert.offset + cert.length));
          certOffset = cert.offset + cert.length;
        }
      }
    }
    signersOffset = signer.offset + signer.length;
  }
  return certificates;
}

function readLengthPrefixed(data: Uint8Array, offset: number): { data: Uint8Array; offset: number; length: number } | null {
  if (offset + 4 > data.length) return null;
  const length = u32(data, offset);
  return { data, offset: offset + 4, length };
}

// —— v1（JAR 签名）：META-INF/*.RSA|*.DSA|*.EC 的 PKCS#7 ——

/** 从 PKCS#7 SignedData 中提取全部证书 DER。 */
function parsePkcs7Certificates(p7: Uint8Array): Uint8Array[] {
  const certificates: Uint8Array[] = [];
  try {
    const contentInfo = derRead(p7);
    const infoChildren = derChildren(contentInfo);
    const contentType = derOidToString(infoChildren[0]);
    if (contentType !== "1.2.840.113549.1.7.2") return certificates; // signedData
    // infoChildren[1] 即 [0] EXPLICIT，其第一个子节点就是 SignedData SEQUENCE
    const signedData = derChildren(infoChildren[1])[0];
    const sdChildren = derChildren(signedData);
    // 0: version, 1: digestAlgorithms, 2: contentInfo, 3: [0] certificates
    const certElement = sdChildren[3];
    if (!certElement || certElement.tag !== 0xa0) return certificates;
    for (const child of derChildren(certElement)) {
      if (child.tag === 0x30) certificates.push(child.full);
    }
  } catch {
    // 忽略解析失败的条目
  }
  return certificates;
}

// —— AndroidManifest.xml（AXML 二进制 XML） ——

interface AxmlStringPool {
  strings: string[];
}

function parseStringPool(data: Uint8Array, chunkOffset: number): AxmlStringPool {
  const stringCount = u32(data, chunkOffset + 8);
  const flags = u32(data, chunkOffset + 16);
  const stringsStart = u32(data, chunkOffset + 20);
  const isUtf8 = (flags & 0x100) !== 0;
  const strings: string[] = [];
  for (let i = 0; i < stringCount; i += 1) {
    const offset = chunkOffset + stringsStart + u32(data, chunkOffset + 28 + i * 4);
    if (isUtf8) {
      let p = offset;
      // UTF-8 池：字符数与字节数均为 1-2 字节 varint（高位 0x80 表示两字节）
      p += readAxmLength8(data, p).bytesRead;
      const byteLengthResult = readAxmLength8(data, p);
      p += byteLengthResult.bytesRead;
      strings.push(new TextDecoder().decode(data.subarray(p, p + byteLengthResult.value)));
    } else {
      // UTF-16 池：长度为 u16（高位 0x8000 表示再跟一个 u16）
      const lengthResult = readAxmLength16(data, offset);
      const p = offset + lengthResult.bytesRead;
      strings.push(new TextDecoder("utf-16le").decode(data.subarray(p, p + lengthResult.value * 2)));
    }
  }
  return { strings };
}

function readAxmLength8(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  const first = data[offset] ?? 0;
  if (first & 0x80) {
    const second = data[offset + 1] ?? 0;
    return { value: ((first & 0x7f) << 8) | second, bytesRead: 2 };
  }
  return { value: first, bytesRead: 1 };
}

function readAxmLength16(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  const first = u16(data, offset);
  if (first & 0x8000) {
    const second = u16(data, offset + 2);
    return { value: ((first & 0x7fff) << 16) | second, bytesRead: 4 };
  }
  return { value: first, bytesRead: 2 };
}

function parseAxmlManifest(data: Uint8Array): { packageName: string | null; versionName: string | null; versionCode: string | null } {
  const result: { packageName: string | null; versionName: string | null; versionCode: string | null } = {
    packageName: null,
    versionName: null,
    versionCode: null,
  };
  try {
    // 文件头 8 字节，第一个 chunk 必为字符串池（type 0x0001）
    const stringPool = parseStringPool(data, 8);
    const strings = stringPool.strings;
    // 从头扫描 START_ELEMENT（type 0x0102）chunk，找 <manifest> 的属性
    let offset = 8;
    let manifestFound = false;
    while (offset + 8 <= data.length && !manifestFound) {
      const type = u16(data, offset);
      const headerSize = u16(data, offset + 2);
      const size = u32(data, offset + 4);
      if (size <= 0 || offset + size > data.length) break;
      if (type === 0x0102) {
        const nameIndex = u32(data, offset + headerSize + 4); // attributeExt: ns(4) name(4)
        const elementName = strings[nameIndex] ?? "";
        if (elementName === "manifest") {
          const attributeStart = u16(data, offset + headerSize + 8);
          const attributeSize = u16(data, offset + headerSize + 10);
          const attributeCount = u16(data, offset + headerSize + 12);
          const attributesOffset = offset + headerSize + attributeStart;
          for (let i = 0; i < attributeCount; i += 1) {
            const attrOffset = attributesOffset + i * attributeSize;
            const attrNameIndex = u32(data, attrOffset + 4);
            const rawValueIndex = u32(data, attrOffset + 8);
            const dataType = data[attrOffset + 15] ?? 0;
            const dataValue = u32(data, attrOffset + 16);
            const attrName = strings[attrNameIndex] ?? "";
            const value = dataType === 0x03 ? strings[dataValue] ?? null : rawValueIndex < strings.length ? strings[rawValueIndex] ?? null : null;
            if (attrName === "package") result.packageName = value;
            else if (attrName === "versionName") result.versionName = value;
            else if (attrName === "versionCode") result.versionCode = value ?? String(dataValue);
          }
          manifestFound = true;
        }
      }
      offset += size;
    }
  } catch {
    // AXML 解析失败不影响签名结果
  }
  return result;
}

// —— 入口 ——

export function parseApkSignatures(data: Uint8Array): ApkParseResult {
  const eocdOffset = findEocd(data);
  const cdOffset = u32(data, eocdOffset + 16);

  const signatureSchemes = parseSigningBlock(data, cdOffset);

  const v1Certificates: Uint8Array[] = [];
  try {
    const entries = readZipEntries(data);
    for (const [name, entry] of entries) {
      const upper = name.toUpperCase();
      if (upper.startsWith("META-INF/") && (upper.endsWith(".RSA") || upper.endsWith(".DSA") || upper.endsWith(".EC"))) {
        const entryData = readZipEntryData(data, entry);
        v1Certificates.push(...parsePkcs7Certificates(entryData));
      }
    }
  } catch {
    // ZIP 读取失败不影响 v2/v3 结果
  }

  let packageName: string | null = null;
  let versionName: string | null = null;
  let versionCode: string | null = null;
  try {
    const entries = readZipEntries(data);
    const manifestEntry = entries.get("AndroidManifest.xml");
    if (manifestEntry) {
      const manifest = parseAxmlManifest(readZipEntryData(data, manifestEntry));
      packageName = manifest.packageName;
      versionName = manifest.versionName;
      versionCode = manifest.versionCode;
    }
  } catch {
    // 忽略
  }

  return { signatureSchemes, v1Certificates, packageName, versionName, versionCode };
}

export { concatBytes };
