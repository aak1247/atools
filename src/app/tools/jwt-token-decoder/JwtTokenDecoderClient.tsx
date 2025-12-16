"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

const base64UrlToBytes = (input: string): Uint8Array => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const base64 = normalized + "=".repeat(padLength);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const base64UrlDecodeText = (input: string): string => new TextDecoder().decode(base64UrlToBytes(input));

const safeJsonParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const formatDateTime = (seconds: unknown): string | null => {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const ms = seconds * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
};

export default function JwtTokenDecoderClient() {
  const [token, setToken] = useState("");

  const result = useMemo(() => {
    const value = token.trim();
    if (!value) {
      return { ok: true as const, headerText: "", payloadText: "", signatureText: "", signatureOk: true, meta: null as null };
    }

    const parts = value.split(".");
    if (parts.length !== 3) {
      return { ok: false as const, error: "JWT 必须包含 3 段（header.payload.signature）。" };
    }

    const [headerPart, payloadPart, signaturePart] = parts;

    try {
      const headerRaw = base64UrlDecodeText(headerPart);
      const payloadRaw = base64UrlDecodeText(payloadPart);
      const headerJson = safeJsonParse(headerRaw);
      const payloadJson = safeJsonParse(payloadRaw);

      const headerText = isRecord(headerJson) ? JSON.stringify(headerJson, null, 2) : headerRaw;
      const payloadText = isRecord(payloadJson) ? JSON.stringify(payloadJson, null, 2) : payloadRaw;

      const signatureOk = (() => {
        try {
          base64UrlToBytes(signaturePart);
          return true;
        } catch {
          return false;
        }
      })();

      const meta = isRecord(payloadJson)
        ? {
            alg: isRecord(headerJson) && typeof headerJson.alg === "string" ? headerJson.alg : null,
            typ: isRecord(headerJson) && typeof headerJson.typ === "string" ? headerJson.typ : null,
            iss: typeof payloadJson.iss === "string" ? payloadJson.iss : null,
            sub: typeof payloadJson.sub === "string" ? payloadJson.sub : null,
            aud: payloadJson.aud ?? null,
            exp: formatDateTime(payloadJson.exp),
            nbf: formatDateTime(payloadJson.nbf),
            iat: formatDateTime(payloadJson.iat),
          }
        : null;

      return {
        ok: true as const,
        headerText,
        payloadText,
        signatureText: signaturePart,
        signatureOk,
        meta,
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "解码失败，请检查 token 是否正确。" };
    }
  }, [token]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <ToolPageLayout toolSlug="jwt-token-decoder">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">JWT 输入</div>
              <textarea
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
                className="mt-3 h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              <div className="mt-3 text-xs text-slate-500">
                说明：该工具仅解码并展示 header/payload，不进行签名验证（不会要求你输入密钥）。
              </div>
              {!result.ok && (
                <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                  错误：{result.error}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">结构信息</div>
              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <div>
                  算法：<span className="font-mono">{result.ok ? result.meta?.alg ?? "-" : "-"}</span>
                </div>
                <div>
                  类型：<span className="font-mono">{result.ok ? result.meta?.typ ?? "-" : "-"}</span>
                </div>
                <div className="sm:col-span-2">
                  过期（exp）：<span className="font-mono">{result.ok ? result.meta?.exp ?? "-" : "-"}</span>
                </div>
                <div className="sm:col-span-2">
                  生效（nbf）：<span className="font-mono">{result.ok ? result.meta?.nbf ?? "-" : "-"}</span>
                </div>
                <div className="sm:col-span-2">
                  签发（iat）：<span className="font-mono">{result.ok ? result.meta?.iat ?? "-" : "-"}</span>
                </div>
              </div>

              {result.ok && (
                <div
                  className={`mt-4 rounded-2xl px-4 py-3 text-sm ring-1 ${
                    result.signatureOk ? "bg-emerald-50 text-emerald-900 ring-emerald-100" : "bg-amber-50 text-amber-900 ring-amber-100"
                  }`}
                >
                  签名段格式：{result.signatureOk ? "看起来正常（可 Base64URL 解码）" : "异常（无法 Base64URL 解码）"}
                </div>
              )}

              <div className="mt-4 text-xs text-slate-500">
                提示：JWT payload 中的 exp/nbf/iat 通常是 Unix 秒时间戳；该工具会自动转换为本地时间显示。
              </div>
            </div>
          </div>

          {result.ok && (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">Header</div>
                  <button
                    type="button"
                    onClick={() => void copy(result.headerText)}
                    disabled={!result.headerText}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    复制
                  </button>
                </div>
                <textarea
                  value={result.headerText}
                  readOnly
                  className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                />
              </div>

              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">Payload</div>
                  <button
                    type="button"
                    onClick={() => void copy(result.payloadText)}
                    disabled={!result.payloadText}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    复制
                  </button>
                </div>
                <textarea
                  value={result.payloadText}
                  readOnly
                  className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                />
              </div>
            </div>
          )}

          {result.ok && (
            <div className="mt-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">Signature</div>
                <button
                  type="button"
                  onClick={() => void copy(result.signatureText)}
                  disabled={!result.signatureText}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  复制
                </button>
              </div>
              <textarea
                value={result.signatureText}
                readOnly
                className="h-24 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
            </div>
          )}
        </div>
      </div>
    </ToolPageLayout>
  );
}

