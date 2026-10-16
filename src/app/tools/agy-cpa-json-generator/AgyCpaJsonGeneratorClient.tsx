"use client";

import type { FC } from "react";
import { useMemo, useState } from "react";
import { zipSync } from "fflate";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

const DEFAULT_UI = {
  hint: "支持批量多行粘贴 CPA 格式账号行（每行一条，自动忽略空行），实时批量生成 Antigravity 客户端使用的 JSON 配置文件；全部处理在浏览器本地完成，数据不会上传。",
  formatHint: "格式：邮箱----密码--------client_id----refresh_token（任意 ≥4 个连续短横线都视为分隔符）",
  inputTitle: "账号输入（每行一条，支持批量粘贴）",
  inputPlaceholder: "email@gmail.com----password--------clientid----1//RefreshTokenString",
  statsTemplate: "共 {total} 行：成功 {ok} 条，失败 {failed} 条",
  blankIgnoredTemplate: "已自动忽略 {blank} 个空行",
  outputTitle: "生成结果",
  emptyResult: "输入 CPA 账号行后，这里会实时显示生成的 JSON 文件。",
  pretty: "缩进输出",
  copy: "复制",
  copied: "已复制",
  download: "下载",
  downloadAll: "打包下载 ZIP",
  downloadEach: "逐个下载全部",
  clear: "清空",
  errNoEmail: "缺少邮箱字段",
  errInvalidEmail: "邮箱格式无效",
  errNoToken: "字段不足，缺少 refresh_token",
  errDuplicate: "邮箱重复，已跳过",
  warnTokenFormat: "refresh_token 未以 1// 开头，请确认是否为有效的 Google OAuth token",
} as const;

type Ui = typeof DEFAULT_UI;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD_SEPARATOR = /-{4,}/;

type GeneratedFile = {
  email: string;
  fileName: string;
  json: string;
  warn: string | null;
};

type ParseErrorItem = {
  raw: string;
  error: string;
};

type ParseResult = {
  files: GeneratedFile[];
  errors: ParseErrorItem[];
  blankLines: number;
};

const buildAccountPayload = (
  email: string,
  refreshToken: string,
  expired: string,
  timestamp: number,
) => ({
  access_token: "",
  disabled: false,
  email,
  expired,
  expires_in: 3599,
  project_id: "aicode-consumers",
  refresh_token: refreshToken,
  timestamp,
  type: "antigravity",
});

const parseInput = (raw: string, pretty: boolean, ui: Ui): ParseResult => {
  const timestamp = Date.now();
  const expired = new Date(timestamp).toISOString().replace(/\.\d{3}Z$/, "Z");
  const seenEmails = new Set<string>();
  const files: GeneratedFile[] = [];
  const errors: ParseErrorItem[] = [];
  let blankLines = 0;

  // 去掉粘贴内容末尾的换行符，避免被计成空行
  const lines = raw.replace(/\r\n?$/, "").split(/\r\n|\r|\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    // 空行与只含短横线的分隔行一律过滤
    if (!line || /^-+$/.test(line)) {
      blankLines += 1;
      continue;
    }

    const fields = line.split(FIELD_SEPARATOR).map((field) => field.trim());
    const email = fields[0] ?? "";
    const refreshToken = fields.length >= 2 ? fields[fields.length - 1] ?? "" : "";

    if (!email) {
      errors.push({ raw: line, error: ui.errNoEmail });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      errors.push({ raw: line, error: ui.errInvalidEmail });
      continue;
    }
    if (!refreshToken) {
      errors.push({ raw: line, error: ui.errNoToken });
      continue;
    }
    if (seenEmails.has(email.toLowerCase())) {
      errors.push({ raw: line, error: ui.errDuplicate });
      continue;
    }
    seenEmails.add(email.toLowerCase());

    files.push({
      email,
      fileName: `antigravity-${email}.json`,
      json: JSON.stringify(buildAccountPayload(email, refreshToken, expired, timestamp), null, pretty ? 2 : 0),
      warn: refreshToken.startsWith("1//") ? null : ui.warnTokenFormat,
    });
  }

  return { files, errors, blankLines };
};

const applyTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const downloadText = (filename: string, content: string, mime = "application/json") => {
  downloadBlob(filename, new Blob([content], { type: `${mime};charset=utf-8` }));
};

