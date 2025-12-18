"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { decryptBytes, encryptBytes, parseEncryptedPayload } from "../../../lib/crypto/aes256gcm-pbkdf2";

type Mode = "encrypt" | "decrypt";

const DEFAULT_UI = {
  encrypt: "加密",
  decrypt: "解密",
  pickFile: "选择文件",
  pickEncryptedFile: "选择加密 JSON 文件",
  password: "密码",
  iterations: "PBKDF2 迭代次数",
  run: "执行",
  working: "处理中…",
  clear: "清空",
  encryptedJson: "加密输出（JSON）",
  encryptedJsonPlaceholder: "加密后会在这里输出 JSON；也可复制保存为文件。",
  inputJson: "待解密 JSON（粘贴或选文件）",
  inputJsonPlaceholder: "粘贴本工具生成的 JSON，或选择 .json 文件…",
  copy: "复制",
  download: "下载",
  hintTitle: "说明",
  hintBody:
    "使用 AES-256-GCM + PBKDF2(SHA-256) 在本地加密/解密任意文件。输出为 JSON（包含 salt/iv/iter/ct），便于保存与传输；请妥善保管密码。",
} as const;

type FileEncryptorUi = typeof DEFAULT_UI;

const readAsText = async (file: File): Promise<string> => file.text();

const readAsBytes = async (file: File): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer());

export default function FileEncryptorClient() {
  return (
    <ToolPageLayout toolSlug="file-encryptor" maxWidthClassName="max-w-6xl">
      <FileEncryptorInner />
    </ToolPageLayout>
  );
}

function FileEncryptorInner() {
  const config = useOptionalToolConfig("file-encryptor");
  const ui: FileEncryptorUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<FileEncryptorUi>) };

  const inputRef = useRef<HTMLInputElement>(null);
  const encryptedFileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("encrypt");
  const [password, setPassword] = useState("");
  const [iterations, setIterations] = useState(200_000);

  const [file, setFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState("");

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [outputText, setOutputText] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("encrypted.json");
  const [downloadMime, setDownloadMime] = useState<string>("application/json");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const canRun = useMemo(() => {
    if (!password) return false;
    if (mode === "encrypt") return !!file && iterations > 0;
    return jsonText.trim().length > 0;
  }, [file, iterations, jsonText, mode, password]);

  const resetOutput = () => {
    setOutputText("");
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  };

  const pickFile = (selected: File) => {
    setFile(selected);
    setJsonText("");
    resetOutput();
    const base = selected.name || "file";
    setDownloadName(`${base}.enc.json`);
    setDownloadMime("application/json");
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) pickFile(selected);
  };

  const onEncryptedFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    resetOutput();
    setFile(null);
    const text = await readAsText(selected);
    setJsonText(text);
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const runEncrypt = async () => {
    if (!file) return;
    setIsWorking(true);
    setError(null);
    setOutputText("");
    try {
      const bytes = await readAsBytes(file);
      const payload = await encryptBytes({
        bytes,
        password,
        iterations,
        meta: {
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          createdAt: new Date().toISOString(),
        },
      });
      const out = `${JSON.stringify(payload, null, 2)}\n`;
      setOutputText(out);
      const blob = new Blob([out], { type: "application/json" });
      const url = URL.createObjectURL(blob);
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
      const name = meta?.name || "decrypted.bin";
      const type = meta?.type || "application/octet-stream";
      const blob = new Blob([bytes], { type });
      const url = URL.createObjectURL(blob);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(url);
      setDownloadName(name);
      setDownloadMime(type);
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

  const clearAll = () => {
    setFile(null);
    setJsonText("");
    setOutputText("");
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setDownloadName("encrypted.json");
    setDownloadMime("application/json");
    if (inputRef.current) inputRef.current.value = "";
    if (encryptedFileRef.current) encryptedFileRef.current.value = "";
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
              {ui.encrypt}
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
              {ui.decrypt}
            </button>
          </div>

          <button
            type="button"
            onClick={clearAll}
            className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
          >
            {ui.clear}
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">输入</div>

              <div className="mt-4 space-y-3">
                {mode === "encrypt" ? (
                  <>
                    <input ref={inputRef} type="file" className="hidden" onChange={onFileChange} />
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      {ui.pickFile}
                    </button>
                    {file && (
                      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
                        <div className="font-medium text-slate-900">{file.name}</div>
                        <div className="mt-1 text-xs text-slate-600">
                          {file.type || "unknown"} · {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <input
                      ref={encryptedFileRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(e) => void onEncryptedFileChange(e)}
                    />
                    <button
                      type="button"
                      onClick={() => encryptedFileRef.current?.click()}
                      className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      {ui.pickEncryptedFile}
                    </button>
                    <label className="block text-sm text-slate-700">
                      {ui.inputJson}
                      <textarea
                        value={jsonText}
                        onChange={(e) => setJsonText(e.target.value)}
                        placeholder={ui.inputJsonPlaceholder}
                        className="mt-2 h-44 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      />
                    </label>
                  </>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    {ui.password}
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      placeholder="仅在本地使用，不会上传"
                    />
                  </label>
                  <label className={`block text-sm text-slate-700 ${mode === "encrypt" ? "" : "opacity-60"}`}>
                    {ui.iterations}
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
                  {isWorking ? ui.working : ui.run}
                </button>

                {error && (
                  <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                    {error}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 text-xs text-slate-600">
              <div className="font-semibold text-slate-800">{ui.hintTitle}</div>
              <div className="mt-2 leading-relaxed">{ui.hintBody}</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">
                  {mode === "encrypt" ? ui.encryptedJson : "输出"}
                </div>
                <div className="flex items-center gap-2">
                  {outputText && (
                    <button
                      type="button"
                      onClick={() => void copy(outputText)}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                    >
                      {ui.copy}
                    </button>
                  )}
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      download={downloadName}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
                    >
                      {ui.download} {downloadName}
                    </a>
                  )}
                </div>
              </div>

              <textarea
                value={outputText}
                readOnly
                placeholder={ui.encryptedJsonPlaceholder}
                className="mt-3 h-72 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />

              {downloadUrl && mode === "decrypt" && (
                <div className="mt-3 text-xs text-slate-500">
                  MIME: {downloadMime}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

