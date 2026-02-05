"use client";

import { useMemo, useState, type ReactNode } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type AllOriginsResponse = {
  contents: string;
  status: {
    url: string;
    content_type: string;
    http_code: number;
    response_time: number;
    content_length: number;
  };
};

type IssueLevel = "error" | "warning" | "info";
type Issue = { level: IssueLevel; message: string };

type AasaApplinksDetail = {
  appID: string;
  paths?: string[];
  components?: unknown[];
};

type AasaValidation = {
  issues: Issue[];
  details: AasaApplinksDetail[];
  appIDs: string[];
  hasApplinks: boolean;
};

type FetchResult = {
  requestUrl: string;
  status: AllOriginsResponse["status"] | null;
  contents: string | null;
  parseError: string | null;
  aasa: unknown | null;
  validation: AasaValidation | null;
  issues: Issue[];
};

const DEFAULT_UI = {
  title: "AASA / iOS Universal Links 在线验证",
  description:
    "说明：浏览器受 CORS 限制，本工具通过公共代理拉取 AASA 文件进行检查。请勿输入敏感内部地址；AASA 本身应为公开可访问文件。",
  domainLabel: "域名 / 站点地址",
  domainPlaceholder: "example.com 或 https://example.com",
  fetchButton: "获取并校验",
  fetching: "获取中…",
  invalidDomainInput: "请输入有效的域名或站点地址。",
  invalidInputRequestUrl: "(输入无效)",
  manualRequestUrl: "(手动输入)",
  sourceLabel: "作为校验/匹配的 AASA 来源",
  sourceWellKnown: ".well-known 路径",
  sourceRoot: "根路径",
  sourceAppleCdn: "Apple 官方 CDN",
  sourceManual: "手动粘贴",
  manualLabel: "手动粘贴 AASA JSON",
  manualPlaceholder: "{\n  \"applinks\": { \"apps\": [], \"details\": [] }\n}",
  validateManual: "校验粘贴内容",
  parsedAppIdsLabel: "解析到 appID：",
  manualResultTitle: "手动校验结果",
  resultsTitle: "检查结果",
  badgeHasError: "有错误",
  badgeDone: "已完成",
  levelError: "错误",
  levelWarning: "警告",
  levelInfo: "提示",
  tableHeaderField: "字段",
  tableHeaderValue: "值",
  fieldHttp: "HTTP",
  fieldFinalUrl: "最终 URL",
  fieldContentType: "Content-Type",
  fieldResponseTimeMs: "耗时(ms)",
  fieldContentLength: "长度",
  yesText: "是",
  noText: "否",
  summaryApplinksLabel: "applinks:",
  summaryAppIdCountTpl: "appID 数：{count}",
  summaryDetailsCountTpl: "details 数：{count}",
  checkTitleWellKnownTpl: "HTTPS {path}",
  checkTitleRootTpl: "HTTPS {path}",
  appleCdnTitleTpl: "Apple CDN {url}",
  universalTitle: "Universal Links 匹配测试",
  universalUrlLabel: "Universal Link URL",
  universalUrlPlaceholder: "https://example.com/path?x=1",
  appIdLabel: "App ID（TeamID.BundleID）",
  appIdPlaceholder: "ABCDE12345.com.example.app",
  runMatch: "开始匹配",
  matchOk: "匹配通过：该链接应被识别为 Universal Link（规则层面）",
  matchBad: "不匹配：该链接未命中 AASA 规则（规则层面）",
  matchNeedAasa: "请先获取/选择一个可用的 AASA（并成功解析）。",
  matchInvalidUrl: "请输入有效的 Universal Link URL。",
  matchNote: "注：此处仅做 AASA 规则层面的“是否命中”判断，实际 iOS 仍受缓存、安装状态、系统版本与跳转来源影响。",
  noValidAasaSelected: "未选择可用 AASA",
  currentSourcePrefix: "当前来源：",
  matchMetaAppIdTpl: "命中 appID：{appID}",
  matchMetaAppIdRuleTpl: "命中 appID：{appID}，规则：{rule}",
  tutorialTitle: "验证教程（快速排错）",
  tutorialBlocks: [
    {
      kind: "ol",
      title: "1) 部署 AASA（服务端）",
      items: [
        "将文件部署到 `https://<domain>/.well-known/apple-app-site-association`（推荐）或 `https://<domain>/apple-app-site-association`。",
        "文件必须无扩展名（不要 `.json`），并确保 HTTPS 可访问且返回 200。",
        "建议 `Content-Type: application/json`（签名文件可能为 `application/pkcs7-mime`）。",
        "典型结构：`applinks.apps` 为 `[]`，`applinks.details` 中配置 `appID` 与 `paths`/`components`。",
      ],
    },
    {
      kind: "ol",
      title: "2) 配置 iOS（客户端）",
      items: [
        "在 Xcode 的 Associated Domains 中添加：`applinks:your-domain.com`（按需包含子域）。",
        "确保 `appID` 正确：`<TeamID>.<BundleID>`，且与打包签名一致。",
        "安装 App 后，用 Safari/备忘录/短信等入口点击链接测试。",
      ],
    },
    {
      kind: "ul",
      title: "3) 常见失败原因",
      items: [
        "路径/文件名错误（少了 `.well-known` 或多了 `.json`）。",
        "跳转/鉴权/WAF 导致拿到 HTML。",
        "AASA JSON 结构不合法：缺少 `applinks.details[].appID` 或缺少 `paths/components`。",
        "iOS 有缓存：更新后生效可能延迟。",
        "Apple 官方 CDN 可能存在缓存延迟：`app-site-association.cdn-apple.com` 返回的内容不一定实时。",
      ],
    },
    {
      kind: "code",
      title: "4) 本地命令快速检查（可选）",
      commands: [
        "curl -i https://your-domain.com/.well-known/apple-app-site-association",
        "xcrun simctl openurl booted https://your-domain.com/your/path",
      ],
      note: "注：不同 macOS/iOS 版本的调试命令可能不同；企业网络/代理环境也可能影响拉取。",
    },
  ],
  issueFetchFailedTpl: "拉取失败：{error}",
  issueNoResponseData: "无响应数据。",
  issueProxyNoStatus: "代理未返回 status 字段。",
  issueHttpCodeNot200Tpl: "HTTP 状态码为 {code}（通常需 200）。",
  issueFinalUrlEndsWithJson: "最终 URL 以 .json 结尾：Apple 要求文件无扩展名（apple-app-site-association）。",
  issueNoContentType: "未获取到 Content-Type（代理限制或源站未返回）。",
  issueContentTypeSigned: "Content-Type 为 application/pkcs7-mime（签名 AASA）：浏览器端无法直接解析，建议使用 openssl 在本地解包检查。",
  issueContentTypeNotJsonTpl: "Content-Type 看起来不是 application/json：{contentType}",
  issueNoResponseBody: "未获取到响应内容。",
  issueBodyLooksLikeHtml: "响应内容疑似 HTML（可能是 404 页面/跳转页/鉴权页）。",
  issueJsonParseFailedTpl: "JSON 解析失败：{error}",
  issueAasaTopLevelMustBeObject: "AASA 顶层必须是 JSON 对象。",
  issueApplinksMissing: "未找到 applinks 字段：如果你只配置 WebCredentials/Activity Continuation，这可能是正常的。",
  issueApplinksMustBeObject: "applinks 必须是对象。",
  issueApplinksAppsMustBeArray: "applinks.apps 必须是数组（通常应为 []）。",
  issueApplinksAppsShouldBeEmpty: "applinks.apps 通常应为空数组 []（旧格式遗留可能导致兼容问题）。",
  issueApplinksDetailsEmpty: "applinks.details 为空：没有任何 appID/paths 规则会匹配 Universal Links。",
  issueDetailsItemMustBeObjectTpl: "applinks.details[{index}] 必须是对象。",
  issueDetailsAppIdMissingTpl: "applinks.details[{index}].appID 缺失或不是字符串。",
  issueDetailsNoPathsOrComponentsTpl: "applinks.details[{index}] 未提供 paths/components，可能无法匹配任何链接。",
  issueDetailsPathsEmptyTpl: "applinks.details[{index}].paths 为空数组。",
  issueAppIdFormatSuspiciousTpl: "appID 格式看起来不标准：{appID}（通常为 10 位 TeamID + '.' + BundleID）。",
  issueUniversalLinkMustBeHttps: "Universal Links 必须是 https:// 链接。",
  issueNoMatchingAppId: "该 AASA 中没有匹配的 appID。",
  issueNoDetails: "该 AASA 中没有任何 applinks.details。",
  issueMissingValidAasa: "缺少可用的 AASA 校验结果。",
  issueUrlParseFailed: "URL 解析失败。",
  issueHostMismatchTpl: "链接域名({urlHost}) 与当前输入域名({inputHost})不一致：实际 iOS 关联会按域名分别拉取 AASA。",
} as const;

