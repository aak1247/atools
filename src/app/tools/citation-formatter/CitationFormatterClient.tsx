"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import {
  detectCitationStyle,
  formatCitation,
  normalizeDoi,
  parseAuthors,
  parseCitation,
  type CitationInput,
  type CitationSourceType,
  type CitationStyle,
  type CitationWarningCode,
} from "../../../lib/citation";

type Ui = {
  hint: string;
  parseTitle: string;
  parseInput: string;
  parsePlaceholder: string;
  parseButton: string;
  parseApply: string;
  parseDetected: string;
  parseConfidence: string;
  parseUnknown: string;
  style: string;
  styleApa: string;
  styleMla: string;
  styleChicago: string;
  styleIeee: string;
  styleGbt: string;
  sourceType: string;
  typeWebsite: string;
  typeJournal: string;
  typeBook: string;
  authors: string;
  authorsPlaceholder: string;
  title: string;
  titlePlaceholder: string;
  containerTitle: string;
  containerTitleWebsite: string;
  containerTitleJournal: string;
  containerTitleBook: string;
  publisher: string;
  publisherPlaceholder: string;
  publishedDate: string;
  publishedDatePlaceholder: string;
  accessDate: string;
  accessDatePlaceholder: string;
  yearOptionalHint: string;
  volume: string;
  issue: string;
  pages: string;
  url: string;
  doi: string;
  output: string;
  copy: string;
  copied: string;
  reset: string;
  warnings: string;
  missingTitle: string;
  missingAuthors: string;
  missingContainer: string;
  missingPublisher: string;
  missingUrl: string;
  missingDate: string;
  monthNamesLong: string[];
  monthNamesShort: string[];
  accessedLabel: string;
  retrievedFromLabel: string;
  onlineLabel: string;
  availableLabel: string;
};

const DEFAULT_UI: Ui = {
  hint: "引用格式化工具：填写作者/标题/期刊或网站等信息，一键生成 APA / MLA / Chicago / IEEE / GB/T 7714 引用（本地运行不上传）。",
  parseTitle: "解析引用（粘贴现有引用，自动识别规范并解析字段）",
  parseInput: "引用文本",
  parsePlaceholder:
    "粘贴一条引用/参考文献条目（APA/MLA/Chicago/IEEE/GB/T 7714 等），点击“解析并填充”。\n示例：\n[1] A. B. Smith, \"Title,\" Journal, vol. 1, no. 2, pp. 3-4, 2020, doi: 10.xxx/yyy.\n或：\nZhang, S., & Li, S. (2020). Title. Journal, 1(2), 3-4. https://doi.org/10.xxx/yyy",
  parseButton: "解析",
  parseApply: "解析并填充",
  parseDetected: "识别结果",
  parseConfidence: "置信度",
  parseUnknown: "未能可靠识别（将按当前选择输出）",
  style: "引用格式",
  styleApa: "APA 7",
  styleMla: "MLA 9",
  styleChicago: "Chicago",
  styleIeee: "IEEE",
  styleGbt: "GB/T 7714",
  sourceType: "文献类型",
  typeWebsite: "网页/网站",
  typeJournal: "期刊论文",
  typeBook: "图书",
  authors: "作者（每行一个）",
  authorsPlaceholder: "示例：\nZhang, San\nLi, Si\n或：\nSan Zhang\nSi Li",
  title: "题名",
  titlePlaceholder: "请输入文章/网页/图书标题",
  containerTitle: "来源/载体",
  containerTitleWebsite: "网站名称（可选）",
  containerTitleJournal: "期刊名称",
  containerTitleBook: "书名（用于章节/丛书，可选）",
  publisher: "出版者/机构（可选）",
  publisherPlaceholder: "示例：Springer / IEEE / 某出版社",
  publishedDate: "发布日期/年份（可选）",
  publishedDatePlaceholder: "示例：2020 或 2020-03 或 2020-03-12",
  accessDate: "访问日期/年份（可选）",
  accessDatePlaceholder: "示例：2024-01-01 或 2024",
  yearOptionalHint: "提示：缺失年份时将自动省略或使用 n.d.（不同格式略有差异）。",
  volume: "卷（可选）",
  issue: "期（可选）",
  pages: "页码（可选）",
  url: "URL（可选）",
  doi: "DOI（可选）",
  output: "生成结果",
  copy: "复制引用",
  copied: "已复制",
  reset: "重置",
  warnings: "缺失项提示",
  missingTitle: "缺少题名",
  missingAuthors: "缺少作者（可留空，用机构/网站名替代）",
  missingContainer: "缺少来源/期刊/网站名（部分格式可省略）",
  missingPublisher: "缺少出版者（图书/部分网页可填写）",
  missingUrl: "缺少 URL/DOI（网页通常需要 URL）",
  missingDate: "缺少日期/年份",
  monthNamesLong: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  monthNamesShort: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  accessedLabel: "访问于",
  retrievedFromLabel: "检索自",
  onlineLabel: "在线",
  availableLabel: "可用",
};

