"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Lock,
  Unlock,
  File,
  FileArchive,
  Upload,
  Download,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Settings,
  Copy,
  Check,
  FileCode,
  Loader2,
} from "lucide-react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { decryptBytes, encryptBytes, parseEncryptedPayload } from "../../../lib/crypto/aes256gcm-pbkdf2";

type Mode = "encrypt" | "decrypt";
type OutputFormat = "enc" | "json";

const MAGIC_AENC = new Uint8Array([0x41, 0x45, 0x4e, 0x43]); // 'AENC'

function isAencContainer(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 39) return false;
  return (
    bytes[0] === MAGIC_AENC[0] &&
    bytes[1] === MAGIC_AENC[1] &&
    bytes[2] === MAGIC_AENC[2] &&
    bytes[3] === MAGIC_AENC[3]
  );
}

function packAencBinary(params: {
  filename: string;
  salt: Uint8Array;
  iv: Uint8Array;
  iterations: number;
  ciphertext: Uint8Array;
}): Uint8Array {
  const enc = new TextEncoder();
  const nameBytes = enc.encode(params.filename);
  const headerLen = 4 + 1 + 16 + 12 + 4 + 2 + nameBytes.byteLength;
  const result = new Uint8Array(headerLen + params.ciphertext.byteLength);
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);

  // Magic 'AENC'
  result.set(MAGIC_AENC, 0);
  // Version 1
  result[4] = 0x01;
  // Salt (16 bytes)
  result.set(params.salt, 5);
  // IV (12 bytes)
  result.set(params.iv, 21);
  // Iterations (uint32 BE)
  view.setUint32(33, params.iterations, false);
  // Name length (uint16 BE)
  view.setUint16(37, nameBytes.byteLength, false);
  // Filename
  result.set(nameBytes, 39);
  // Ciphertext
  result.set(params.ciphertext, headerLen);

  return result;
}

