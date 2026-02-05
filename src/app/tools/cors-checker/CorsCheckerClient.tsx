"use client";

import { useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
type BodyType = "auto" | "json" | "text" | "form";
type SnippetType = "headers" | "nginx" | "express" | "spring";

const DEFAULT_UI = {
  request: "请求",
  analysis: "分析",
  diagnostics: "诊断",
  fixes: "解决建议",
  url: "接口 URL",
  method: "方法",
  credentials: "凭证（Cookie）",
  credentialsOmit: "omit（不携带）",
  credentialsSameOrigin: "same-origin（同源才携带）",
  credentialsInclude: "include（总是携带）",
  timeoutMs: "超时（ms）",
  headers: "请求头（每行一条：Key: Value）",
  bodyType: "请求体类型",
  bodyTypeAuto: "自动/不指定",
  bodyTypeJson: "JSON（application/json，通常触发预检）",
  bodyTypeText: "纯文本（text/plain，通常不触发预检）",
  bodyTypeForm: "表单（application/x-www-form-urlencoded，通常不触发预检）",
  body: "请求体",
  assumedOrigin: "用于分析的 Origin（可选）",
  assumedOriginHint: "仅影响“建议的响应头”生成；实际请求的 Origin 以当前页面为准。",
  send: "发起检查",
  sending: "检查中...",
  cancel: "取消",
  result: "实际请求结果",
  response: "响应",
  duration: "耗时",
  status: "状态",
  errorPrefix: "错误：",
  errUrlRequired: "请输入接口 URL。",
  errUrlProtocol: "仅支持 http/https URL。",
  errUrlInvalid: "URL 格式不正确。",
  errAborted: "请求已取消或超时。",
  errRequestFailed: "请求失败（可能是 CORS 或网络问题）。",
  reachabilityProbe: "可达性探测（no-cors GET）",
  probeOkOpaque: "目标可达（opaque，无法读取内容）— 更可能是 CORS 阻止读取。",
  probeFailed: "探测也失败 — 更可能是网络/DNS/TLS/被拦截。",
  preflight: "是否会触发预检（OPTIONS）",
  preflightYes: "会（需要服务端正确响应 OPTIONS）",
  preflightNo: "不会（通常不会发 OPTIONS 预检）",
  preflightWhy: "触发原因",
  requiredAllowMethods: "建议允许的方法（Allow-Methods）",
  requiredAllowHeaders: "建议允许的请求头（Allow-Headers）",
  pasteHeaders: "粘贴你看到的响应头（可选，用于更精确诊断）",
  pasteHeadersHint:
    "可从浏览器 DevTools -> Network 复制 response headers 或 preflight response headers，粘贴每行一条：Key: Value。",
  snippetType: "示例配置/响应头",
  copy: "复制",
  copied: "已复制",
} as const;

type CorsCheckerUi = typeof DEFAULT_UI;

type ParsedHeaderLine = { name: string; value: string };

type CorsAnalysis = {
  targetUrlOk: boolean;
  targetUrlErrorCode?: "required" | "protocol" | "invalid";
  currentOrigin: string;
  assumedOrigin: string;
  targetOrigin: string;
  isSameOrigin: boolean;
  method: HttpMethod;
  credentials: RequestCredentials;
  forbiddenHeaders: string[];
  invalidHeaders: string[];
  effectiveHeaders: ParsedHeaderLine[];
  effectiveContentType: string | null;
  willPreflight: boolean;
  preflightReasons: string[];
  requiredAllowMethods: string[];
  requiredAllowHeaders: string[];
  suggestedResponseHeaders: string;
  suggestedPreflightHeaders: string;
  suggestions: string[];
};

const SIMPLE_METHODS = new Set<string>(["get", "head", "post"]);
const SAFE_REQUEST_HEADERS = new Set<string>([
  "accept",
  "accept-language",
  "content-language",
  "content-type",
]);

const FORBIDDEN_HEADER_NAMES = new Set<string>([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
  "user-agent",
]);

const FORBIDDEN_HEADER_PREFIXES = ["proxy-", "sec-"];

function isForbiddenHeader(nameLower: string): boolean {
  if (FORBIDDEN_HEADER_NAMES.has(nameLower)) return true;
  return FORBIDDEN_HEADER_PREFIXES.some((prefix) => nameLower.startsWith(prefix));
}

function parseHeaderLines(raw: string): ParsedHeaderLine[] {
  const entries: ParsedHeaderLine[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf(":");
    if (index <= 0) continue;
    const name = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!name) continue;
    entries.push({ name, value });
  }
  return entries;
}

