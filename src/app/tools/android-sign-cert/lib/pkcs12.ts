// PKCS#12（.p12/.pfx）读写实现（RFC 7292）。
// - 写出：PBES2（PBKDF2-HMAC-SHA256 + AES-256-CBC）加密私钥，HMAC-SHA256 MAC，keytool/openssl 可读。
// - 读取：支持 PBES1（3DES / RC2-40 / RC2-128）、PBES2（AES / 3DES）与 HmacPBESHA1 / HMAC-SHA256 MAC，
//   覆盖 keytool（JDK≤17 默认 3DES+RC2-40，JDK18+ 默认 AES-256）与常见 openssl 产物。
import CryptoJS from "crypto-js";
import {
  DER_TAG,
  DerWriter,
  concatBytes,
  derChildren,
  derIntegerToNumber,
  derOidToString,
  derRead,
  derWrap,
} from "./der";

const OID = {
  data: "1.2.840.113549.1.7.1",
  encryptedData: "1.2.840.113549.1.7.6",
  keyBag: "1.2.840.113549.1.12.10.1.1",
  pkcs8ShroudedKeyBag: "1.2.840.113549.1.12.10.1.2",
  certBag: "1.2.840.113549.1.12.10.1.3",
  certTypesX509: "1.2.840.113549.1.9.22.1",
  friendlyName: "1.2.840.113549.1.9.20",
  localKeyId: "1.2.840.113549.1.9.21",
  pbes2: "1.2.840.113549.1.5.13",
  pbkdf2: "1.2.840.113549.1.5.12",
  hmacWithSha1: "1.3.14.3.2.26",
  hmacWithSha256: "1.2.840.113549.2.9",
  sha1: "1.3.14.3.2.26",
  sha256: "2.16.840.1.101.3.4.2.1",
  desEde3Cbc: "1.2.840.113549.3.7",
  rc2Cbc: "1.2.840.113549.3.16",
  aes128Cbc: "2.16.840.1.101.3.4.1.2",
  aes192Cbc: "2.16.840.1.101.3.4.1.22",
  aes256Cbc: "2.16.840.1.101.3.4.1.42",
  pbeWithShaAnd3KeyTripleDesCbc: "1.2.840.113549.1.12.1.3",
  pbeWithShaAnd2KeyTripleDesCbc: "1.2.840.113549.1.12.1.4",
  pbeWithShaAnd128BitRc2Cbc: "1.2.840.113549.1.12.1.5",
  pbeWithShaAnd40BitRc2Cbc: "1.2.840.113549.1.12.1.6",
} as const;

