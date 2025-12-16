"use client";

import { useEffect, useMemo, useState } from "react";

type Algorithm = "MD5" | "SHA-1" | "SHA-256" | "SHA-512";
type Target = "text" | "file";

const bytesToHex = (bytes: Uint8Array, upper: boolean) => {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return upper ? hex.toUpperCase() : hex;
};

const normalizeHex = (value: string) =>
  value.trim().replace(/\s+/g, "").toLowerCase();

const leftRotate = (x: number, c: number) => ((x << c) | (x >>> (32 - c))) >>> 0;

const md5Bytes = (input: Uint8Array) => {
  const originalLength = input.length;
  const bitLength = originalLength * 8;

  const paddingLength = (56 - ((originalLength + 1) % 64) + 64) % 64;
  const totalLength = originalLength + 1 + paddingLength + 8;
  const buffer = new Uint8Array(totalLength);
  buffer.set(input, 0);
  buffer[originalLength] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(totalLength - 8, bitLength >>> 0, true);
  view.setUint32(totalLength - 4, Math.floor(bitLength / 2 ** 32) >>> 0, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ] as const;

  const k = Array.from({ length: 64 }, (_, i) =>
    Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0,
  );

  for (let offset = 0; offset < buffer.length; offset += 64) {
    const m = new Uint32Array(16);
    for (let i = 0; i < 16; i += 1) {
      m[i] = view.getUint32(offset + i * 4, true);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i += 1) {
      let f = 0;
      let g = 0;

      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const temp = d;
      d = c;
      c = b;
      const sum = (a + (f >>> 0) + k[i] + m[g]) >>> 0;
      b = (b + leftRotate(sum, s[i])) >>> 0;
      a = temp;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const words = [a0, b0, c0, d0];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    out[i * 4 + 0] = word & 0xff;
    out[i * 4 + 1] = (word >>> 8) & 0xff;
    out[i * 4 + 2] = (word >>> 16) & 0xff;
    out[i * 4 + 3] = (word >>> 24) & 0xff;
  }
  return out;
};

const digestBytes = async (algorithm: Algorithm, data: Uint8Array) => {
  if (algorithm === "MD5") return md5Bytes(data);
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  const hash = await crypto.subtle.digest(algorithm, buffer);
  return new Uint8Array(hash);
};

export default function HashToolsClient() {
  const [target, setTarget] = useState<Target>("text");
  const [algorithm, setAlgorithm] = useState<Algorithm>("SHA-256");
  const [upper, setUpper] = useState(false);

  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [expected, setExpected] = useState("");

  const [hashHex, setHashHex] = useState<string>("");
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expectedNormalized = useMemo(() => normalizeHex(expected), [expected]);
  const hashNormalized = useMemo(() => normalizeHex(hashHex), [hashHex]);
  const matches =
    expectedNormalized.length > 0 &&
    hashNormalized.length > 0 &&
    expectedNormalized === hashNormalized;

  useEffect(() => {
    let cancelled = false;

    const compute = async () => {
      setError(null);
      setHashHex("");

      if (target === "text") {
        setIsComputing(true);
        try {
          const bytes = new TextEncoder().encode(text);
          const digest = await digestBytes(algorithm, bytes);
          if (cancelled) return;
          setHashHex(bytesToHex(digest, upper));
        } catch (e) {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : "计算失败");
        } finally {
          if (!cancelled) setIsComputing(false);
        }
        return;
      }

      setIsComputing(false);
    };

    void compute();

    return () => {
      cancelled = true;
    };
  }, [algorithm, target, text, upper]);

  const computeFileHash = async () => {
    if (!file) return;
    setError(null);
    setIsComputing(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const digest = await digestBytes(algorithm, bytes);
      setHashHex(bytesToHex(digest, upper));
    } catch (e) {
      setError(e instanceof Error ? e.message : "计算失败");
    } finally {
      setIsComputing(false);
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          哈希生成与校验
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          支持 MD5 / SHA1 / SHA256 / SHA512（文本与文件），纯本地计算
        </p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-2xl bg-slate-100/60 p-1">
            <button
              type="button"
              onClick={() => {
                setTarget("text");
                setFile(null);
                setExpected("");
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                target === "text"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              文本
            </button>
            <button
              type="button"
              onClick={() => {
                setTarget("file");
                setHashHex("");
                setExpected("");
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                target === "file"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              文件
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              算法
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value as Algorithm)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              >
                <option value="MD5">MD5</option>
                <option value="SHA-1">SHA1</option>
                <option value="SHA-256">SHA256</option>
                <option value="SHA-512">SHA512</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={upper}
                onChange={(e) => setUpper(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              大写
            </label>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {target === "text" ? "输入文本" : "选择文件"}
            </div>

            {target === "text" ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="输入要计算哈希的文本…"
                className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-800 hover:file:bg-slate-200"
                />
                <div className="mt-3 text-xs text-slate-500">
                  {file ? `${file.name}（${file.size.toLocaleString()} 字节）` : "未选择文件"}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={computeFileHash}
                    disabled={!file || isComputing}
                    className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {isComputing ? "计算中…" : "计算哈希"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setHashHex("");
                      setExpected("");
                      setError(null);
                    }}
                    className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    清空
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">哈希值</div>
              <button
                type="button"
                disabled={!hashHex}
                onClick={() => copy(hashHex)}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                复制
              </button>
            </div>

            <textarea
              value={hashHex}
              readOnly
              placeholder={target === "file" ? "点击“计算哈希”后显示…" : "自动计算并显示…"}
              className="h-36 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />

            <div className="mt-4">
              <div className="mb-2 text-sm font-semibold text-slate-900">校验（可选）</div>
              <input
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder="粘贴期望哈希值（忽略大小写与空白）…"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              {expectedNormalized && hashNormalized && (
                <div
                  className={`mt-2 text-sm font-medium ${
                    matches ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {matches ? "一致" : "不一致"}
                </div>
              )}
            </div>

            {error && <div className="mt-3 text-sm text-rose-600">错误：{error}</div>}

            {target === "text" && (
              <div className="mt-3 text-xs text-slate-500">
                说明：文本按 UTF-8 编码计算；文件哈希会在本地读取文件内容进行计算。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
