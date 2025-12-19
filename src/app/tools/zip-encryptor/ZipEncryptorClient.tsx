"use client";

import type { ChangeEvent } from "react";
import { unzipSync, zipSync } from "fflate";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { decryptBytes, encryptBytes, parseEncryptedPayload } from "../../../lib/crypto/aes256gcm-pbkdf2";

type Mode = "encrypt" | "decrypt";

const DEFAULT_UI = {
  encrypt: "加密 ZIP",
  decrypt: "解密 ZIP",
  inputTitle: "输入",
  outputJsonTitle: "加密输出 JSON",
  outputZipTitle: "输出 ZIP",
  pickFiles: "选择多个文件（将打包为 ZIP）",
  pickEncrypted: "选择加密 JSON",
  jsonLabel: "JSON",
  password: "密码",
  iterations: "迭代次数",
  zipLevel: "ZIP 压缩等级",
  zipLevelRangeHint: "（0-9）",
  run: "执行",
  working: "处理中…",
  clear: "清空",
  download: "下载",
  selectedFilesTemplate: "已选择 {count} 个文件",
  jsonPlaceholder: "粘贴本工具生成的 JSON…",
  encryptOutputPlaceholder: "加密后会在这里输出 JSON…",
  decryptOutputPlaceholder: "解密后会在这里输出元信息…",
  zipPreviewTitle: "ZIP 内容预览",
  errPasswordRequired: "请输入密码",
  errEncryptFailed: "加密失败",
  errDecryptFailed: "解密失败（可能密码错误或内容损坏）",
  note:
    "说明：此工具先将文件打包为 ZIP（fflate），再使用 AES-256-GCM 将 ZIP 整体加密为 JSON；解密后可下载恢复 ZIP。纯前端本地处理不上传文件。",
} as const;

const readAsBytes = async (file: File): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer());

const clampZipLevel = (value: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 =>
  Math.max(0, Math.min(9, Math.round(value))) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const bytesToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const { byteOffset, byteLength } = bytes;
  const buffer = bytes.buffer;
  if (buffer instanceof ArrayBuffer) {
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }
  const copy = new Uint8Array(byteLength);
  copy.set(bytes);
  return copy.buffer;
};

export default function ZipEncryptorClient() {
  return (
    <ToolPageLayout toolSlug="zip-encryptor" maxWidthClassName="max-w-6xl">
      <ZipEncryptorInner />
    </ToolPageLayout>
  );
}