// —— 字节 / WordArray 互转（crypto-js） ——

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
  const out = new Uint8Array(wordArray.sigBytes);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = (words[i >> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

function sha1Sync(...chunks: Uint8Array[]): Uint8Array {
  return bytesFromWordArray(CryptoJS.SHA1(wordArrayFromBytes(concatBytes(chunks))));
}

function sha256Sync(...chunks: Uint8Array[]): Uint8Array {
  return bytesFromWordArray(CryptoJS.SHA256(wordArrayFromBytes(concatBytes(chunks))));
}

/** PKCS#12 密码 → BMPString 字节（UTF-16BE，追加 0x00 0x00；空密码为空）。 */
function pkcs12PasswordBytes(password: string): Uint8Array {
  if (!password) return new Uint8Array(0);
  const bytes = new Uint8Array(password.length * 2 + 2);
  for (let i = 0; i < password.length; i += 1) {
    const code = password.charCodeAt(i);
    bytes[i * 2] = (code >> 8) & 0xff;
    bytes[i * 2 + 1] = code & 0xff;
  }
  return bytes;
}

function repeatToMultiple(data: Uint8Array, block: number): Uint8Array {
  if (data.length === 0) return new Uint8Array(0);
  const count = Math.ceil(data.length / block);
  const out = new Uint8Array(count * block);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = data[i % data.length];
  }
  return out;
}

/** RFC 7292 附录 B 的 PKCS#12 KDF。id：1=密钥 2=IV 3=MAC 密钥。
 * 密钥长度超过单个哈希输出（u）时，按规范在后续块前用 B 修改 I。 */
function pkcs12Kdf(
  id: number,
  hashName: "sha1" | "sha256",
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyLength: number,
): Uint8Array {
  const v = 64; // 块长度（OpenJDK/openssl 均使用 64）
  const u = hashName === "sha1" ? 20 : 32;
  const hashBytes = hashName === "sha1" ? sha1Sync : sha256Sync;
  const d = new Uint8Array(v).fill(id);
  const s = repeatToMultiple(salt, v);
  const p = repeatToMultiple(pkcs12PasswordBytes(password), v);
  const iVector = concatBytes([s, p]);
  const key = new Uint8Array(keyLength);
  let remaining = keyLength;
  let offset = 0;
  while (remaining > 0) {
    let a = hashBytes(d, iVector);
    for (let r = 1; r < iterations; r += 1) a = hashBytes(a);
    const take = Math.min(remaining, u);
    key.set(a.subarray(0, take), offset);
    remaining -= take;
    offset += take;
    if (remaining <= 0) break;
    // B = (A 复制到 v 字节) + 1
    const b = new Uint8Array(v);
    for (let i = 0; i < v; i += 1) b[i] = a[i % a.length];
    let carry = 1;
    for (let i = v - 1; i >= 0 && carry; i -= 1) {
      const sum = b[i] + carry;
      b[i] = sum & 0xff;
      carry = sum >> 8;
    }
    // 每个 64 字节块：I += B（块内大端加法，块间无进位）
    for (let j = 0; j < iVector.length; j += v) {
      let blockCarry = 0;
      for (let i = v - 1; i >= 0; i -= 1) {
        const sum = iVector[j + i] + b[i] + blockCarry;
        iVector[j + i] = sum & 0xff;
        blockCarry = sum >> 8;
      }
    }
  }
  return key;
}

// —— RC2（RFC 2268），用于解密旧版 PKCS#12（如 keytool JDK≤17 的证书保护） ——

const RC2_PI_TABLE = [
  0xd9, 0x78, 0xf9, 0xc4, 0x19, 0xdd, 0xb5, 0xed, 0x28, 0xe9, 0xfd, 0x79, 0x4a, 0xa0, 0xd8, 0x9d,
  0xc6, 0x7e, 0x37, 0x83, 0x2b, 0x76, 0x53, 0x8e, 0x62, 0x4c, 0x64, 0x88, 0x44, 0x8b, 0xfb, 0xa2,
  0x17, 0x9a, 0x59, 0xf5, 0x87, 0xb3, 0x4f, 0x13, 0x61, 0x45, 0x6d, 0x8d, 0x09, 0x81, 0x7d, 0x32,
  0xbd, 0x8f, 0x40, 0xeb, 0x86, 0xb7, 0x7b, 0x0b, 0xf0, 0x95, 0x21, 0x22, 0x5c, 0x6b, 0x4e, 0x82,
  0x54, 0xd6, 0x65, 0x93, 0xce, 0x60, 0xb2, 0x1c, 0x73, 0x56, 0xc0, 0x14, 0xa7, 0x8c, 0xf1, 0xdc,
  0x12, 0x75, 0xca, 0x1f, 0x3b, 0xbe, 0xe4, 0xd1, 0x42, 0x3d, 0xd4, 0x30, 0xa3, 0x3c, 0xb6, 0x26,
  0x6f, 0xbf, 0x0e, 0xda, 0x46, 0x69, 0x07, 0x57, 0x27, 0xf2, 0x1d, 0x9b, 0xbc, 0x94, 0x43, 0x03,
  0xf8, 0x11, 0xc7, 0xf6, 0x90, 0xef, 0x3e, 0xe7, 0x06, 0xc3, 0xd5, 0x2f, 0xc8, 0x66, 0x1e, 0xd7,
  0x08, 0xe8, 0xea, 0xde, 0x80, 0x52, 0xee, 0xf7, 0x84, 0xaa, 0x72, 0xac, 0x35, 0x4d, 0x6a, 0x2a,
  0x96, 0x1a, 0xd2, 0x71, 0x5a, 0x15, 0x49, 0x74, 0x4b, 0x9f, 0xd0, 0x5e, 0x04, 0x18, 0xa4, 0xec,
  0xc2, 0xe0, 0x41, 0x6e, 0x0f, 0x51, 0xcb, 0xcc, 0x24, 0x91, 0xaf, 0x50, 0xa1, 0xf4, 0x70, 0x39,
  0x99, 0x7c, 0x3a, 0x85, 0x23, 0xb8, 0xb4, 0x7a, 0xfc, 0x02, 0x36, 0x5b, 0x25, 0x55, 0x97, 0x31,
  0x2d, 0x5d, 0xfa, 0x98, 0xe3, 0x8a, 0x92, 0xae, 0x05, 0xdf, 0x29, 0x10, 0x67, 0x6c, 0xba, 0xc9,
  0xd3, 0x00, 0xe6, 0xcf, 0xe1, 0x9e, 0xa8, 0x2c, 0x63, 0x16, 0x01, 0x3f, 0x58, 0xe2, 0x89, 0xa9,
  0x0d, 0x38, 0x34, 0x1b, 0xab, 0x33, 0xff, 0xb0, 0xbb, 0x48, 0x0c, 0x5f, 0xb9, 0xb1, 0xcd, 0x2e,
  0xc5, 0xf3, 0xdb, 0x47, 0xe5, 0xa5, 0x9c, 0x77, 0x0a, 0xa6, 0x20, 0x68, 0xfe, 0x7f, 0xc1, 0xad,
];

function rc2ExpandKey(keyBytes: Uint8Array, effectiveBits: number): number[] {
  const t8 = Math.ceil(effectiveBits / 8);
  const tm = 255 % Math.pow(2, 8 + effectiveBits - 8 * t8);
  const l = new Array<number>(128).fill(0);
  const keyLen = Math.min(keyBytes.length, 128);
  for (let i = 0; i < keyLen; i += 1) l[i] = keyBytes[i];
  for (let i = keyLen; i < 128; i += 1) l[i] = RC2_PI_TABLE[(l[i - 1] + l[i - keyLen]) & 0xff];
  l[128 - t8] = RC2_PI_TABLE[l[128 - t8] & tm];
  for (let i = 127 - t8; i >= 0; i -= 1) l[i] = RC2_PI_TABLE[l[i + 1] ^ l[i + t8]];
  const k: number[] = [];
  for (let j = 0; j < 64; j += 1) k.push(l[2 * j] | (l[2 * j + 1] << 8));
  return k;
}

const rotl16 = (v: number, n: number) => ((v << n) | (v >>> (16 - n))) & 0xffff;
void rotl16;

function rc2DecryptBlock(k: number[], block: Uint8Array, offset: number): Uint8Array {
  let r0 = block[offset] | (block[offset + 1] << 8);
  let r1 = block[offset + 2] | (block[offset + 3] << 8);
  let r2 = block[offset + 4] | (block[offset + 5] << 8);
  let r3 = block[offset + 6] | (block[offset + 7] << 8);
  let j = 63;
  const rMixRound = () => {
    r3 = ((r3 >>> 5) | (r3 << 11)) & 0xffff;
    r3 = (r3 - k[j] - (r2 & r1) - (~r2 & r0)) & 0xffff;
    j -= 1;
    r2 = ((r2 >>> 3) | (r2 << 13)) & 0xffff;
    r2 = (r2 - k[j] - (r1 & r0) - (~r1 & r3)) & 0xffff;
    j -= 1;
    r1 = ((r1 >>> 2) | (r1 << 14)) & 0xffff;
    r1 = (r1 - k[j] - (r0 & r3) - (~r0 & r2)) & 0xffff;
    j -= 1;
    r0 = ((r0 >>> 1) | (r0 << 15)) & 0xffff;
    r0 = (r0 - k[j] - (r3 & r2) - (~r3 & r1)) & 0xffff;
    j -= 1;
  };
  const rMashRound = () => {
    r3 = (r3 - k[r2 & 63]) & 0xffff;
    r2 = (r2 - k[r1 & 63]) & 0xffff;
    r1 = (r1 - k[r0 & 63]) & 0xffff;
    r0 = (r0 - k[r3 & 63]) & 0xffff;
  };
  for (let i = 0; i < 5; i += 1) rMixRound();
  rMashRound();
  for (let i = 0; i < 6; i += 1) rMixRound();
  rMashRound();
  for (let i = 0; i < 5; i += 1) rMixRound();
  const out = new Uint8Array(8);
  out[0] = r0 & 0xff;
  out[1] = (r0 >>> 8) & 0xff;
  out[2] = r1 & 0xff;
  out[3] = (r1 >>> 8) & 0xff;
  out[4] = r2 & 0xff;
  out[5] = (r2 >>> 8) & 0xff;
  out[6] = r3 & 0xff;
  out[7] = (r3 >>> 8) & 0xff;
  return out;
}

function cbcDecrypt(blockSize: number, iv: Uint8Array, data: Uint8Array, decryptBlock: (block: Uint8Array, offset: number, out: Uint8Array, outOffset: number) => void): Uint8Array {
  if (data.length === 0 || data.length % blockSize !== 0) throw new Error("密文长度不合法");
  const out = new Uint8Array(data.length);
  let prev = Uint8Array.from(iv);
  for (let offset = 0; offset < data.length; offset += blockSize) {
    const decrypted = new Uint8Array(blockSize);
    decryptBlock(data, offset, decrypted, 0);
    for (let i = 0; i < blockSize; i += 1) {
      out[offset + i] = decrypted[i] ^ (prev[i] ?? 0);
    }
    prev = data.slice(offset, offset + blockSize);
  }
  return out;
}

function stripPkcs7Padding(data: Uint8Array, blockSize: number): Uint8Array {
  if (data.length === 0) throw new Error("解密结果为空");
  const pad = data[data.length - 1];
  if (!pad || pad < 1 || pad > blockSize) throw new Error("解密失败（填充无效，密码可能错误）");
  for (let i = data.length - pad; i < data.length; i += 1) {
    if (data[i] !== pad) throw new Error("解密失败（填充无效，密码可能错误）");
  }
  return data.slice(0, data.length - pad);
}

function des3CbcDecryptSync(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const decrypted = CryptoJS.TripleDES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: wordArrayFromBytes(data) }),
    wordArrayFromBytes(key),
    { iv: wordArrayFromBytes(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding },
  );
  return bytesFromWordArray(decrypted);
}

