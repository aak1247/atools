"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Format = "utf8" | "hex" | "base32" | "base58";

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

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

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const base32Encode = (bytes: Uint8Array, withPadding: boolean) => {
  let buffer = 0;
  let bits = 0;
  let out = "";
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += base32Alphabet[(buffer >> (bits - 5)) & 31] ?? "";
      bits -= 5;
    }
  }
  if (bits > 0) out += base32Alphabet[(buffer << (5 - bits)) & 31] ?? "";
  if (withPadding) {
    while (out.length % 8 !== 0) out += "=";
  }
  return out;
};

const base32Decode = (input: string) => {
  const normalized = input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/=+$/g, "");

  let buffer = 0;
  let bits = 0;
  const out: number[] = [];

  for (const ch of normalized) {
    const idx = base32Alphabet.indexOf(ch);
    if (idx < 0) throw new Error(`Base32 包含无效字符：${ch}`);
    buffer = (buffer << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(out);
};

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const base58Encode = (bytes: Uint8Array) => {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;

  const digits: number[] = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i] ?? 0;
    for (let j = 0; j < digits.length; j += 1) {
      const val = (digits[j] ?? 0) * 256 + carry;
      digits[j] = val % 58;
      carry = Math.floor(val / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  return "1".repeat(zeros) + digits.reverse().map((d) => base58Alphabet[d] ?? "").join("");
};

const base58Decode = (input: string) => {
  const normalized = input.trim().replace(/\s+/g, "");
  if (!normalized) return new Uint8Array();

  let zeros = 0;
  while (zeros < normalized.length && normalized[zeros] === "1") zeros += 1;

  const bytes: number[] = [0];
  for (let i = zeros; i < normalized.length; i += 1) {
    const ch = normalized[i] ?? "";
    const val = base58Alphabet.indexOf(ch);
    if (val < 0) throw new Error(`Base58 包含无效字符：${ch}`);

    let carry = val;
    for (let j = 0; j < bytes.length; j += 1) {
      const n = (bytes[j] ?? 0) * 58 + carry;
      bytes[j] = n & 0xff;
      carry = n >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const out = new Uint8Array(zeros + bytes.length);
  out.fill(0, 0, zeros);
  out.set(bytes.reverse(), zeros);
  return out;
};

const encodeBytes = (bytes: Uint8Array, format: Format, base32Padding: boolean) => {
  if (format === "hex") return bytesToHex(bytes);
  if (format === "base32") return base32Encode(bytes, base32Padding);
  if (format === "base58") return base58Encode(bytes);
  return new TextDecoder().decode(bytes);
};

const decodeToBytes = (text: string, format: Format) => {
  if (format === "hex") return hexToBytes(text);
  if (format === "base32") return base32Decode(text);
  if (format === "base58") return base58Decode(text);
  return new TextEncoder().encode(text);
};

export default function Base32Base58ConverterClient() {
  const [from, setFrom] = useState<Format>("utf8");
  const [to, setTo] = useState<Format>("base58");
  const [base32Padding, setBase32Padding] = useState(true);
  const [input, setInput] = useState("hello world");

  const result = useMemo(() => {
    try {
      const bytes = decodeToBytes(input, from);
      const out = encodeBytes(bytes, to, base32Padding);
      const hex = bytesToHex(bytes);
      const utf8 = (() => {
        try {
          return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          return null;
        }
      })();
      return { ok: true as const, out, bytes, hex, utf8 };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "转换失败" };
    }
  }, [base32Padding, from, input, to]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  return (
    <ToolPageLayout toolSlug="base32-base58-converter">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                输入格式
                <select
                  value={from}
                  onChange={(e) => setFrom(e.target.value as Format)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="utf8">UTF-8 文本</option>
                  <option value="hex">Hex</option>
                  <option value="base32">Base32</option>
                  <option value="base58">Base58</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                输出格式
                <select
                  value={to}
                  onChange={(e) => setTo(e.target.value as Format)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="utf8">UTF-8 文本</option>
                  <option value="hex">Hex</option>
                  <option value="base32">Base32</option>
                  <option value="base58">Base58</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                Base32 填充
                <input
                  type="checkbox"
                  checked={base32Padding}
                  onChange={(e) => setBase32Padding(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => void copy(result.ok ? result.out : "")}
              disabled={!result.ok || !result.out}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              复制输出
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">输入</div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="mt-3 h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              <div className="mt-3 text-xs text-slate-500">
                提示：Base58 使用 Bitcoin 字母表；Base32 使用 RFC4648 字母表（A-Z2-7）。
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">输出</div>
              </div>
              <textarea
                value={result.ok ? result.out : ""}
                readOnly
                className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
              {result.ok ? (
                <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  <div>字节数：{result.bytes.byteLength}</div>
                  <div className="sm:col-span-2">
                    Hex：<span className="font-mono break-all">{result.hex}</span>
                  </div>
                  <div className="sm:col-span-2">
                    UTF-8：<span className="font-mono break-all">{result.utf8 ?? "（无法解码）"}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                  错误：{result.error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}