function ZipEncryptorInner() {
  const config = useOptionalToolConfig("zip-encryptor");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const filesRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("encrypt");
  const [password, setPassword] = useState("");
  const [iterations, setIterations] = useState(200_000);
  const [zipLevel, setZipLevel] = useState(6);

  const [files, setFiles] = useState<File[]>([]);
  const [jsonText, setJsonText] = useState("");

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputText, setOutputText] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("archive.zip.enc.json");
  const [zipEntries, setZipEntries] = useState<Array<{ name: string; size: number }> | null>(null);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const resetOutput = () => {
    setError(null);
    setOutputText("");
    setZipEntries(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  };

  const canRun = useMemo(() => {
    if (!password) return false;
    if (mode === "encrypt") return files.length > 0;
    return jsonText.trim().length > 0;
  }, [files.length, jsonText, mode, password]);

  const onFilesChange = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    resetOutput();
    setFiles(picked);
    setDownloadName(`archive.${Date.now()}.zip.enc.json`);
  };

  const onJsonFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    resetOutput();
    const text = await selected.text();
    setJsonText(text);
  };

  const packZip = async (picked: File[]): Promise<Uint8Array> => {
    const record: Record<string, Uint8Array> = {};
    for (const f of picked) record[f.name || `file-${Math.random().toString(16).slice(2)}`] = await readAsBytes(f);
    return zipSync(record, { level: clampZipLevel(zipLevel) });
  };

  const runEncrypt = async () => {
    setIsWorking(true);
    setError(null);
    setOutputText("");
    setZipEntries(null);
    try {
      const zipBytes = await packZip(files);
      const payload = await encryptBytes({
        bytes: zipBytes,
        password,
        iterations,
        meta: { name: "archive.zip", type: "application/zip", size: zipBytes.byteLength, createdAt: new Date().toISOString() },
      });
      const out = `${JSON.stringify(payload, null, 2)}\n`;
      setOutputText(out);
      setDownloadUrl(URL.createObjectURL(new Blob([out], { type: "application/json" })));
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errEncryptFailed);
    } finally {
      setIsWorking(false);
    }
  };

  const runDecrypt = async () => {
    setIsWorking(true);
    setError(null);
    setOutputText("");
    setZipEntries(null);
    try {
      const payload = parseEncryptedPayload(jsonText);
      const { bytes, meta } = await decryptBytes({ payload, password });
      const name = meta?.name?.toLowerCase().endsWith(".zip") ? meta.name : "decrypted.zip";
      const bufferForBlob = bytesToArrayBuffer(bytes);
      const url = URL.createObjectURL(new Blob([bufferForBlob], { type: "application/zip" }));
      setDownloadUrl(url);
      setDownloadName(name);

      try {
        const entries = unzipSync(bytes);
        const list = Object.entries(entries)
          .map(([n, b]) => ({ name: n, size: b.byteLength }))
          .sort((a, b) => b.size - a.size)
          .slice(0, 200);
        setZipEntries(list);
      } catch {
        setZipEntries(null);
      }

      setOutputText(JSON.stringify({ meta, size: bytes.byteLength }, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errDecryptFailed);
    } finally {
      setIsWorking(false);
    }
  };

  const run = async () => {
    resetOutput();
    if (!password) {
      setError(ui.errPasswordRequired);
      return;
    }
    if (mode === "encrypt") await runEncrypt();
    else await runDecrypt();
  };

  const clear = () => {
    setFiles([]);
    setJsonText("");
    resetOutput();
    if (filesRef.current) filesRef.current.value = "";
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
            onClick={clear}
            className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
          >
            {ui.clear}
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          {ui.note}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.inputTitle}</div>
            <div className="mt-4 space-y-3">
              {mode === "encrypt" ? (
                <>
                  <input ref={filesRef} type="file" multiple className="hidden" onChange={onFilesChange} />
                  <button
                    type="button"
                    onClick={() => filesRef.current?.click()}
                    className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    {ui.pickFiles}
                  </button>
                  {files.length > 0 && (
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
                      {ui.selectedFilesTemplate.replace("{count}", String(files.length))}
                      <div className="mt-2 max-h-28 overflow-auto text-xs text-slate-600">
                        {files.slice(0, 50).map((f) => (
                          <div key={f.name} className="flex items-center justify-between gap-2">
                            <span className="truncate">{f.name}</span>
                            <span className="shrink-0">{(f.size / 1024).toFixed(1)} KB</span>
                          </div>
                        ))}
                      </div>
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
                    {ui.pickEncrypted}
                  </button>
                  <label className="block text-sm text-slate-700">
                    {ui.jsonLabel}
                    <textarea
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                      className="mt-2 h-44 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      placeholder={ui.jsonPlaceholder}
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

              {mode === "encrypt" && (
                <label className="block text-sm text-slate-700">
                  {ui.zipLevel}
                  {ui.zipLevelRangeHint}
                  <input
                    type="number"
                    min={0}
                    max={9}
                    step={1}
                    value={zipLevel}
                    onChange={(e) => setZipLevel(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
              )}

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

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{mode === "encrypt" ? ui.outputJsonTitle : ui.outputZipTitle}</div>
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
              <textarea
                value={outputText}
                readOnly
                className="mt-3 h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                placeholder={mode === "encrypt" ? ui.encryptOutputPlaceholder : ui.decryptOutputPlaceholder}
              />
            </div>

            {zipEntries && zipEntries.length > 0 && (
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.zipPreviewTitle}</div>
                <div className="mt-3 max-h-56 overflow-auto rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  {zipEntries.map((e) => (
                    <div key={e.name} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                      <span className="truncate font-mono">{e.name}</span>
                      <span className="shrink-0 text-slate-500">{(e.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
