"use client";

import YAML from "yaml";
import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Format = "json" | "yaml" | "ini";
type IniScalar = string | number | boolean;

type Ui = {
  input: string;
  output: string;
  swap: string;
  jsonPretty: string;
  copyOutput: string;
  description: string;
  inputTitle: string;
  outputTitle: string;
  outputPlaceholder: string;
  errConvertFailed: string;
  errIniObjectOnly: string;
};

const DEFAULT_UI: Ui = {
  input: "输入",
  output: "输出",
  swap: "互换",
  jsonPretty: "JSON 美化",
  copyOutput: "复制输出",
  description:
    "说明：支持 INI/YAML/JSON 互转与基础格式校验。INI 仅支持“根键 + section”结构；复杂嵌套建议使用 YAML/JSON。",
  inputTitle: "输入",
  outputTitle: "输出",
  outputPlaceholder: "转换结果…",
  errConvertFailed: "转换失败",
  errIniObjectOnly: "INI 仅支持对象（key=value），不支持数组/纯值。",
};

const safeJsonParse = (text: string): { ok: boolean; value: unknown; error?: string } => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, value: null, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const iniParse = (text: string): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  let section: Record<string, unknown> = out;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(";") || line.startsWith("#")) continue;
    const sec = line.match(/^\[(.+?)\]\s*$/);
    if (sec) {
      const name = sec[1].trim();
      if (!out[name] || !isRecord(out[name])) out[name] = {};
      section = out[name] as Record<string, unknown>;
      continue;
    }
    const kv = line.match(/^([^=:#]+?)\s*(=|:)\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    const valueRaw = kv[3].trim();
    section[key] = iniCoerce(valueRaw);
  }
  return out;
};

const iniEscape = (s: string) => s.replace(/\n/g, "\\n");

const iniStringify = (value: unknown, ui: Ui): string => {
  if (!isRecord(value)) throw new Error(ui.errIniObjectOnly);
  const obj = value as Record<string, unknown>;
  const rootKeys = Object.keys(value).filter((k) => !isRecord(value[k]));
  const sectionKeys = Object.keys(value).filter((k) => isRecord(value[k]));

  const lines: string[] = [];
  for (const k of rootKeys.sort()) lines.push(`${k}=${iniEscape(String(obj[k]))}`);
  if (rootKeys.length && sectionKeys.length) lines.push("");

  for (const secName of sectionKeys.sort()) {
    lines.push(`[${secName}]`);
    const sec = obj[secName] as Record<string, unknown>;
    for (const k of Object.keys(sec).sort()) lines.push(`${k}=${iniEscape(String(sec[k]))}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
};

const iniCoerce = (raw: string): IniScalar => {
  const s = raw.trim();
  if (!s) return "";
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === "true";
  if (/^[+-]?\d+(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : s;
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s.replace(/\\n/g, "\n");
};

const parseByFormat = (fmt: Format, text: string): unknown => {
  if (fmt === "json") {
    const parsed = safeJsonParse(text);
    if (!parsed.ok) throw new Error(parsed.error || "Invalid JSON");
    return parsed.value;
  }
  if (fmt === "yaml") return YAML.parse(text);
  return iniParse(text);
};

const stringifyByFormat = (fmt: Format, value: unknown, pretty: boolean, ui: Ui): string => {
  if (fmt === "json") return pretty ? `${JSON.stringify(value, null, 2)}\n` : `${JSON.stringify(value)}\n`;
  if (fmt === "yaml") return `${YAML.stringify(value)}\n`;
  return iniStringify(value, ui);
};

export default function IniYamlJsonConverterClient() {
  return (
    <ToolPageLayout toolSlug="ini-yaml-json-converter" maxWidthClassName="max-w-6xl">
      {({ config }) => (
        <IniYamlJsonConverterInner ui={{ ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) }} />
      )}
    </ToolPageLayout>
  );
}

function IniYamlJsonConverterInner({ ui }: { ui: Ui }) {
  const [inputFormat, setInputFormat] = useState<Format>("json");
  const [outputFormat, setOutputFormat] = useState<Format>("yaml");
  const [prettyJson, setPrettyJson] = useState(true);
  const [input, setInput] = useState('{\n  "name": "ATools",\n  "debug": true,\n  "port": 3000\n}\n');

  const computed = useMemo(() => {
    try {
      const value = parseByFormat(inputFormat, input);
      const out = stringifyByFormat(outputFormat, value, prettyJson, ui);
      return { ok: true, out, error: null as string | null, value };
    } catch (e) {
      return { ok: false, out: "", error: e instanceof Error ? e.message : ui.errConvertFailed, value: null as unknown };
    }
  }, [input, inputFormat, outputFormat, prettyJson, ui]);

  const copy = async () => {
    if (!computed.ok) return;
    await navigator.clipboard.writeText(computed.out);
  };

  const swap = () => {
    setInputFormat(outputFormat);
    setOutputFormat(inputFormat);
    if (computed.ok) setInput(computed.out);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              {ui.input}
              <select
                value={inputFormat}
                onChange={(e) => setInputFormat(e.target.value as Format)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
              >
                <option value="json">JSON</option>
                <option value="yaml">YAML</option>
                <option value="ini">INI</option>
              </select>
            </div>
            <button
              type="button"
              onClick={swap}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {ui.swap}
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              {ui.output}
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as Format)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
              >
                <option value="json">JSON</option>
                <option value="yaml">YAML</option>
                <option value="ini">INI</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {outputFormat === "json" && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={prettyJson}
                  onChange={(e) => setPrettyJson(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {ui.jsonPretty}
              </label>
            )}
            <button
              type="button"
              onClick={() => void copy()}
              disabled={!computed.ok}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {ui.copyOutput}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          {ui.description}
        </div>

        {!computed.ok && computed.error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {computed.error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.inputTitle}</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="mt-3 h-[520px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.outputTitle}</div>
            <textarea
              value={computed.ok ? computed.out : ""}
              readOnly
              className="mt-3 h-[520px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              placeholder={ui.outputPlaceholder}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
