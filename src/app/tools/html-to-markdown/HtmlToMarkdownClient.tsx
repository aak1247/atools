"use client";

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type HeadingStyle = "atx" | "setext";
type CodeBlockStyle = "fenced" | "indented";
type BulletMarker = "-" | "*";

const DEFAULT_UI = {
  options: "选项",
  gfm: "GFM（表格/任务列表/删除线）",
  keepLinks: "保留链接",
  keepImages: "保留图片",
  stripUnsafe: "移除 script/style/iframe",
  headingStyle: "标题风格",
  headingAtx: "ATX（#）",
  headingSetext: "Setext（=== / ---）",
  codeBlockStyle: "代码块",
  codeFenced: "围栏（```）",
  codeIndented: "缩进",
  bulletMarker: "无序列表符号",
  bulletDash: "-",
  bulletAsterisk: "*",
  copyResult: "复制结果",
  download: "下载 .md",
  copied: "已复制",
  input: "输入（HTML）",
  output: "输出（Markdown）",
  inputPlaceholder: "粘贴 HTML…",
  outputPlaceholder: "Markdown 会显示在这里…",
  errorPrefix: "错误：",
  invalidHtml: "HTML 转换失败",
} as const;

type HtmlToMarkdownUi = typeof DEFAULT_UI;

function stripElements(root: HTMLElement, selector: string) {
  root.querySelectorAll(selector).forEach((el) => el.remove());
}

function extractLanguageFromClassName(className: string): string {
  const value = className.trim().toLowerCase();
  const match = value.match(/\blanguage-([a-z0-9_-]+)\b/) ?? value.match(/\blang-([a-z0-9_-]+)\b/);
  return match?.[1] ?? "";
}

function buildTurndownService(options: {
  gfmEnabled: boolean;
  keepLinks: boolean;
  keepImages: boolean;
  stripUnsafe: boolean;
  headingStyle: HeadingStyle;
  codeBlockStyle: CodeBlockStyle;
  bulletMarker: BulletMarker;
}) {
  const service = new TurndownService({
    headingStyle: options.headingStyle,
    codeBlockStyle: options.codeBlockStyle,
    bulletListMarker: options.bulletMarker,
  });

  if (options.gfmEnabled) service.use(gfm);

  if (!options.keepLinks) {
    service.addRule("stripLinks", {
      filter: ["a"],
      replacement: (content) => content,
    });
  }

  if (!options.keepImages) {
    service.addRule("stripImages", {
      filter: ["img", "picture", "source"],
      replacement: () => "",
    });
  }

  if (options.codeBlockStyle === "fenced") {
    service.addRule("fencedCodeBlockWithLanguage", {
      filter: (node) => node.nodeName === "PRE",
      replacement: (_content, node) => {
        const pre = node as HTMLElement;
        const code = pre.querySelector("code");
        const className =
          code?.getAttribute("class") ||
          pre.getAttribute("class") ||
          "";
        const language = extractLanguageFromClassName(className);
        const rawText = (code?.textContent || pre.textContent || "").replace(/\r\n/g, "\n").replace(/\n$/, "");
        const fence = "```";
        return `\n\n${fence}${language}\n${rawText}\n${fence}\n\n`;
      },
    });
  }

  if (options.stripUnsafe) service.remove(["script", "style", "noscript", "iframe"]);
  return service;
}