function aesCbcDecryptSync(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: wordArrayFromBytes(data) }),
    wordArrayFromBytes(key),
    { iv: wordArrayFromBytes(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding },
  );
  return bytesFromWordArray(decrypted);
}

function rc2CbcDecryptSync(keyBytes: Uint8Array, effectiveBits: number, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const k = rc2ExpandKey(keyBytes, effectiveBits);
  return cbcDecrypt(8, iv, data, (block, offset, out, outOffset) => {
    const plain = rc2DecryptBlock(k, block, offset);
    out.set(plain, outOffset);
  });
}

// —— PBES1 / PBES2 解密 ——

interface PbeParams {
  salt: Uint8Array;
  iterations: number;
}

function decryptPkcs12Pbe(oid: string, params: PbeParams, encrypted: Uint8Array, password: string): Uint8Array {
  const spec: Record<string, { keyLen: number; ivLen: number; kind: "des3" | "rc2-40" | "rc2-128" }> = {
    [OID.pbeWithShaAnd3KeyTripleDesCbc]: { keyLen: 24, ivLen: 8, kind: "des3" },
    [OID.pbeWithShaAnd2KeyTripleDesCbc]: { keyLen: 16, ivLen: 8, kind: "des3" },
    [OID.pbeWithShaAnd128BitRc2Cbc]: { keyLen: 16, ivLen: 8, kind: "rc2-128" },
    [OID.pbeWithShaAnd40BitRc2Cbc]: { keyLen: 5, ivLen: 8, kind: "rc2-40" },
  };
  const cfg = spec[oid];
  if (!cfg) throw new Error(`不支持的 PKCS#12 加密算法：${oid}`);
  const key = pkcs12Kdf(1, "sha1", password, params.salt, params.iterations, cfg.keyLen);
  const iv = pkcs12Kdf(2, "sha1", password, params.salt, params.iterations, cfg.ivLen);
  let plain: Uint8Array;
  if (cfg.kind === "des3") {
    plain = des3CbcDecryptSync(key, iv, encrypted);
  } else {
    plain = rc2CbcDecryptSync(key, cfg.kind === "rc2-40" ? 40 : 128, iv, encrypted);
  }
  return stripPkcs7Padding(plain, 8);
}

