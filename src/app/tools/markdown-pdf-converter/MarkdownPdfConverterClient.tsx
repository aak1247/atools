"use client";

import type { ChangeEvent } from "react";
import { useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; lang: string; code: string }
  | { type: "table"; header: string[]; align: Array<"left" | "center" | "right" | null>; rows: string[][] }
  | { type: "hr" };

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const safeHref = (href: string): string | null => {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") return trimmed;
    return null;
  } catch {
    return null;
  }
};

const safeImageSrc = (src: string): string | null => {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return trimmed;
  if (trimmed.startsWith("data:image/")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:") return trimmed;
    return null;
  } catch {
    return null;
  }
};

const escapeHtmlPreservingTags = (value: string) => {
  const tagRe = /<\/?[a-zA-Z][\w:-]*(?:\s+[^<>]*?)?>/g;
  let out = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(value)) !== null) {
    out += escapeHtml(value.slice(lastIndex, match.index));
    out += match[0];
    lastIndex = match.index + match[0].length;
  }
  out += escapeHtml(value.slice(lastIndex));
  return out;
};

const sanitizeHtml = (html: string) => {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const container = doc.body.firstElementChild;
  if (!container) return html;

  const allowedTags = new Set([
    "A",
    "B",
    "BLOCKQUOTE",
    "BR",
    "CODE",
    "DEL",
    "EM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HR",
    "I",
    "IMG",
    "LI",
    "OL",
    "P",
    "PRE",
    "SPAN",
    "STRONG",
    "TABLE",
    "TBODY",
    "TD",
    "TH",
    "THEAD",
    "TR",
    "UL",
  ]);

  const blockedTags = new Set(["BASE", "EMBED", "IFRAME", "LINK", "META", "OBJECT", "SCRIPT", "STYLE"]);

  const allowedAttributes: Record<string, Set<string>> = {
    A: new Set(["href", "rel", "target"]),
    IMG: new Set(["alt", "height", "src", "title", "width"]),
    TD: new Set(["align", "colspan", "rowspan"]),
    TH: new Set(["align", "colspan", "rowspan"]),
  };

  const allElements = Array.from(container.querySelectorAll("*"));
  for (const element of allElements) {
    const tagName = element.tagName.toUpperCase();

    if (blockedTags.has(tagName)) {
      element.remove();
      continue;
    }

    if (!allowedTags.has(tagName)) {
      const parent = element.parentNode;
      if (!parent) {
        element.remove();
        continue;
      }
      while (element.firstChild) parent.insertBefore(element.firstChild, element);
      element.remove();
      continue;
    }

    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === "style" || name.startsWith("on")) {
        element.removeAttribute(attr.name);
        continue;
      }

      const allowedForTag = allowedAttributes[tagName] ?? new Set<string>();
      if (!allowedForTag.has(name)) {
        element.removeAttribute(attr.name);
      }
    }

    if (tagName === "A") {
      const href = element.getAttribute("href") ?? "";
      const safe = safeHref(href);
      if (!safe) {
        element.removeAttribute("href");
      } else {
        element.setAttribute("href", safe);
      }
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer");
    }

    if (tagName === "IMG") {
      const src = element.getAttribute("src") ?? "";
      const safe = safeImageSrc(src);
      if (!safe) {
        element.remove();
        continue;
      }
      element.setAttribute("src", safe);
    }

    if (tagName === "TD" || tagName === "TH") {
      const align = (element.getAttribute("align") ?? "").toLowerCase();
      if (align && align !== "left" && align !== "center" && align !== "right") {
        element.removeAttribute("align");
      }
    }
  }

  return container.innerHTML;
};

const renderInlineToHtml = (text: string): string => {
  const placeholderPrefix = `__ATOOLS_INLINE_CODE_${Math.random().toString(36).slice(2)}_`;
  const inlineCodes: string[] = [];
  const withCodePlaceholders = text.replace(/`([^`]+)`/g, (_m, code) => {
    const key = `${placeholderPrefix}${inlineCodes.length}__`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return key;
  });

  const withBold = withCodePlaceholders.replace(/\*\*([^*]+)\*\*/g, (_m, body) => `<strong>${body}</strong>`);
  const withItalic = withBold.replace(/\*([^*]+)\*/g, (_m, body) => `<em>${body}</em>`);
  const withImages = withItalic.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, altRaw, srcRaw) => {
    const src = safeImageSrc(srcRaw);
    if (!src) return altRaw ? String(altRaw) : "";
    const alt = escapeHtml(altRaw);
    return `<img src="${escapeHtml(src)}" alt="${alt}" />`;
  });
  const withLinks = withImages.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, hrefRaw) => {
    const href = safeHref(hrefRaw);
    if (!href) return label;
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>`;
  });

  const escaped = escapeHtmlPreservingTags(withLinks);
  let restored = escaped;
  for (const [index, html] of inlineCodes.entries()) {
    restored = restored.split(`${placeholderPrefix}${index}__`).join(html);
  }
  return restored;
};

