"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalI18n } from "../../../i18n/I18nProvider";

type AnyRecord = Record<string, unknown>;
type InputMode = "auto" | "pem" | "json" | "der-base64";
type DerHint = "auto" | "spki" | "pkcs8";

type Result = {
  inputSummary: string;
  isPrivate: boolean;
  keyInfo: Array<{ label: string; value: string }>;
  jwkPublic: JsonWebKey;
  jwkPrivate: JsonWebKey | null;
  jwksPublic: { keys: JsonWebKey[] };
  pemPublic: string;
  pemPrivate: string | null;
  derSpkiBase64: string;
  derPkcs8Base64: string | null;
};

const wrap64 = (value: string) => value.match(/.{1,64}/gu)?.join("\n") ?? value;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const cleaned = value.replace(/\s+/gu, "");
  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

const base64UrlToBytes = (value: string) => {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return base64ToBytes(padded);
};

const bytesToBase64Url = (bytes: Uint8Array) =>
  bytesToBase64(bytes).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");

const toArrayBufferU8 = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  const out = new Uint8Array(buffer);
  out.set(bytes);
  return out as Uint8Array<ArrayBuffer>;
};

const toPem = (label: string, bytes: Uint8Array) =>
  `-----BEGIN ${label}-----\n${wrap64(bytesToBase64(bytes))}\n-----END ${label}-----\n`;

const parsePemFirstBlock = (text: string): { label: string; bytes: Uint8Array } | null => {
  const match = text.match(/-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/u);
  if (!match) return null;
  const label = match[1]?.trim() ?? "";
  const body = match[2]?.trim() ?? "";
  if (!label || !body) return null;
  try {
    return { label, bytes: base64ToBytes(body) };
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is AnyRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const safeString = (value: unknown) => (typeof value === "string" ? value : "");

const isJwk = (value: unknown): value is JsonWebKey => isRecord(value) && typeof value.kty === "string";

const isJwks = (value: unknown): value is { keys: JsonWebKey[] } =>
  isRecord(value) && Array.isArray(value.keys) && value.keys.every((k) => isJwk(k));

const toPublicJwk = (jwk: JsonWebKey): JsonWebKey => {
  const result = { ...jwk } as JsonWebKey & AnyRecord;
  delete result.d;
  delete result.p;
  delete result.q;
  delete result.dp;
  delete result.dq;
  delete result.qi;
  delete result.oth;
  return result as JsonWebKey;
};

const getKeyAlgorithmForJwk = (jwk: JsonWebKey): RsaHashedImportParams | EcKeyImportParams => {
  if (jwk.kty === "RSA") return { name: "RSA-OAEP", hash: "SHA-256" } satisfies RsaHashedImportParams;
  if (jwk.kty === "EC") {
    const curve = safeString((jwk as AnyRecord).crv);
    if (!curve) throw new Error("MISSING_CRV");
    return { name: "ECDSA", namedCurve: curve } satisfies EcKeyImportParams;
  }
  throw new Error("UNSUPPORTED_KTY");
};

const getKeyUsagesForJwk = (jwk: JsonWebKey): KeyUsage[] => {
  const record = jwk as AnyRecord;
  const isPrivate = typeof record.d === "string" && record.d.length > 0;
  if (jwk.kty === "RSA") return isPrivate ? ["decrypt"] : ["encrypt"];
  if (jwk.kty === "EC") return isPrivate ? ["sign"] : ["verify"];
  return [];
};

const tryImportDerKey = async (format: "spki" | "pkcs8", bytes: Uint8Array) => {
  const isPrivate = format === "pkcs8";
  const normalizedBytes = toArrayBufferU8(bytes);

  const attempts: Array<{ algorithm: RsaHashedImportParams | EcKeyImportParams; usages: KeyUsage[] }> = [];
  attempts.push({ algorithm: { name: "RSA-OAEP", hash: "SHA-256" }, usages: isPrivate ? ["decrypt"] : ["encrypt"] });
  attempts.push({
    algorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    usages: isPrivate ? ["sign"] : ["verify"],
  });
  attempts.push({ algorithm: { name: "RSA-PSS", hash: "SHA-256" }, usages: isPrivate ? ["sign"] : ["verify"] });
  for (const namedCurve of ["P-256", "P-384", "P-521"]) {
    attempts.push({ algorithm: { name: "ECDSA", namedCurve }, usages: isPrivate ? ["sign"] : ["verify"] });
  }

  for (const a of attempts) {
    try {
      return await crypto.subtle.importKey(format, normalizedBytes, a.algorithm, true, a.usages);
    } catch {
      // try next
    }
  }
  throw new Error("IMPORT_FAILED");
};

const tryImportJwk = async (jwk: JsonWebKey) => {
  const normalizedJwk = jwk as unknown as JsonWebKey;
  const record = normalizedJwk as AnyRecord;
  const isPrivate = typeof record.d === "string" && record.d.length > 0;

  const attempts: Array<{ algorithm: RsaHashedImportParams | EcKeyImportParams; usages: KeyUsage[] }> = [];
  if (normalizedJwk.kty === "RSA") {
    attempts.push({ algorithm: { name: "RSA-OAEP", hash: "SHA-256" }, usages: isPrivate ? ["decrypt"] : ["encrypt"] });
    attempts.push({
      algorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      usages: isPrivate ? ["sign"] : ["verify"],
    });
    attempts.push({ algorithm: { name: "RSA-PSS", hash: "SHA-256" }, usages: isPrivate ? ["sign"] : ["verify"] });
  } else if (normalizedJwk.kty === "EC") {
    const curve = safeString(record.crv);
    if (!curve) throw new Error("MISSING_CRV");
    attempts.push({ algorithm: { name: "ECDSA", namedCurve: curve }, usages: isPrivate ? ["sign"] : ["verify"] });
  } else {
    throw new Error("UNSUPPORTED_KTY");
  }

  for (const a of attempts) {
    try {
      return await crypto.subtle.importKey("jwk", normalizedJwk, a.algorithm, true, a.usages);
    } catch {
      // try next
    }
  }
  throw new Error("IMPORT_FAILED");
};

const exportSpkiFromAnyKey = async (key: CryptoKey) => {
  if (key.type === "public") return new Uint8Array(await crypto.subtle.exportKey("spki", key));
  const jwkPrivate = (await crypto.subtle.exportKey("jwk", key)) as JsonWebKey;
  const jwkPublic = toPublicJwk(jwkPrivate);
  const alg = getKeyAlgorithmForJwk(jwkPublic);
  const pubKey = await crypto.subtle.importKey("jwk", jwkPublic, alg, true, getKeyUsagesForJwk(jwkPublic));
  return new Uint8Array(await crypto.subtle.exportKey("spki", pubKey));
};

const exportPkcs8IfPrivate = async (key: CryptoKey) => {
  if (key.type !== "private") return null;
  return new Uint8Array(await crypto.subtle.exportKey("pkcs8", key));
};

const sha256Base64Url = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBufferU8(bytes));
  return bytesToBase64Url(new Uint8Array(digest));
};