export default function HtmlToMarkdownClient() {
  const config = useOptionalToolConfig("html-to-markdown");
  const ui: HtmlToMarkdownUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<HtmlToMarkdownUi>) };

  const [gfmEnabled, setGfmEnabled] = useState(true);
  const [keepLinks, setKeepLinks] = useState(true);
  const [keepImages, setKeepImages] = useState(true);
  const [stripUnsafe, setStripUnsafe] = useState(true);
  const [headingStyle, setHeadingStyle] = useState<HeadingStyle>("atx");
  const [codeBlockStyle, setCodeBlockStyle] = useState<CodeBlockStyle>("fenced");
  const [bulletMarker, setBulletMarker] = useState<BulletMarker>("-");

  const [input, setInput] = useState(
    "<h1>Hello</h1><p>Paste <strong>HTML</strong> here.</p><ul><li>Supports lists</li><li>And tables (GFM)</li></ul>",
  );
  const [copiedKey, setCopiedKey] = useState<"copy" | "download" | null>(null);

  const result = useMemo(() => {
    const raw = input.trim();
    if (!raw) return { ok: true as const, text: "" };
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, "text/html");
      const root = doc.body;

      if (stripUnsafe) {
        stripElements(root, "script,style,noscript,iframe");
      }

      const service = buildTurndownService({
        gfmEnabled,
        keepLinks,
        keepImages,
        stripUnsafe,
        headingStyle,
        codeBlockStyle,
        bulletMarker,
      });

      const markdown = service.turndown(root);
      return { ok: true as const, text: markdown.trim() };
    } catch (e) {
      return {
        ok: false as const,
        text: "",
        error: e instanceof Error ? e.message : ui.invalidHtml,
      };
    }
  }, [
    bulletMarker,
    codeBlockStyle,
    gfmEnabled,
    headingStyle,
    input,
    keepImages,
    keepLinks,
    stripUnsafe,
    ui.invalidHtml,
  ]);

  const copy = async () => {
    if (!result.ok) return;
    await navigator.clipboard.writeText(result.text);
    setCopiedKey("copy");
    window.setTimeout(() => setCopiedKey((v) => (v === "copy" ? null : v)), 900);
  };

  const download = () => {
    if (!result.ok) return;
    const blob = new Blob([result.text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "converted.md";
    a.click();
    URL.revokeObjectURL(url);
    setCopiedKey("download");
    window.setTimeout(() => setCopiedKey((v) => (v === "download" ? null : v)), 900);
  };

  return (
    <ToolPageLayout toolSlug="html-to-markdown" maxWidthClassName="max-w-6xl">
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">{ui.options}</div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={gfmEnabled}
                onChange={(e) => setGfmEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.gfm}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={keepLinks}
                onChange={(e) => setKeepLinks(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.keepLinks}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={keepImages}
                onChange={(e) => setKeepImages(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.keepImages}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={stripUnsafe}
                onChange={(e) => setStripUnsafe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {ui.stripUnsafe}
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              {ui.headingStyle}
              <select
                value={headingStyle}
                onChange={(e) => setHeadingStyle(e.target.value as HeadingStyle)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              >
                <option value="atx">{ui.headingAtx}</option>
                <option value="setext">{ui.headingSetext}</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              {ui.codeBlockStyle}
              <select
                value={codeBlockStyle}
                onChange={(e) => setCodeBlockStyle(e.target.value as CodeBlockStyle)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              >
                <option value="fenced">{ui.codeFenced}</option>
                <option value="indented">{ui.codeIndented}</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              {ui.bulletMarker}
              <select
                value={bulletMarker}
                onChange={(e) => setBulletMarker(e.target.value as BulletMarker)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              >
                <option value="-">{ui.bulletDash}</option>
                <option value="*">{ui.bulletAsterisk}</option>
              </select>
            </label>

            <button
              type="button"
              disabled={!result.ok}
              onClick={() => void copy()}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {copiedKey === "copy" ? ui.copied : ui.copyResult}
            </button>
            <button
              type="button"
              disabled={!result.ok}
              onClick={download}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {copiedKey === "download" ? ui.copied : ui.download}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.input}</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={ui.inputPlaceholder}
              className="h-96 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">{ui.output}</div>
            <textarea
              value={result.ok ? result.text : ""}
              readOnly
              placeholder={ui.outputPlaceholder}
              className="h-96 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
            />
            {!result.ok && (
              <div className="mt-2 text-sm text-rose-600">
                {ui.errorPrefix} {result.error}
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}

