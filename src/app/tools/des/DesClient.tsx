"use client";

import { useMemo, useState } from "react";
import CryptoJS from "crypto-js";

type Mode = "encrypt" | "decrypt";
type DesMode = "CBC" | "ECB";

const normalizeHex = (value: string) =>
  value.trim().replace(/^0x/i, "").replace(/\s+/g, "").toLowerCase();

const isHex = (value: string) => /^[0-9a-f]*$/i.test(value);

const randomHex = (bytes: number) => {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export default function DesClient() {
  const [mode, setMode] = useState<Mode>("encrypt");
  const [desMode, setDesMode] = useState<DesMode>("CBC");
  const [keyHex, setKeyHex] = useState(() => randomHex(8));
  const [ivHex, setIvHex] = useState(() => randomHex(8));
  const [input, setInput] = useState("Hello DES!");

  const result = useMemo(() => {
    const key = normalizeHex(keyHex);
    const iv = normalizeHex(ivHex);
    if (key.length !== 16 || !isHex(key)) {
      return { ok: false as const, text: "", error: "Key 需为 8 字节十六进制（16 个 hex 字符）" };
    }
    if (desMode === "CBC" && (iv.length !== 16 || !isHex(iv))) {
      return { ok: false as const, text: "", error: "IV 需为 8 字节十六进制（16 个 hex 字符）" };
    }

    try {
      const keyWord = CryptoJS.enc.Hex.parse(key);
      const opts =
        desMode === "ECB"
          ? { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
          : { iv: CryptoJS.enc.Hex.parse(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 };

      if (mode === "encrypt") {
        const encrypted = CryptoJS.DES.encrypt(input, keyWord, opts);
        return { ok: true as const, text: encrypted.toString() };
      }

      const ciphertext = input.trim().replace(/\s+/g, "");
      if (!ciphertext) return { ok: true as const, text: "" };
      const cipherParams = CryptoJS.lib.CipherParams.create({
        ciphertext: CryptoJS.enc.Base64.parse(ciphertext),
      });
      const decrypted = CryptoJS.DES.decrypt(cipherParams, keyWord, opts);
      const plain = decrypted.toString(CryptoJS.enc.Utf8);
      if (!plain && ciphertext) {
        return { ok: false as const, text: "", error: "解密失败（可能 Key/IV 不正确或密文无效）" };
      }
      return { ok: true as const, text: plain };
    } catch (e) {
      return { ok: false as const, text: "", error: e instanceof Error ? e.message : "处理失败" };
    }
  }, [desMode, input, ivHex, keyHex, mode]);

  const copy = async () => {
    if (!result.ok) return;
    await navigator.clipboard.writeText(result.text);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">DES 加解密</h1>
        <p className="mt-2 text-sm text-slate-500">CBC/ECB + PKCS7（注意：DES 已不安全）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-2xl bg-slate-100/60 p-1">
            <button
              type="button"
              onClick={() => setMode("encrypt")}
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
              onClick={() => setMode("decrypt")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mode === "decrypt"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              解密
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              模式
              <select
                value={desMode}
                onChange={(e) => setDesMode(e.target.value as DesMode)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              >
                <option value="CBC">CBC</option>
                <option value="ECB">ECB</option>
              </select>
            </label>
            <button
              type="button"
              disabled={!result.ok || !result.text}
              onClick={copy}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              复制结果
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {mode === "encrypt" ? "明文" : "密文（Base64）"}
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === "encrypt" ? "输入要加密的文本…" : "粘贴 Base64 密文…"}
              className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">结果</div>
            <textarea
              value={result.ok ? result.text : ""}
              readOnly
              placeholder="结果会显示在这里…"
              className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
            {!result.ok && <div className="mt-2 text-sm text-rose-600">错误：{result.error}</div>}
          </div>
        </div>

        <div className="mt-4 grid gap-4 rounded-2xl bg-white/60 p-4 ring-1 ring-black/5 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block">
              <div className="text-xs text-slate-500">Key（8 字节 Hex）</div>
              <input
                value={keyHex}
                onChange={(e) => setKeyHex(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
            </label>
            <button
              type="button"
              onClick={() => setKeyHex(randomHex(8))}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
            >
              生成随机 Key
            </button>
          </div>

          <div className="space-y-3">
            <label className="block">
              <div className="text-xs text-slate-500">IV（8 字节 Hex，CBC 模式需要）</div>
              <input
                value={ivHex}
                onChange={(e) => setIvHex(e.target.value)}
                disabled={desMode === "ECB"}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
              />
            </label>
            <button
              type="button"
              onClick={() => setIvHex(randomHex(8))}
              disabled={desMode === "ECB"}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              生成随机 IV
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          提示：DES 已不再适合用于安全场景，建议优先使用 AES-GCM。
        </div>
      </div>
    </div>
  );
}