const warningLabel = (ui: Ui, code: CitationWarningCode) => {
  switch (code) {
    case "missingTitle":
      return ui.missingTitle;
    case "missingAuthors":
      return ui.missingAuthors;
    case "missingContainer":
      return ui.missingContainer;
    case "missingPublisher":
      return ui.missingPublisher;
    case "missingUrl":
      return ui.missingUrl;
    case "missingDate":
      return ui.missingDate;
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
};

export default function CitationFormatterClient() {
  return (
    <ToolPageLayout toolSlug="citation-formatter" maxWidthClassName="max-w-6xl">
      {({ config }) => <Inner ui={{ ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) }} />}
    </ToolPageLayout>
  );
}

function Inner({ ui }: { ui: Ui }) {
  const [style, setStyle] = useState<CitationStyle>("apa7");
  const [sourceType, setSourceType] = useState<CitationSourceType>("website");

  const [parseText, setParseText] = useState("");
  const [parseInfo, setParseInfo] = useState<{ style: CitationStyle | "unknown"; confidence: number } | null>(null);

  const [authorsRaw, setAuthorsRaw] = useState("");
  const [title, setTitle] = useState("");
  const [containerTitle, setContainerTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [accessDate, setAccessDate] = useState("");
  const [volume, setVolume] = useState("");
  const [issue, setIssue] = useState("");
  const [pages, setPages] = useState("");
  const [url, setUrl] = useState("");
  const [doi, setDoi] = useState("");
  const [copied, setCopied] = useState(false);

  const normalizedDoi = useMemo(() => normalizeDoi(doi), [doi]);

  const styleLabel = (s: CitationStyle | "unknown") => {
    switch (s) {
      case "apa7":
        return ui.styleApa;
      case "mla9":
        return ui.styleMla;
      case "chicago":
        return ui.styleChicago;
      case "ieee":
        return ui.styleIeee;
      case "gbt7714":
        return ui.styleGbt;
      default:
        return ui.parseUnknown;
    }
  };

  const computed = useMemo(() => {
    const input: CitationInput = {
      style,
      sourceType,
      title,
      containerTitle,
      publisher,
      publishedDate,
      accessDate,
      volume,
      issue,
      pages,
      url,
      doi: normalizedDoi,
      authors: parseAuthors(authorsRaw),
    };

    return formatCitation(input, {
      monthNamesLong: ui.monthNamesLong,
      monthNamesShort: ui.monthNamesShort,
      accessedLabel: ui.accessedLabel,
      retrievedFromLabel: ui.retrievedFromLabel,
      onlineLabel: ui.onlineLabel,
      availableLabel: ui.availableLabel,
    });
  }, [
    accessDate,
    authorsRaw,
    containerTitle,
    issue,
    normalizedDoi,
    pages,
    publishedDate,
    publisher,
    sourceType,
    style,
    title,
    ui.monthNamesLong,
    ui.monthNamesShort,
    url,
  ]);

  const citation = computed.citation || "-";
  const warnings = computed.warnings;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(citation === "-" ? "" : citation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const onReset = () => {
    setParseText("");
    setParseInfo(null);
    setAuthorsRaw("");
    setTitle("");
    setContainerTitle("");
    setPublisher("");
    setPublishedDate("");
    setAccessDate("");
    setVolume("");
    setIssue("");
    setPages("");
    setUrl("");
    setDoi("");
    setCopied(false);
  };

  const onParseOnly = () => {
    const det = detectCitationStyle(parseText);
    setParseInfo({ style: det.style, confidence: det.confidence });
  };

  const onParseAndApply = () => {
    const det = detectCitationStyle(parseText);
    setParseInfo({ style: det.style, confidence: det.confidence });

    const parsed = parseCitation(parseText, det.style === "unknown" ? undefined : det.style);

    if (det.style !== "unknown") setStyle(det.style);
    if (parsed.sourceType) setSourceType(parsed.sourceType);
    if (parsed.title) setTitle(parsed.title);
    if (parsed.containerTitle) setContainerTitle(parsed.containerTitle);
    if (parsed.publisher) setPublisher(parsed.publisher);
    if (parsed.publishedDate) setPublishedDate(parsed.publishedDate);
    if (parsed.accessDate) setAccessDate(parsed.accessDate);
    if (parsed.volume) setVolume(parsed.volume);
    if (parsed.issue) setIssue(parsed.issue);
    if (parsed.pages) setPages(parsed.pages);
    if (parsed.url) setUrl(parsed.url);
    if (parsed.doi) setDoi(parsed.doi);
    if (parsed.authorsRaw) setAuthorsRaw(parsed.authorsRaw);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.hint}</div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="grid gap-3">
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.parseTitle}</div>
                <label className="mt-3 grid gap-1 text-xs text-slate-600">
                  {ui.parseInput}
                  <textarea
                    value={parseText}
                    onChange={(e) => setParseText(e.target.value)}
                    placeholder={ui.parsePlaceholder}
                    className="min-h-[120px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-400"
                  />
                </label>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onParseOnly}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    {ui.parseButton}
                  </button>
                  <button
                    type="button"
                    onClick={onParseAndApply}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                  >
                    {ui.parseApply}
                  </button>
                </div>

                {parseInfo ? (
                  <div className="mt-3 grid gap-1 text-xs text-slate-700">
                    <div>
                      {ui.parseDetected}: <span className="font-semibold">{styleLabel(parseInfo.style)}</span>
                    </div>
                    <div>
                      {ui.parseConfidence}:{" "}
                      <span className="font-mono">{Math.round(Math.max(0, Math.min(1, parseInfo.confidence)) * 100)}%</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <label className="grid gap-1 text-xs text-slate-600">
                  {ui.style}
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value as CitationStyle)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                  >
                    <option value="apa7">{ui.styleApa}</option>
                    <option value="mla9">{ui.styleMla}</option>
                    <option value="chicago">{ui.styleChicago}</option>
                    <option value="ieee">{ui.styleIeee}</option>
                    <option value="gbt7714">{ui.styleGbt}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  {ui.sourceType}
                  <select
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value as CitationSourceType)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                  >
                    <option value="website">{ui.typeWebsite}</option>
                    <option value="journal">{ui.typeJournal}</option>
                    <option value="book">{ui.typeBook}</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-1 text-xs text-slate-600">
                {ui.authors}
                <textarea
                  value={authorsRaw}
                  onChange={(e) => setAuthorsRaw(e.target.value)}
                  placeholder={ui.authorsPlaceholder}
                  className="min-h-[96px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-400"
                />
              </label>

              <label className="grid gap-1 text-xs text-slate-600">
                {ui.title}
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={ui.titlePlaceholder}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-400"
                />
              </label>

              <label className="grid gap-1 text-xs text-slate-600">
                {ui.containerTitle}
                <input
                  value={containerTitle}
                  onChange={(e) => setContainerTitle(e.target.value)}
                  placeholder={
                    sourceType === "website"
                      ? ui.containerTitleWebsite
                      : sourceType === "journal"
                        ? ui.containerTitleJournal
                        : ui.containerTitleBook
                  }
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-400"
                />
              </label>

              <label className="grid gap-1 text-xs text-slate-600">
                {ui.publisher}
                <input
                  value={publisher}
                  onChange={(e) => setPublisher(e.target.value)}
                  placeholder={ui.publisherPlaceholder}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-400"
                />
              </label>

              <div className="grid gap-2 md:grid-cols-2">
                <label className="grid gap-1 text-xs text-slate-600">
                  {ui.publishedDate}
                  <input
                    value={publishedDate}
                    onChange={(e) => setPublishedDate(e.target.value)}
                    placeholder={ui.publishedDatePlaceholder}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-400"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  {ui.accessDate}
                  <input
                    value={accessDate}
                    onChange={(e) => setAccessDate(e.target.value)}
                    placeholder={ui.accessDatePlaceholder}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-400"
                  />
                </label>
              </div>

              {sourceType === "journal" ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="grid gap-1 text-xs text-slate-600">
                    {ui.volume}
                    <input
                      value={volume}
                      onChange={(e) => setVolume(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    {ui.issue}
                    <input
                      value={issue}
                      onChange={(e) => setIssue(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    {ui.pages}
                    <input
                      value={pages}
                      onChange={(e) => setPages(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                    />
                  </label>
                </div>
              ) : null}

              <div className="grid gap-2 md:grid-cols-2">
                <label className="grid gap-1 text-xs text-slate-600">
                  {ui.url}
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    inputMode="url"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  {ui.doi}
                  <input
                    value={doi}
                    onChange={(e) => setDoi(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                  />
                </label>
              </div>

              <div className="text-xs text-slate-500">{ui.yearOptionalHint}</div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={onCopy}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  {copied ? ui.copied : ui.copy}
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  {ui.reset}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.output}</div>
            <pre className="mt-3 whitespace-pre-wrap break-words rounded-2xl bg-slate-50 p-4 text-sm text-slate-900 ring-1 ring-slate-200">
              {citation}
            </pre>

            {warnings.length ? (
              <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                <div className="text-xs font-semibold text-amber-900">{ui.warnings}</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
                  {warnings.map((w) => (
                    <li key={w}>{warningLabel(ui, w)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
