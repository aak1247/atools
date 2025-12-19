"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { decryptBytes, encryptBytes, parseEncryptedPayload } from "../../../lib/crypto/aes256gcm-pbkdf2";

type Mode = "encrypt" | "decrypt";

const DEFAULT_UI = {
  encrypt: "加密 PDF",
  decrypt: "解密 PDF",
  pickPdf: "选择 PDF",
  pickEncrypted: "选择加密 JSON",
  password: "密码",
  iterations: "迭代次数",
  run: "执行",
  working: "处理中…",
  clear: "清空",
  download: "下载",
  outputJson: "加密输出 JSON",
  inputJson: "待解密 JSON",
  note:
    "说明：由于纯静态站点无法对 PDF 做标准“打开密码”加密/解密，本工具使用 AES-256-GCM 将整个 PDF 文件加密为 JSON，可在本工具中解密还原原 PDF。",
} as const;

const readAsBytes = async (file: File): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer());

export default function PdfEncryptorClient() {
  return (
    <ToolPageLayout toolSlug="pdf-encryptor" maxWidthClassName="max-w-6xl">
      <PdfEncryptorInner />
    </ToolPageLayout>
  );
}

function PdfEncryptorInner() {
  const config = useOptionalToolConfig("pdf-encryptor");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const pdfRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("encrypt");
  const [password, setPassword] = useState("");
  const [iterations, setIterations] = useState(200_000);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState("");

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputText, setOutputText] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("encrypted.pdf.enc.json");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const resetOutput = () => {
    setError(null);
    setOutputText("");
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  };

  const canRun = useMemo(() => {
    if (!password) return false;
    if (mode === "encrypt") return !!pdfFile;
    return jsonText.trim().length > 0;
  }, [jsonText, mode, password, pdfFile]);

  const onPdfChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    resetOutput();
    setPdfFile(selected);
    const base = selected.name.replace(/\.pdf$/i, "") || "document";
    setDownloadName(`${base}.pdf.enc.json`);
  };

  const onJsonFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    resetOutput();
    const text = await selected.text();
    setJsonText(text);
  };

  const runEncrypt = async () => {
    if (!pdfFile) return;
    setIsWorking(true);
    setError(null);
    setOutputText("");
    try {
      const bytes = await readAsBytes(pdfFile);
      const payload = await encryptBytes({
        bytes,
        password,
        iterations,
        meta: { name: pdfFile.name, type: "application/pdf", size: pdfFile.size, createdAt: new Date().toISOString() },
      });
      const out = `${JSON.stringify(payload, null, 2)}\n`;
      setOutputText(out);
      const url = URL.createObjectURL(new Blob([out], { type: "application/json" }));
      setDownloadUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加密失败");
    } finally {
      setIsWorking(false);
    }
  };

  const runDecrypt = async () => {
    setIsWorking(true);
    setError(null);
    setOutputText("");
    try {
      const payload = parseEncryptedPayload(jsonText);
      const { bytes, meta } = await decryptBytes({ payload, password });
      const name = meta?.name?.toLowerCase().endsWith(".pdf") ? meta.name : "decrypted.pdf";
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      setDownloadUrl(url);
      setDownloadName(name);
      setOutputText(JSON.stringify({ meta, size: bytes.byteLength }, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "解密失败（可能密码错误或内容损坏）");
    } finally {
      setIsWorking(false);
    }
  };

  const run = async () => {
    resetOutput();
    if (!password) {
      setError("请输入密码");
      return;
    }
    if (mode === "encrypt") await runEncrypt();
    else await runDecrypt();
  };

  const clear = () => {
    setPdfFile(null);
    setJsonText("");
    resetOutput();
    if (pdfRef.current) pdfRef.current.value = "";
    if (jsonRef.current) jsonRef.current.value = "";
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setMode("encrypt");
                resetOutput();
              }}
              className={`rounded-2xl px-4 py-2 font-semibold transition ${
                mode === "encrypt" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {DEFAULT_UI.encrypt}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("decrypt");
                resetOutput();
              }}
              className={`rounded-2xl px-4 py-2 font-semibold transition ${
                mode === "decrypt" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {DEFAULT_UI.decrypt}
            </button>
          </div>
          <button
            type="button"
            onClick={clear}
            className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
          >
            {DEFAULT_UI.clear}
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          {DEFAULT_UI.note}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">输入</div>

            <div className="mt-4 space-y-3">
              {mode === "encrypt" ? (
                <>
                  <input ref={pdfRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPdfChange} />
                  <button
                    type="button"
                    onClick={() => pdfRef.current?.click()}
                    className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    {DEFAULT_UI.pickPdf}
                  </button>
                  {pdfFile && (
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
                      <div className="font-medium text-slate-900">{pdfFile.name}</div>
                      <div className="mt-1 text-xs text-slate-600">{(pdfFile.size / 1024).toFixed(1)} KB</div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <input ref={jsonRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onJsonFileChange(e)} />
                  <button
                    type="button"
                    onClick={() => jsonRef.current?.click()}
                    className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    {DEFAULT_UI.pickEncrypted}
                  </button>
                  <label className="block text-sm text-slate-700">
                    {DEFAULT_UI.inputJson}
                    <textarea
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                      className="mt-2 h-44 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      placeholder="粘贴本工具生成的 JSON…"
                    />
                  </label>
                </>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  {DEFAULT_UI.password}
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <label className={`block text-sm text-slate-700 ${mode === "encrypt" ? "" : "opacity-60"}`}>
                  {DEFAULT_UI.iterations}
                  <input
                    type="number"
                    min={10_000}
                    max={2_000_000}
                    step={10_000}
                    value={iterations}
                    onChange={(e) => setIterations(Number(e.target.value))}
                    disabled={mode !== "encrypt"}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => void run()}
                disabled={!canRun || isWorking}
                className="w-full rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {isWorking ? DEFAULT_UI.working : DEFAULT_UI.run}
              </button>

              {error && (
                <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">{mode === "encrypt" ? DEFAULT_UI.outputJson : "输出"}</div>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
                >
                  {DEFAULT_UI.download} {downloadName}
                </a>
              )}
            </div>
            <textarea
              value={outputText}
              readOnly
              className="mt-3 h-72 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              placeholder={mode === "encrypt" ? "加密后会在这里输出 JSON…" : "解密后会在这里输出元信息…"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
