"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { zipSync } from "fflate";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Row = { label: string; text: string };

const sanitizeFileName = (name: string) =>
  name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "qr";

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const parseRows = (raw: string): Row[] => {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: Row[] = [];
  for (const line of lines) {
    const tab = line.split(/\t/);
    if (tab.length >= 2) {
      const label = tab[0]!.trim();
      const text = tab.slice(1).join("\t").trim();
      if (text) out.push({ label: label || text, text });
      continue;
    }
    const parts = line.split(/\s*,\s*/);
    if (parts.length >= 2) {
      const label = parts[0]!.trim();
      const text = parts.slice(1).join(",").trim();
      if (text) out.push({ label: label || text, text });
      continue;
    }
    out.push({ label: line, text: line });
  }
  return out;
};

export default function QrCodeBulkGeneratorClient() {
  const [raw, setRaw] = useState("");
  const rows = useMemo(() => parseRows(raw), [raw]);
  const [size, setSize] = useState(512);
  const [margin, setMargin] = useState(2);

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [zipName, setZipName] = useState<string>("qrcodes.zip");

  useEffect(() => {
    return () => {
      if (zipUrl) URL.revokeObjectURL(zipUrl);
    };
  }, [zipUrl]);

  return (
    <ToolPageLayout toolSlug="qr-code-bulk-generator" maxWidthClassName="max-w-5xl">
      {({ config }) => {
        const ui: Ui = { ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) };
        const onRun = async () => {
          setError(null);
          if (!rows.length) {
            setError(ui.errEmpty);
            return;
          }
          setIsWorking(true);
          if (zipUrl) {
            URL.revokeObjectURL(zipUrl);
            setZipUrl(null);
          }

          try {
            const files: Record<string, Uint8Array> = {};
            const width = Math.max(128, Math.min(2048, Math.round(size)));
            const safeMargin = Math.max(0, Math.min(16, Math.round(margin)));

            for (let idx = 0; idx < rows.length; idx += 1) {
              const row = rows[idx]!;
              // eslint-disable-next-line no-await-in-loop
              const dataUrl = await QRCode.toDataURL(row.text, {
                width,
                margin: safeMargin,
                errorCorrectionLevel: "M",
                type: "image/png",
              });
              const fileName = `${String(idx + 1).padStart(3, "0")}-${sanitizeFileName(row.label)}.png`;
              files[fileName] = dataUrlToBytes(dataUrl);
            }

            const zipped = zipSync(files, { level: 6 });
            const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
            const url = URL.createObjectURL(blob);
            setZipUrl(url);
            setZipName(`qrcodes-${rows.length}.zip`);
          } catch (e) {
            setError(e instanceof Error ? e.message : ui.errFailed);
          } finally {
            setIsWorking(false);
          }
        };

        return (
          <div className="w-full px-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.hint}</div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.input}</div>
                <div className="mt-2 text-xs text-slate-500">{ui.inputHint}</div>
                <textarea
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder={ui.placeholder}
                  className="mt-3 h-72 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <span>
                    {ui.rows}: <span className="font-mono">{rows.length}</span>
                  </span>
                </div>
              </div>

              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.optionsTitle}</div>
                <div className="mt-4 grid gap-3">
                  <label className="block text-sm text-slate-700">
                    {ui.sizeLabel}
                    <input
                      type="number"
                      min={128}
                      max={2048}
                      step={16}
                      value={size}
                      onChange={(e) => setSize(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                  <label className="block text-sm text-slate-700">
                    {ui.marginLabel}
                    <input
                      type="number"
                      min={0}
                      max={16}
                      step={1}
                      value={margin}
                      onChange={(e) => setMargin(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onRun()}
                    disabled={isWorking}
                    className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {isWorking ? ui.working : ui.start}
                  </button>
                  {zipUrl ? (
                    <a
                      href={zipUrl}
                      download={zipName}
                      className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    >
                      {ui.download}
                    </a>
                  ) : null}
                </div>

                {error ? (
                  <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      }}
    </ToolPageLayout>
  );
}

type Ui = {
  hint: string;
  input: string;
  inputHint: string;
  placeholder: string;
  optionsTitle: string;
  sizeLabel: string;
  marginLabel: string;
  start: string;
  working: string;
  download: string;
  rows: string;
  errEmpty: string;
  errFailed: string;
};

const DEFAULT_UI: Ui = {
  hint: "批量生成二维码并打包下载 ZIP（纯前端本地运行，不上传）。",
  input: "输入（每行一个）",
  inputHint: "格式：纯文本；或 label<TAB>文本；或 label,文本",
  placeholder: "https://example.com\n你好\n名称\thttps://example.com?a=1",
  optionsTitle: "选项",
  sizeLabel: "尺寸（px）",
  marginLabel: "留白",
  start: "生成 ZIP",
  working: "处理中…",
  download: "下载 ZIP",
  rows: "条目数",
  errEmpty: "请至少输入一行。",
  errFailed: "生成失败。",
};