interface Pbes2Params {
  keyDerivation: { salt: Uint8Array; iterations: number; keyLength: number | null; prf: "sha1" | "sha256" };
  encryptionSchemeOid: string;
  schemeParams: { iv: Uint8Array; rc2EffectiveBits: number | null };
}

function decryptPbes2(params: Pbes2Params, encrypted: Uint8Array, password: string): Uint8Array {
  const keyLength = params.keyDerivation.keyLength ?? (params.encryptionSchemeOid === OID.aes256Cbc ? 32 : params.encryptionSchemeOid === OID.aes128Cbc ? 16 : params.encryptionSchemeOid === OID.aes192Cbc ? 24 : 24);
  const prfHasher = params.keyDerivation.prf === "sha256" ? CryptoJS.algo.SHA256 : CryptoJS.algo.SHA1;
  const keyWordArray = CryptoJS.PBKDF2(
    wordArrayFromBytes(new TextEncoder().encode(password)),
    wordArrayFromBytes(params.keyDerivation.salt),
    {
      keySize: keyLength / 4,
      iterations: params.keyDerivation.iterations,
      hasher: prfHasher,
    },
  );
  const key = bytesFromWordArray(keyWordArray);
  const iv = params.schemeParams.iv;
  let plain: Uint8Array;
  if (params.encryptionSchemeOid === OID.desEde3Cbc) {
    plain = des3CbcDecryptSync(key, iv, encrypted);
    return stripPkcs7Padding(plain, 8);
  }
  if (params.encryptionSchemeOid === OID.rc2Cbc) {
    const bits = params.schemeParams.rc2EffectiveBits ?? 128;
    plain = rc2CbcDecryptSync(key, bits, iv, encrypted);
    return stripPkcs7Padding(plain, 8);
  }
  if (params.encryptionSchemeOid === OID.aes128Cbc || params.encryptionSchemeOid === OID.aes256Cbc || params.encryptionSchemeOid === OID.aes192Cbc) {
    plain = aesCbcDecryptSync(key, iv, encrypted);
    return stripPkcs7Padding(plain, 16);
  }
  throw new Error(`不支持的 PBES2 加密算法：${params.encryptionSchemeOid}`);
}

