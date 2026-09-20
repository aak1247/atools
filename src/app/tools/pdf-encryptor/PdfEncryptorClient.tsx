"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { encryptPDF, AlreadyEncryptedError } from "@pdfsmaller/pdf-encrypt";
import { decryptPDF } from "@pdfsmaller/pdf-decrypt";
import {
  Lock,
  Unlock,
  FileText,
  Upload,
  Download,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Settings,
  Printer,
  Copy,
  Edit3,
  CheckSquare,
  Loader2,
} from "lucide-react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { decryptBytes, parseEncryptedPayload } from "../../../lib/crypto/aes256gcm-pbkdf2";

type Mode = "encrypt" | "decrypt";
type EncryptionAlgorithm = "AES-256" | "RC4";

const DEFAULT_UI = {
  encrypt: "加密 PDF",
  decrypt: "解密 PDF",
  inputTitle: "输入",
  outputTitle: "输出",
  pickPdf: "选择 PDF 文件",
  replacePdf: "替换 PDF 文件",
  pickEncryptedPdf: "选择受保护的 PDF 文件",
  replaceEncryptedPdf: "替换受保护的 PDF 文件",
  dropHintEncrypt: "拖拽 PDF 文件到此处，或点击按钮上传。",
  dropHintDecrypt: "拖拽需要解密的 PDF 文件（或旧版加密 JSON）到此处。",
  password: "打开密码 (User Password)",
  passwordPlaceholder: "输入用于打开 PDF 的解密密码",
  ownerPassword: "管理密码 (Owner Password，可选)",
  ownerPasswordPlaceholder: "设置独立的权限管理密码（留空则同打开密码）",
  algorithm: "加密标准",
  aes256Label: "AES-256 (推荐，ISO 32000-2 / PDF 2.0)",
  aes256Desc: "现代国际标准，高强度安全加密。兼容 Adobe Acrobat、Chrome、Edge 及现代 PDF 阅读器。",
  rc4Label: "RC4 128-bit (经典兼容模式)",
  rc4Desc: "旧版 PDF 加密规范，安全性相对较弱，兼容老旧设备与旧版软件。",
  permissionsTitle: "权限限制设置",
  allowPrinting: "允许打印文档",
  allowCopying: "允许复制文字和内容",
  allowModifying: "允许修改文档内容",
  allowAnnotating: "允许批注与填写表单",
  runEncrypt: "加密并导出标准 PDF",
  runDecrypt: "解密并导出无密码 PDF",
  working: "处理中…",
  clear: "清空",
  download: "下载",
  downloadEncryptedPdf: "下载加密 PDF (带密码)",
  downloadDecryptedPdf: "下载已解密 PDF (无密码)",
  selectedFileTemplate: "已选择文件：{name} ({size})",
  encryptSuccess: "加密成功！已生成符合行业标准的受密码保护 PDF 文件",
  decryptSuccess: "解密成功！已成功移除密码保护，生成无密码 PDF",
  showPassword: "显示密码",
  hidePassword: "隐藏密码",
  fileInfo: "文件信息",
  outputPdfTitle: "加密输出 PDF",
  decryptResultTitle: "解密输出 PDF",
  generatedFile: "生成文件：",
  originalSize: "原始大小：",
  resultSize: "最终大小：",
  encryptEmptyHint: "选择 PDF 文件并设置密码后点击“加密并导出标准 PDF”",
  encryptEmptySubHint: "生成的 .pdf 文件可用 Adobe Acrobat、浏览器等任意 PDF 阅读器直接输入密码打开",
  decryptEmptyHint: "选择加密的 PDF 并输入密码后点击解密",
  decryptEmptySubHint: "解密后将移除密码限制，生成干净的无密码 PDF 文件",
  errPasswordRequired: "请输入密码",
  errNoPdfFile: "请选择有效的 PDF 文件",
  errInvalidPdfType: "请上传 .pdf 格式的文件",
  errAlreadyEncrypted: "该 PDF 文件本身已包含加密，请先在解密面板解密后再加密",
  errEncryptFailed: "PDF 加密失败，请重试",
  errInvalidPassword: "解密失败：密码错误，请核对密码后重试",
  errCorruptedFile: "解密失败：PDF 文件损坏或格式不受支持",
  note:
    "说明：本工具生成符合 ISO 32000 行业标准的密码保护 PDF 文件（AES-256 与 RC4 128-bit），生成的文件可在 Adobe Acrobat、Edge、Chrome 或任何标准阅读器中直接输入密码打开。全流程在浏览器本地纯前端完成，文件绝不上传至任何服务器。",
} as const;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const readAsBytes = async (file: File): Promise<Uint8Array> =>
  new Uint8Array(await file.arrayBuffer());

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

  const encryptInputRef = useRef<HTMLInputElement>(null);
  const decryptInputRef = useRef<HTMLInputElement>(null);

  // Common states
  const [mode, setMode] = useState<Mode>("encrypt");
  const [password, setPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Encrypt states
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [algorithm, setAlgorithm] = useState<EncryptionAlgorithm>("AES-256");
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(false);
  const [allowModifying, setAllowModifying] = useState(false);
  const [allowAnnotating, setAllowAnnotating] = useState(true);

  // Output states
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("document-encrypted.pdf");
  const [resultFileSize, setResultFileSize] = useState<number | null>(null);

  // Decrypt states
  const [encryptedFile, setEncryptedFile] = useState<File | null>(null);

  // Revoke object URL on cleanup
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
    setResultFileSize(null);
  };

  const clearAll = () => {
    clearOutputState();
    setPdfFile(null);
    setEncryptedFile(null);
    setPassword("");
    setOwnerPassword("");
    if (encryptInputRef.current) encryptInputRef.current.value = "";
    if (decryptInputRef.current) decryptInputRef.current.value = "";
  };

  const handleSelectEncryptPdf = (file: File) => {
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError(ui.errInvalidPdfType);
      return;
    }
    clearOutputState();
    setPdfFile(file);
    const base = file.name.replace(/\.pdf$/i, "") || "document";
    setDownloadName(`${base}-encrypted.pdf`);
  };

  const handleSelectDecryptFile = (file: File) => {
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isJson =
      file.type === "application/json" || file.name.toLowerCase().endsWith(".json");
    if (!isPdf && !isJson) {
      setError("请选择 .pdf 或 .json 文件");
      return;
    }
    clearOutputState();
    setEncryptedFile(file);
    const base = file.name.replace(/\.(pdf|enc\.json|json)$/i, "") || "document";
    setDownloadName(`${base}-decrypted.pdf`);
  };

  // Drag and drop handlers
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (!dropped) return;

    if (mode === "encrypt") {
      handleSelectEncryptPdf(dropped);
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
    if (!pdfFile) {
      setError(ui.errNoPdfFile);
      return;
    }
    if (!password) {
      setError(ui.errPasswordRequired);
      return;
    }

    clearOutputState();
    setIsWorking(true);

    try {
      const fileBytes = await readAsBytes(pdfFile);

      const encryptedBytes = await encryptPDF(fileBytes, password, {
        ownerPassword: ownerPassword.trim() || undefined,
        algorithm,
        allowPrinting,
        allowCopying,
        allowModifying,
        allowAnnotating,
        allowFillingForms: allowAnnotating,
      });

      const blob = new Blob([encryptedBytes as Uint8Array<ArrayBuffer>], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setResultFileSize(encryptedBytes.byteLength);
    } catch (e) {
      if (e instanceof AlreadyEncryptedError) {
        setError(ui.errAlreadyEncrypted);
      } else {
        setError(e instanceof Error ? e.message : ui.errEncryptFailed);
      }
    } finally {
      setIsWorking(false);
    }
  };

  // Run Decrypt
  const runDecrypt = async () => {
    if (!encryptedFile) {
      setError("请选择要解密的 PDF 文件");
      return;
    }
    if (!password) {
      setError(ui.errPasswordRequired);
      return;
    }

    clearOutputState();
    setIsWorking(true);

    try {
      const isJsonFile =
        encryptedFile.type === "application/json" ||
        encryptedFile.name.toLowerCase().endsWith(".json");

      if (isJsonFile) {
        // Backward compatibility for old .pdf.enc.json
        const jsonText = await encryptedFile.text();
        const payload = parseEncryptedPayload(jsonText);
        const { bytes } = await decryptBytes({ payload, password });

        const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
          type: "application/pdf",
        });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setResultFileSize(bytes.byteLength);
      } else {
        // Standard encrypted PDF file: unlock via pure JS WebCrypto
        const fileBytes = await readAsBytes(encryptedFile);
        const decryptedBytes = await decryptPDF(fileBytes, password);

        const blob = new Blob([decryptedBytes as Uint8Array<ArrayBuffer>], {
          type: "application/pdf",
        });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setResultFileSize(decryptedBytes.byteLength);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes("invalid password") ||
        msg.includes("Invalid password") ||
        msg.includes("password") ||
        msg.includes("Password") ||
        msg.includes("密码")
      ) {
        setError(ui.errInvalidPassword);
      } else {
        setError(ui.errCorruptedFile);
      }
    } finally {
      setIsWorking(false);
    }
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
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (file) handleSelectEncryptPdf(file);
                      e.target.value = "";
                    }}
                  />

                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="rounded-2xl bg-blue-100 p-3 text-blue-600">
                      <FileText className="h-8 w-8" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-800">
                      {pdfFile ? (
                        ui.selectedFileTemplate
                          .replace("{name}", pdfFile.name)
                          .replace("{size}", formatBytes(pdfFile.size))
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
                        {pdfFile ? ui.replacePdf : ui.pickPdf}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Password and Options */}
                <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Settings className="h-4 w-4 text-slate-500" />
                    加密选项与权限保护
                  </div>

                  {/* Passwords */}
                  <div className="grid gap-3 sm:grid-cols-2">
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
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                        {ui.ownerPassword}
                      </label>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={ownerPassword}
                        onChange={(e) => setOwnerPassword(e.target.value)}
                        placeholder={ui.ownerPasswordPlaceholder}
                        className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
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
                        onClick={() => setAlgorithm("AES-256")}
                        className={`text-left rounded-2xl border p-3.5 transition ${
                          algorithm === "AES-256"
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
                        onClick={() => setAlgorithm("RC4")}
                        className={`text-left rounded-2xl border p-3.5 transition ${
                          algorithm === "RC4"
                            ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-500"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="font-semibold text-xs text-slate-800">
                          {ui.rc4Label}
                        </div>
                        <div className="mt-1 text-[11px] leading-tight text-slate-500">
                          {ui.rc4Desc}
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Permissions Checklist */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                      {ui.permissionsTitle}
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-700">
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={allowPrinting}
                          onChange={(e) => setAllowPrinting(e.target.checked)}
                          className="rounded accent-blue-600"
                        />
                        <Printer className="h-3.5 w-3.5 text-slate-500" />
                        <span>{ui.allowPrinting}</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={allowCopying}
                          onChange={(e) => setAllowCopying(e.target.checked)}
                          className="rounded accent-blue-600"
                        />
                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                        <span>{ui.allowCopying}</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={allowModifying}
                          onChange={(e) => setAllowModifying(e.target.checked)}
                          className="rounded accent-blue-600"
                        />
                        <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                        <span>{ui.allowModifying}</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={allowAnnotating}
                          onChange={(e) => setAllowAnnotating(e.target.checked)}
                          className="rounded accent-blue-600"
                        />
                        <CheckSquare className="h-3.5 w-3.5 text-slate-500" />
                        <span>{ui.allowAnnotating}</span>
                      </label>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="button"
                    onClick={() => void runEncrypt()}
                    disabled={isWorking || !pdfFile || !password}
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
                    accept=".pdf,.json,application/pdf,application/json"
                    className="hidden"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (file) handleSelectDecryptFile(file);
                      e.target.value = "";
                    }}
                  />

                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-600">
                      <FileText className="h-8 w-8" />
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
                        {encryptedFile ? ui.replaceEncryptedPdf : ui.pickEncryptedPdf}
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
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                {mode === "encrypt" ? (
                  <>
                    <Lock className="h-4 w-4 text-blue-600" />
                    <span>{ui.outputPdfTitle}</span>
                  </>
                ) : (
                  <>
                    <Unlock className="h-4 w-4 text-emerald-600" />
                    <span>{ui.decryptResultTitle}</span>
                  </>
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
                    {mode === "encrypt" ? ui.downloadEncryptedPdf : ui.downloadDecryptedPdf}
                  </a>
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