type Ui = typeof DEFAULT_UI;

type TutorialBlock =
  | { kind: "ol" | "ul"; title: string; items: readonly string[] }
  | { kind: "code"; title: string; commands: readonly string[]; note?: string };

const WELL_KNOWN_PATH = "/.well-known/apple-app-site-association";
const ROOT_PATH = "/apple-app-site-association";
const APPLE_CDN_BASE = "https://app-site-association.cdn-apple.com/a/v1/";

function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

function issueLevelLabel(level: IssueLevel, ui: Ui): string {
  if (level === "error") return ui.levelError;
  if (level === "warning") return ui.levelWarning;
  return ui.levelInfo;
}

function renderInlineCode(text: string): ReactNode[] {
  const parts = text.split(/`([^`]+)`/g);
  return parts.map((part, idx) => {
    if (idx % 2 === 1) {
      return (
        <span key={idx} className="font-mono text-[11px] text-slate-800">
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function normalizeDomainInput(raw: string): {
  host: string | null;
  httpsWellKnownUrl: string | null;
  httpsRootUrl: string | null;
  appleCdnUrl: string | null;
} {
  const s = raw.trim();
  if (!s) return { host: null, httpsWellKnownUrl: null, httpsRootUrl: null, appleCdnUrl: null };
  const withProto = s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`;
  try {
    const url = new URL(withProto);
    const host = url.host;
    if (!host) return { host: null, httpsWellKnownUrl: null, httpsRootUrl: null, appleCdnUrl: null };
    return {
      host,
      httpsWellKnownUrl: `https://${host}${WELL_KNOWN_PATH}`,
      httpsRootUrl: `https://${host}${ROOT_PATH}`,
      appleCdnUrl: `${APPLE_CDN_BASE}${host}`,
    };
  } catch {
    return { host: null, httpsWellKnownUrl: null, httpsRootUrl: null, appleCdnUrl: null };
  }
}

