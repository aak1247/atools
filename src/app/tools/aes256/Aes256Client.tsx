"use client";

import { useState } from "react";

type Mode = "encrypt" | "decrypt";

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

type PayloadV1 = {
  v: 1;
  alg: "AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  iter: number;
  salt: string;
  iv: string;
  ct: string;
};

const toArrayBuffer = (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const deriveAesKey = async (password: string, salt: Uint8Array, iterations: number) => {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

export default function Aes256Client() {
  const [mode, setMode] = useState<Mode>("encrypt");
  const [password, setPassword] = useState("");
  const [iterations, setIterations] = useState(200_000);
  const [input, setInput] = useState("Hello AES!");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const encrypt = async () => {
    setError(null);
    setOutput("");
    if (!password) {
      setError("请输入密码（用于派生密钥）");
      return;
    }
    setIsWorking(true);
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveAesKey(password, salt, iterations);
      const pt = new TextEncoder().encode(input);
      const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(pt),
      );
      const payload: PayloadV1 = {
        v: 1,
        alg: "AES-256-GCM",
        kdf: "PBKDF2-SHA256",
        iter: iterations,
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
        ct: bytesToBase64(new Uint8Array(ct)),
      };
      setOutput(JSON.stringify(payload, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加密失败");
    } finally {
      setIsWorking(false);
    }
  };

  const decrypt = async () => {
    setError(null);
    setOutput("");
    if (!password) {
      setError("请输入密码（用于派生密钥）");
      return;
    }
    setIsWorking(true);
    try {
      const parsed = JSON.parse(input) as Partial<PayloadV1>;
      if (parsed.v !== 1 || parsed.alg !== "AES-256-GCM" || parsed.kdf !== "PBKDF2-SHA256") {
        setError("输入不是本工具生成的 AES256 JSON（v=1 / AES-256-GCM / PBKDF2-SHA256）");
        return;
      }
      const iter = Number(parsed.iter);
      if (!Number.isFinite(iter) || iter < 1) {
        setError("无效 iter");
        return;
      }
      if (!parsed.salt || !parsed.iv || !parsed.ct) {
        setError("缺少 salt/iv/ct 字段");
        return;
      }
      const salt = base64ToBytes(parsed.salt);
      const iv = base64ToBytes(parsed.iv);
      const ct = base64ToBytes(parsed.ct);
      const key = await deriveAesKey(password, salt, iter);

      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(ct),
      );
      const text = new TextDecoder().decode(new Uint8Array(pt));
      setOutput(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "解密失败（可能密码不正确或内容损坏）");
    } finally {
      setIsWorking(false);
    }
  };

  const run = async () => {
    if (mode === "encrypt") await encrypt();
    else await decrypt();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(output);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">AES256 加解密</h1>
        <p className="mt-2 text-sm text-slate-500">AES-256-GCM + PBKDF2-SHA256（纯本地）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-2xl bg-slate-100/60 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("encrypt");
                setOutput("");
                setError(null);
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mode === "encrypt"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              加密
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("decrypt");
                setOutput("");
                setError(null);
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mode === "decrypt"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              解密
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              迭代次数
              <input
                type="number"
                min={10_000}
                max={2_000_000}
                value={iterations}
                onChange={(e) => setIterations(Number(e.target.value))}
                className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {mode === "encrypt" ? "明文" : "密文（本工具输出的 JSON）"}
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === "encrypt" ? "输入要加密的文本…" : "粘贴加密输出的 JSON…"}
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">结果</div>
              <button
                type="button"
                disabled={!output}
                onClick={copy}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                复制
              </button>
            </div>
            <textarea
              value={output}
              readOnly
              placeholder="点击“执行”后显示结果…"
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
          <label className="flex flex-1 items-center gap-2 text-sm text-slate-700">
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              placeholder="仅在本地使用，不会上传"
            />
          </label>
          <button
            type="button"
            onClick={run}
            disabled={isWorking}
            className="rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 disabled:opacity-60 active:scale-[0.99]"
          >
            {isWorking ? "处理中…" : "执行"}
          </button>
        </div>

        {error && <div className="mt-4 text-sm text-rose-600">错误：{error}</div>}

        <div className="mt-4 text-xs text-slate-500">
          提示：此工具使用随机 salt 与 iv；加密输出包含必要参数。建议不要使用 DES 等弱算法进行敏感数据加密。
        </div>
      </div>
    </div>
  );
}
