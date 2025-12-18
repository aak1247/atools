"use client";

import type { FC } from "react";
import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type ParsedCurl = {
  ok: true;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  isForm: boolean;
  formParts: Array<{ name: string; value: string; isFile: boolean }>;
} | { ok: false; error: string };

type OutputTarget = "fetch" | "axios";

const DEFAULT_UI = {
  copyCode: "复制代码",
  curlInputTitle: "cURL 输入",
  generatedCodeTitle: "生成代码",
  generatedCodePlaceholder: "解析成功后会在这里生成代码…",
  methodLabel: "方法：",
  urlLabel: "URL：",
  note: "提示：当前为轻量解析器，复杂 curl（多文件 form、证书、代理等）可能需要手动调整。",
  errorPrefix: "错误：",
  errEmpty: "请输入 curl 命令。",
  errNoUrl: "未识别到 URL，请确认 curl 命令包含请求地址。",
} as const;

type CurlToCodeUi = typeof DEFAULT_UI;

const splitShellArgs = (input: string): string[] => {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escape = false;

  const push = () => {
    const trimmed = current.trim();
    if (trimmed) args.push(trimmed);
    current = "";
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] ?? "";

    if (escape) {
      current += ch;
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      push();
      continue;
    }

    current += ch;
  }

  push();
  return args;
};

const normalizeHeaderKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");

const parseHeaderLine = (line: string): { key: string; value: string } | null => {
  const idx = line.indexOf(":");
  if (idx <= 0) return null;
  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  if (!key) return null;
  return { key: normalizeHeaderKey(key), value };
};

