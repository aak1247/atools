"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ZipWriter,
  ZipReader,
  BlobReader,
  BlobWriter,
  Uint8ArrayReader,
  configure,
} from "@zip.js/zip.js";
import {
  Lock,
  Unlock,
  FileArchive,
  File as FileIcon,
  Folder,
  Upload,
  Download,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  FolderArchive,
  ShieldCheck,
  Settings,
  Loader2,
} from "lucide-react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { decryptBytes, parseEncryptedPayload } from "../../../lib/crypto/aes256gcm-pbkdf2";

if (typeof window !== "undefined") {
  configure({ useWebWorkers: false });
}

type Mode = "encrypt" | "decrypt";
type EncryptionAlgorithm = "aes256" | "zipCrypto";

interface DecryptedFileItem {
  filename: string;
  size: number;
  blob: Blob;
  url: string;
}

interface ArchiveMeta {
  isEncrypted: boolean;
  totalEntries: number;
  fileCount: number;
  dirCount: number;
  totalUncompressedSize: number;
  isLegacyJson: boolean;
}

const DEFAULT_UI = {
  encrypt: "加密 ZIP",
  decrypt: "解密 ZIP",
  inputTitle: "输入",
  pickFiles: "选择文件",
  addMoreFiles: "添加更多文件",
  pickEncryptedZip: "选择加密 ZIP 文件",
  replaceEncryptedZip: "替换 ZIP 文件",
  dropHintEncrypt: "拖拽文件到此处，或点击按钮上传。支持选择多个文件。",
  dropHintDecrypt: "拖拽待解密的 .zip 文件到此处，或点击上传。",
  password: "解压密码",
  passwordPlaceholder: "输入用于加密/解密的密码",
  passwordOptionalPlaceholder: "此文件未加密，可留空",
  algorithm: "加密算法",
  aes256Label: "WinZip AES-256 (推荐，高强度)",
  aes256Desc: "现代主流标准，高安全性。兼容 7-Zip、WinRAR、Win11、macOS 等现代解压软件。",
  zipCryptoLabel: "ZipCrypto (传统旧格式兼容)",
  zipCryptoDesc: "传统 ZIP 加密规范，安全性较弱，但兼容极老旧系统和 Windows 旧版本原生解压。",
  zipLevel: "压缩等级",
  zipLevelHint: "0: 仅打包不压缩；1: 最快；6: 标准；9: 极限压缩",
  outputArchiveName: "输出文件名",
  runEncrypt: "生成加密 ZIP",
  runDecrypt: "解密并提取文件",
  runExtractUnencrypted: "提取文件 (无密码)",
  working: "处理中…",
  clear: "清空",
  download: "下载",
  downloadAllUnencrypted: "一键打包下载全部文件 (无密码 ZIP)",
  downloadEncryptedZip: "下载加密 ZIP 压缩包",
  selectedFilesCount: "已添加 {count} 个文件 (共 {size})",
  selectedEncryptedFile: "已选择文件：{name} ({size})",
  encryptSuccess: "加密成功！已生成标准受密码保护的 ZIP 压缩包",
  decryptSuccess: "解密成功！已成功提取 {count} 个文件 (共 {size})",
  fileListPreview: "文件列表",
  fileName: "文件名",
  fileSize: "大小",
  action: "操作",
  emptyFileList: "暂未添加文件",
  removeFile: "移除文件",
  encryptOptions: "加密与压缩选项",
  showPassword: "显示密码",
  hidePassword: "隐藏密码",
  filesCountTemplate: "{count} 个文件",
  foldersCountTemplate: "{count} 个文件夹",
  totalSizeTemplate: "(共 {size})",
  noPasswordNeeded: "(未加密压缩包无需密码)",
  outputZipTitle: "加密输出 ZIP",
  generatedFile: "生成文件：",
  compressedSize: "压缩后大小：",
  originalSize: "原始",
  encryptEmptyHint: "设置文件与密码后点击“生成加密 ZIP”",
  encryptEmptySubHint: "生成的 .zip 文件可被各类常用解压软件直接识别与解密",
  decryptResultTitle: "解密结果与提取",
  downloadSingleFile: "下载此文件",
  decryptEmptyHint: "选择 ZIP 压缩包后点击解密提取",
  decryptEmptySubHint: "支持标准加密 ZIP（AES-256、ZipCrypto）以及未加密 ZIP 的在线查看与提取",
  decryptingJson: "正在解密 JSON 数据包…",
  generatingUnencryptedZip: "正在生成无密码 ZIP 压缩包…",
  detectedEncrypted: "受密码保护",
  detectedUnencrypted: "未设置密码",
  detectedEncryptedDesc: "检测到压缩包包含加密内容，需要输入密码进行解密与提取。",
  detectedUnencryptedDesc: "检测到此 ZIP 压缩包未加密，可直接点击提取所有内容。",
  decryptingProgress: "正在解密 ({current}/{total}): {name}",
  encryptingProgress: "正在打包与加密 ({current}/{total}): {name}",
  errPasswordRequired: "此压缩包已加密，请输入密码后再解密",
  errNoFilesSelected: "请至少选择一个待打包的文件",
  errNoEncryptedFile: "请选择需要解密的 ZIP 文件",
  errEncryptFailed: "加密打包失败，请重试",
  errInvalidPassword: "解密失败：密码错误，请检查输入的密码是否正确",
  errCorruptedFile: "解密失败：ZIP 文件已损坏、不完整或格式不支持",
  note:
    "说明：本工具基于行业标准规范（WinZip AES-256 与 ZipCrypto），生成的加密 .zip 可在 7-Zip、WinRAR、macOS 归档实用工具或 Windows 资源管理器中直接双击输入密码解压。解密功能同样支持标准加密 ZIP 在线输入密码提取或转换为无密码 ZIP。全流程在浏览器本地纯前端完成，文件绝不上传至任何服务器。",
} as const;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

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

  const filesInputRef = useRef<HTMLInputElement>(null);
  const decryptFileInputRef = useRef<HTMLInputElement>(null);

  // Common states
  const [mode, setMode] = useState<Mode>("encrypt");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Encrypt states
  const [filesToEncrypt, setFilesToEncrypt] = useState<File[]>([]);
  const [algorithm, setAlgorithm] = useState<EncryptionAlgorithm>("aes256");
  const [zipLevel, setZipLevel] = useState<number>(6);
  const [archiveName, setArchiveName] = useState<string>("archive-encrypted.zip");
  const [encryptedDownloadUrl, setEncryptedDownloadUrl] = useState<string | null>(null);
  const [encryptedZipBlob, setEncryptedZipBlob] = useState<Blob | null>(null);

  // Decrypt states
  const [encryptedFile, setEncryptedFile] = useState<File | null>(null);
  const [archiveMeta, setArchiveMeta] = useState<ArchiveMeta | null>(null);
  const [decryptedFiles, setDecryptedFiles] = useState<DecryptedFileItem[]>([]);
  const [unencryptedZipUrl, setUnencryptedZipUrl] = useState<string | null>(null);
  const [unencryptedZipName, setUnencryptedZipName] = useState<string>("decrypted.zip");

  // Revoke object URLs on cleanup
  useEffect(() => {
    return () => {
      if (encryptedDownloadUrl) URL.revokeObjectURL(encryptedDownloadUrl);
      if (unencryptedZipUrl) URL.revokeObjectURL(unencryptedZipUrl);
      decryptedFiles.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [encryptedDownloadUrl, unencryptedZipUrl, decryptedFiles]);

  const clearOutputState = () => {
    setError(null);
    setProgressStatus(null);
    if (encryptedDownloadUrl) {
      URL.revokeObjectURL(encryptedDownloadUrl);
      setEncryptedDownloadUrl(null);
    }
    setEncryptedZipBlob(null);

    if (unencryptedZipUrl) {
      URL.revokeObjectURL(unencryptedZipUrl);
      setUnencryptedZipUrl(null);
    }
    decryptedFiles.forEach((item) => URL.revokeObjectURL(item.url));
    setDecryptedFiles([]);
  };

  const clearAll = () => {
    clearOutputState();
    setFilesToEncrypt([]);
    setEncryptedFile(null);
    setArchiveMeta(null);
    setPassword("");
    if (filesInputRef.current) filesInputRef.current.value = "";
    if (decryptFileInputRef.current) decryptFileInputRef.current.value = "";
  };

  const totalInputSize = useMemo(() => {
    return filesToEncrypt.reduce((sum, f) => sum + f.size, 0);
  }, [filesToEncrypt]);

  const totalDecryptedSize = useMemo(() => {
    return decryptedFiles.reduce((sum, f) => sum + f.size, 0);
  }, [decryptedFiles]);

  // Handle files selected for encryption
  const handleAddFiles = (picked: File[]) => {
    if (picked.length === 0) return;
    clearOutputState();
    setFilesToEncrypt((prev) => {
      const combined = [...prev, ...picked];
      if (prev.length === 0 && picked.length > 0) {
        const baseName = picked[0].name.replace(/\.[^/.]+$/, "");
        setArchiveName(`${baseName}-encrypted.zip`);
      }
      return combined;
    });
  };

  const handleRemoveFile = (index: number) => {
    clearOutputState();
    setFilesToEncrypt((prev) => prev.filter((_, i) => i !== index));
  };

  // Inspect uploaded file in decrypt mode
  const handleSetEncryptedFile = async (file: File) => {
    clearOutputState();
    setEncryptedFile(file);

    const baseName = file.name.replace(/\.(zip|enc\.json|json)$/i, "");
    setUnencryptedZipName(`${baseName || "archive"}-decrypted.zip`);

    const isJson =
      file.type === "application/json" || file.name.toLowerCase().endsWith(".json");

    if (isJson) {
      setArchiveMeta({
        isEncrypted: true,
        totalEntries: 1,
        fileCount: 1,
        dirCount: 0,
        totalUncompressedSize: file.size,
        isLegacyJson: true,
      });
      return;
    }

    // Inspect standard ZIP file header
    try {
      const zipReader = new ZipReader(new BlobReader(file));
      const entries = await zipReader.getEntries();
      await zipReader.close();

      const isEncrypted = entries.some((e) => e.encrypted);
      const fileEntries = entries.filter((e) => !e.directory);
      const dirCount = entries.length - fileEntries.length;
      const totalSize = fileEntries.reduce(
        (sum, e) => sum + (e.uncompressedSize || 0),
        0
      );

      setArchiveMeta({
        isEncrypted,
        totalEntries: entries.length,
        fileCount: fileEntries.length,
        dirCount,
        totalUncompressedSize: totalSize,
        isLegacyJson: false,
      });
    } catch {
      setError(ui.errCorruptedFile);
      setArchiveMeta(null);
    }
  };

  // Drag and drop handlers
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (!dropped.length) return;

    if (mode === "encrypt") {
      handleAddFiles(dropped);
    } else {
      void handleSetEncryptedFile(dropped[0]);
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
    if (filesToEncrypt.length === 0) {
      setError(ui.errNoFilesSelected);
      return;
    }
    if (!password) {
      setError(ui.errPasswordRequired);
      return;
    }

    clearOutputState();
    setIsWorking(true);

    try {
      const zipWriter = new ZipWriter(new BlobWriter("application/zip"), {
        password: password,
        encryptionStrength: algorithm === "aes256" ? 3 : undefined,
        zipCrypto: algorithm === "zipCrypto",
        level: Math.max(0, Math.min(9, Math.round(zipLevel))),
      });

      for (let i = 0; i < filesToEncrypt.length; i++) {
        const file = filesToEncrypt[i];
        setProgressStatus(
          ui.encryptingProgress
            .replace("{current}", String(i + 1))
            .replace("{total}", String(filesToEncrypt.length))
            .replace("{name}", file.name)
        );
        await zipWriter.add(file.name, new BlobReader(file));
      }

      setProgressStatus(ui.working);
      const blob = await zipWriter.close();
      const url = URL.createObjectURL(blob);

      setEncryptedZipBlob(blob);
      setEncryptedDownloadUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errEncryptFailed);
    } finally {
      setIsWorking(false);
      setProgressStatus(null);
    }
  };

  // Run Decrypt
  const runDecrypt = async () => {
    if (!encryptedFile) {
      setError(ui.errNoEncryptedFile);
      return;
    }

    const needsPassword = archiveMeta ? archiveMeta.isEncrypted : true;
    if (needsPassword && !password) {
      setError(ui.errPasswordRequired);
      return;
    }

    clearOutputState();
    setIsWorking(true);

    try {
      const isJsonFile =
        archiveMeta?.isLegacyJson ||
        encryptedFile.type === "application/json" ||
        encryptedFile.name.toLowerCase().endsWith(".json");

      if (isJsonFile) {
        // Backward compatibility for old .zip.enc.json payload
        setProgressStatus(ui.decryptingJson);
        const jsonText = await encryptedFile.text();
        const payload = parseEncryptedPayload(jsonText);
        const { bytes, meta } = await decryptBytes({ payload, password });

        const reader = new ZipReader(new Uint8ArrayReader(bytes));
        const entries = await reader.getEntries();
        const items: DecryptedFileItem[] = [];

        for (const entry of entries) {
          if (entry.directory) continue;
          const dataBlob = await entry.getData(new BlobWriter());
          const itemUrl = URL.createObjectURL(dataBlob);
          items.push({
            filename: entry.filename,
            size: entry.uncompressedSize || dataBlob.size,
            blob: dataBlob,
            url: itemUrl,
          });
        }
        await reader.close();

        const plainBlob = new Blob([bytesToArrayBuffer(bytes)], {
          type: "application/zip",
        });
        const plainUrl = URL.createObjectURL(plainBlob);
        setUnencryptedZipUrl(plainUrl);
        setUnencryptedZipName(
          meta?.name?.replace(/\.enc\.json$/i, ".zip") || "decrypted.zip"
        );
        setDecryptedFiles(items);
      } else {
        // Standard encrypted or unencrypted ZIP file
        const zipReader = new ZipReader(new BlobReader(encryptedFile));
        const entries = await zipReader.getEntries();
        const fileEntries = entries.filter((e) => !e.directory);
        const items: DecryptedFileItem[] = [];

        let count = 0;
        for (const entry of entries) {
          if (entry.directory) continue;
          count++;
          setProgressStatus(
            ui.decryptingProgress
              .replace("{current}", String(count))
              .replace("{total}", String(fileEntries.length))
              .replace("{name}", entry.filename)
          );

          try {
            const dataBlob = await entry.getData(
              new BlobWriter(),
              entry.encrypted ? { password } : undefined
            );
            const itemUrl = URL.createObjectURL(dataBlob);
            items.push({
              filename: entry.filename,
              size: entry.uncompressedSize || dataBlob.size,
              blob: dataBlob,
              url: itemUrl,
            });
          } catch (entryErr) {
            await zipReader.close();
            const errMsg = entryErr instanceof Error ? entryErr.message : String(entryErr);
            if (errMsg.includes("password") || errMsg.includes("Password") || errMsg.includes("encrypted")) {
              throw new Error(ui.errInvalidPassword);
            }
            throw new Error(ui.errCorruptedFile);
          }
        }
        await zipReader.close();

        // Build unencrypted repackaged ZIP preserving folder hierarchy
        setProgressStatus(ui.generatingUnencryptedZip);
        const unencryptedWriter = new ZipWriter(new BlobWriter("application/zip"));
        for (const entry of entries) {
          if (entry.directory) {
            await unencryptedWriter.add(entry.filename, undefined, { directory: true });
          } else {
            const decryptedItem = items.find((i) => i.filename === entry.filename);
            if (decryptedItem) {
              await unencryptedWriter.add(
                entry.filename,
                new BlobReader(decryptedItem.blob)
              );
            }
          }
        }
        const repackBlob = await unencryptedWriter.close();
        const repackUrl = URL.createObjectURL(repackBlob);

        setUnencryptedZipUrl(repackUrl);
        setDecryptedFiles(items);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("password") || msg.includes("Password") || msg.includes("密码")) {
        setError(ui.errInvalidPassword);
      } else if (msg.includes("format") || msg.includes("corrupt") || msg.includes("EOF")) {
        setError(ui.errCorruptedFile);
      } else {
        setError(msg);
      }
    } finally {
      setIsWorking(false);
      setProgressStatus(null);
    }
  };

  const finalArchiveName = archiveName.trim()
    ? archiveName.trim().toLowerCase().endsWith(".zip")
      ? archiveName.trim()
      : `${archiveName.trim()}.zip`
    : "archive-encrypted.zip";

  const isDecryptReady = Boolean(
    encryptedFile &&
      (!archiveMeta || !archiveMeta.isEncrypted || password.trim().length > 0)
  );

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        {/* Top Header & Mode Switcher */}
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

        {/* Security & Standard Note Banner */}
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-blue-50/70 p-4 text-xs text-blue-900 ring-1 ring-blue-100">
          <ShieldCheck className="h-5 w-5 shrink-0 text-blue-600" />
          <div className="leading-relaxed">{ui.note}</div>
        </div>

        {/* Main Workspace Layout */}
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* Left Column: Input & Options (7 cols on lg) */}
          <div className="space-y-5 lg:col-span-7">
            {/* Mode: Encrypt View */}
            {mode === "encrypt" ? (
              <>
                {/* Drag and Drop Box */}
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
                    ref={filesInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const picked = Array.from(e.target.files ?? []);
                      handleAddFiles(picked);
                      e.target.value = "";
                    }}
                  />

                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="rounded-2xl bg-blue-100 p-3 text-blue-600">
                      <FolderArchive className="h-8 w-8" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-800">
                      {filesToEncrypt.length > 0 ? (
                        ui.selectedFilesCount
                          .replace("{count}", String(filesToEncrypt.length))
                          .replace("{size}", formatBytes(totalInputSize))
                      ) : (
                        ui.dropHintEncrypt
                      )}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => filesInputRef.current?.click()}
                        className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                      >
                        <Upload className="h-4 w-4" />
                        {filesToEncrypt.length > 0 ? ui.addMoreFiles : ui.pickFiles}
                      </button>
                    </div>
                  </div>

                  {/* Selected files list */}
                  {filesToEncrypt.length > 0 && (
                    <div className="mt-5 max-h-52 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2">
                      <div className="divide-y divide-slate-100">
                        {filesToEncrypt.map((f, idx) => (
                          <div
                            key={`${f.name}-${idx}`}
                            className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <FileIcon className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className="truncate font-medium text-slate-700">
                                {f.name}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <span className="text-slate-400">
                                {formatBytes(f.size)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(idx)}
                                className="text-slate-400 hover:text-rose-600 transition"
                                title={ui.removeFile}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Encryption Configuration Card */}
                <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Settings className="h-4 w-4 text-slate-500" />
                    {ui.encryptOptions}
                  </div>

                  {/* Password Input */}
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 pr-11 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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

                  {/* Algorithm Selector */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                      {ui.algorithm}
                    </label>
                    <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setAlgorithm("aes256")}
                        className={`text-left rounded-2xl border p-3.5 transition ${
                          algorithm === "aes256"
                            ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-500"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="font-semibold text-xs text-blue-900">
                          {ui.aes256Label}
                        </div>
                        <div className="mt-1 text-[11px] leading-tight text-slate-500">
                          {ui.aes256Desc}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAlgorithm("zipCrypto")}
                        className={`text-left rounded-2xl border p-3.5 transition ${
                          algorithm === "zipCrypto"
                            ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-500"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="font-semibold text-xs text-slate-800">
                          {ui.zipCryptoLabel}
                        </div>
                        <div className="mt-1 text-[11px] leading-tight text-slate-500">
                          {ui.zipCryptoDesc}
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Compression Level & Output Name */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>{ui.zipLevel}</span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-800">
                          {zipLevel}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={9}
                        step={1}
                        value={zipLevel}
                        onChange={(e) => setZipLevel(Number(e.target.value))}
                        className="mt-2 w-full accent-blue-600"
                      />
                      <div className="mt-1 text-[11px] text-slate-400">
                        {ui.zipLevelHint}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        {ui.outputArchiveName}
                      </label>
                      <input
                        type="text"
                        value={archiveName}
                        onChange={(e) => setArchiveName(e.target.value)}
                        placeholder="archive-encrypted.zip"
                        className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="button"
                    onClick={() => void runEncrypt()}
                    disabled={isWorking || filesToEncrypt.length === 0 || !password}
                    className="flex items-center justify-center gap-2 w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isWorking ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{progressStatus || ui.working}</span>
                      </>
                    ) : (
                      ui.runEncrypt
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* Mode: Decrypt View */
              <>
                {/* Drag and Drop Box for Encrypted ZIP */}
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
                    ref={decryptFileInputRef}
                    type="file"
                    accept=".zip,.json,application/zip,application/json"
                    className="hidden"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (file) void handleSetEncryptedFile(file);
                      e.target.value = "";
                    }}
                  />

                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-600">
                      <FileArchive className="h-8 w-8" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-800">
                      {encryptedFile ? (
                        ui.selectedEncryptedFile
                          .replace("{name}", encryptedFile.name)
                          .replace("{size}", formatBytes(encryptedFile.size))
                      ) : (
                        ui.dropHintDecrypt
                      )}
                    </p>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => decryptFileInputRef.current?.click()}
                        className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                      >
                        <Upload className="h-4 w-4" />
                        {encryptedFile ? ui.replaceEncryptedZip : ui.pickEncryptedZip}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pre-inspection info card */}
                {archiveMeta && (
                  <div
                    className={`rounded-3xl border p-4 text-xs transition ${
                      archiveMeta.isEncrypted
                        ? "border-amber-200 bg-amber-50/60 text-amber-900"
                        : "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <div className="flex items-center gap-2">
                        {archiveMeta.isEncrypted ? (
                          <Lock className="h-4 w-4 text-amber-600" />
                        ) : (
                          <Unlock className="h-4 w-4 text-emerald-600" />
                        )}
                        <span>
                          {archiveMeta.isEncrypted
                            ? ui.detectedEncrypted
                            : ui.detectedUnencrypted}
                        </span>
                      </div>
                      <span className="text-[11px] font-normal text-slate-500">
                        {ui.filesCountTemplate.replace("{count}", String(archiveMeta.fileCount))}
                        {archiveMeta.dirCount > 0
                          ? ` · ${ui.foldersCountTemplate.replace("{count}", String(archiveMeta.dirCount))}`
                          : ""}
                        {archiveMeta.totalUncompressedSize > 0
                          ? ` ${ui.totalSizeTemplate.replace("{size}", formatBytes(archiveMeta.totalUncompressedSize))}`
                          : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] opacity-80">
                      {archiveMeta.isEncrypted
                        ? ui.detectedEncryptedDesc
                        : ui.detectedUnencryptedDesc}
                    </p>
                  </div>
                )}

                {/* Decryption Password Card */}
                <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                        {ui.password}{" "}
                        {archiveMeta?.isEncrypted ? (
                          <span className="text-rose-500">*</span>
                        ) : (
                          <span className="text-slate-400 font-normal">
                            {ui.noPasswordNeeded}
                          </span>
                        )}
                      </label>
                    </div>
                    <div className="relative mt-1.5">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={
                          archiveMeta && !archiveMeta.isEncrypted
                            ? ui.passwordOptionalPlaceholder
                            : ui.passwordPlaceholder
                        }
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

                  {/* Submit Decrypt Button */}
                  <button
                    type="button"
                    onClick={() => void runDecrypt()}
                    disabled={isWorking || !isDecryptReady}
                    className="flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isWorking ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{progressStatus || ui.working}</span>
                      </>
                    ) : archiveMeta && !archiveMeta.isEncrypted ? (
                      ui.runExtractUnencrypted
                    ) : (
                      ui.runDecrypt
                    )}
                  </button>
                </div>
              </>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-rose-50 p-4 text-xs sm:text-sm text-rose-800 ring-1 ring-rose-200">
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Right Column: Output & Result (5 cols on lg) */}
          <div className="space-y-5 lg:col-span-5">
            {mode === "encrypt" ? (
              /* Encrypt Output Panel */
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileArchive className="h-4 w-4 text-blue-600" />
                  {ui.outputZipTitle}
                </div>

                {encryptedDownloadUrl && encryptedZipBlob ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-emerald-50 p-4 text-xs text-emerald-800 ring-1 ring-emerald-100 flex items-start gap-2.5">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                      <div>
                        <div className="font-semibold text-emerald-900">{ui.encryptSuccess}</div>
                        <div className="mt-1 text-slate-600">
                          {ui.generatedFile}<span className="font-mono font-medium">{finalArchiveName}</span>
                          <br />
                          {ui.compressedSize}{formatBytes(encryptedZipBlob.size)} ({ui.originalSize} {formatBytes(totalInputSize)})
                        </div>
                      </div>
                    </div>

                    <a
                      href={encryptedDownloadUrl}
                      download={finalArchiveName}
                      className="flex items-center justify-center gap-2 w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700"
                    >
                      <Download className="h-4 w-4" />
                      {ui.downloadEncryptedZip}
                    </a>

                    <div className="border-t border-slate-100 pt-3">
                      <div className="text-xs font-semibold text-slate-600 mb-2">
                        {ui.fileListPreview} ({filesToEncrypt.length})
                      </div>
                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-xl bg-slate-50 p-2 text-xs">
                        {filesToEncrypt.map((f, i) => (
                          <div key={i} className="flex justify-between py-1.5 px-2">
                            <span className="truncate font-mono text-slate-700">{f.name}</span>
                            <span className="shrink-0 text-slate-500">{formatBytes(f.size)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                    <Lock className="h-10 w-10 stroke-1" />
                    <p className="mt-3 text-xs">{ui.encryptEmptyHint}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {ui.encryptEmptySubHint}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Decrypt Output Panel */
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Unlock className="h-4 w-4 text-emerald-600" />
                  {ui.decryptResultTitle}
                </div>

                {decryptedFiles.length > 0 ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-emerald-50 p-4 text-xs text-emerald-800 ring-1 ring-emerald-100 flex items-start gap-2.5">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                      <div>
                        <div className="font-semibold text-emerald-900">
                          {ui.decryptSuccess
                            .replace("{count}", String(decryptedFiles.length))
                            .replace("{size}", formatBytes(totalDecryptedSize))}
                        </div>
                      </div>
                    </div>

                    {unencryptedZipUrl && (
                      <a
                        href={unencryptedZipUrl}
                        download={unencryptedZipName}
                        className="flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700"
                      >
                        <Download className="h-4 w-4" />
                        {ui.downloadAllUnencrypted}
                      </a>
                    )}

                    <div className="border-t border-slate-100 pt-3">
                      <div className="text-xs font-semibold text-slate-600 mb-2">
                        {ui.fileListPreview} ({decryptedFiles.length})
                      </div>
                      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-xl bg-slate-50 p-2 text-xs">
                        {decryptedFiles.map((fileItem, idx) => {
                          const isNested = fileItem.filename.includes("/");
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-2 py-2 px-2 hover:bg-slate-100/80 rounded-lg transition"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {isNested ? (
                                  <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                ) : (
                                  <FileIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                )}
                                <span
                                  className="truncate font-mono text-slate-800"
                                  title={fileItem.filename}
                                >
                                  {fileItem.filename}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center gap-3">
                                <span className="text-slate-500">
                                  {formatBytes(fileItem.size)}
                                </span>
                                <a
                                  href={fileItem.url}
                                  download={fileItem.filename.split("/").pop() || "file"}
                                  className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-medium"
                                  title={`${ui.downloadSingleFile}: ${fileItem.filename}`}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  <span>{ui.download}</span>
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                    <Unlock className="h-10 w-10 stroke-1" />
                    <p className="mt-3 text-xs">{ui.decryptEmptyHint}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {ui.decryptEmptySubHint}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
