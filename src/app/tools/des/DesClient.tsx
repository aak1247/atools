"use client";

import type { FC } from "react";
import { useMemo, useState } from "react";
import CryptoJS from "crypto-js";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Mode = "encrypt" | "decrypt";
type DesMode = "CBC" | "ECB";

const DEFAULT_UI = {
  actionEncrypt: "加密",
  actionDecrypt: "解密",
  cipherModeLabel: "模式",
  copyResult: "复制结果",
  plaintextLabel: "明文",
  ciphertextLabel: "密文（Base64）",
  plaintextPlaceholder: "输入要加密的文本…",
  ciphertextPlaceholder: "粘贴 Base64 密文…",
  resultLabel: "结果",
  resultPlaceholder: "结果会显示在这里…",
  errorPrefix: "错误：",
  keyLabel: "Key（8 字节 Hex）",
  randomKey: "生成随机 Key",
  ivLabel: "IV（8 字节 Hex，CBC 模式需要）",
  randomIv: "生成随机 IV",
  insecureTip: "提示：DES 已不再适合用于安全场景，建议优先使用 AES-GCM。",
  errKeyInvalid: "Key 需为 8 字节十六进制（16 个 hex 字符）",
  errIvInvalid: "IV 需为 8 字节十六进制（16 个 hex 字符）",
  errDecryptFailed: "解密失败（可能 Key/IV 不正确或密文无效）",
  errProcessFailed: "处理失败",
} as const;

type DesUi = typeof DEFAULT_UI;

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

const formatDesError = (error: string, ui: DesUi) => {
  if (error === "ERR_KEY_INVALID") return ui.errKeyInvalid;
  if (error === "ERR_IV_INVALID") return ui.errIvInvalid;
  if (error === "ERR_DECRYPT_FAILED") return ui.errDecryptFailed;
  if (error === "ERR_PROCESS_FAILED") return ui.errProcessFailed;
  return error;
};

const DesInner: FC<{ ui: DesUi }> = ({ ui }) => {
  const [mode, setMode] = useState<Mode>("encrypt");
  const [desMode, setDesMode] = useState<DesMode>("CBC");
  const [keyHex, setKeyHex] = useState(() => randomHex(8));
  const [ivHex, setIvHex] = useState(() => randomHex(8));
  const [input, setInput] = useState("Hello DES!");

  const result = useMemo(() => {
    const key = normalizeHex(keyHex);
    const iv = normalizeHex(ivHex);
    if (key.length !== 16 || !isHex(key)) {
      return { ok: false as const, text: "", error: "ERR_KEY_INVALID" };
    }
    if (desMode === "CBC" && (iv.length !== 16 || !isHex(iv))) {
      return { ok: false as const, text: "", error: "ERR_IV_INVALID" };
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
        return { ok: false as const, text: "", error: "ERR_DECRYPT_FAILED" };
      }
      return { ok: true as const, text: plain };
    } catch (e) {
      return { ok: false as const, text: "", error: e instanceof Error ? e.message : "ERR_PROCESS_FAILED" };
    }
  }, [desMode, input, ivHex, keyHex, mode]);

  const copy = async () => {
    if (!result.ok) return;
    await navigator.clipboard.writeText(result.text);
  };

  return (
    <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
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
              {ui.actionEncrypt}
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
              {ui.actionDecrypt}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              {ui.cipherModeLabel}
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
              {ui.copyResult}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {mode === "encrypt" ? ui.plaintextLabel : ui.ciphertextLabel}
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === "encrypt" ? ui.plaintextPlaceholder : ui.ciphertextPlaceholder}
              className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.resultLabel}</div>
            <textarea
              value={result.ok ? result.text : ""}
              readOnly
              placeholder={ui.resultPlaceholder}
              className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
            {!result.ok && (
              <div className="mt-2 text-sm text-rose-600" aria-live="polite">
                {ui.errorPrefix}
                {formatDesError(result.error, ui)}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 rounded-2xl bg-white/60 p-4 ring-1 ring-black/5 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block">
              <div className="text-xs text-slate-500">{ui.keyLabel}</div>
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
              {ui.randomKey}
            </button>
          </div>

          <div className="space-y-3">
            <label className="block">
              <div className="text-xs text-slate-500">{ui.ivLabel}</div>
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
              {ui.randomIv}
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">{ui.insecureTip}</div>
    </div>
  );
};

const DesClient: FC = () => {
  return (
    <ToolPageLayout toolSlug="des" maxWidthClassName="max-w-5xl">
      {({ config }) => (
        <DesInner
          ui={{
            ...DEFAULT_UI,
            ...((config.ui as Partial<DesUi> | undefined) ?? {}),
          }}
        />
      )}
    </ToolPageLayout>
  );
};

export default DesClient;