const computeJwkThumbprint = async (jwk: JsonWebKey) => {
  const kty = jwk.kty;
  if (!kty) return null;

  const members: Record<string, string> = {};
  const record = jwk as AnyRecord;

  if (kty === "RSA") {
    const e = safeString(record.e);
    const n = safeString(record.n);
    if (!e || !n) return null;
    members.e = e;
    members.kty = "RSA";
    members.n = n;
  } else if (kty === "EC") {
    const crv = safeString(record.crv);
    const x = safeString(record.x);
    const y = safeString(record.y);
    if (!crv || !x || !y) return null;
    members.crv = crv;
    members.kty = "EC";
    members.x = x;
    members.y = y;
  } else {
    return null;
  }

  const canonical = `{${Object.keys(members)
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((k) => `${JSON.stringify(k)}:${JSON.stringify(members[k] ?? "")}`)
    .join(",")}}`;

  return sha256Base64Url(new TextEncoder().encode(canonical));
};

const getRsaBits = (jwk: JsonWebKey) => {
  const n = safeString((jwk as AnyRecord).n);
  if (!n) return null;
  try {
    return base64UrlToBytes(n).length * 8;
  } catch {
    return null;
  }
};

const copyText = async (text: string) => {
  if (!text) return;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-10000px";
  textarea.style.top = "-10000px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
};

