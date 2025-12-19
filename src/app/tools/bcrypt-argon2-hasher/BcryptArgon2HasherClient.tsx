"use client";

import { argon2id, argon2Verify, bcrypt, bcryptVerify } from "hash-wasm";
import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

// 中文默认值
const DEFAULT_UI = {
  generateHash: "生成哈希",
  verifyHash: "校验",
  description: "说明：bcrypt/argon2id 为密码哈希算法（不可逆）。本工具使用 `hash-wasm` 在浏览器本地计算与校验，不上传密码与哈希。",
  input: "输入",
  passwordLabel: "Password",
  passwordPlaceholder: "输入要哈希/校验的密码",
  hashForVerify: "Hash（用于校验）",
  hashPlaceholder: "粘贴 bcrypt/argon2id 哈希…",
  generating: "处理中…",
  generateButton: "生成",
  verifyButton: "校验",
  result: "结果",
  copyButton: "复制",
  bcryptParams: "bcrypt 参数",
  cost: "cost",
  costFactor: "costFactor（4-31）",
  salt: "salt（Base64，解码后需 16 字节）",
  randomButton: "随机",
  argon2idParams: "argon2id 参数",
  memory: "memory (KiB)",
  memorySize: "memorySize（KiB）",
  iterations: "iterations",
  parallelism: "parallelism",
  hashLength: "hash length (bytes)",
  saltArgon: "salt（Base64，解码后至少 8 字节）",
  securityTip: "提示：生产环境建议让服务端生成随机 salt 并存储哈希（包含参数），客户端不要自行实现登录加密协议。",
  verifySuccess: "校验通过 ✅",
  verifyFailed: "校验失败 ❌",
  calculationError: "计算失败",
  verifyError: "校验失败",
  bcryptSaltError: "bcrypt salt 必须为 16 字节（Base64 解码后）。",
  autoFillPlaceholder: "生成后会自动填充…"
} as const;

type BcryptArgon2HasherUi = typeof DEFAULT_UI;

type Algo = "bcrypt" | "argon2id";
type Mode = "hash" | "verify";

const randomSaltB64 = (bytes: number) => {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.subarray(i, i + chunkSize);
    bin += String.fromCharCode(...chunk);
  }
  return btoa(bin);
};

const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

export default function BcryptArgon2HasherClient() {
  return (
    <ToolPageLayout toolSlug="bcrypt-argon2-hasher" maxWidthClassName="max-w-6xl">
      <BcryptArgon2HasherInner />
    </ToolPageLayout>
  );
}