function toHeaders(entries: ParsedHeaderLine[]): { headers: Headers; invalid: string[] } {
  const headers = new Headers();
  const invalid: string[] = [];
  for (const { name, value } of entries) {
    try {
      headers.append(name, value);
    } catch {
      invalid.push(name);
    }
  }
  return { headers, invalid };
}

function normalizeMimeEssence(contentType: string): string {
  const value = contentType.trim().toLowerCase();
  const semicolon = value.indexOf(";");
  return (semicolon >= 0 ? value.slice(0, semicolon) : value).trim();
}

function isSafelistedContentType(contentType: string): boolean {
  const essence = normalizeMimeEssence(contentType);
  return (
    essence === "application/x-www-form-urlencoded" ||
    essence === "multipart/form-data" ||
    essence === "text/plain"
  );
}

function withAutoContentType(
  entries: ParsedHeaderLine[],
  canHaveBody: boolean,
  bodyType: BodyType,
  body: string,
): { effective: ParsedHeaderLine[]; contentType: string | null } {
  const hasBody = canHaveBody && body.trim().length > 0;
  const hasContentType = entries.some((h) => h.name.trim().toLowerCase() === "content-type");
  if (!hasBody || bodyType === "auto" || hasContentType) {
    const contentType = (entries.find((h) => h.name.trim().toLowerCase() === "content-type")?.value ?? "").trim();
    return { effective: entries, contentType: contentType ? contentType : null };
  }

  const autoValue =
    bodyType === "json"
      ? "application/json"
      : bodyType === "form"
        ? "application/x-www-form-urlencoded"
        : "text/plain;charset=UTF-8";

  return { effective: [...entries, { name: "Content-Type", value: autoValue }], contentType: autoValue };
}

function uniqSortedLower(names: string[]): string[] {
  return Array.from(new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "en"),
  );
}

function guessDefaultAssumedOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function computeCorsAnalysis(params: {
  url: string;
  method: HttpMethod;
  headersRaw: string;
  bodyType: BodyType;
  body: string;
  credentials: RequestCredentials;
  assumedOriginInput: string;
}): CorsAnalysis {
  const currentOrigin = guessDefaultAssumedOrigin();
  const assumedOrigin = (params.assumedOriginInput || currentOrigin).trim();

  const target = params.url.trim();
  if (!target) {
    return {
      targetUrlOk: false,
      targetUrlErrorCode: "required",
      currentOrigin,
      assumedOrigin,
      targetOrigin: "",
      isSameOrigin: false,
      method: params.method,
      credentials: params.credentials,
      forbiddenHeaders: [],
      invalidHeaders: [],
      effectiveHeaders: [],
      effectiveContentType: null,
      willPreflight: false,
      preflightReasons: [],
      requiredAllowMethods: [],
      requiredAllowHeaders: [],
      suggestedResponseHeaders: "",
      suggestedPreflightHeaders: "",
      suggestions: [],
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(target);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return {
        targetUrlOk: false,
        targetUrlErrorCode: "protocol",
        currentOrigin,
        assumedOrigin,
        targetOrigin: "",
        isSameOrigin: false,
        method: params.method,
        credentials: params.credentials,
        forbiddenHeaders: [],
        invalidHeaders: [],
        effectiveHeaders: [],
        effectiveContentType: null,
        willPreflight: false,
        preflightReasons: [],
        requiredAllowMethods: [],
        requiredAllowHeaders: [],
        suggestedResponseHeaders: "",
        suggestedPreflightHeaders: "",
        suggestions: [],
      };
    }
  } catch {
    return {
      targetUrlOk: false,
      targetUrlErrorCode: "invalid",
      currentOrigin,
      assumedOrigin,
      targetOrigin: "",
      isSameOrigin: false,
      method: params.method,
      credentials: params.credentials,
      forbiddenHeaders: [],
      invalidHeaders: [],
      effectiveHeaders: [],
      effectiveContentType: null,
      willPreflight: false,
      preflightReasons: [],
      requiredAllowMethods: [],
      requiredAllowHeaders: [],
      suggestedResponseHeaders: "",
      suggestedPreflightHeaders: "",
      suggestions: [],
    };
  }

  const targetOrigin = parsedUrl.origin;
  const isSameOrigin = Boolean(currentOrigin) && currentOrigin === targetOrigin;

  const canHaveBody = params.method !== "GET" && params.method !== "HEAD";
  const inputHeaders = parseHeaderLines(params.headersRaw);

  const forbiddenHeaders = uniqSortedLower(
    inputHeaders.map((h) => h.name.toLowerCase()).filter((name) => isForbiddenHeader(name)),
  );

  const stripped = inputHeaders.filter((h) => !isForbiddenHeader(h.name.toLowerCase()));
  const withCt = withAutoContentType(stripped, canHaveBody, params.bodyType, params.body);

  const { headers: effectiveHeadersObj, invalid: invalidHeaders } = toHeaders(withCt.effective);

  const fromHeaders = (effectiveHeadersObj.get("content-type") ?? "").trim();
  const effectiveContentType = (withCt.contentType ?? fromHeaders) || null;

  const preflightReasons: string[] = [];
  const requiredAllowMethods: string[] = [];
  const requiredAllowHeaders: string[] = [];

  const methodLower = params.method.toLowerCase();
  const isSimpleMethod = SIMPLE_METHODS.has(methodLower);
  if (!isSimpleMethod && !isSameOrigin) {
    preflightReasons.push(`方法 ${params.method} 不是简单请求方法（GET/HEAD/POST）。`);
    requiredAllowMethods.push(params.method);
  }

  const headerEntriesLower = withCt.effective.map((h) => ({
    nameLower: h.name.trim().toLowerCase(),
    value: h.value,
  }));

  const nonSafelistedHeaderNames: string[] = [];
  for (const h of headerEntriesLower) {
    if (!h.nameLower) continue;
    if (!SAFE_REQUEST_HEADERS.has(h.nameLower)) {
      nonSafelistedHeaderNames.push(h.nameLower);
      continue;
    }
    if (h.nameLower === "content-type") {
      if (h.value && !isSafelistedContentType(h.value)) nonSafelistedHeaderNames.push("content-type");
    }
  }

  const nonSafelistedUnique = uniqSortedLower(nonSafelistedHeaderNames);
  if (nonSafelistedUnique.length > 0 && !isSameOrigin) {
    preflightReasons.push(
      `包含非简单请求头：${nonSafelistedUnique.map((n) => n).join(", ")}。`,
    );
    requiredAllowHeaders.push(...nonSafelistedUnique);
  }

  const willPreflight = !isSameOrigin && (preflightReasons.length > 0);
  if (willPreflight) requiredAllowMethods.push(params.method);

  const assumedOriginForHeader = assumedOrigin || currentOrigin || "https://example.com";
  const allowOriginLine =
    params.credentials === "include"
      ? `Access-Control-Allow-Origin: ${assumedOriginForHeader}`
      : `Access-Control-Allow-Origin: ${assumedOriginForHeader || "*"}`;

  const allowCredentialsLine =
    params.credentials === "include" ? "Access-Control-Allow-Credentials: true" : "";

  const suggestedAllowMethods = uniqSortedLower([
    ...(requiredAllowMethods.length > 0 ? requiredAllowMethods : [params.method]),
    "options",
  ])
    .map((m) => m.toUpperCase())
    .join(", ");

  const suggestedAllowHeaders = uniqSortedLower(requiredAllowHeaders).join(", ");

  const suggestedResponseHeaders = [
    allowOriginLine,
    allowCredentialsLine,
    "Vary: Origin",
    "Access-Control-Expose-Headers: X-Request-Id",
  ]
    .filter(Boolean)
    .join("\n");

  const suggestedPreflightHeaders = [
    allowOriginLine,
    allowCredentialsLine,
    `Access-Control-Allow-Methods: ${suggestedAllowMethods}`,
    suggestedAllowHeaders ? `Access-Control-Allow-Headers: ${suggestedAllowHeaders}` : "",
    "Access-Control-Max-Age: 600",
    "Vary: Origin",
  ]
    .filter(Boolean)
    .join("\n");

  const suggestions: string[] = [];
  if (isSameOrigin) {
    suggestions.push("该 URL 与当前页面同源：不会触发 CORS，浏览器不会拦截跨域读取。");
  } else {
    suggestions.push("跨域请求的 CORS 只能由服务端响应头决定，前端无法“绕过”。");
    if (params.credentials === "include") {
      suggestions.push(
        "携带 Cookie/凭证时：必须返回 Access-Control-Allow-Credentials: true，且 Access-Control-Allow-Origin 不能是 *（必须精确到某个 Origin）。",
      );
      suggestions.push(
        "若依赖跨站 Cookie：服务端 Cookie 还需设置 SameSite=None; Secure（并使用 HTTPS）。",
      );
    }
    if (willPreflight) {
      suggestions.push(
        "需要处理 OPTIONS 预检：对 OPTIONS 返回 204/200，并带上 Allow-Origin/Allow-Methods/Allow-Headers 等响应头。",
      );
    }
    if (requiredAllowHeaders.length > 0) {
      suggestions.push(
        `确保预检响应的 Access-Control-Allow-Headers 覆盖：${uniqSortedLower(requiredAllowHeaders).join(", ")}。`,
      );
    }
    if (requiredAllowMethods.length > 0) {
      suggestions.push(
        `确保预检响应的 Access-Control-Allow-Methods 包含：${uniqSortedLower(requiredAllowMethods)
          .map((m) => m.toUpperCase())
          .join(", ")}。`,
      );
    }
    suggestions.push(
      "浏览器在 CORS 失败时通常只显示 “TypeError: Failed to fetch”，具体原因请在 DevTools -> Network 查看 preflight / response headers。",
    );
  }

  if (forbiddenHeaders.length > 0) {
    suggestions.push(
      `你填写的这些请求头属于浏览器禁止设置（会被忽略或报错）：${forbiddenHeaders.join(", ")}。`,
    );
  }

  if (invalidHeaders.length > 0) {
    suggestions.push(
      `以下请求头名称格式无效（未发送）：${uniqSortedLower(invalidHeaders).join(", ")}。`,
    );
  }

  return {
    targetUrlOk: true,
    currentOrigin,
    assumedOrigin,
    targetOrigin,
    isSameOrigin,
    method: params.method,
    credentials: params.credentials,
    forbiddenHeaders,
    invalidHeaders,
    effectiveHeaders: withCt.effective,
    effectiveContentType,
    willPreflight,
    preflightReasons,
    requiredAllowMethods: uniqSortedLower(requiredAllowMethods).map((m) => m.toUpperCase()),
    requiredAllowHeaders: uniqSortedLower(requiredAllowHeaders),
    suggestedResponseHeaders,
    suggestedPreflightHeaders,
    suggestions,
  };
}