export default function PemJwkToolkitClient() {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";

  const ui = useMemo(() => {
    if (locale === "en-us") {
      return {
        hint: "Convert PEM/DER/JWK/JWKS locally (no uploads).",
        input: "Input",
        inputMode: "Input mode",
        derHint: "DER format",
        parse: "Parse & convert",
        parsing: "Working…",
        detected: "Detected",
        outputs: "Outputs",
        keyInfo: "Key info",
        publicJwk: "Public JWK",
        privateJwk: "Private JWK",
        publicJwks: "JWKS (public)",
        pemPublic: "PEM (PUBLIC KEY)",
        pemPrivate: "PEM (PRIVATE KEY)",
        derSpki: "DER (SPKI) Base64",
        derPkcs8: "DER (PKCS8) Base64",
        copy: "Copy",
        clear: "Clear",
        notAvailable: "Not available",
        needInput: "Please paste content first.",
        unsupportedPem: "Unsupported PEM label (supported: PUBLIC KEY, PRIVATE KEY).",
        unsupportedKty: "Unsupported key type (supported: RSA, EC).",
        parseFailed: "Failed to parse or convert.",
        auto: "Auto",
        pem: "PEM",
        json: "JWK/JWKS JSON",
        derBase64: "DER Base64",
        derAuto: "Auto (try SPKI then PKCS8)",
        spki: "SPKI (public)",
        pkcs8: "PKCS8 (private)",
      };
    }
    return {
      hint: "PEM/DER/JWK/JWKS 互转与字段展示，全程本地处理，不上传任何密钥。",
      input: "输入",
      inputMode: "输入类型",
      derHint: "DER 格式",
      parse: "解析并转换",
      parsing: "处理中…",
      detected: "识别结果",
      outputs: "输出",
      keyInfo: "密钥信息",
      publicJwk: "公钥 JWK",
      privateJwk: "私钥 JWK",
      publicJwks: "公钥 JWKS",
      pemPublic: "PEM（PUBLIC KEY）",
      pemPrivate: "PEM（PRIVATE KEY）",
      derSpki: "DER（SPKI）Base64",
      derPkcs8: "DER（PKCS8）Base64",
      copy: "复制",
      clear: "清空",
      notAvailable: "不可用",
      needInput: "请先粘贴内容。",
      unsupportedPem: "不支持的 PEM 类型（仅支持 PUBLIC KEY / PRIVATE KEY）。",
      unsupportedKty: "不支持的密钥类型（仅支持 RSA / EC）。",
      parseFailed: "解析或转换失败。",
      auto: "自动识别",
      pem: "PEM",
      json: "JWK/JWKS JSON",
      derBase64: "DER Base64",
      derAuto: "自动（先尝试 SPKI 再尝试 PKCS8）",
      spki: "SPKI（公钥）",
      pkcs8: "PKCS8（私钥）",
    };
  }, [locale]);

  const [input, setInput] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("auto");
  const [derHint, setDerHint] = useState<DerHint>("auto");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const clearAll = () => {
    setInput("");
    setError(null);
    setResult(null);
    setInputMode("auto");
    setDerHint("auto");
  };

  const parseAndConvert = async () => {
    const raw = input.trim();
    if (!raw) {
      setError(ui.needInput);
      setResult(null);
      return;
    }

    setIsWorking(true);
    setError(null);
    setResult(null);

    try {
      let mode: InputMode = inputMode;
      if (mode === "auto") {
        if (/-----BEGIN [^-]+-----/u.test(raw)) mode = "pem";
        else if (raw.startsWith("{") || raw.startsWith("[")) mode = "json";
        else mode = "der-base64";
      }

      let key: CryptoKey;
      let summary: string = mode;

      if (mode === "pem") {
        const block = parsePemFirstBlock(raw);
        if (!block) throw new Error("PARSE_FAILED");
        const label = block.label.toUpperCase();
        if (label.includes("PUBLIC KEY")) {
          key = await tryImportDerKey("spki", block.bytes);
          summary = "PEM: PUBLIC KEY";
        } else if (label.includes("PRIVATE KEY")) {
          key = await tryImportDerKey("pkcs8", block.bytes);
          summary = "PEM: PRIVATE KEY";
        } else {
          throw new Error("UNSUPPORTED_PEM");
        }
      } else if (mode === "der-base64") {
        const bytes = base64ToBytes(raw);
        if (derHint === "spki") {
          key = await tryImportDerKey("spki", bytes);
          summary = "DER Base64: SPKI";
        } else if (derHint === "pkcs8") {
          key = await tryImportDerKey("pkcs8", bytes);
          summary = "DER Base64: PKCS8";
        } else {
          try {
            key = await tryImportDerKey("spki", bytes);
            summary = "DER Base64: SPKI";
          } catch {
            key = await tryImportDerKey("pkcs8", bytes);
            summary = "DER Base64: PKCS8";
          }
        }
      } else {
        const parsed = JSON.parse(raw) as unknown;
        const jwk = isJwks(parsed) ? parsed.keys[0] : isJwk(parsed) ? parsed : null;
        if (!jwk) throw new Error("PARSE_FAILED");
        if (jwk.kty !== "RSA" && jwk.kty !== "EC") throw new Error("UNSUPPORTED_KTY");
        key = await tryImportJwk(jwk);
        summary = isJwks(parsed) ? "JWKS (first key)" : "JWK";
      }

      const isPrivate = key.type === "private";
      const jwkExported = (await crypto.subtle.exportKey("jwk", key)) as JsonWebKey;
      const jwkPrivate = isPrivate ? jwkExported : null;
      const jwkPublic = isPrivate ? toPublicJwk(jwkExported) : jwkExported;

      if (jwkPublic.kty !== "RSA" && jwkPublic.kty !== "EC") throw new Error("UNSUPPORTED_KTY");

      const spkiBytes = await exportSpkiFromAnyKey(key);
      const pkcs8Bytes = await exportPkcs8IfPrivate(key);

      const thumbprint = await computeJwkThumbprint(jwkPublic);
      const spkiSha256 = await sha256Base64Url(spkiBytes);
      const rsaBits = jwkPublic.kty === "RSA" ? getRsaBits(jwkPublic) : null;

      const info: Array<{ label: string; value: string }> = [];
      info.push({ label: "kty", value: jwkPublic.kty ?? "-" });
      if (jwkPublic.kty === "EC") info.push({ label: "crv", value: safeString((jwkPublic as AnyRecord).crv) || "-" });
      if (rsaBits) info.push({ label: "bits", value: String(rsaBits) });
      info.push({ label: "private", value: isPrivate ? "true" : "false" });
      if (thumbprint) info.push({ label: "jwk thumbprint (RFC7638)", value: thumbprint });
      info.push({ label: "spki sha256 (base64url)", value: spkiSha256 });

      const out: Result = {
        inputSummary: summary,
        isPrivate,
        keyInfo: info,
        jwkPublic,
        jwkPrivate,
        jwksPublic: { keys: [jwkPublic] },
        pemPublic: toPem("PUBLIC KEY", spkiBytes),
        pemPrivate: pkcs8Bytes ? toPem("PRIVATE KEY", pkcs8Bytes) : null,
        derSpkiBase64: bytesToBase64(spkiBytes),
        derPkcs8Base64: pkcs8Bytes ? bytesToBase64(pkcs8Bytes) : null,
      };

      setResult(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "PARSE_FAILED";
      if (msg === "UNSUPPORTED_PEM") setError(ui.unsupportedPem);
      else if (msg === "UNSUPPORTED_KTY") setError(ui.unsupportedKty);
      else if (msg === "IMPORT_FAILED") setError(ui.parseFailed);
      else if (msg === "MISSING_CRV") setError(ui.parseFailed);
      else setError(ui.parseFailed);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <ToolPageLayout toolSlug="pem-jwk-toolkit">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 backdrop-blur dark:border-slate-700 dark:bg-slate-950/60">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{ui.hint}</div>
              {result ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {ui.detected}: {result.inputSummary}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={parseAndConvert}
                disabled={isWorking}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isWorking ? ui.parsing : ui.parse}
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {ui.clear}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <div className="grid gap-2">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.inputMode}</div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={inputMode}
                    onChange={(e) => setInputMode(e.target.value as InputMode)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="auto">{ui.auto}</option>
                    <option value="pem">{ui.pem}</option>
                    <option value="json">{ui.json}</option>
                    <option value="der-base64">{ui.derBase64}</option>
                  </select>
                  <select
                    value={derHint}
                    onChange={(e) => setDerHint(e.target.value as DerHint)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    disabled={inputMode !== "der-base64" && inputMode !== "auto"}
                  >
                    <option value="auto">{ui.derAuto}</option>
                    <option value="spki">{ui.spki}</option>
                    <option value="pkcs8">{ui.pkcs8}</option>
                  </select>
                </div>
              </div>

              <label className="grid gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.input}</span>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n\n{ \"kty\": \"RSA\", ... }\n\n(base64 DER)`}
                  className="min-h-64 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.keyInfo}</div>
              {result ? (
                <div className="grid gap-2 text-sm">
                  <div className="grid gap-1">
                    {result.keyInfo.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">{row.label}</div>
                        <div className="truncate font-mono text-xs text-slate-900 dark:text-slate-100">{row.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500 dark:text-slate-400">{ui.notAvailable}</div>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{ui.outputs}</div>

              <div className="grid gap-4 md:grid-cols-2">
                {(
                  [
                    { title: ui.publicJwk, value: result ? JSON.stringify(result.jwkPublic, null, 2) : "" },
                    { title: ui.privateJwk, value: result?.jwkPrivate ? JSON.stringify(result.jwkPrivate, null, 2) : "" },
                    { title: ui.publicJwks, value: result ? JSON.stringify(result.jwksPublic, null, 2) : "" },
                    { title: ui.pemPublic, value: result ? result.pemPublic : "" },
                    { title: ui.pemPrivate, value: result?.pemPrivate ?? "" },
                    { title: ui.derSpki, value: result ? result.derSpkiBase64 : "" },
                    { title: ui.derPkcs8, value: result?.derPkcs8Base64 ?? "" },
                  ] as const
                ).map((item) => (
                  <div key={item.title} className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{item.title}</div>
                      <button
                        type="button"
                        onClick={() => copyText(item.value)}
                        disabled={!item.value}
                        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        {ui.copy}
                      </button>
                    </div>
                    <textarea
                      value={item.value || ""}
                      readOnly
                      placeholder={ui.notAvailable}
                      className="min-h-28 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