function BcryptArgon2HasherInner() {
  const config = useOptionalToolConfig("bcrypt-argon2-hasher");
  const ui: BcryptArgon2HasherUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<BcryptArgon2HasherUi>) };

  const [algo, setAlgo] = useState<Algo>("bcrypt");
  const [mode, setMode] = useState<Mode>("hash");
  const [password, setPassword] = useState("password");
  const [hashText, setHashText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [isWorking, setIsWorking] = useState(false);

  // bcrypt
  const [bcryptCost, setBcryptCost] = useState(10);
  const [bcryptSaltB64, setBcryptSaltB64] = useState(() => randomSaltB64(16));

  // argon2id
  const [argonMemoryKiB, setArgonMemoryKiB] = useState(64 * 1024);
  const [argonIterations, setArgonIterations] = useState(3);
  const [argonParallelism, setArgonParallelism] = useState(1);
  const [argonHashLength, setArgonHashLength] = useState(32);
  const [argonSaltB64, setArgonSaltB64] = useState(() => randomSaltB64(16));

  const canRun = useMemo(() => {
    if (!password) return false;
    if (mode === "verify") return !!hashText.trim();
    return true;
  }, [hashText, mode, password]);

  const runHash = async () => {
    setIsWorking(true);
    setError(null);
    setResult("");
    try {
      if (algo === "bcrypt") {
        const costFactor = Math.min(31, Math.max(4, Math.round(bcryptCost)));
        const salt = b64ToBytes(bcryptSaltB64);
        if (salt.byteLength !== 16) throw new Error(ui.bcryptSaltError);
        const out = await bcrypt({ password, salt, costFactor, outputType: "encoded" });
        setResult(out);
        setHashText(out);
      } else {
        const memorySize = Math.max(8 * argonParallelism, Math.round(argonMemoryKiB));
        const iterations = Math.max(1, Math.round(argonIterations));
        const parallelism = Math.max(1, Math.round(argonParallelism));
        const hashLength = Math.max(4, Math.round(argonHashLength));
        const salt = b64ToBytes(argonSaltB64);
        const out = await argon2id({
          password,
          salt,
          iterations,
          parallelism,
          memorySize,
          hashLength,
          outputType: "encoded",
        });
        setResult(out);
        setHashText(out);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.calculationError);
    } finally {
      setIsWorking(false);
    }
  };

  const runVerify = async () => {
    setIsWorking(true);
    setError(null);
    setResult("");
    try {
      const hash = hashText.trim();
      if (algo === "bcrypt") {
        const ok = await bcryptVerify({ password, hash });
        setResult(ok ? ui.verifySuccess : ui.verifyFailed);
      } else {
        const ok = await argon2Verify({ password, hash });
        setResult(ok ? ui.verifySuccess : ui.verifyFailed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.verifyError);
    } finally {
      setIsWorking(false);
    }
  };

  const run = async () => {
    if (!canRun) return;
    if (mode === "hash") await runHash();
    else await runVerify();
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => setAlgo("bcrypt")}
              className={`rounded-2xl px-4 py-2 font-semibold transition ${
                algo === "bcrypt" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              bcrypt
            </button>
            <button
              type="button"
              onClick={() => setAlgo("argon2id")}
              className={`rounded-2xl px-4 py-2 font-semibold transition ${
                algo === "argon2id" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              argon2id
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("hash")}
              className={`rounded-2xl px-4 py-2 font-semibold transition ${
                mode === "hash" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {ui.generateHash}
            </button>
            <button
              type="button"
              onClick={() => setMode("verify")}
              className={`rounded-2xl px-4 py-2 font-semibold transition ${
                mode === "verify" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {ui.verifyHash}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          {ui.description}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.input}</div>
              <div className="mt-4 grid gap-4">
                <label className="block text-sm text-slate-700">
                  {ui.passwordLabel}
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    placeholder={ui.passwordPlaceholder}
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.hashForVerify}
                  <textarea
                    value={hashText}
                    onChange={(e) => setHashText(e.target.value)}
                    className="mt-2 h-28 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    placeholder={mode === "verify" ? ui.hashPlaceholder : ui.autoFillPlaceholder}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void run()}
                  disabled={!canRun || isWorking}
                  className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isWorking ? ui.generating : mode === "hash" ? ui.generateButton : ui.verifyButton}
                </button>

                {error && (
                  <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                    {error}
                  </div>
                )}
                {result && (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-800 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{ui.result}</div>
                      <button
                        type="button"
                        onClick={() => void copy(result)}
                        className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-100"
                      >
                        {ui.copyButton}
                      </button>
                    </div>
                    <div className="mt-2 break-words font-mono text-xs">{result}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {algo === "bcrypt" ? (
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.bcryptParams}</div>
                <div className="mt-4 grid gap-4">
                  <label className="block text-sm text-slate-700">
                    {ui.costFactor}
                    <input
                      type="number"
                      min={4}
                      max={31}
                      step={1}
                      value={bcryptCost}
                      onChange={(e) => setBcryptCost(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                  <label className="block text-sm text-slate-700">
                    {ui.salt}
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={bcryptSaltB64}
                        onChange={(e) => setBcryptSaltB64(e.target.value)}
                        className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 font-mono text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setBcryptSaltB64(randomSaltB64(16))}
                        className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
                      >
                        {ui.randomButton}
                      </button>
                    </div>
                  </label>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.argon2idParams}</div>
                <div className="mt-4 grid gap-4">
                  <label className="block text-sm text-slate-700">
                    {ui.memorySize}
                    <input
                      type="number"
                      min={8}
                      step={1024}
                      value={argonMemoryKiB}
                      onChange={(e) => setArgonMemoryKiB(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm text-slate-700">
                      {ui.iterations}
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={argonIterations}
                        onChange={(e) => setArgonIterations(Number(e.target.value))}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      />
                    </label>
                    <label className="block text-sm text-slate-700">
                      {ui.parallelism}
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={argonParallelism}
                        onChange={(e) => setArgonParallelism(Number(e.target.value))}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      />
                    </label>
                    <label className="block text-sm text-slate-700 sm:col-span-2">
                      {ui.hashLength}
                      <input
                        type="number"
                        min={4}
                        step={1}
                        value={argonHashLength}
                        onChange={(e) => setArgonHashLength(Number(e.target.value))}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      />
                    </label>
                  </div>
                  <label className="block text-sm text-slate-700">
                    {ui.saltArgon}
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={argonSaltB64}
                        onChange={(e) => setArgonSaltB64(e.target.value)}
                        className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 font-mono text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setArgonSaltB64(randomSaltB64(16))}
                        className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
                      >
                        {ui.randomButton}
                      </button>
                    </div>
                  </label>
                </div>
              </div>
            )}

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-600">
              {ui.securityTip}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