/** 解析 AlgorithmIdentifier 并解密 PKCS#7 encryptedContent。 */
function decryptEncryptedContent(algElement: ReturnType<typeof derRead>, encrypted: Uint8Array, password: string): Uint8Array {
  const algChildren = derChildren(algElement);
  const oid = derOidToString(algChildren[0]);
  const paramsElement = algChildren[1];
  if (!oid || !paramsElement) throw new Error("加密算法参数缺失");

  if (oid === OID.pbes2) {
    // params: SEQ { keyDerivationFunc AlgId, encryptionScheme AlgId }
    const [kdfAlg, encAlg] = derChildren(paramsElement);
    if (!kdfAlg || !encAlg) throw new Error("PBES2 参数缺失");
    const kdfChildren = derChildren(kdfAlg);
    const kdfOid = derOidToString(kdfChildren[0]);
    if (kdfOid !== OID.pbkdf2) throw new Error(`不支持的密钥派生算法：${kdfOid}`);
    const kdfParamsChildren = derChildren(kdfChildren[1]);
    const salt = kdfParamsChildren[0].content;
    const iterations = derIntegerToNumber(kdfParamsChildren[1]);
    let keyLength: number | null = null;
    let prf: "sha1" | "sha256" = "sha1";
    if (kdfParamsChildren.length >= 3 && kdfParamsChildren[2].tag === DER_TAG.INTEGER) {
      keyLength = derIntegerToNumber(kdfParamsChildren[2]);
    }
    const prfElement = kdfParamsChildren.find((el) => el.tag === DER_TAG.SEQUENCE);
    if (prfElement) {
      const prfOid = derOidToString(derChildren(prfElement)[0]);
      prf = prfOid === OID.hmacWithSha256 ? "sha256" : "sha1";
    }
    const encChildren = derChildren(encAlg);
    const encOid = derOidToString(encChildren[0]);
    const encParams = derChildren(encAlg)[1];
    if (!encParams) throw new Error("加密方案参数缺失");
    if (encOid === OID.rc2Cbc) {
      // params: SEQ { rc2ParameterVersion INTEGER, iv OCTET STRING }
      const rc2Children = derChildren(encParams);
      const version = derIntegerToNumber(rc2Children[0]);
      const effectiveBits = version === 58 ? 128 : version === 120 ? 64 : version === 160 ? 40 : version === 16 ? 256 : version;
      return decryptPbes2(
        { keyDerivation: { salt, iterations, keyLength, prf }, encryptionSchemeOid: encOid, schemeParams: { iv: rc2Children[1].content, rc2EffectiveBits: effectiveBits } },
        encrypted,
        password,
      );
    }
    return decryptPbes2(
      { keyDerivation: { salt, iterations, keyLength, prf }, encryptionSchemeOid: encOid, schemeParams: { iv: encParams.content, rc2EffectiveBits: null } },
      encrypted,
      password,
    );
  }

  // PBES1: params: SEQ { salt OCTET STRING, iterationCount INTEGER }
  const pbeChildren = derChildren(paramsElement);
  const params: PbeParams = {
    salt: pbeChildren[0].content,
    iterations: derIntegerToNumber(pbeChildren[1]),
  };
  return decryptPkcs12Pbe(oid, params, encrypted, password);
}