async function fetchViaAllOrigins(url: string): Promise<AllOriginsResponse> {
  const api = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const resp = await fetch(api);
  if (!resp.ok) throw new Error(`Proxy request failed: ${resp.status}`);
  return (await resp.json()) as AllOriginsResponse;
}

function pushIssue(issues: Issue[], level: IssueLevel, message: string) {
  issues.push({ level, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    out.push(item);
  }
  return out;
}

function validateAasa(aasa: unknown, ui: Ui): AasaValidation {
  const issues: Issue[] = [];
  const details: AasaApplinksDetail[] = [];

  if (!isRecord(aasa)) {
    pushIssue(issues, "error", ui.issueAasaTopLevelMustBeObject);
    return { issues, details, appIDs: [], hasApplinks: false };
  }

  const applinksRaw = aasa["applinks"];
  if (!applinksRaw) {
    pushIssue(issues, "warning", ui.issueApplinksMissing);
    return { issues, details, appIDs: [], hasApplinks: false };
  }
  if (!isRecord(applinksRaw)) {
    pushIssue(issues, "error", ui.issueApplinksMustBeObject);
    return { issues, details, appIDs: [], hasApplinks: true };
  }

  const apps = applinksRaw["apps"];
  if (!Array.isArray(apps)) {
    pushIssue(issues, "error", ui.issueApplinksAppsMustBeArray);
  } else if (apps.length !== 0) {
    pushIssue(issues, "warning", ui.issueApplinksAppsShouldBeEmpty);
  }

  const rawDetails = applinksRaw["details"];
  const normalizedDetails = Array.isArray(rawDetails) ? rawDetails : rawDetails ? [rawDetails] : [];
  if (normalizedDetails.length === 0) {
    pushIssue(issues, "warning", ui.issueApplinksDetailsEmpty);
  }

  for (const [index, item] of normalizedDetails.entries()) {
    if (!isRecord(item)) {
      pushIssue(issues, "error", formatTemplate(ui.issueDetailsItemMustBeObjectTpl, { index }));
      continue;
    }
    const appID = getString(item["appID"]);
    if (!appID) {
      pushIssue(issues, "error", formatTemplate(ui.issueDetailsAppIdMissingTpl, { index }));
      continue;
    }
    const paths = getStringArray(item["paths"]);
    const components = Array.isArray(item["components"]) ? item["components"] : null;
    if (!paths && !components) {
      pushIssue(issues, "warning", formatTemplate(ui.issueDetailsNoPathsOrComponentsTpl, { index }));
    }
    if (paths && paths.length === 0) {
      pushIssue(issues, "warning", formatTemplate(ui.issueDetailsPathsEmptyTpl, { index }));
    }
    details.push({ appID, paths: paths ?? undefined, components: components ?? undefined });

    if (!/^[A-Z0-9]{10}\\.[A-Za-z0-9.-]+$/.test(appID)) {
      pushIssue(issues, "warning", formatTemplate(ui.issueAppIdFormatSuspiciousTpl, { appID }));
    }
  }

  const appIDs = Array.from(new Set(details.map((d) => d.appID))).sort((a, b) => a.localeCompare(b, "en"));
  return { issues, details, appIDs, hasApplinks: true };
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const re = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${re}$`);
}

function matchPathsRules(pathname: string, rules: string[]): { allowed: boolean; matchedRule: string | null } {
  let allowed = false;
  let matchedRule: string | null = null;

  for (const rawRule of rules) {
    const trimmed = rawRule.trim();
    if (!trimmed) continue;

    const isNot = trimmed.toUpperCase().startsWith("NOT ");
    const rule = isNot ? trimmed.slice(4).trim() : trimmed;
    const normalizedRule = rule === "*" ? "/*" : rule;
    if (!normalizedRule.startsWith("/")) continue;

    const re = globToRegExp(normalizedRule);
    if (re.test(pathname)) {
      allowed = !isNot;
      matchedRule = rawRule;
    }
  }
  return { allowed, matchedRule };
}

function matchComponentsRules(url: URL, components: unknown[]): { allowed: boolean; matchedRule: string | null } {
  for (const comp of components) {
    if (!isRecord(comp)) continue;
    const exclude = Boolean(comp["exclude"]);

    const pathPattern = getString(comp["/"]);
    if (pathPattern) {
      const re = globToRegExp(pathPattern === "*" ? "/*" : pathPattern);
      if (!re.test(url.pathname)) continue;
    }

    const fragmentPattern = getString(comp["#"]);
    if (fragmentPattern) {
      const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
      const re = globToRegExp(fragmentPattern);
      if (!re.test(fragment)) continue;
    }

    const queryPattern = comp["?"];
    if (queryPattern) {
      if (!isRecord(queryPattern)) continue;
      let ok = true;
      for (const [key, rawValue] of Object.entries(queryPattern)) {
        const wanted = getString(rawValue);
        if (!wanted) {
          ok = false;
          break;
        }
        const actual = url.searchParams.get(key);
        if (actual === null) {
          ok = false;
          break;
        }
        if (wanted !== "*" && !globToRegExp(wanted).test(actual)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }

    return { allowed: !exclude, matchedRule: JSON.stringify(comp) };
  }
  return { allowed: false, matchedRule: null };
}

function evaluateUniversalLink({
  aasaValidation,
  universalUrl,
  appID,
  ui,
}: {
  aasaValidation: AasaValidation;
  universalUrl: URL;
  appID: string | null;
  ui: Ui;
}): { ok: boolean; matched: { appID: string; rule: string | null } | null; issues: Issue[] } {
  const issues: Issue[] = [];
  if (universalUrl.protocol !== "https:") {
    pushIssue(issues, "error", ui.issueUniversalLinkMustBeHttps);
    return { ok: false, matched: null, issues };
  }

  const candidates = aasaValidation.details.filter((d) => (appID ? d.appID === appID : true));
  if (candidates.length === 0) {
    pushIssue(issues, "error", appID ? ui.issueNoMatchingAppId : ui.issueNoDetails);
    return { ok: false, matched: null, issues };
  }

  for (const detail of candidates) {
    if (detail.components && detail.components.length > 0) {
      const res = matchComponentsRules(universalUrl, detail.components);
      if (res.allowed) return { ok: true, matched: { appID: detail.appID, rule: res.matchedRule }, issues };
      continue;
    }
    if (detail.paths && detail.paths.length > 0) {
      const res = matchPathsRules(universalUrl.pathname, detail.paths);
      if (res.allowed) return { ok: true, matched: { appID: detail.appID, rule: res.matchedRule }, issues };
    }
  }

  return { ok: false, matched: null, issues };
}

function summarizeFetch(requestUrl: string, data: AllOriginsResponse | null, error: string | null, ui: Ui): FetchResult {
  const issues: Issue[] = [];
  if (error) {
    pushIssue(issues, "error", error);
    return { requestUrl, status: null, contents: null, parseError: null, aasa: null, validation: null, issues };
  }
  if (!data) {
    pushIssue(issues, "error", ui.issueNoResponseData);
    return { requestUrl, status: null, contents: null, parseError: null, aasa: null, validation: null, issues };
  }

  const status = data.status ?? null;
  const contents = typeof data.contents === "string" ? data.contents : null;

  if (!status) {
    pushIssue(issues, "error", ui.issueProxyNoStatus);
  } else {
    if (status.http_code !== 200) {
      pushIssue(issues, "warning", formatTemplate(ui.issueHttpCodeNot200Tpl, { code: status.http_code }));
    }
    if (status.url && status.url.toLowerCase().endsWith(".json")) {
      pushIssue(issues, "warning", ui.issueFinalUrlEndsWithJson);
    }

    const ct = (status.content_type || "").toLowerCase();
    if (!ct) {
      pushIssue(issues, "warning", ui.issueNoContentType);
    } else if (ct.includes("application/pkcs7-mime")) {
      pushIssue(issues, "warning", ui.issueContentTypeSigned);
    } else if (!ct.includes("application/json")) {
      pushIssue(issues, "warning", formatTemplate(ui.issueContentTypeNotJsonTpl, { contentType: status.content_type || "" }));
    }
  }

  if (!contents) {
    pushIssue(issues, "error", ui.issueNoResponseBody);
    return { requestUrl, status, contents, parseError: null, aasa: null, validation: null, issues };
  }

  const looksLikeHtml = /^\s*</.test(contents) || /^\s*<!doctype/i.test(contents);
  if (looksLikeHtml) pushIssue(issues, "warning", ui.issueBodyLooksLikeHtml);

  let aasa: unknown | null = null;
  let parseError: string | null = null;
  try {
    aasa = JSON.parse(contents);
  } catch (e) {
    parseError = e instanceof Error ? e.message : "JSON parse failed";
    pushIssue(issues, "error", formatTemplate(ui.issueJsonParseFailedTpl, { error: parseError }));
  }

  const validation = aasa ? validateAasa(aasa, ui) : null;
  if (validation) issues.push(...validation.issues);

  return { requestUrl, status, contents, parseError, aasa, validation, issues };
}

function Badge({ level, children }: { level: IssueLevel; children: ReactNode }) {
  const cls =
    level === "error"
      ? "bg-rose-50 text-rose-800 ring-1 ring-rose-100"
      : level === "warning"
        ? "bg-amber-50 text-amber-800 ring-1 ring-amber-100"
        : "bg-slate-50 text-slate-700 ring-1 ring-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function ResultCard({ title, result, ui }: { title: string; result: FetchResult | null; ui: Ui }) {
  if (!result) return null;
  const status = result.status;
  const hasError = result.issues.some((i) => i.level === "error");
  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <Badge level={hasError ? "error" : "info"}>{hasError ? ui.badgeHasError : ui.badgeDone}</Badge>
      </div>
      <div className="mt-2 text-xs text-slate-500 font-mono break-all">{result.requestUrl}</div>

      {status && (
        <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
          <table className="w-full table-fixed border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="w-24 border-b border-slate-200 px-3 py-2">{ui.tableHeaderField}</th>
                <th className="border-b border-slate-200 px-3 py-2">{ui.tableHeaderValue}</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {[
                [ui.fieldHttp, String(status.http_code)],
                [ui.fieldFinalUrl, status.url || "-"],
                [ui.fieldContentType, status.content_type || "-"],
                [ui.fieldResponseTimeMs, String(status.response_time ?? "-")],
                [ui.fieldContentLength, String(status.content_length ?? "-")],
              ].map(([k, v]) => (
                <tr key={k} className="odd:bg-white even:bg-slate-50/40">
                  <td className="border-b border-slate-100 px-3 py-2 font-semibold">{k}</td>
                  <td className="border-b border-slate-100 px-3 py-2 font-mono break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.validation && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Badge level="info">
            {ui.summaryApplinksLabel} {result.validation.hasApplinks ? ui.yesText : ui.noText}
          </Badge>
          <Badge level="info">{formatTemplate(ui.summaryAppIdCountTpl, { count: result.validation.appIDs.length })}</Badge>
          <Badge level="info">{formatTemplate(ui.summaryDetailsCountTpl, { count: result.validation.details.length })}</Badge>
        </div>
      )}

      {result.issues.length > 0 && (
        <div className="mt-4 space-y-2">
          {result.issues.map((issue, idx) => (
            <div key={`${issue.level}-${idx}`} className="flex items-start gap-2 text-xs">
              <Badge level={issue.level}>{issueLevelLabel(issue.level, ui)}</Badge>
              <div className="pt-1 text-slate-700">{issue.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AasaUniversalLinksClient() {
  return (
    <ToolPageLayout toolSlug="aasa-universal-links" maxWidthClassName="max-w-6xl">
      <AasaUniversalLinksInner />
    </ToolPageLayout>
  );
}

function AasaUniversalLinksInner() {
  const config = useOptionalToolConfig("aasa-universal-links");
  const ui: Ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<Ui>) };

  const [domainInput, setDomainInput] = useState("example.com");
  const normalized = useMemo(() => normalizeDomainInput(domainInput), [domainInput]);

  const [source, setSource] = useState<"well-known" | "root" | "apple-cdn" | "manual">("well-known");
  const [manualJson, setManualJson] = useState<string>(
    "{\n  \"applinks\": {\n    \"apps\": [],\n    \"details\": [\n      {\n        \"appID\": \"ABCDE12345.com.example.app\",\n        \"paths\": [\"/*\"]\n      }\n    ]\n  }\n}\n",
  );

  const [isFetching, setIsFetching] = useState(false);
  const [wellKnownResult, setWellKnownResult] = useState<FetchResult | null>(null);
  const [rootResult, setRootResult] = useState<FetchResult | null>(null);
  const [appleCdnResult, setAppleCdnResult] = useState<FetchResult | null>(null);
  const [manualResult, setManualResult] = useState<FetchResult | null>(null);

  const [universalUrlInput, setUniversalUrlInput] = useState("https://example.com/");
  const [appIdInput, setAppIdInput] = useState("");
  const [matchOutput, setMatchOutput] = useState<{
    ok: boolean;
    text: string;
    meta: string | null;
    issues: Issue[];
  } | null>(null);

  const activeValidation = useMemo(() => {
    if (source === "manual") return manualResult?.validation ?? null;
    if (source === "apple-cdn") return appleCdnResult?.validation ?? null;
    if (source === "root") return rootResult?.validation ?? null;
    return wellKnownResult?.validation ?? null;
  }, [appleCdnResult, manualResult, rootResult, source, wellKnownResult]);

  const activeHost = normalized.host;

  const runFetch = async () => {
    setMatchOutput(null);
    setWellKnownResult(null);
    setRootResult(null);
    setAppleCdnResult(null);

    if (!normalized.httpsWellKnownUrl || !normalized.httpsRootUrl || !normalized.appleCdnUrl) {
      setWellKnownResult({
        requestUrl: ui.invalidInputRequestUrl,
        status: null,
        contents: null,
        parseError: "invalid input",
        aasa: null,
        validation: null,
        issues: [{ level: "error", message: ui.invalidDomainInput }],
      });
      return;
    }

    setIsFetching(true);
    try {
      const [wk, rt, cdn] = await Promise.allSettled([
        fetchViaAllOrigins(normalized.httpsWellKnownUrl),
        fetchViaAllOrigins(normalized.httpsRootUrl),
        fetchViaAllOrigins(normalized.appleCdnUrl),
      ]);

      const wkRes =
        wk.status === "fulfilled"
          ? summarizeFetch(normalized.httpsWellKnownUrl, wk.value, null, ui)
          : summarizeFetch(
              normalized.httpsWellKnownUrl,
              null,
              formatTemplate(ui.issueFetchFailedTpl, {
                error: wk.reason instanceof Error ? wk.reason.message : "Fetch failed",
              }),
              ui,
            );
      const rtRes =
        rt.status === "fulfilled"
          ? summarizeFetch(normalized.httpsRootUrl, rt.value, null, ui)
          : summarizeFetch(
              normalized.httpsRootUrl,
              null,
              formatTemplate(ui.issueFetchFailedTpl, {
                error: rt.reason instanceof Error ? rt.reason.message : "Fetch failed",
              }),
              ui,
            );
      const cdnRes =
        cdn.status === "fulfilled"
          ? summarizeFetch(normalized.appleCdnUrl, cdn.value, null, ui)
          : summarizeFetch(
              normalized.appleCdnUrl,
              null,
              formatTemplate(ui.issueFetchFailedTpl, {
                error: cdn.reason instanceof Error ? cdn.reason.message : "Fetch failed",
              }),
              ui,
            );

      setWellKnownResult(wkRes);
      setRootResult(rtRes);
      setAppleCdnResult(cdnRes);

      const nextSource = (() => {
        const wkOk = wkRes.validation && !wkRes.issues.some((i) => i.level === "error");
        if (wkOk) return "well-known";
        const rtOk = rtRes.validation && !rtRes.issues.some((i) => i.level === "error");
        if (rtOk) return "root";
        const cdnOk = cdnRes.validation && !cdnRes.issues.some((i) => i.level === "error");
        if (cdnOk) return "apple-cdn";
        return source;
      })();
      setSource(nextSource);

      const appIDs =
        (nextSource === "well-known"
          ? wkRes.validation?.appIDs
          : nextSource === "root"
            ? rtRes.validation?.appIDs
            : nextSource === "apple-cdn"
              ? cdnRes.validation?.appIDs
              : []) ?? [];
      if (appIDs.length > 0 && !appIdInput) setAppIdInput(appIDs[0]);
    } finally {
      setIsFetching(false);
    }
  };

  const runManual = () => {
    setMatchOutput(null);
    const requestUrl = ui.manualRequestUrl;
    const issues: Issue[] = [];
    let aasa: unknown | null = null;
    try {
      aasa = JSON.parse(manualJson);
    } catch (e) {
      pushIssue(
        issues,
        "error",
        formatTemplate(ui.issueJsonParseFailedTpl, {
          error: e instanceof Error ? e.message : "JSON parse failed",
        }),
      );
    }
    const validation = aasa ? validateAasa(aasa, ui) : null;
    if (validation) issues.push(...validation.issues);
    const res: FetchResult = {
      requestUrl,
      status: null,
      contents: manualJson,
      parseError: aasa ? null : "parse failed",
      aasa,
      validation,
      issues,
    };
    setManualResult(res);
    setSource("manual");
    if (validation?.appIDs?.length && !appIdInput) setAppIdInput(validation.appIDs[0]);
  };

  const runMatch = () => {
    if (!activeValidation) {
      setMatchOutput({
        ok: false,
        text: ui.matchNeedAasa,
        meta: null,
        issues: [{ level: "error", message: ui.issueMissingValidAasa }],
      });
      return;
    }

    let url: URL;
    try {
      url = new URL(universalUrlInput.trim());
    } catch {
      setMatchOutput({
        ok: false,
        text: ui.matchInvalidUrl,
        meta: null,
        issues: [{ level: "error", message: ui.issueUrlParseFailed }],
      });
      return;
    }

    const evalRes = evaluateUniversalLink({
      aasaValidation: activeValidation,
      universalUrl: url,
      appID: appIdInput.trim() || null,
      ui,
    });

    const mismatchHost = activeHost && url.host && activeHost !== url.host;
    const mismatchIssue: Issue[] = mismatchHost
      ? [
          {
            level: "warning",
            message: formatTemplate(ui.issueHostMismatchTpl, { urlHost: url.host, inputHost: activeHost }),
          },
        ]
      : [];

    setMatchOutput({
      ok: evalRes.ok,
      text: evalRes.ok ? ui.matchOk : ui.matchBad,
      meta: evalRes.matched
        ? evalRes.matched.rule
          ? formatTemplate(ui.matchMetaAppIdRuleTpl, { appID: evalRes.matched.appID, rule: evalRes.matched.rule })
          : formatTemplate(ui.matchMetaAppIdTpl, { appID: evalRes.matched.appID })
        : null,
      issues: [...mismatchIssue, ...evalRes.issues],
    });
  };

  const appIdCandidates = activeValidation?.appIDs ?? [];

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="text-sm font-semibold text-slate-900">{ui.title}</div>
        <div className="mt-2 text-xs text-slate-600">{ui.description}</div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.resultsTitle}</div>

            <label className="mt-4 block text-xs font-semibold text-slate-700">{ui.domainLabel}</label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                className="min-w-[240px] flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                placeholder={ui.domainPlaceholder}
              />
              <button
                type="button"
                onClick={() => void runFetch()}
                disabled={isFetching}
                className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {isFetching ? ui.fetching : ui.fetchButton}
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
              <div className="font-semibold text-slate-700">{ui.sourceLabel}</div>
              <div className="mt-2 flex flex-wrap gap-3">
                {[
                  { key: "well-known", label: ui.sourceWellKnown },
                  { key: "root", label: ui.sourceRoot },
                  { key: "apple-cdn", label: ui.sourceAppleCdn },
                  { key: "manual", label: ui.sourceManual },
                ].map((opt) => (
                  <label key={opt.key} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="aasa-source"
                      value={opt.key}
                      checked={source === opt.key}
                      onChange={() => setSource(opt.key as typeof source)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <ResultCard
                title={formatTemplate(ui.checkTitleWellKnownTpl, { path: WELL_KNOWN_PATH })}
                result={wellKnownResult}
                ui={ui}
              />
              <ResultCard title={formatTemplate(ui.checkTitleRootTpl, { path: ROOT_PATH })} result={rootResult} ui={ui} />
              <ResultCard
                title={formatTemplate(ui.appleCdnTitleTpl, { url: `${APPLE_CDN_BASE}${normalized.host ?? "<domain>"}` })}
                result={appleCdnResult}
                ui={ui}
              />
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.manualLabel}</div>
            <div className="mt-3">
              <textarea
                value={manualJson}
                onChange={(e) => setManualJson(e.target.value)}
                className="h-64 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                placeholder={ui.manualPlaceholder}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runManual}
                className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {ui.validateManual}
              </button>
              {manualResult?.validation?.appIDs?.length ? (
                <span className="text-xs text-slate-600">
                  {ui.parsedAppIdsLabel}
                  {manualResult.validation.appIDs.join(", ")}
                </span>
              ) : null}
            </div>
            {manualResult ? (
              <div className="mt-4">
                <ResultCard title={ui.manualResultTitle} result={manualResult} ui={ui} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-8 rounded-3xl bg-white p-6 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">{ui.universalTitle}</div>
            {activeValidation ? (
              <Badge level="info">
                {ui.currentSourcePrefix}
                {source === "well-known"
                  ? ui.sourceWellKnown
                  : source === "root"
                    ? ui.sourceRoot
                    : source === "apple-cdn"
                      ? ui.sourceAppleCdn
                      : ui.sourceManual}
              </Badge>
            ) : (
              <Badge level="warning">{ui.noValidAasaSelected}</Badge>
            )}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-700">{ui.universalUrlLabel}</label>
              <input
                value={universalUrlInput}
                onChange={(e) => setUniversalUrlInput(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                placeholder={ui.universalUrlPlaceholder}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">{ui.appIdLabel}</label>
              <input
                value={appIdInput}
                onChange={(e) => setAppIdInput(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                placeholder={ui.appIdPlaceholder}
              />
              {appIdCandidates.length > 0 && (
                <div className="mt-2">
                  <select
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    {appIdCandidates.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runMatch}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {ui.runMatch}
            </button>
            <div className="text-xs text-slate-500">
              {ui.matchNote}
            </div>
          </div>

          {matchOutput && (
            <div
              className={`mt-5 rounded-3xl p-5 ring-1 ${
                matchOutput.ok ? "bg-emerald-50 ring-emerald-100" : "bg-rose-50 ring-rose-100"
              }`}
            >
              <div className={`text-sm font-semibold ${matchOutput.ok ? "text-emerald-900" : "text-rose-900"}`}>
                {matchOutput.text}
              </div>
              {matchOutput.meta ? (
                <div className="mt-2 text-xs font-mono break-all text-slate-700">{matchOutput.meta}</div>
              ) : null}
              {matchOutput.issues.length > 0 && (
                <div className="mt-3 space-y-2">
                  {matchOutput.issues.map((issue, idx) => (
                    <div key={`${issue.level}-${idx}`} className="flex items-start gap-2 text-xs">
                      <Badge level={issue.level}>{issueLevelLabel(issue.level, ui)}</Badge>
                      <div className="pt-1 text-slate-700">{issue.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 rounded-3xl bg-white p-6 ring-1 ring-slate-200">
          <div className="text-sm font-semibold text-slate-900">{ui.tutorialTitle}</div>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {(ui.tutorialBlocks as readonly TutorialBlock[]).map((block) => (
              <div key={block.title} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-semibold text-slate-900">{block.title}</div>
                {block.kind === "code" ? (
                  <div className="mt-2 space-y-2 text-xs text-slate-700">
                    {block.commands.map((cmd) => (
                      <div
                        key={cmd}
                        className="font-mono break-all rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200"
                      >
                        {cmd}
                      </div>
                    ))}
                    {block.note ? <div className="text-[11px] text-slate-500">{block.note}</div> : null}
                  </div>
                ) : block.kind === "ol" ? (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-700">
                    {block.items.map((item) => (
                      <li key={item}>{renderInlineCode(item)}</li>
                    ))}
                  </ol>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-700">
                    {block.items.map((item) => (
                      <li key={item}>{renderInlineCode(item)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