const parseCurl = (command: string): ParsedCurl => {
  const raw = command.trim();
  if (!raw) return { ok: false, error: "ERR_EMPTY" };

  const args = splitShellArgs(raw);
  const startIndex = args[0] === "curl" ? 1 : 0;

  let url: string | null = null;
  let method: string | null = null;
  const headers: Record<string, string> = {};
  const dataParts: string[] = [];
  let isForm = false;
  const formParts: Array<{ name: string; value: string; isFile: boolean }> = [];
  let treatDataAsQuery = false;

  const takeValue = (index: number) => {
    const value = args[index + 1];
    if (typeof value !== "string") return { value: null as string | null, nextIndex: index };
    return { value, nextIndex: index + 1 };
  };

  for (let i = startIndex; i < args.length; i += 1) {
    const token = args[i] ?? "";

    if (!token) continue;

    if (!token.startsWith("-")) {
      if (!url && /^(https?:)?\/\//i.test(token)) url = token;
      else if (!url && !token.includes("=") && token.includes("/")) url = token;
      continue;
    }

    if (token === "-X" || token === "--request") {
      const { value, nextIndex } = takeValue(i);
      if (value) method = value.toUpperCase();
      i = nextIndex;
      continue;
    }

    if (token === "-H" || token === "--header") {
      const { value, nextIndex } = takeValue(i);
      if (value) {
        const parsed = parseHeaderLine(value);
        if (parsed) headers[parsed.key] = parsed.value;
      }
      i = nextIndex;
      continue;
    }

    if (token === "-b" || token === "--cookie") {
      const { value, nextIndex } = takeValue(i);
      if (value) headers.Cookie = value;
      i = nextIndex;
      continue;
    }

    if (token === "-u" || token === "--user") {
      const { value, nextIndex } = takeValue(i);
      if (value) {
        const encoded = btoa(value);
        headers.Authorization = `Basic ${encoded}`;
      }
      i = nextIndex;
      continue;
    }

    if (
      token === "-d" ||
      token === "--data" ||
      token === "--data-raw" ||
      token === "--data-binary" ||
      token === "--data-urlencode"
    ) {
      const { value, nextIndex } = takeValue(i);
      if (value) dataParts.push(value);
      i = nextIndex;
      continue;
    }

    if (token === "-F" || token === "--form") {
      const { value, nextIndex } = takeValue(i);
      if (value) {
        isForm = true;
        const eq = value.indexOf("=");
        if (eq > 0) {
          const name = value.slice(0, eq);
          const rest = value.slice(eq + 1);
          const isFileValue = rest.startsWith("@");
          formParts.push({ name, value: isFileValue ? rest.slice(1) : rest, isFile: isFileValue });
        }
      }
      i = nextIndex;
      continue;
    }

    if (token === "-G" || token === "--get") {
      treatDataAsQuery = true;
      continue;
    }
  }

  if (!url) return { ok: false, error: "ERR_NO_URL" };

  const finalMethod = (method || (dataParts.length > 0 || isForm ? "POST" : "GET")).toUpperCase();

  let finalUrl = url;
  if ((treatDataAsQuery || finalMethod === "GET") && dataParts.length > 0) {
    try {
      const base = new URL(url);
      for (const part of dataParts) {
        const pairs = part.split("&");
        for (const pair of pairs) {
          const [k, v] = pair.split("=");
          if (!k) continue;
          base.searchParams.append(decodeURIComponent(k), v ? decodeURIComponent(v) : "");
        }
      }
      finalUrl = base.toString();
      treatDataAsQuery = true;
    } catch {
      treatDataAsQuery = false;
    }
  }

  const body = treatDataAsQuery || isForm || dataParts.length === 0 ? null : dataParts.join("&");

  return { ok: true, url: finalUrl, method: finalMethod, headers, body, isForm, formParts };
};

const formatCurlError = (error: string, ui: CurlToCodeUi) => {
  if (error === "ERR_EMPTY") return ui.errEmpty;
  if (error === "ERR_NO_URL") return ui.errNoUrl;
  return error;
};

const jsString = (value: string) => JSON.stringify(value);

const headersToCode = (headers: Record<string, string>) => {
  const entries = Object.entries(headers);
  if (entries.length === 0) return "{}";
  const lines = entries.map(([k, v]) => `  ${jsString(k)}: ${jsString(v)},`);
  return `{\n${lines.join("\n")}\n}`;
};

const buildFetchCode = (parsed: Extract<ParsedCurl, { ok: true }>): string => {
  const hasHeaders = Object.keys(parsed.headers).length > 0;
  const hasBody = typeof parsed.body === "string" && parsed.body.length > 0;

  if (parsed.isForm) {
    const lines = [
      `const url = ${jsString(parsed.url)};`,
      `const formData = new FormData();`,
      ...parsed.formParts.map((p) =>
        p.isFile
          ? `// TODO: 需要在浏览器选择文件后再 append\n// formData.append(${jsString(p.name)}, file);`
          : `formData.append(${jsString(p.name)}, ${jsString(p.value)});`,
      ),
      "",
      `const res = await fetch(url, {`,
      `  method: ${jsString(parsed.method)},`,
      ...(hasHeaders ? [`  headers: ${headersToCode(parsed.headers)},`] : []),
      `  body: formData,`,
      `});`,
      `const text = await res.text();`,
      `console.log(res.status, text);`,
    ];
    return lines.join("\n");
  }

  const lines = [
    `const url = ${jsString(parsed.url)};`,
    `const res = await fetch(url, {`,
    `  method: ${jsString(parsed.method)},`,
    ...(hasHeaders ? [`  headers: ${headersToCode(parsed.headers)},`] : []),
    ...(hasBody ? [`  body: ${jsString(parsed.body ?? "")},`] : []),
    `});`,
    `const text = await res.text();`,
    `console.log(res.status, text);`,
  ];
  return lines.join("\n");
};

const buildAxiosCode = (parsed: Extract<ParsedCurl, { ok: true }>): string => {
  const hasHeaders = Object.keys(parsed.headers).length > 0;
  const hasBody = typeof parsed.body === "string" && parsed.body.length > 0;

  if (parsed.isForm) {
    const lines = [
      `import axios from "axios";`,
      "",
      `const url = ${jsString(parsed.url)};`,
      `const formData = new FormData();`,
      ...parsed.formParts.map((p) =>
        p.isFile
          ? `// TODO: 需要在浏览器选择文件后再 append\n// formData.append(${jsString(p.name)}, file);`
          : `formData.append(${jsString(p.name)}, ${jsString(p.value)});`,
      ),
      "",
      `const res = await axios({`,
      `  url,`,
      `  method: ${jsString(parsed.method.toLowerCase())},`,
      ...(hasHeaders ? [`  headers: ${headersToCode(parsed.headers)},`] : []),
      `  data: formData,`,
      `});`,
      `console.log(res.status, res.data);`,
    ];
    return lines.join("\n");
  }

  const lines = [
    `import axios from "axios";`,
    "",
    `const res = await axios({`,
    `  url: ${jsString(parsed.url)},`,
    `  method: ${jsString(parsed.method.toLowerCase())},`,
    ...(hasHeaders ? [`  headers: ${headersToCode(parsed.headers)},`] : []),
    ...(hasBody ? [`  data: ${jsString(parsed.body ?? "")},`] : []),
    `});`,
    `console.log(res.status, res.data);`,
  ];
  return lines.join("\n");
};

const CurlToCodeInner: FC<{ ui: CurlToCodeUi }> = ({ ui }) => {
  const [target, setTarget] = useState<OutputTarget>("fetch");
  const [input, setInput] = useState("");

  const parsed = useMemo(() => parseCurl(input), [input]);
  const code = useMemo(() => {
    if (!parsed.ok) return "";
    return target === "fetch" ? buildFetchCode(parsed) : buildAxiosCode(parsed);
  }, [parsed, target]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-2xl bg-slate-100/60 p-1">
              <button
                type="button"
                onClick={() => setTarget("fetch")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  target === "fetch" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                fetch
              </button>
              <button
                type="button"
                onClick={() => setTarget("axios")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  target === "axios" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Axios
              </button>
            </div>

            <button
              type="button"
              onClick={() => void copy(code)}
              disabled={!code}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {ui.copyCode}
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">{ui.curlInputTitle}</div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`curl -X POST \"https://api.example.com/v1\" -H \"Content-Type: application/json\" -d '{\"a\":1}'`}
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              {!parsed.ok && input.trim() && (
                <div className="mt-2 text-sm text-rose-600" aria-live="polite">
                  {ui.errorPrefix}
                  {formatCurlError(parsed.error, ui)}
                </div>
              )}
              {parsed.ok && (
                <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  <div>
                    {ui.methodLabel}
                    <span className="font-mono">{parsed.method}</span>
                  </div>
                  <div className="sm:col-span-2">
                    {ui.urlLabel}
                    <span className="font-mono break-all">{parsed.url}</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{ui.generatedCodeTitle}</div>
              </div>
              <textarea
                value={code}
                readOnly
                placeholder={ui.generatedCodePlaceholder}
                className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
              <div className="mt-3 text-xs text-slate-500">
                {ui.note}
              </div>
            </div>
          </div>
      </div>
    </div>
  );
};

const CurlToCodeClient: FC = () => {
  return (
    <ToolPageLayout toolSlug="curl-to-code">
      {({ config }) => (
        <CurlToCodeInner
          ui={{
            ...DEFAULT_UI,
            ...((config.ui as Partial<CurlToCodeUi> | undefined) ?? {}),
          }}
        />
      )}
    </ToolPageLayout>
  );
};

export default CurlToCodeClient;