function diagnosePastedHeaders(
  raw: string,
  analysis: CorsAnalysis,
): { issues: string[]; parsed: Record<string, string> } {
  const parsed: Record<string, string> = {};
  const issues: string[] = [];

  const lines = parseHeaderLines(raw);
  for (const h of lines) {
    const key = h.name.trim().toLowerCase();
    if (!key) continue;
    parsed[key] = h.value.trim();
  }

  if (!analysis.targetUrlOk || analysis.isSameOrigin) return { issues, parsed };

  const acao = parsed["access-control-allow-origin"];
  if (!acao) {
    issues.push("缺少 Access-Control-Allow-Origin（浏览器会直接拦截跨域读取）。");
  } else if (acao.includes(",")) {
    issues.push(
      "Access-Control-Allow-Origin 不应返回多个值（逗号分隔）；只能是 * 或单个 Origin。",
    );
  } else if (analysis.credentials === "include" && acao.trim() === "*") {
    issues.push("携带凭证时 Access-Control-Allow-Origin 不能为 *。");
  } else if (
    analysis.assumedOrigin &&
    acao.trim() !== "*" &&
    acao.trim() !== analysis.assumedOrigin
  ) {
    issues.push(
      `Access-Control-Allow-Origin 与期望 Origin 不匹配：期望 ${analysis.assumedOrigin}，实际 ${acao}。`,
    );
  }

  if (analysis.credentials === "include") {
    const acac = parsed["access-control-allow-credentials"];
    if (!acac || acac.trim().toLowerCase() !== "true") {
      issues.push("携带凭证时需要 Access-Control-Allow-Credentials: true。");
    }
  }

  if (analysis.willPreflight) {
    const allowMethods = (parsed["access-control-allow-methods"] ?? "").toLowerCase();
    const allowHeaders = (parsed["access-control-allow-headers"] ?? "").toLowerCase();

    if (!allowMethods) issues.push("预检响应缺少 Access-Control-Allow-Methods。");
    const allowMethodSet = new Set(allowMethods.split(",").map((s) => s.trim()).filter(Boolean));
    if (allowMethods && !allowMethodSet.has("*") && !allowMethodSet.has(analysis.method.toLowerCase())) {
      issues.push(
        `Access-Control-Allow-Methods 未包含 ${analysis.method}。`,
      );
    }

    if (analysis.requiredAllowHeaders.length > 0) {
      if (!allowHeaders) issues.push("预检响应缺少 Access-Control-Allow-Headers。");
      const allowHeaderSet = new Set(allowHeaders.split(",").map((s) => s.trim()).filter(Boolean));
      if (allowHeaderSet.has("*")) return { issues, parsed };
      for (const h of analysis.requiredAllowHeaders) {
        if (!allowHeaderSet.has(h.toLowerCase())) {
          issues.push(`Access-Control-Allow-Headers 未包含 ${h}。`);
        }
      }
    }
  }

  return { issues, parsed };
}

