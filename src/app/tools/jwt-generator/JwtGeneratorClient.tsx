"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Algo = "none" | "HS256" | "HS384" | "HS512";
type SecretEncoding = "text" | "base64" | "hex";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const safeJsonParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string) => {
  const normalized = base64.replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const hexToBytes = (hex: string) => {
  const normalized = hex.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (normalized.length === 0) return new Uint8Array();
  if (normalized.length % 2 !== 0) throw new Error("Hex 长度必须为偶数（每 2 位一个字节）。");
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
    if (!Number.isFinite(byte)) throw new Error("Hex 包含无效字符。");
    out[i] = byte;
  }
  return out;
};

const base64UrlEncode = (bytes: Uint8Array) =>
  bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const textToBytes = (text: string) => new TextEncoder().encode(text);

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const algoToHash = (algo: Algo): "SHA-256" | "SHA-384" | "SHA-512" => {
  if (algo === "HS384") return "SHA-384";
  if (algo === "HS512") return "SHA-512";
  return "SHA-256";
};

const deriveSecretBytes = (secret: string, encoding: SecretEncoding): Uint8Array => {
  if (encoding === "text") return textToBytes(secret);
  if (encoding === "hex") return hexToBytes(secret);
  return base64ToBytes(secret);
};

const formatJsonMaybe = (value: string) => {
  const parsed = safeJsonParse(value);
  if (parsed === null) return value;
  return JSON.stringify(parsed, null, 2);
};

export default function JwtGeneratorClient() {
  const [algo, setAlgo] = useState<Algo>("HS256");
  const [secretEncoding, setSecretEncoding] = useState<SecretEncoding>("text");
  const [secret, setSecret] = useState("");

  const [headerText, setHeaderText] = useState(`{\n  \"typ\": \"JWT\"\n}`);
  const [payloadText, setPayloadText] = useState(`{\n  \"sub\": \"1234567890\",\n  \"name\": \"John Doe\",\n  \"iat\": 1516239022\n}`);

  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const headerPreview = useMemo(() => {
    const parsed = safeJsonParse(headerText);
    if (parsed === null) return { ok: false as const, error: "Header 不是合法 JSON。" };
    if (!isRecord(parsed)) return { ok: false as const, error: "Header 必须是 JSON 对象。" };
    return { ok: true as const, value: parsed };
  }, [headerText]);

  const payloadPreview = useMemo(() => {
    const parsed = safeJsonParse(payloadText);
    if (parsed === null) return { ok: false as const, error: "Payload 不是合法 JSON。" };
    if (!isRecord(parsed)) return { ok: true as const, value: parsed, warn: "提示：JWT payload 通常是对象（object）。" };
    return { ok: true as const, value: parsed };
  }, [payloadText]);

  const applyIatExp = (ttlSeconds: number) => {
    const parsed = safeJsonParse(payloadText);
    if (!isRecord(parsed)) return;
    const now = Math.floor(Date.now() / 1000);
    parsed.iat = now;
    parsed.exp = now + ttlSeconds;
    setPayloadText(JSON.stringify(parsed, null, 2));
  };

  const generate = async () => {
    setError(null);

    if (!headerPreview.ok) {
      setError(headerPreview.error);
      return;
    }

    if (!payloadPreview.ok) {
      setError(payloadPreview.error);
      return;
    }

    const header = { ...headerPreview.value, alg: algo };
    const headerPart = base64UrlEncode(textToBytes(JSON.stringify(header)));
    const payloadPart = base64UrlEncode(textToBytes(JSON.stringify(payloadPreview.value)));
    const signingInput = `${headerPart}.${payloadPart}`;

    if (algo === "none") {
      setToken(`${signingInput}.`);
      return;
    }

    if (!secret.trim()) {
      setError("请填写密钥（Secret）。");
      return;
    }

    try {
      const secretBytes = deriveSecretBytes(secret, secretEncoding);
      const key = await crypto.subtle.importKey(
        "raw",
        toArrayBuffer(secretBytes),
        { name: "HMAC", hash: algoToHash(algo) },
        false,
        ["sign"],
      );
      const sigBuffer = await crypto.subtle.sign("HMAC", key, toArrayBuffer(textToBytes(signingInput)));
      const sigBytes = new Uint8Array(sigBuffer);
      const signaturePart = base64UrlEncode(sigBytes);
      setToken(`${signingInput}.${signaturePart}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  return (
    <ToolPageLayout toolSlug="jwt-generator">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                算法
                <select
                  value={algo}
                  onChange={(e) => setAlgo(e.target.value as Algo)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="HS256">HS256</option>
                  <option value="HS384">HS384</option>
                  <option value="HS512">HS512</option>
                  <option value="none">none</option>
                </select>
              </label>

              {algo !== "none" && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  Secret 格式
                  <select
                    value={secretEncoding}
                    onChange={(e) => setSecretEncoding(e.target.value as SecretEncoding)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value="text">文本</option>
                    <option value="base64">Base64</option>
                    <option value="hex">Hex</option>
                  </select>
                </label>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHeaderText((v) => formatJsonMaybe(v))}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
              >
                格式化 Header
              </button>
              <button
                type="button"
                onClick={() => setPayloadText((v) => formatJsonMaybe(v))}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
              >
                格式化 Payload
              </button>
              <button
                type="button"
                onClick={() => applyIatExp(3600)}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
              >
                iat/exp(+1h)
              </button>
              <button
                type="button"
                onClick={() => void generate()}
                className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                生成 JWT
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">Header JSON</div>
              <textarea
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                className="mt-3 h-56 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              {!headerPreview.ok && <div className="mt-2 text-sm text-rose-600">错误：{headerPreview.error}</div>}
              <div className="mt-3 text-xs text-slate-500">
                说明：生成时会强制写入 <span className="font-mono">alg</span> 为上方所选算法。
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">Payload JSON</div>
              <textarea
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                className="mt-3 h-56 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              {!payloadPreview.ok && <div className="mt-2 text-sm text-rose-600">错误：{payloadPreview.error}</div>}
              {payloadPreview.ok && "warn" in payloadPreview && (
                <div className="mt-2 text-sm text-amber-700">提示：{payloadPreview.warn}</div>
              )}
            </div>
          </div>

          {algo !== "none" && (
            <div className="mt-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">Secret</div>
              <textarea
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={secretEncoding === "text" ? "输入密钥文本…" : secretEncoding === "hex" ? "例如：001122AABB…" : "例如：c2VjcmV0"}
                className="mt-3 h-20 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              <div className="mt-3 text-xs text-slate-500">提示：该工具只在本地浏览器使用 Web Crypto 计算签名，不上传密钥与内容。</div>
            </div>
          )}

          <div className="mt-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">生成结果</div>
              <button
                type="button"
                onClick={() => void copy(token)}
                disabled={!token}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                复制 JWT
              </button>
            </div>
            <textarea
              value={token}
              readOnly
              placeholder="点击“生成 JWT”后会在这里输出 token…"
              className="h-32 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
            {error && (
              <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                错误：{error}
              </div>
            )}
            <div className="mt-3 text-xs text-slate-500">
              兼容性：HS* 使用 HMAC（SHA-256/384/512）生成签名；如需 RS256/ES256 等非对称算法，可配合站内 RSA 密钥生成器导出密钥后在后续版本支持。
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