// —— 读取 ——

export interface Pkcs12Parsed {
  key: { pkcs8: Uint8Array; alias: string; certDer: Uint8Array | null; localKeyId: string } | null;
  certificates: Array<{ certDer: Uint8Array; alias: string; localKeyId: string }>;
}

function parseSafeBags(safeContents: Uint8Array, password: string, parsed: Pkcs12Parsed): void {
  const root = derRead(safeContents);
  for (const bagElement of derChildren(root)) {
    const bagChildren = derChildren(bagElement);
    const bagId = derOidToString(bagChildren[0]);
    const bagValue = bagChildren[1];
    const attrsElement = bagChildren[2];
    let alias = "";
    let localKeyId = "";
    if (attrsElement && attrsElement.tag === DER_TAG.SET) {
      for (const attr of derChildren(attrsElement)) {
        const attrChildren = derChildren(attr);
        const attrOid = derOidToString(attrChildren[0]);
        const valueElement = derChildren(attrChildren[1])[0];
        if (attrOid === OID.friendlyName && valueElement) {
          alias = String.fromCharCode(...Array.from({ length: valueElement.content.length / 2 }, (_, i) => (valueElement.content[i * 2] << 8) | valueElement.content[i * 2 + 1]));
        } else if (attrOid === OID.localKeyId && valueElement) {
          localKeyId = Array.from(valueElement.content).map((b) => b.toString(16).padStart(2, "0")).join("");
        }
      }
    }

    if (bagId === OID.pkcs8ShroudedKeyBag && bagValue) {
      // bagValue [0] EXPLICIT → EncryptedPrivateKeyInfo
      const epkiElement = derChildren(bagValue)[0];
      if (!epkiElement) continue;
      const epkiChildren = derChildren(epkiElement);
      const plain = decryptEncryptedContent(epkiChildren[0], epkiChildren[1].content, password);
      const pkcs8 = plain;
      const existing = parsed.key;
      parsed.key = { pkcs8, alias, certDer: existing?.certDer ?? null, localKeyId };
      if (existing && !existing.alias && alias) existing.alias = alias;
    } else if (bagId === OID.keyBag && bagValue) {
      const pkcs8Element = derChildren(bagValue)[0];
      if (!pkcs8Element) continue;
      const existing = parsed.key;
      parsed.key = { pkcs8: pkcs8Element.full, alias, certDer: existing?.certDer ?? null, localKeyId };
    } else if (bagId === OID.certBag && bagValue) {
      // CertBag ::= SEQ { certId OID, certValue [0] EXPLICIT OCTET STRING }
      const certBagElement = derChildren(bagValue)[0];
      if (!certBagElement) continue;
      const certBagChildren = derChildren(certBagElement);
      const certId = derOidToString(certBagChildren[0]);
      if (certId !== OID.certTypesX509) continue;
      const certValueElement = derChildren(certBagChildren[1])[0];
      if (!certValueElement) continue;
      parsed.certificates.push({ certDer: certValueElement.content, alias, localKeyId });
    }
  }
}

function parseSafeContentsBytes(content: Uint8Array, password: string, parsed: Pkcs12Parsed): void {
  parseSafeBags(content, password, parsed);
}

