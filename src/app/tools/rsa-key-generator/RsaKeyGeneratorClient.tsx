"use client";

import { useState } from "react";

type Modulus = 2048 | 3072 | 4096;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const wrap64 = (value: string) => value.match(/.{1,64}/g)?.join("\n") ?? value;

const toPem = (label: string, bytes: Uint8Array) => {
  const base64 = wrap64(bytesToBase64(bytes));
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----\n`;
};

const downloadText = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function RsaKeyGeneratorClient() {
  const [modulusLength, setModulusLength] = useState<Modulus>(2048);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicPem, setPublicPem] = useState("");
  const [privatePem, setPrivatePem] = useState("");

  const generate = async () => {
    setError(null);
    setPublicPem("");
    setPrivatePem("");
    setIsWorking(true);
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: "RSA-OAEP",
          modulusLength,
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"],
      );

      const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
      const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

      setPublicPem(toPem("PUBLIC KEY", new Uint8Array(spki)));
      setPrivatePem(toPem("PRIVATE KEY", new Uint8Array(pkcs8)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setIsWorking(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">RSA 密钥生成器</h1>
        <p className="mt-2 text-sm text-slate-500">生成 RSA-OAEP 密钥对并导出 PEM（纯本地）</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            位数
            <select
              value={modulusLength}
              onChange={(e) => setModulusLength(Number(e.target.value) as Modulus)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            >
              <option value={2048}>2048</option>
              <option value={3072}>3072</option>
              <option value={4096}>4096</option>
            </select>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={isWorking}
              className="rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 disabled:opacity-60 active:scale-[0.99]"
            >
              {isWorking ? "生成中…" : "生成密钥"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPublicPem("");
                setPrivatePem("");
                setError(null);
              }}
              className="rounded-2xl bg-slate-100 px-6 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 active:scale-[0.99]"
            >
              清空
            </button>
          </div>
        </div>

        {error && <div className="mt-4 text-sm text-rose-600">错误：{error}</div>}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">公钥（SPKI PEM）</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!publicPem}
                  onClick={() => copy(publicPem)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  复制
                </button>
                <button
                  type="button"
                  disabled={!publicPem}
                  onClick={() => downloadText("rsa-public.pem", publicPem)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  下载
                </button>
              </div>
            </div>
            <textarea
              value={publicPem}
              readOnly
              placeholder="点击“生成密钥”后显示…"
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">私钥（PKCS8 PEM）</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!privatePem}
                  onClick={() => copy(privatePem)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  复制
                </button>
                <button
                  type="button"
                  disabled={!privatePem}
                  onClick={() => downloadText("rsa-private.pem", privatePem)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  下载
                </button>
              </div>
            </div>
            <textarea
              value={privatePem}
              readOnly
              placeholder="点击“生成密钥”后显示…"
              className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          提示：密钥在浏览器本地生成；私钥请妥善保存，不要在不可信环境中生成与使用。
        </div>
      </div>
    </div>
  );
}