const downloadZip = (files: GeneratedFile[]) => {
  const encoder = new TextEncoder();
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[file.fileName] = encoder.encode(file.json);
  }
  const zipped = zipSync(entries, { level: 6 });
  downloadBlob(`antigravity-jsons-${files.length}.zip`, new Blob([new Uint8Array(zipped)], { type: "application/zip" }));
};

const downloadEachFile = async (files: GeneratedFile[]) => {
  for (const file of files) {
    downloadText(file.fileName, file.json);
    // 间隔触发，避免浏览器把连续下载当作自动下载拦截
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }
};

const AgyCpaJsonGeneratorInner: FC<{ ui: Ui }> = ({ ui }) => {
  const [input, setInput] = useState("");
  const [pretty, setPretty] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const parsed = useMemo(() => parseInput(input, pretty, ui), [input, pretty, ui]);
  const okCount = parsed.files.length;
  const failedCount = parsed.errors.length;

  const copyJson = async (index: number, json: string) => {
    try {
      await navigator.clipboard.writeText(json);
      setCopiedIndex(index);
      window.setTimeout(() => {
        setCopiedIndex((current) => (current === index ? null : current));
      }, 1500);
    } catch {
      // 剪贴板不可用时静默失败
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
        <p>{ui.hint}</p>
        <p className="mt-1 font-mono text-[11px] text-slate-500">{ui.formatHint}</p>
      </div>

      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">{ui.inputTitle}</div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={pretty}
                onChange={(event) => setPretty(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.pretty}
            </label>
            <button
              type="button"
              disabled={!input}
              onClick={() => setInput("")}
              className="rounded-2xl px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 active:scale-[0.99]"
            >
              {ui.clear}
            </button>
            <button
              type="button"
              disabled={okCount === 0}
              onClick={() => void downloadEachFile(parsed.files)}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60 active:scale-[0.99]"
            >
              {ui.downloadEach}
            </button>
            <button
              type="button"
              disabled={okCount === 0}
              onClick={() => downloadZip(parsed.files)}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 disabled:opacity-60 active:scale-[0.99]"
            >
              {ui.downloadAll}
            </button>
          </div>
        </div>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={ui.inputPlaceholder}
          spellCheck={false}
          className="mt-4 h-64 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
        />
        {okCount + failedCount > 0 || parsed.blankLines > 0 ? (
          <div className="mt-2 text-xs text-slate-500">
            {okCount + failedCount > 0 &&
              applyTemplate(ui.statsTemplate, {
                total: String(okCount + failedCount),
                ok: String(okCount),
                failed: String(failedCount),
              })}
            {parsed.blankLines > 0 && (
              <span className={okCount + failedCount > 0 ? "ml-2" : undefined}>
                {applyTemplate(ui.blankIgnoredTemplate, { blank: String(parsed.blankLines) })}
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="text-sm font-semibold text-slate-900">{ui.outputTitle}</div>
        {okCount + failedCount === 0 ? (
          <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {ui.emptyResult}
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {parsed.files.map((file, index) => (
              <li key={file.fileName} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs font-semibold text-slate-900">
                      {file.fileName}
                    </div>
                    {file.warn && <div className="mt-1 text-[11px] text-amber-600">{file.warn}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void copyJson(index, file.json)}
                      className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 active:scale-[0.99]"
                    >
                      {copiedIndex === index ? ui.copied : ui.copy}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadText(file.fileName, file.json)}
                      className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 active:scale-[0.99]"
                    >
                      {ui.download}
                    </button>
                  </div>
                </div>
                <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700">
                  {file.json}
                </pre>
              </li>
            ))}
            {parsed.errors.map((item, index) => (
              <li key={`error-${index}`} className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
                <div className="break-all font-mono text-xs text-rose-700">{item.raw}</div>
                <div className="mt-1 text-xs font-medium text-rose-600">{item.error}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const AgyCpaJsonGeneratorClient: FC = () => {
  const config = useOptionalToolConfig("agy-cpa-json-generator");
  const ui: Ui = {
    ...DEFAULT_UI,
    ...((config?.ui ?? {}) as Partial<Ui>),
  };

  return (
    <ToolPageLayout toolSlug="agy-cpa-json-generator" maxWidthClassName="max-w-5xl">
      <AgyCpaJsonGeneratorInner ui={ui} />
    </ToolPageLayout>
  );
};

export default AgyCpaJsonGeneratorClient;