function buildSnippet(type: SnippetType, analysis: CorsAnalysis): string {
  const origin = analysis.assumedOrigin || analysis.currentOrigin || "https://example.com";
  const allowHeadersList =
    analysis.requiredAllowHeaders.length > 0
      ? analysis.requiredAllowHeaders
      : ["content-type", "authorization"];
  const allowMethodsList =
    analysis.requiredAllowMethods.length > 0 ? analysis.requiredAllowMethods : [analysis.method];
  const allowCredentials = analysis.credentials === "include";

  if (type === "headers") {
    return [
      "# 预检（OPTIONS）响应建议",
      analysis.suggestedPreflightHeaders || "",
      "",
      "# 实际业务响应建议（非 OPTIONS）",
      analysis.suggestedResponseHeaders || "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (type === "nginx") {
    return [
      "# Nginx 示例（按需调整为白名单；不要对敏感接口开放任意 Origin）",
      "location / {",
      `  add_header Access-Control-Allow-Origin "${allowCredentials ? origin : "*"}" always;`,
      allowCredentials ? "  add_header Access-Control-Allow-Credentials \"true\" always;" : "",
      `  add_header Access-Control-Allow-Methods "${uniqSortedLower([...allowMethodsList, "OPTIONS"]).map((m) => m.toUpperCase()).join(", ")}" always;`,
      `  add_header Access-Control-Allow-Headers "${allowHeadersList.map((h) => h.trim()).filter(Boolean).join(", ")}" always;`,
      "  add_header Access-Control-Max-Age 600 always;",
      "  add_header Vary Origin always;",
      "",
      "  if ($request_method = OPTIONS) {",
      "    return 204;",
      "  }",
      "}",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (type === "express") {
    return [
      "// Express 示例（推荐使用 cors 中间件并配置白名单）",
      "import cors from \"cors\";",
      "",
      "app.use(cors({",
      `  origin: ${allowCredentials ? `[\"${origin}\"]` : "true"},`,
      `  credentials: ${allowCredentials ? "true" : "false"},`,
      `  methods: [${uniqSortedLower([...allowMethodsList, "OPTIONS"]).map((m) => JSON.stringify(m.toUpperCase())).join(", ")}],`,
      `  allowedHeaders: [${uniqSortedLower(allowHeadersList).map((h) => JSON.stringify(h.trim())).join(", ")}],`,
      "}));",
      "",
      "// 需要的话单独处理预检：",
      "app.options(\"*\", cors());",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "// Spring Boot 示例（示意；请按项目实际配置）",
    "@Bean",
    "public WebMvcConfigurer corsConfigurer() {",
    "  return new WebMvcConfigurer() {",
    "    @Override",
    "    public void addCorsMappings(CorsRegistry registry) {",
    "      registry.addMapping(\"/**\")",
    `        .allowedOrigins(${allowCredentials ? `"${origin}"` : "\"*\""})`,
    `        .allowedMethods(${uniqSortedLower([...allowMethodsList, "OPTIONS"]).map((m) => `"${m.toUpperCase()}"`).join(", ")})`,
    `        .allowedHeaders(${uniqSortedLower(allowHeadersList).map((h) => `"${h.trim()}"`).join(", ")})`,
    `        .allowCredentials(${allowCredentials ? "true" : "false"});`,
    "    }",
    "  };",
    "}",
  ].join("\n");
}

export default function CorsCheckerClient() {
  return (
    <ToolPageLayout toolSlug="cors-checker" maxWidthClassName="max-w-6xl">
      <CorsCheckerInner />
    </ToolPageLayout>
  );
}

function CorsCheckerInner() {
  const config = useOptionalToolConfig("cors-checker");
  const ui: CorsCheckerUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<CorsCheckerUi>) };

  const abortRef = useRef<AbortController | null>(null);

  const [method, setMethod] = useState<HttpMethod>("POST");
  const [url, setUrl] = useState("https://httpbin.org/anything");
  const [credentials, setCredentials] = useState<RequestCredentials>("omit");
  const [timeoutMs, setTimeoutMs] = useState(15000);
  const [headersRaw, setHeadersRaw] = useState("accept: application/json");
  const [bodyType, setBodyType] = useState<BodyType>("json");
  const [body, setBody] = useState('{"hello":"world"}');
  const [assumedOriginInput, setAssumedOriginInput] = useState<string>("");

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [responseText, setResponseText] = useState<string>("");
  const [reachabilityNote, setReachabilityNote] = useState<string>("");

  const [pastedHeadersRaw, setPastedHeadersRaw] = useState<string>("");
  const [snippetType, setSnippetType] = useState<SnippetType>("headers");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const canHaveBody = method !== "GET" && method !== "HEAD";

  const analysis = useMemo(
    () =>
      computeCorsAnalysis({
        url,
        method,
        headersRaw,
        bodyType,
        body,
        credentials,
        assumedOriginInput,
      }),
    [assumedOriginInput, body, bodyType, credentials, headersRaw, method, url],
  );

  const pastedDiagnosis = useMemo(() => diagnosePastedHeaders(pastedHeadersRaw, analysis), [analysis, pastedHeadersRaw]);

  const snippet = useMemo(() => buildSnippet(snippetType, analysis), [analysis, snippetType]);

  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 900);
  };

  const send = async () => {
    setError(null);
    setStatusLine(null);
    setDurationMs(null);
    setResponseText("");
    setReachabilityNote("");

    if (!analysis.targetUrlOk) {
      const message =
        analysis.targetUrlErrorCode === "required"
          ? ui.errUrlRequired
          : analysis.targetUrlErrorCode === "protocol"
            ? ui.errUrlProtocol
            : ui.errUrlInvalid;
      setError(message);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timeout = window.setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
    const started = performance.now();
    setIsSending(true);

    const { headers: effectiveHeadersObj } = toHeaders(analysis.effectiveHeaders);
    const init: RequestInit = {
      method,
      mode: "cors",
      credentials,
      headers: effectiveHeadersObj,
      cache: "no-store",
      signal: controller.signal,
    };
    if (canHaveBody && body.trim()) init.body = body;

    try {
      const res = await fetch(url.trim(), init);
      const elapsed = performance.now() - started;
      setDurationMs(elapsed);
      setStatusLine(`${res.status} ${res.statusText || ""}`.trim());
      const text = await res.text();
      setResponseText(text.slice(0, 20000));
    } catch (e) {
      const elapsed = performance.now() - started;
      setDurationMs(elapsed);
      if (e instanceof DOMException && e.name === "AbortError") {
        setError(ui.errAborted);
      } else {
        setError(e instanceof Error ? e.message : ui.errRequestFailed);
      }

      try {
        const probe = await fetch(url.trim(), { method: "GET", mode: "no-cors", cache: "no-store" });
        if (probe.type === "opaque") setReachabilityNote(ui.probeOkOpaque);
      } catch {
        setReachabilityNote(ui.probeFailed);
      }
    } finally {
      window.clearTimeout(timeout);
      setIsSending(false);
    }
  };

  const cancel = () => abortRef.current?.abort();

  return (
    <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.request}</div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr]">
              <label className="block text-sm text-slate-700">
                {ui.method}
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as HttpMethod)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  {(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-700">
                {ui.url}
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/api"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-slate-700">
                {ui.credentials}
                <select
                  value={credentials}
                  onChange={(e) => setCredentials(e.target.value as RequestCredentials)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="omit">{ui.credentialsOmit}</option>
                  <option value="same-origin">{ui.credentialsSameOrigin}</option>
                  <option value="include">{ui.credentialsInclude}</option>
                </select>
              </label>

              <label className="block text-sm text-slate-700">
                {ui.timeoutMs}
                <input
                  type="number"
                  min={1000}
                  step={500}
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(Number(e.target.value))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
            </div>

            <div className="mt-4">
              <div className="text-sm font-semibold text-slate-900">{ui.headers}</div>
              <textarea
                value={headersRaw}
                onChange={(e) => setHeadersRaw(e.target.value)}
                className="mt-2 h-28 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                placeholder="authorization: Bearer ...\ncontent-type: application/json"
              />
            </div>

            {canHaveBody && (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    {ui.bodyType}
                    <select
                      value={bodyType}
                      onChange={(e) => setBodyType(e.target.value as BodyType)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="auto">{ui.bodyTypeAuto}</option>
                      <option value="json">{ui.bodyTypeJson}</option>
                      <option value="text">{ui.bodyTypeText}</option>
                      <option value="form">{ui.bodyTypeForm}</option>
                    </select>
                  </label>
                  <label className="block text-sm text-slate-700">
                    {ui.assumedOrigin}
                    <input
                      value={assumedOriginInput}
                      onChange={(e) => setAssumedOriginInput(e.target.value)}
                      placeholder={analysis.currentOrigin || "https://your-site.example"}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    />
                    <div className="mt-2 text-xs text-slate-500">{ui.assumedOriginHint}</div>
                  </label>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-semibold text-slate-900">{ui.body}</div>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="mt-2 h-44 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    placeholder='{"key":"value"}'
                  />
                </div>
              </>
            )}

            {!canHaveBody && (
              <div className="mt-4">
                <label className="block text-sm text-slate-700">
                  {ui.assumedOrigin}
                  <input
                    value={assumedOriginInput}
                    onChange={(e) => setAssumedOriginInput(e.target.value)}
                    placeholder={analysis.currentOrigin || "https://your-site.example"}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                  <div className="mt-2 text-xs text-slate-500">{ui.assumedOriginHint}</div>
                </label>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void send()}
                disabled={isSending}
                className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isSending ? ui.sending : ui.send}
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={!isSending}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
              >
                {ui.cancel}
              </button>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.analysis}</div>
            <div className="mt-3 text-xs text-slate-600">
              <div>
                Origin:{" "}
                <span className="font-mono text-slate-900">
                  {analysis.currentOrigin || "-"}
                </span>{" "}
                →{" "}
                <span className="font-mono text-slate-900">
                  {analysis.targetOrigin || "-"}
                </span>
              </div>
              <div className="mt-2">
                {ui.preflight}：{" "}
                <span className="font-semibold text-slate-900">
                  {analysis.isSameOrigin ? "-" : analysis.willPreflight ? ui.preflightYes : ui.preflightNo}
                </span>
              </div>
              {!analysis.isSameOrigin && analysis.preflightReasons.length > 0 && (
                <div className="mt-2">
                  <div className="font-semibold text-slate-900">{ui.preflightWhy}</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                    {analysis.preflightReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!analysis.isSameOrigin && analysis.requiredAllowMethods.length > 0 && (
                <div className="mt-3">
                  <div className="font-semibold text-slate-900">{ui.requiredAllowMethods}</div>
                  <div className="mt-1 font-mono text-slate-900">
                    {analysis.requiredAllowMethods.join(", ")}
                  </div>
                </div>
              )}

              {!analysis.isSameOrigin && analysis.requiredAllowHeaders.length > 0 && (
                <div className="mt-3">
                  <div className="font-semibold text-slate-900">{ui.requiredAllowHeaders}</div>
                  <div className="mt-1 font-mono text-slate-900">
                    {analysis.requiredAllowHeaders.join(", ")}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">{ui.snippetType}</div>
                  <div className="flex items-center gap-2">
                    <select
                      value={snippetType}
                      onChange={(e) => setSnippetType(e.target.value as SnippetType)}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="headers">响应头建议</option>
                      <option value="nginx">Nginx</option>
                      <option value="express">Express</option>
                      <option value="spring">Spring</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void copy("snippet", snippet)}
                      className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
                    >
                      {copiedKey === "snippet" ? ui.copied : ui.copy}
                    </button>
                  </div>
                </div>
                <textarea
                  value={snippet}
                  readOnly
                  className="mt-2 h-56 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.fixes}</div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
              {analysis.suggestions.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">{ui.result}</div>
              <div className="text-xs text-slate-500">
                {ui.duration}：{durationMs == null ? "-" : `${Math.round(durationMs)} ms`}
              </div>
            </div>

            <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-800 ring-1 ring-slate-200">
              {ui.status}：{statusLine ?? "-"}
            </div>

            {reachabilityNote && (
              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                {ui.reachabilityProbe}：{reachabilityNote}
              </div>
            )}

            {error && (
              <div className="mt-4 text-sm text-rose-600">
                {ui.errorPrefix}
                {error}
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{ui.response}</div>
                <button
                  type="button"
                  onClick={() => void copy("response", responseText)}
                  disabled={!responseText}
                  className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  {copiedKey === "response" ? ui.copied : ui.copy}
                </button>
              </div>
              <textarea
                value={responseText}
                readOnly
                className="mt-2 h-72 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                placeholder="（CORS 成功时）这里会显示响应体预览；失败时通常读不到内容。"
              />
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.diagnostics}</div>

            <div className="mt-3 text-xs text-slate-500">{ui.pasteHeadersHint}</div>
            <div className="mt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{ui.pasteHeaders}</div>
                <button
                  type="button"
                  onClick={() => void copy("pasted", pastedHeadersRaw)}
                  disabled={!pastedHeadersRaw}
                  className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  {copiedKey === "pasted" ? ui.copied : ui.copy}
                </button>
              </div>
              <textarea
                value={pastedHeadersRaw}
                onChange={(e) => setPastedHeadersRaw(e.target.value)}
                className="mt-2 h-44 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                placeholder={"access-control-allow-origin: https://your-site.example\naccess-control-allow-methods: GET, POST, OPTIONS\naccess-control-allow-headers: content-type, authorization"}
              />
              {pastedHeadersRaw.trim() && (
                <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                  {pastedDiagnosis.issues.length === 0 ? (
                    <div>未发现明显问题（或当前请求不需要 CORS/预检）。</div>
                  ) : (
                    <ul className="list-disc space-y-1 pl-5">
                      {pastedDiagnosis.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