export function readPkcs12(data: Uint8Array, password: string): Pkcs12Parsed {
  const parsed: Pkcs12Parsed = { key: null, certificates: [] };
  const pfx = derRead(data);
  const pfxChildren = derChildren(pfx);
  const version = derIntegerToNumber(pfxChildren[0]);
  if (version !== 3) throw new Error(`不支持的 PKCS#12 版本：${version}`);
  const authSafeInfo = pfxChildren[1];
  if (!authSafeInfo) throw new Error("PKCS#12 数据无效");

  // authSafe ContentInfo：SEQ { OID data, [0] EXPLICIT OCTET STRING }
  const authSafeChildren = derChildren(authSafeInfo);
  const authSafeContent = derChildren(authSafeChildren[1])[0].content;

  // MAC 校验
  const macDataElement = pfxChildren[2];
  if (macDataElement) {
    const macChildren = derChildren(macDataElement);
    const digestInfoChildren = derChildren(macChildren[0]);
    const digestAlgChildren = derChildren(digestInfoChildren[0]);
    const macOid = derOidToString(digestAlgChildren[0]);
    const storedMac = digestInfoChildren[1].content;
    const macSalt = macChildren[1].content;
    const macIterations = macChildren[2] ? derIntegerToNumber(macChildren[2]) : 1;
    const isSha256Mac = macOid === OID.hmacWithSha256 || macOid === OID.sha256;
    const keyLength = isSha256Mac ? 32 : 20;
    const key = pkcs12Kdf(3, isSha256Mac ? "sha256" : "sha1", password, macSalt, macIterations, keyLength);
    const hmacFn = isSha256Mac ? CryptoJS.HmacSHA256 : CryptoJS.HmacSHA1;
    const hmac = bytesFromWordArray(hmacFn(wordArrayFromBytes(authSafeContent), wordArrayFromBytes(key)));
    for (let i = 0; i < storedMac.length; i += 1) {
      if ((storedMac[i] ?? 0) !== (hmac[i] ?? 0)) {
        throw new Error("密码错误（MAC 校验失败）");
      }
    }
  }

  // AuthenticatedSafe ::= SEQUENCE OF ContentInfo
  const authenticatedSafe = derRead(authSafeContent);
  for (const contentInfo of derChildren(authenticatedSafe)) {
    const infoChildren = derChildren(contentInfo);
    const contentType = derOidToString(infoChildren[0]);
    // [0] EXPLICIT：data 类型内为 OCTET STRING，encryptedData 类型内直接是 EncryptedData SEQUENCE
    const contentElement = derChildren(infoChildren[1])[0];
    if (contentType === OID.data) {
      const safeContentsBytes = contentElement.tag === DER_TAG.OCTET_STRING ? contentElement.content : contentElement.full;
      parseSafeContentsBytes(safeContentsBytes, password, parsed);
    } else if (contentType === OID.encryptedData) {
      // EncryptedData ::= SEQ { version, encryptedContentInfo SEQ { contentType, algId, [0] cipher } }
      const encryptedDataElement = contentElement.tag === DER_TAG.SEQUENCE ? contentElement : derRead(contentElement.content);
      const encryptedDataChildren = derChildren(encryptedDataElement);
      const encryptedContentInfo = derChildren(encryptedDataChildren[1]);
      const algElement = encryptedContentInfo[1];
      const cipherElement = encryptedContentInfo[2];
      if (!algElement || !cipherElement) throw new Error("PKCS#12 加密数据无效");
      const plain = decryptEncryptedContent(algElement, cipherElement.content, password);
      parseSafeContentsBytes(plain, password, parsed);
    }
  }

  // 绑定私钥与证书：优先按 localKeyId 匹配，其次唯一证书直接配对
  if (parsed.key && !parsed.key.certDer) {
    const keyLocalId = parsed.key.localKeyId;
    const matched = keyLocalId ? parsed.certificates.find((cert) => cert.localKeyId === keyLocalId) : undefined;
    if (matched) {
      parsed.key.certDer = matched.certDer;
    } else if (parsed.certificates.length === 1) {
      parsed.key.certDer = parsed.certificates[0].certDer;
    }
  }
  return parsed;
}

// —— 写出（异步 WebCrypto） ——

export interface Pkcs12WriteInput {
  alias: string;
  pkcs8: Uint8Array;
  certDer: Uint8Array;
  password: string;
}

async function sha1BytesAsync(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-1", data as unknown as ArrayBuffer));
}

function bmpStringDer(text: string): Uint8Array {
  return new DerWriter().bmpString(text).bytes();
}