const parseMarkdown = (input: string): Block[] => {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const isTableSeparatorLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) return false;
    return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(trimmed);
  };

  const splitTableRow = (line: string) => {
    let src = line.trim();
    if (src.startsWith("|")) src = src.slice(1);
    if (src.endsWith("|")) src = src.slice(0, -1);

    const cells: string[] = [];
    let buf = "";
    let inCode = false;

    for (let idx = 0; idx < src.length; idx += 1) {
      const ch = src[idx] ?? "";

      if (ch === "`") {
        inCode = !inCode;
        buf += ch;
        continue;
      }

      if (ch === "\\" && idx + 1 < src.length) {
        buf += src[idx + 1] ?? "";
        idx += 1;
        continue;
      }

      if (ch === "|" && !inCode) {
        cells.push(buf.trim());
        buf = "";
        continue;
      }

      buf += ch;
    }

    cells.push(buf.trim());
    return cells;
  };

  const parseAlign = (cell: string): "left" | "center" | "right" | null => {
    const trimmed = cell.trim();
    const left = trimmed.startsWith(":");
    const right = trimmed.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  };

  const isTableStartAt = (index: number) => {
    const headerLine = lines[index] ?? "";
    const sepLine = lines[index + 1] ?? "";
    if (!headerLine.trim() || !sepLine.trim()) return false;
    if (!headerLine.includes("|")) return false;
    return isTableSeparatorLine(sepLine);
  };

  const startsAnotherBlock = (line: string) =>
    /^#{1,6}\s+/.test(line) ||
    /^```/.test(line) ||
    /^\s*>\s+/.test(line) ||
    /^\s*(-|\*)\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^---\s*$/.test(line.trim());

  const consumeParagraph = () => {
    const buf: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? "";
      if (!current.trim()) break;
      if (isTableStartAt(i)) break;
      if (startsAnotherBlock(current)) break;
      buf.push(current);
      i += 1;
    }
    const text = buf.join("\n").trim();
    if (text) blocks.push({ type: "paragraph", text });
  };

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line = raw.trimEnd();

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^---\s*$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    if (isTableStartAt(i)) {
      const header = splitTableRow(lines[i] ?? "");
      const alignRow = splitTableRow(lines[i + 1] ?? "");
      const align = alignRow.map(parseAlign);
      i += 2;

      const rows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i] ?? "";
        if (!rowLine.trim()) break;
        if (isTableSeparatorLine(rowLine)) break;
        if (!rowLine.includes("|")) break;
        rows.push(splitTableRow(rowLine));
        i += 1;
      }

      blocks.push({ type: "table", header, align, rows });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i] ?? "")) {
        codeLines.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    const quote = raw.match(/^\s*>\s+(.+)$/);
    if (quote) {
      const buf: string[] = [quote[1]];
      i += 1;
      while (i < lines.length) {
        const m = (lines[i] ?? "").match(/^\s*>\s+(.+)$/);
        if (!m) break;
        buf.push(m[1]);
        i += 1;
      }
      blocks.push({ type: "quote", text: buf.join("\n") });
      continue;
    }

    if (/^\s*(-|\*)\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*(-|\*)\s+/.test(lines[i] ?? "")) {
        items.push(String(lines[i]).replace(/^\s*(-|\*)\s+/, "").trimEnd());
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) {
        items.push(String(lines[i]).replace(/^\s*\d+\.\s+/, "").trimEnd());
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    consumeParagraph();
  }

  return blocks;
};

const blocksToHtml = (blocks: Block[]) => {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "hr") {
      parts.push("<hr />");
      continue;
    }
    if (block.type === "table") {
      const columnCount = Math.max(block.header.length, block.align.length, ...block.rows.map((row) => row.length));
      const normalizeRow = (row: string[]) => Array.from({ length: columnCount }, (_, idx) => row[idx] ?? "");
      const alignAttr = (idx: number) => {
        const align = block.align[idx] ?? null;
        return align ? ` align="${align}"` : "";
      };

      const header = normalizeRow(block.header);
      const bodyRows = block.rows.map(normalizeRow);

      parts.push(
        `<table><thead><tr>${header
          .map((cell, idx) => `<th${alignAttr(idx)}>${renderInlineToHtml(cell)}</th>`)
          .join("")}</tr></thead><tbody>${bodyRows
          .map((row) => `<tr>${row.map((cell, idx) => `<td${alignAttr(idx)}>${renderInlineToHtml(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }
    if (block.type === "heading") {
      const tag = `h${Math.min(6, Math.max(1, block.level))}`;
      parts.push(`<${tag}>${renderInlineToHtml(block.text)}</${tag}>`);
      continue;
    }
    if (block.type === "paragraph") {
      const html = renderInlineToHtml(block.text).replace(/\n/g, "<br />");
      parts.push(`<p>${html}</p>`);
      continue;
    }
    if (block.type === "quote") {
      const html = renderInlineToHtml(block.text).replace(/\n/g, "<br />");
      parts.push(`<blockquote>${html}</blockquote>`);
      continue;
    }
    if (block.type === "ul") {
      parts.push(`<ul>${block.items.map((it) => `<li>${renderInlineToHtml(it)}</li>`).join("")}</ul>`);
      continue;
    }
    if (block.type === "ol") {
      parts.push(`<ol>${block.items.map((it) => `<li>${renderInlineToHtml(it)}</li>`).join("")}</ol>`);
      continue;
    }
    if (block.type === "code") {
      const langClass = block.lang ? ` class="lang-${escapeHtml(block.lang)}"` : "";
      parts.push(`<pre><code${langClass}>${escapeHtml(block.code)}</code></pre>`);
      continue;
    }
  }
  return parts.join("\n");
};

const buildPrintableHtml = (title: string, bodyHtml: string) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #0f172a; }
      .page { max-width: 820px; margin: 0 auto; padding: 32px 24px; }
      h1,h2,h3,h4,h5,h6 { margin: 20px 0 10px; line-height: 1.25; }
      p { margin: 10px 0; line-height: 1.75; }
      ul,ol { margin: 10px 0 10px 22px; }
      li { margin: 6px 0; }
      blockquote { margin: 12px 0; padding: 8px 12px; border-left: 4px solid #e2e8f0; background: #f8fafc; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: #f1f5f9; padding: 1px 4px; border-radius: 4px; }
      pre { overflow: auto; background: #0b1220; color: #e2e8f0; border-radius: 10px; padding: 12px 14px; }
      pre code { background: transparent; padding: 0; color: inherit; }
      hr { border: 0; border-top: 1px solid #e2e8f0; margin: 18px 0; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
      img { max-width: 100%; height: auto; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
      thead th { background: #f1f5f9; }
      @media print {
        .page { padding: 0; }
        pre { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      ${bodyHtml}
    </div>
  </body>
</html>`;

const printHtml = (html: string) => {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.srcdoc = html;
  document.body.appendChild(iframe);

  const cleanup = () => {
    iframe.remove();
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.focus();
    win.print();
    setTimeout(cleanup, 1000);
  };
};

export default function MarkdownPdfConverterClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("Markdown 文档");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState<string | null>(null);

  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  const previewHtml = useMemo(() => sanitizeHtml(blocksToHtml(blocks)), [blocks]);

  const onChangeFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      setMarkdown(text);
      setTitle(file.name.replace(/\.[^.]+$/, "") || "Markdown 文档");
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取文件失败。");
    }
  };

  const exportPdf = () => {
    setError(null);
    if (!markdown.trim()) {
      setError("请先输入 Markdown 内容。");
      return;
    }
    const html = buildPrintableHtml(title, previewHtml);
    printHtml(html);
  };

  return (
    <ToolPageLayout toolSlug="markdown-pdf-converter">
      <div className="w-full px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200"
              >
                上传 .md
              </button>
              <input ref={inputRef} type="file" accept=".md,text/markdown,text/plain" className="hidden" onChange={onChangeFile} />
            </div>

            <button
              type="button"
              onClick={exportPdf}
              className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              导出为 PDF（打印）
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">Markdown 输入</div>
              <label className="mt-3 block text-sm text-slate-700">
                文档标题（用于打印页面）
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                placeholder={"# 标题\n\n- 列表项\n\n```js\nconsole.log('hello')\n```"}
                className="mt-3 h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              />
              <div className="mt-3 text-xs text-slate-500">
                提示：导出会打开浏览器打印面板，请选择“另存为 PDF”。不会上传任何内容。
              </div>
              {error && (
                <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
                  {error}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">预览</div>
              <div
                className="mt-3 max-w-none rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"
                dangerouslySetInnerHTML={{
                  __html: previewHtml || "<div style='color:#64748b;font-size:14px;'>预览会显示在这里…</div>",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