function unpackAencBinary(bytes: Uint8Array): {
  salt: Uint8Array;
  iv: Uint8Array;
  iterations: number;
  filename: string;
  ciphertext: Uint8Array;
} {
  if (!isAencContainer(bytes)) {
    throw new Error("Invalid AENC container");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const salt = bytes.slice(5, 21);
  const iv = bytes.slice(21, 33);
  const iterations = view.getUint32(33, false);
  const nameLen = view.getUint16(37, false);
  const dec = new TextDecoder("utf-8");
  const filename = dec.decode(bytes.slice(39, 39 + nameLen)) || "decrypted-file";
  const ciphertext = bytes.slice(39 + nameLen);

  return { salt, iv, iterations, filename, ciphertext };
}

const DEFAULT_UI = {
  encrypt: "加密文件",
  decrypt: "解密文件",
  inputTitle: "输入",
  outputTitle: "输出",
  pickFile: "选择文件",
  replaceFile: "替换文件",
  pickEncryptedFile: "选择加密文件 (.enc 或 .json)",
  replaceEncryptedFile: "替换加密文件",
  dropHintEncrypt: "拖拽任意文件到此处，或点击按钮上传。",
  dropHintDecrypt: "拖拽已加密的 .enc 文件（或旧版加密 .json）到此处。",
  password: "加密密码",
  passwordPlaceholder: "输入高强度加密/解密密码",
  format: "导出格式",
  formatEnc: "二进制加密包 (.enc，推荐)",
  formatEncDesc: "无体积膨胀，原生二进制加密，直接还原原文件名与扩展名。",
  formatJson: "JSON 文本包 (.json)",
  formatJsonDesc: "包含 Base64 密文与元数据，便于复制纯文本传输或查看参数。",
  iterations: "PBKDF2 迭代轮次",
  iterationsHint: "默认 200,000 轮，数字越高暴力破解难度越大。",
  encryptOptions: "加密参数设置",
  runEncrypt: "加密并导出文件",
  runDecrypt: "解密并还原原始文件",
  working: "处理中…",
  clear: "清空",
  download: "下载",
  copy: "复制 JSON",
  copied: "已复制！",
  selectedFileTemplate: "已选择文件：{name} ({size})",
  encryptSuccess: "加密成功！已生成强加密密文包",
  decryptSuccess: "解密成功！已还原原始文件",
  showPassword: "显示密码",
  hidePassword: "隐藏密码",
  outputEncTitle: "加密输出",
  decryptResultTitle: "解密结果",
  generatedFile: "生成文件：",
  originalSize: "原始大小：",
  resultSize: "最终大小：",
  encryptEmptyHint: "选择文件并设置密码后点击“加密并导出文件”",
  encryptEmptySubHint: "加密在浏览器本地完成，采用 AES-256-GCM 工业级算法，无文件大小外泄",
  decryptEmptyHint: "选择 .enc 加密包或 .json 文件并输入密码进行解密",
  decryptEmptySubHint: "解密将校验完整性并还原原始文件与名称",
  errPasswordRequired: "请输入密码",
  errNoFileSelected: "请先选择需要加密的文件",
  errNoEncryptedFile: "请选择需要解密的加密文件",
  errEncryptFailed: "加密失败，请重试",
  errInvalidPassword: "解密失败：密码错误或密文已被篡改",
  errCorruptedFile: "解密失败：文件损坏或格式不支持",
  note:
    "说明：本工具使用 AES-256-GCM + PBKDF2(SHA-256) 在浏览器本地对任意类型文件进行强加密。默认导出紧凑二进制包（.enc），零体积冗余；同时支持 JSON 格式输出及历史兼容解密。全流程纯前端处理，文件绝不上传至任何服务器。",
} as const;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const readAsBytes = async (file: File): Promise<Uint8Array> =>
  new Uint8Array(await file.arrayBuffer());

export default function FileEncryptorClient() {
  return (
    <ToolPageLayout toolSlug="file-encryptor" maxWidthClassName="max-w-6xl">
      <FileEncryptorInner />
    </ToolPageLayout>
  );
}

function FileEncryptorInner() {
  const config = useOptionalToolConfig("file-encryptor");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const encryptInputRef = useRef<HTMLInputElement>(null);
  const decryptInputRef = useRef<HTMLInputElement>(null);

  // Common states
  const [mode, setMode] = useState<Mode>("encrypt");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Encrypt states
  const [fileToEncrypt, setFileToEncrypt] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("enc");
  const [iterations, setIterations] = useState(200_000);

  // Output states
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("encrypted.enc");
  const [jsonOutput, setJsonOutput] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [resultFileSize, setResultFileSize] = useState<number | null>(null);

  // Decrypt states
  const [encryptedFile, setEncryptedFile] = useState<File | null>(null);

  // Revoke object URLs on cleanup
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const clearOutputState = () => {
    setError(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    setJsonOutput("");
    setResultFileSize(null);
    setCopied(false);
  };

  const clearAll = () => {
    clearOutputState();
    setFileToEncrypt(null);
    setEncryptedFile(null);
    setPassword("");
    if (encryptInputRef.current) encryptInputRef.current.value = "";
    if (decryptInputRef.current) decryptInputRef.current.value = "";
  };

  const handleSelectEncryptFile = (file: File) => {
    clearOutputState();
    setFileToEncrypt(file);
    setDownloadName(
      outputFormat === "enc" ? `${file.name}.enc` : `${file.name}.enc.json`
    );
  };

  const handleSelectDecryptFile = (file: File) => {
    clearOutputState();
    setEncryptedFile(file);
    const base = file.name.replace(/\.(enc|enc\.json|json)$/i, "") || "decrypted-file";
    setDownloadName(base);
  };

  // Drag and drop handlers
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (!dropped) return;

    if (mode === "encrypt") {
      handleSelectEncryptFile(dropped);
    } else {
      handleSelectDecryptFile(dropped);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  // Run Encrypt
  const runEncrypt = async () => {
    if (!fileToEncrypt) {
      setError(ui.errNoFileSelected);
      return;
    }
    if (!password) {
      setError(ui.errPasswordRequired);
      return;
    }

    clearOutputState();
    setIsWorking(true);

    try {
      const rawBytes = await readAsBytes(fileToEncrypt);

      if (outputFormat === "enc") {
        // Binary AENC packaging
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const keyMaterial = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(password),
          "PBKDF2",
          false,
          ["deriveKey"]
        );

        const key = await crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt,
            iterations,
            hash: "SHA-256",
          },
          keyMaterial,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt"]
        );

        const ciphertextBuffer = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          rawBytes as Uint8Array<ArrayBuffer>
        );

        const packed = packAencBinary({
          filename: fileToEncrypt.name,
          salt,
          iv,
          iterations,
          ciphertext: new Uint8Array(ciphertextBuffer),
        });

        const blob = new Blob([packed as Uint8Array<ArrayBuffer>], {
          type: "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setDownloadName(`${fileToEncrypt.name}.enc`);
        setResultFileSize(packed.byteLength);
      } else {
        // JSON payload format
        const payload = await encryptBytes({
          bytes: rawBytes,
          password,
          iterations,
          meta: {
            name: fileToEncrypt.name,
            type: fileToEncrypt.type || "application/octet-stream",
            size: fileToEncrypt.size,
            createdAt: new Date().toISOString(),
          },
        });

        const text = `${JSON.stringify(payload, null, 2)}\n`;
        setJsonOutput(text);
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setDownloadName(`${fileToEncrypt.name}.enc.json`);
        setResultFileSize(blob.size);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errEncryptFailed);
    } finally {
      setIsWorking(false);
    }
  };

  // Run Decrypt
  const runDecrypt = async () => {
    if (!encryptedFile) {
      setError(ui.errNoEncryptedFile);
      return;
    }
    if (!password) {
      setError(ui.errPasswordRequired);
      return;
    }

    clearOutputState();
    setIsWorking(true);

    try {
      const bytes = await readAsBytes(encryptedFile);

      if (isAencContainer(bytes)) {
        // Unpack binary AENC
        const unpacked = unpackAencBinary(bytes);

        const keyMaterial = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(password),
          "PBKDF2",
          false,
          ["deriveKey"]
        );

        const key = await crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: unpacked.salt as Uint8Array<ArrayBuffer>,
            iterations: unpacked.iterations,
            hash: "SHA-256",
          },
          keyMaterial,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"]
        );

        const plaintextBuffer = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: unpacked.iv as Uint8Array<ArrayBuffer> },
          key,
          unpacked.ciphertext as Uint8Array<ArrayBuffer>
        );

        const plainBytes = new Uint8Array(plaintextBuffer);
        const blob = new Blob([plainBytes as Uint8Array<ArrayBuffer>], {
          type: "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setDownloadName(unpacked.filename || "decrypted-file");
        setResultFileSize(plainBytes.byteLength);
      } else {
        // JSON payload decrypt
        const text = new TextDecoder().decode(bytes);
        const payload = parseEncryptedPayload(text);
        const { bytes: decryptedBytes, meta } = await decryptBytes({ payload, password });

        const blob = new Blob([decryptedBytes as Uint8Array<ArrayBuffer>], {
          type: meta?.type || "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setDownloadName(meta?.name || "decrypted-file");
        setResultFileSize(decryptedBytes.byteLength);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes("operation failed") ||
        msg.includes("decrypt") ||
        msg.includes("Tag mismatch") ||
        msg.includes("password")
      ) {
        setError(ui.errInvalidPassword);
      } else {
        setError(ui.errCorruptedFile);
      }
    } finally {
      setIsWorking(false);
    }
  };

  const copyJson = async () => {
    if (!jsonOutput) return;
    try {
      await navigator.clipboard.writeText(jsonOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        {/* Top Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setMode("encrypt");
                clearOutputState();
              }}
              className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 font-semibold transition ${
                mode === "encrypt"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Lock className="h-4 w-4" />
              {ui.encrypt}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("decrypt");
                clearOutputState();
              }}
              className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 font-semibold transition ${
                mode === "decrypt"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Unlock className="h-4 w-4" />
              {ui.decrypt}
            </button>
          </div>

          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            <Trash2 className="h-4 w-4" />
            {ui.clear}
          </button>
        </div>

        {/* Note Banner */}
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-blue-50/70 p-4 text-xs text-blue-900 ring-1 ring-blue-100">
          <ShieldCheck className="h-5 w-5 shrink-0 text-blue-600" />
          <div className="leading-relaxed">{ui.note}</div>
        </div>

        {/* Workspace Grid */}
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* Left Column: 7 cols */}
          <div className="space-y-5 lg:col-span-7">
            {mode === "encrypt" ? (
              <>
                {/* Upload Zone */}
                <div
                  className={`rounded-3xl border-2 border-dashed p-6 transition ${
                    isDragging
                      ? "border-blue-500 bg-blue-50/50"
                      : "border-slate-200 bg-slate-50/60 hover:bg-slate-50"
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <input
                    ref={encryptInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (file) handleSelectEncryptFile(file);
                      e.target.value = "";
                    }}
                  />

                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="rounded-2xl bg-blue-100 p-3 text-blue-600">
                      <File className="h-8 w-8" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-800">
                      {fileToEncrypt ? (
                        ui.selectedFileTemplate
                          .replace("{name}", fileToEncrypt.name)
                          .replace("{size}", formatBytes(fileToEncrypt.size))
                      ) : (
                        ui.dropHintEncrypt
                      )}
                    </p>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => encryptInputRef.current?.click()}
                        className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                      >
                        <Upload className="h-4 w-4" />
                        {fileToEncrypt ? ui.replaceFile : ui.pickFile}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Encryption Configuration */}
                <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Settings className="h-4 w-4 text-slate-500" />
                    {ui.encryptOptions}
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                      {ui.password} <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={ui.passwordPlaceholder}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title={showPassword ? ui.hidePassword : ui.showPassword}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Format Selector */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                      {ui.format}
                    </label>
                    <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          setOutputFormat("enc");
                          if (fileToEncrypt) setDownloadName(`${fileToEncrypt.name}.enc`);
                        }}
                        className={`text-left rounded-2xl border p-3.5 transition ${
                          outputFormat === "enc"
                            ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-500"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-blue-900">
                          <FileArchive className="h-4 w-4 text-blue-600" />
                          {ui.formatEnc}
                        </div>
                        <div className="mt-1 text-[11px] leading-tight text-slate-500">
                          {ui.formatEncDesc}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOutputFormat("json");
                          if (fileToEncrypt) setDownloadName(`${fileToEncrypt.name}.enc.json`);
                        }}
                        className={`text-left rounded-2xl border p-3.5 transition ${
                          outputFormat === "json"
                            ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-500"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-800">
                          <FileCode className="h-4 w-4 text-slate-500" />
                          {ui.formatJson}
                        </div>
                        <div className="mt-1 text-[11px] leading-tight text-slate-500">
                          {ui.formatJsonDesc}
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Iterations */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span>{ui.iterations}</span>
                      <span className="font-mono text-slate-700">{iterations.toLocaleString()}</span>
                    </div>
                    <input
                      type="number"
                      min={10000}
                      max={2000000}
                      step={10000}
                      value={iterations}
                      onChange={(e) => setIterations(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <div className="mt-1 text-[11px] text-slate-400">{ui.iterationsHint}</div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="button"
                    onClick={() => void runEncrypt()}
                    disabled={isWorking || !fileToEncrypt || !password}
                    className="flex items-center justify-center gap-2 w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isWorking ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{ui.working}</span>
                      </>
                    ) : (
                      ui.runEncrypt
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* Decrypt Mode */
              <>
                <div
                  className={`rounded-3xl border-2 border-dashed p-6 transition ${
                    isDragging
                      ? "border-emerald-500 bg-emerald-50/50"
                      : "border-slate-200 bg-slate-50/60 hover:bg-slate-50"
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <input
                    ref={decryptInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (file) handleSelectDecryptFile(file);
                      e.target.value = "";
                    }}
                  />

                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-600">
                      <FileArchive className="h-8 w-8" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-800">
                      {encryptedFile ? (
                        ui.selectedFileTemplate
                          .replace("{name}", encryptedFile.name)
                          .replace("{size}", formatBytes(encryptedFile.size))
                      ) : (
                        ui.dropHintDecrypt
                      )}
                    </p>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => decryptInputRef.current?.click()}
                        className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                      >
                        <Upload className="h-4 w-4" />
                        {encryptedFile ? ui.replaceEncryptedFile : ui.pickEncryptedFile}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                      {ui.password} <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={ui.passwordPlaceholder}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 pr-11 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title={showPassword ? ui.hidePassword : ui.showPassword}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void runDecrypt()}
                    disabled={isWorking || !encryptedFile || !password}
                    className="flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isWorking ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{ui.working}</span>
                      </>
                    ) : (
                      ui.runDecrypt
                    )}
                  </button>
                </div>
              </>
            )}

            {error && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-rose-50 p-4 text-xs sm:text-sm text-rose-800 ring-1 ring-rose-200">
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Right Column: 5 cols */}
          <div className="space-y-5 lg:col-span-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {mode === "encrypt" ? (
                    <>
                      <Lock className="h-4 w-4 text-blue-600" />
                      <span>{ui.outputEncTitle}</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="h-4 w-4 text-emerald-600" />
                      <span>{ui.decryptResultTitle}</span>
                    </>
                  )}
                </div>

                {jsonOutput && (
                  <button
                    type="button"
                    onClick={() => void copyJson()}
                    className="flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? ui.copied : ui.copy}</span>
                  </button>
                )}
              </div>

              {downloadUrl ? (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-emerald-50 p-4 text-xs text-emerald-800 ring-1 ring-emerald-100 flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                    <div>
                      <div className="font-semibold text-emerald-900">
                        {mode === "encrypt" ? ui.encryptSuccess : ui.decryptSuccess}
                      </div>
                      <div className="mt-1 text-slate-600 leading-relaxed">
                        {ui.generatedFile}
                        <span className="font-mono font-medium">{downloadName}</span>
                        {resultFileSize && (
                          <>
                            <br />
                            {ui.resultSize} {formatBytes(resultFileSize)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <a
                    href={downloadUrl}
                    download={downloadName}
                    className={`flex items-center justify-center gap-2 w-full rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-md transition ${
                      mode === "encrypt"
                        ? "bg-blue-600 hover:bg-blue-700"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    <Download className="h-4 w-4" />
                    {ui.download} {downloadName}
                  </a>

                  {jsonOutput && (
                    <div className="rounded-2xl bg-slate-50 p-3 border border-slate-200">
                      <div className="text-[11px] font-mono text-slate-600 max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                        {jsonOutput}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                  {mode === "encrypt" ? (
                    <Lock className="h-10 w-10 stroke-1" />
                  ) : (
                    <Unlock className="h-10 w-10 stroke-1" />
                  )}
                  <p className="mt-3 text-xs">
                    {mode === "encrypt" ? ui.encryptEmptyHint : ui.decryptEmptyHint}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {mode === "encrypt" ? ui.encryptEmptySubHint : ui.decryptEmptySubHint}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