export async function writePkcs12(input: Pkcs12WriteInput): Promise<Uint8Array> {
  const { alias, pkcs8, certDer, password } = input;
  const iterations = 2048;

  // 加密私钥：PBES2(PBKDF2-HMAC-SHA256 + AES-256-CBC)
  const keySalt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password) as unknown as ArrayBuffer, "PBKDF2", false, ["deriveBits"]);
  const aesKeyBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: keySalt as unknown as ArrayBuffer, iterations },
    baseKey,
    256,
  );
  const aesKey = await crypto.subtle.importKey("raw", aesKeyBits, { name: "AES-CBC" }, false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: iv as unknown as ArrayBuffer }, aesKey, pkcs8 as unknown as ArrayBuffer));

  const pbkdf2Params = new DerWriter()
    .octetString(keySalt)
    .integer(iterations)
    .integer(32)
    .sequence(new DerWriter().oid(OID.hmacWithSha256).nullValue().bytes())
    .bytes();
  const pbkdf2Alg = derWrap(DER_TAG.SEQUENCE, concatBytes([new DerWriter().oid(OID.pbkdf2).bytes(), derWrap(DER_TAG.SEQUENCE, pbkdf2Params)]));
  const encSchemeAlg = derWrap(DER_TAG.SEQUENCE, concatBytes([new DerWriter().oid(OID.aes256Cbc).bytes(), new DerWriter().octetString(iv).bytes()]));
  const pbes2Params = derWrap(DER_TAG.SEQUENCE, concatBytes([pbkdf2Alg, encSchemeAlg]));
  const pbes2Alg = derWrap(DER_TAG.SEQUENCE, concatBytes([new DerWriter().oid(OID.pbes2).bytes(), pbes2Params]));
  const epki = derWrap(DER_TAG.SEQUENCE, concatBytes([pbes2Alg, new DerWriter().octetString(cipher).bytes()]));

  const localKeyId = await sha1BytesAsync(certDer);
  const bagAttributes = derWrap(
    DER_TAG.SET,
    concatBytes([
      derWrap(DER_TAG.SEQUENCE, concatBytes([new DerWriter().oid(OID.friendlyName).bytes(), derWrap(DER_TAG.SET, bmpStringDer(alias))])),
      derWrap(DER_TAG.SEQUENCE, concatBytes([new DerWriter().oid(OID.localKeyId).bytes(), derWrap(DER_TAG.SET, new DerWriter().octetString(localKeyId).bytes())])),
    ]),
  );

  const keyBag = derWrap(
    DER_TAG.SEQUENCE,
    concatBytes([
      new DerWriter().oid(OID.pkcs8ShroudedKeyBag).bytes(),
      derWrap(0xa0, epki),
      bagAttributes,
    ]),
  );
  const certBagValue = derWrap(
    DER_TAG.SEQUENCE,
    concatBytes([
      new DerWriter().oid(OID.certTypesX509).bytes(),
      derWrap(0xa0, new DerWriter().octetString(certDer).bytes()),
    ]),
  );
  const certBag = derWrap(
    DER_TAG.SEQUENCE,
    concatBytes([
      new DerWriter().oid(OID.certBag).bytes(),
      derWrap(0xa0, certBagValue),
      bagAttributes,
    ]),
  );
  const safeContents = derWrap(DER_TAG.SEQUENCE, concatBytes([keyBag, certBag]));
  const authSafeInnerContentInfo = derWrap(
    DER_TAG.SEQUENCE,
    concatBytes([
      new DerWriter().oid(OID.data).bytes(),
      derWrap(0xa0, new DerWriter().octetString(safeContents).bytes()),
    ]),
  );
  const authenticatedSafe = derWrap(DER_TAG.SEQUENCE, authSafeInnerContentInfo);
  const pfxAuthSafe = derWrap(
    DER_TAG.SEQUENCE,
    concatBytes([
      new DerWriter().oid(OID.data).bytes(),
      derWrap(0xa0, new DerWriter().octetString(authenticatedSafe).bytes()),
    ]),
  );

  // MacData：HMAC-SHA256，密钥用 PKCS#12 KDF(id=3, SHA-256)。
  // 算法标识沿用 JDK 的写法（裸 SHA-256 OID），openssl 与 keytool 均可识别。
  const macSalt = crypto.getRandomValues(new Uint8Array(16));
  const macKey = pkcs12Kdf(3, "sha256", password, macSalt, iterations, 32);
  const macDigest = bytesFromWordArray(CryptoJS.HmacSHA256(wordArrayFromBytes(authenticatedSafe), wordArrayFromBytes(macKey)));
  const digestInfo = derWrap(
    DER_TAG.SEQUENCE,
    concatBytes([
      derWrap(DER_TAG.SEQUENCE, concatBytes([new DerWriter().oid(OID.sha256).bytes(), new DerWriter().nullValue().bytes()])),
      new DerWriter().octetString(macDigest).bytes(),
    ]),
  );
  const macData = derWrap(
    DER_TAG.SEQUENCE,
    concatBytes([digestInfo, new DerWriter().octetString(macSalt).bytes(), new DerWriter().integer(iterations).bytes()]),
  );

  const pfxContent = concatBytes([
    new DerWriter().integer(3).bytes(),
    pfxAuthSafe,
    macData,
  ]);
  return derWrap(DER_TAG.SEQUENCE, pfxContent);
}
