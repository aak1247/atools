"use client";

import type { ReactNode } from "react";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { useEffect, useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import { useFileDropzone } from "../../../hooks/useFileDropzone";

type FileKind = "pdf" | "ooxml" | "unsupported";
type OoxmlSubtype = "docx" | "docm" | "xlsx" | "xlsm" | "pptx" | "pptm" | "unknown";
type CustomPropType = "text" | "number" | "bool" | "date";

type PdfMetaDraft = {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string;
  modificationDate: string;
};

type OoxmlCoreDraft = {
  title: string;
  subject: string;
  creator: string;
  lastModifiedBy: string;
  description: string;
  keywords: string;
  category: string;
  contentStatus: string;
  revision: string;
  identifier: string;
  language: string;
  version: string;
  created: string;
  modified: string;
  lastPrinted: string;
};

type OoxmlAppDraft = {
  company: string;
  manager: string;
  application: string;
  appVersion: string;
  template: string;
  hyperlinkBase: string;
};

type OoxmlCustomDraft = {
  id: string;
  pid: number | null;
  name: string;
  type: CustomPropType;
  value: string;
};

type OoxmlMetaDraft = {
  core: OoxmlCoreDraft;
  app: OoxmlAppDraft;
  custom: OoxmlCustomDraft[];
};

const DEFAULT_UI = {
  pick: "选择文件",
  replace: "替换文件",
  clear: "清空",
  parsing: "解析中…",
  saving: "生成中…",
  save: "生成并下载",
  download: "下载",
  kindPdf: "PDF",
  kindWord: "Word（DOCX/DOCM）",
  kindExcel: "Excel（XLSX/XLSM）",
  kindPpt: "PPT（PPTX/PPTM）",
  kindOoxml: "Office（OOXML）",
  kindUnsupported: "不支持",
  unsupportedHint:
    "暂仅支持：PDF 与 Office Open XML（.docx/.docm/.xlsx/.xlsm/.pptx/.pptm）。旧版 .doc/.xls 暂不支持。",
  encryptedOfficeHint: "检测到 Office 文档已加密/受保护（EncryptedPackage），无法在纯前端环境修改其元信息。",
  privacyHint: "提示：全程浏览器本地处理，不上传文件。",
  timezoneHint: "时间会保存为 ISO 8601（UTC/Z）格式；显示为本地时间仅用于输入。",
  dropHint: "支持点击上传与拖拽上传，拖拽可直接替换当前文档。",
  tipNotice: "提示",
  quickActions: "快捷操作",
  setNow: "时间设为当前",
  clearDates: "清空时间字段",
  anonymize: "一键匿名（清空作者/公司等）",
  pdfSection: "PDF 元信息",
  ooxmlCoreSection: "Office 核心属性（core.xml）",
  ooxmlAppSection: "Office 扩展属性（app.xml）",
  ooxmlCustomSection: "Office 自定义属性（custom.xml）",
  addCustom: "添加自定义属性",
  remove: "删除",
  noCustomProps: "暂无自定义属性（可点击下方按钮添加）。",
  jsonEditor: "高级：JSON 批量编辑",
  jsonFromForm: "从表单生成 JSON",
  jsonApply: "应用到表单",
  jsonCopy: "复制 JSON",
  expand: "展开",
  collapse: "收起",
  labelTitle: "标题 Title",
  placeholderTitle: "例如：项目总结",
  labelAuthor: "作者 Author",
  placeholderAuthor: "例如：张三",
  labelSubject: "主题 Subject",
  placeholderSubject: "例如：财务报表",
  labelKeywords: "关键词 Keywords",
  hintKeywords: "用逗号/分号分隔",
  placeholderKeywords: "例如：报销, 2026, 机密",
  labelCreationDate: "创建时间 CreationDate",
  labelModDate: "修改时间 ModDate",
  labelCreatorTool: "Creator（创建工具）",
  placeholderCreatorTool: "例如：Microsoft Word",
  labelProducer: "Producer（生成器）",
  placeholderProducer: "例如：Adobe PDF Library",
  labelCoreTitle: "标题 Title (dc:title)",
  labelCoreSubject: "主题 Subject (dc:subject)",
  labelCoreAuthor: "作者 Author (dc:creator)",
  labelCoreLastModifiedBy: "最后修改者 LastModifiedBy (cp:lastModifiedBy)",
  labelCoreKeywords: "关键词 Keywords (cp:keywords)",
  hintCoreKeywords: "原样写入 core.xml",
  labelCoreDescription: "描述 Description (dc:description)",
  labelCoreCategory: "分类 Category (cp:category)",
  labelCoreContentStatus: "内容状态 ContentStatus (cp:contentStatus)",
  labelCoreRevision: "修订号 Revision (cp:revision)",
  labelCoreIdentifier: "Identifier (dc:identifier)",
  labelCoreLanguage: "语言 Language (dc:language)",
  placeholderLanguage: "例如：zh-CN",
  labelCoreVersion: "版本 Version (cp:version)",
  labelCoreCreated: "创建时间 Created (dcterms:created)",
  labelCoreModified: "修改时间 Modified (dcterms:modified)",
  labelCoreLastPrinted: "上次打印 LastPrinted (cp:lastPrinted)",
  labelAppCompany: "公司 Company",
  labelAppManager: "经理 Manager",
  labelAppApplication: "Application",
  labelAppVersion: "AppVersion",
  labelAppTemplate: "Template",
  labelAppHyperlinkBase: "HyperlinkBase",
  customNamePlaceholder: "例如：Project",
  customNumberPlaceholder: "例如：123.45",
  customTextPlaceholder: "例如：Alpha",
  thName: "Name",
  thType: "Type",
  thValue: "Value",
  errXmlParse: "XML 解析失败",
  errNotStandardOoxml: "无法识别为标准 OOXML 文档（缺少 _rels/.rels 或 [Content_Types].xml）",
  errInvalidCreationDate: "创建时间格式无效",
  errInvalidModificationDate: "修改时间格式无效",
  errParseFailed: "解析失败",
  errJsonNotObject: "JSON 不是对象",
  errJsonTypePdf: "JSON type 必须为 pdf",
  errJsonInfoMissing: "info 字段缺失",
  errJsonTypeOoxml: "JSON type 必须为 ooxml",
  errJsonOoxmlMissing: "ooxml 字段缺失",
  errJsonUnsupported: "当前文件类型不支持应用 JSON",
  errJsonParseFailed: "JSON 解析失败",
  errCopyFailed: "复制失败",
  errPdfMetaNotReady: "PDF 元信息未准备好",
  errOoxmlMetaNotReady: "Office 元信息未准备好",
  errSaveFailed: "生成失败",
  warningCustomDateInvalid: "自定义属性“{name}”日期无效，已忽略该字段。",
} as const;

const DEFAULT_PDF_DRAFT: PdfMetaDraft = {
  title: "",
  author: "",
  subject: "",
  keywords: "",
  creator: "",
  producer: "",
  creationDate: "",
  modificationDate: "",
};

const DEFAULT_OOXML_DRAFT: OoxmlMetaDraft = {
  core: {
    title: "",
    subject: "",
    creator: "",
    lastModifiedBy: "",
    description: "",
    keywords: "",
    category: "",
    contentStatus: "",
    revision: "",
    identifier: "",
    language: "",
    version: "",
    created: "",
    modified: "",
    lastPrinted: "",
  },
  app: {
    company: "",
    manager: "",
    application: "",
    appVersion: "",
    template: "",
    hyperlinkBase: "",
  },
  custom: [],
};

const OOXML_CORE_NS = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
const OOXML_DC_NS = "http://purl.org/dc/elements/1.1/";
const OOXML_DCTERMS_NS = "http://purl.org/dc/terms/";
const OOXML_XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";
const OOXML_RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OOXML_CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const OOXML_EXTENDED_NS = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";
const OOXML_CUSTOM_NS = "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties";
const OOXML_VT_NS = "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes";

const CORE_REL_TYPE = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
const APP_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties";
const CUSTOM_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties";

const CORE_CT = "application/vnd.openxmlformats-package.core-properties+xml";
const APP_CT = "application/vnd.openxmlformats-officedocument.extended-properties+xml";
const CUSTOM_CT = "application/vnd.openxmlformats-officedocument.custom-properties+xml";

const CUSTOM_FMTID = "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}";

const readFileBytes = async (file: File): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer());

const safeExt = (name: string): string => {
  const lower = name.toLowerCase();
  const match = lower.match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
};

const detectOoxmlSubtype = (name: string): OoxmlSubtype => {
  const ext = safeExt(name);
  if (ext === "docx") return "docx";
  if (ext === "docm") return "docm";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xlsm") return "xlsm";
  if (ext === "pptx") return "pptx";
  if (ext === "pptm") return "pptm";
  return "unknown";
};

const detectKind = (file: File | null): { kind: FileKind; subtype: OoxmlSubtype } => {
  if (!file) return { kind: "unsupported", subtype: "unknown" };
  const lower = file.name.toLowerCase();
  if (file.type === "application/pdf" || lower.endsWith(".pdf")) return { kind: "pdf", subtype: "unknown" };
  const subtype = detectOoxmlSubtype(file.name);
  if (subtype !== "unknown") return { kind: "ooxml", subtype };
  return { kind: "unsupported", subtype: "unknown" };
};

const mimeForOoxmlSubtype = (subtype: OoxmlSubtype): string => {
  switch (subtype) {
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "docm":
      return "application/vnd.ms-word.document.macroEnabled.12";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xlsm":
      return "application/vnd.ms-excel.sheet.macroEnabled.12";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "pptm":
      return "application/vnd.ms-powerpoint.presentation.macroEnabled.12";
    default:
      return "application/octet-stream";
  }
};

const pad2 = (value: number): string => String(value).padStart(2, "0");

const dateToDatetimeLocal = (date: Date): string => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const w3cToDatetimeLocal = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return "";
  return dateToDatetimeLocal(date);
};

const datetimeLocalToIso = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const normalizeKeywordsToArray = (value: string): string[] =>
  value
    .split(/[,\n;，；]+/g)
    .map((token) => token.trim())
    .filter(Boolean);

const keywordsArrayToString = (keywords: string[] | undefined): string => {
  const list = Array.isArray(keywords) ? keywords.map((k) => String(k).trim()).filter(Boolean) : [];
  return list.join(", ");
};

const uint8ArrayToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

function parseXml(xml: string, errMessage: string = DEFAULT_UI.errXmlParse): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) throw new Error(errMessage);
  return doc;
}

function serializeXml(doc: Document): string {
  const body = new XMLSerializer().serializeToString(doc);
  const trimmed = body.trimStart();
  if (trimmed.startsWith("<?xml")) return body;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`;
}

function upsertTextElement(params: {
  doc: Document;
  ns: string;
  qualifiedName: string;
  localName: string;
  value: string;
  attrs?: Array<{ ns: string; name: string; value: string }>;
}) {
  const { doc, ns, qualifiedName, localName, value, attrs } = params;
  const root = doc.documentElement;
  const existing = doc.getElementsByTagNameNS(ns, localName)[0] ?? null;
  const normalized = value.trim();
  if (!normalized) {
    if (existing?.parentNode) existing.parentNode.removeChild(existing);
    return;
  }
  const element = existing ?? doc.createElementNS(ns, qualifiedName);
  element.textContent = value;
  if (attrs) {
    for (const attr of attrs) element.setAttributeNS(attr.ns, attr.name, attr.value);
  }
  if (!existing) root.appendChild(element);
}

function getTextNS(doc: Document, ns: string, localName: string): string {
  const el = doc.getElementsByTagNameNS(ns, localName)[0];
  return (el?.textContent ?? "").trim();
}

function ensureRelationship(relsXml: string, relType: string, target: string): string {
  const doc = parseXml(relsXml);
  const relationships = doc.documentElement;
  const items = Array.from(doc.getElementsByTagNameNS(OOXML_RELS_NS, "Relationship"));
  const existingByType = items.find((el) => (el.getAttribute("Type") ?? "").trim() === relType);
  if (existingByType) {
    existingByType.setAttribute("Target", target);
    return serializeXml(doc);
  }

  let maxId = 0;
  for (const rel of items) {
    const id = rel.getAttribute("Id") ?? "";
    const match = id.match(/^rId(\d+)$/);
    if (match) maxId = Math.max(maxId, Number(match[1]));
  }
  const newId = `rId${maxId + 1}`;
  const rel = doc.createElementNS(OOXML_RELS_NS, "Relationship");
  rel.setAttribute("Id", newId);
  rel.setAttribute("Type", relType);
  rel.setAttribute("Target", target);
  relationships.appendChild(rel);
  return serializeXml(doc);
}

function ensureContentTypeOverride(ctXml: string, partName: string, contentType: string): string {
  const doc = parseXml(ctXml);
  const types = doc.documentElement;
  const overrides = Array.from(doc.getElementsByTagNameNS(OOXML_CT_NS, "Override"));
  const existing = overrides.find((el) => (el.getAttribute("PartName") ?? "").trim() === partName);
  if (existing) {
    existing.setAttribute("ContentType", contentType);
    return serializeXml(doc);
  }
  const override = doc.createElementNS(OOXML_CT_NS, "Override");
  override.setAttribute("PartName", partName);
  override.setAttribute("ContentType", contentType);
  types.appendChild(override);
  return serializeXml(doc);
}

function parseOoxmlCustomProperties(xml: string): OoxmlCustomDraft[] {
  const doc = parseXml(xml);
  const props = Array.from(doc.getElementsByTagNameNS(OOXML_CUSTOM_NS, "property"));
  const out: OoxmlCustomDraft[] = [];
  for (const prop of props) {
    const pidRaw = prop.getAttribute("pid");
    const pid = pidRaw ? Number.parseInt(pidRaw, 10) : null;
    const name = (prop.getAttribute("name") ?? "").trim();
    const valueEl = prop.firstElementChild;
    const valueText = (valueEl?.textContent ?? "").trim();
    const valueLocalName = valueEl?.localName ?? "";
    const valueNs = valueEl?.namespaceURI ?? "";

    let type: CustomPropType = "text";
    let value = valueText;

    if (valueNs === OOXML_VT_NS) {
      if (valueLocalName === "bool") {
        type = "bool";
        const normalized = valueText.toLowerCase();
        value = normalized === "1" || normalized === "true" ? "true" : "false";
      } else if (valueLocalName === "filetime") {
        type = "date";
        value = w3cToDatetimeLocal(valueText);
      } else if (["i1", "i2", "i4", "i8", "int", "r4", "r8", "decimal"].includes(valueLocalName)) {
        type = "number";
      } else {
        type = "text";
      }
    }

    out.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      pid: Number.isFinite(pid) ? pid : null,
      name,
      type,
      value,
    });
  }
  return out;
}

function buildOoxmlCustomXml(custom: OoxmlCustomDraft[], warnings: string[], uiWarningInvalidDate: string = DEFAULT_UI.warningCustomDateInvalid): string {
  const doc = document.implementation.createDocument(OOXML_CUSTOM_NS, "Properties", null);
  const root = doc.documentElement;
  root.setAttribute("xmlns:vt", OOXML_VT_NS);

  const cleaned = custom
    .map((item) => ({ ...item, name: item.name.trim() }))
    .filter((item) => item.name.length > 0);

  const used = new Set<number>();
  let maxPid = 1;
  for (const item of cleaned) {
    if (item.pid && Number.isFinite(item.pid)) {
      used.add(item.pid);
      maxPid = Math.max(maxPid, item.pid);
    }
  }

  for (const item of cleaned) {
    let pid = item.pid;
    if (!pid || used.has(pid)) {
      maxPid += 1;
      pid = maxPid;
    }
    used.add(pid);

    const prop = doc.createElementNS(OOXML_CUSTOM_NS, "property");
    prop.setAttribute("fmtid", CUSTOM_FMTID);
    prop.setAttribute("pid", String(pid));
    prop.setAttribute("name", item.name);

    let valueEl: Element | null = null;
    if (item.type === "bool") {
      valueEl = doc.createElementNS(OOXML_VT_NS, "vt:bool");
      const normalized = item.value.trim().toLowerCase();
      valueEl.textContent = normalized === "1" || normalized === "true" ? "true" : "false";
    } else if (item.type === "number") {
      valueEl = doc.createElementNS(OOXML_VT_NS, "vt:r8");
      valueEl.textContent = item.value.trim();
    } else if (item.type === "date") {
      const iso = datetimeLocalToIso(item.value);
      if (!iso) {
        warnings.push(uiWarningInvalidDate.replace("{name}", item.name));
        continue;
      }
      valueEl = doc.createElementNS(OOXML_VT_NS, "vt:filetime");
      valueEl.textContent = iso;
    } else {
      valueEl = doc.createElementNS(OOXML_VT_NS, "vt:lpwstr");
      valueEl.textContent = item.value;
    }

    prop.appendChild(valueEl);
    root.appendChild(prop);
  }

  return serializeXml(doc);
}

function emptyOoxmlCoreXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<cp:coreProperties xmlns:cp="${OOXML_CORE_NS}" xmlns:dc="${OOXML_DC_NS}" xmlns:dcterms="${OOXML_DCTERMS_NS}" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="${OOXML_XSI_NS}"></cp:coreProperties>`
  );
}

function emptyOoxmlAppXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Properties xmlns="${OOXML_EXTENDED_NS}" xmlns:vt="${OOXML_VT_NS}"></Properties>`
  );
}

function parseOoxmlMetadata(bytes: Uint8Array): { subtypeHint: OoxmlSubtype; draft: OoxmlMetaDraft } {
  const entries = unzipSync(bytes);
  if (entries["EncryptedPackage"] || entries["EncryptionInfo"]) {
    throw new Error(DEFAULT_UI.encryptedOfficeHint);
  }

  const coreXml = entries["docProps/core.xml"] ? strFromU8(entries["docProps/core.xml"]) : "";
  const appXml = entries["docProps/app.xml"] ? strFromU8(entries["docProps/app.xml"]) : "";
  const customXml = entries["docProps/custom.xml"] ? strFromU8(entries["docProps/custom.xml"]) : "";

  const draft: OoxmlMetaDraft = JSON.parse(JSON.stringify(DEFAULT_OOXML_DRAFT)) as OoxmlMetaDraft;

  if (coreXml) {
    const doc = parseXml(coreXml);
    draft.core.title = getTextNS(doc, OOXML_DC_NS, "title");
    draft.core.subject = getTextNS(doc, OOXML_DC_NS, "subject");
    draft.core.creator = getTextNS(doc, OOXML_DC_NS, "creator");
    draft.core.description = getTextNS(doc, OOXML_DC_NS, "description");
    draft.core.identifier = getTextNS(doc, OOXML_DC_NS, "identifier");
    draft.core.language = getTextNS(doc, OOXML_DC_NS, "language");

    draft.core.keywords = getTextNS(doc, OOXML_CORE_NS, "keywords");
    draft.core.lastModifiedBy = getTextNS(doc, OOXML_CORE_NS, "lastModifiedBy");
    draft.core.revision = getTextNS(doc, OOXML_CORE_NS, "revision");
    draft.core.category = getTextNS(doc, OOXML_CORE_NS, "category");
    draft.core.contentStatus = getTextNS(doc, OOXML_CORE_NS, "contentStatus");
    draft.core.version = getTextNS(doc, OOXML_CORE_NS, "version");

    draft.core.created = w3cToDatetimeLocal(getTextNS(doc, OOXML_DCTERMS_NS, "created"));
    draft.core.modified = w3cToDatetimeLocal(getTextNS(doc, OOXML_DCTERMS_NS, "modified"));
    draft.core.lastPrinted = w3cToDatetimeLocal(getTextNS(doc, OOXML_CORE_NS, "lastPrinted"));
  }

  if (appXml) {
    const doc = parseXml(appXml);
    const get = (localName: string) => getTextNS(doc, OOXML_EXTENDED_NS, localName);
    draft.app.company = get("Company");
    draft.app.manager = get("Manager");
    draft.app.application = get("Application");
    draft.app.appVersion = get("AppVersion");
    draft.app.template = get("Template");
    draft.app.hyperlinkBase = get("HyperlinkBase");
  }

  if (customXml) {
    draft.custom = parseOoxmlCustomProperties(customXml);
  }

  const subtypeHint = "unknown";
  return { subtypeHint, draft };
}

function applyOoxmlMetadata(params: {
  bytes: Uint8Array;
  subtype: OoxmlSubtype;
  draft: OoxmlMetaDraft;
  warnings: string[];
  errNotStandard?: string;
  uiWarningInvalidDate?: string;
}): Uint8Array {
  const { bytes, draft, warnings, errNotStandard = DEFAULT_UI.errNotStandardOoxml, uiWarningInvalidDate } = params;
  const entries = unzipSync(bytes);

  const relsPath = "_rels/.rels";
  const ctPath = "[Content_Types].xml";
  if (!entries[relsPath] || !entries[ctPath]) {
    throw new Error(errNotStandard);
  }

  const coreXmlRaw = entries["docProps/core.xml"] ? strFromU8(entries["docProps/core.xml"]) : emptyOoxmlCoreXml();
  const appXmlRaw = entries["docProps/app.xml"] ? strFromU8(entries["docProps/app.xml"]) : emptyOoxmlAppXml();

  const coreDoc = parseXml(coreXmlRaw);
  upsertTextElement({ doc: coreDoc, ns: OOXML_DC_NS, qualifiedName: "dc:title", localName: "title", value: draft.core.title });
  upsertTextElement({ doc: coreDoc, ns: OOXML_DC_NS, qualifiedName: "dc:subject", localName: "subject", value: draft.core.subject });
  upsertTextElement({ doc: coreDoc, ns: OOXML_DC_NS, qualifiedName: "dc:creator", localName: "creator", value: draft.core.creator });
  upsertTextElement({ doc: coreDoc, ns: OOXML_DC_NS, qualifiedName: "dc:description", localName: "description", value: draft.core.description });
  upsertTextElement({ doc: coreDoc, ns: OOXML_DC_NS, qualifiedName: "dc:identifier", localName: "identifier", value: draft.core.identifier });
  upsertTextElement({ doc: coreDoc, ns: OOXML_DC_NS, qualifiedName: "dc:language", localName: "language", value: draft.core.language });

  upsertTextElement({ doc: coreDoc, ns: OOXML_CORE_NS, qualifiedName: "cp:keywords", localName: "keywords", value: draft.core.keywords });
  upsertTextElement({
    doc: coreDoc,
    ns: OOXML_CORE_NS,
    qualifiedName: "cp:lastModifiedBy",
    localName: "lastModifiedBy",
    value: draft.core.lastModifiedBy,
  });
  upsertTextElement({ doc: coreDoc, ns: OOXML_CORE_NS, qualifiedName: "cp:revision", localName: "revision", value: draft.core.revision });
  upsertTextElement({ doc: coreDoc, ns: OOXML_CORE_NS, qualifiedName: "cp:category", localName: "category", value: draft.core.category });
  upsertTextElement({
    doc: coreDoc,
    ns: OOXML_CORE_NS,
    qualifiedName: "cp:contentStatus",
    localName: "contentStatus",
    value: draft.core.contentStatus,
  });
  upsertTextElement({ doc: coreDoc, ns: OOXML_CORE_NS, qualifiedName: "cp:version", localName: "version", value: draft.core.version });

  const createdIso = datetimeLocalToIso(draft.core.created);
  upsertTextElement({
    doc: coreDoc,
    ns: OOXML_DCTERMS_NS,
    qualifiedName: "dcterms:created",
    localName: "created",
    value: createdIso ?? "",
    attrs: [{ ns: OOXML_XSI_NS, name: "xsi:type", value: "dcterms:W3CDTF" }],
  });

  const modifiedIso = datetimeLocalToIso(draft.core.modified);
  upsertTextElement({
    doc: coreDoc,
    ns: OOXML_DCTERMS_NS,
    qualifiedName: "dcterms:modified",
    localName: "modified",
    value: modifiedIso ?? "",
    attrs: [{ ns: OOXML_XSI_NS, name: "xsi:type", value: "dcterms:W3CDTF" }],
  });

  const lastPrintedIso = datetimeLocalToIso(draft.core.lastPrinted);
  upsertTextElement({
    doc: coreDoc,
    ns: OOXML_CORE_NS,
    qualifiedName: "cp:lastPrinted",
    localName: "lastPrinted",
    value: lastPrintedIso ?? "",
  });

  const appDoc = parseXml(appXmlRaw);
  const upsertApp = (localName: string, value: string) =>
    upsertTextElement({ doc: appDoc, ns: OOXML_EXTENDED_NS, qualifiedName: localName, localName, value });

  upsertApp("Company", draft.app.company);
  upsertApp("Manager", draft.app.manager);
  upsertApp("Application", draft.app.application);
  upsertApp("AppVersion", draft.app.appVersion);
  upsertApp("Template", draft.app.template);
  upsertApp("HyperlinkBase", draft.app.hyperlinkBase);

  entries["docProps/core.xml"] = strToU8(serializeXml(coreDoc));
  entries["docProps/app.xml"] = strToU8(serializeXml(appDoc));

  const customWarnings: string[] = [];
  const customXml = buildOoxmlCustomXml(draft.custom, customWarnings, uiWarningInvalidDate);
  for (const w of customWarnings) warnings.push(w);
  if (draft.custom.length > 0) {
    entries["docProps/custom.xml"] = strToU8(customXml);
  }

  const relsXml = strFromU8(entries[relsPath]);
  let relsOut = ensureRelationship(relsXml, CORE_REL_TYPE, "docProps/core.xml");
  relsOut = ensureRelationship(relsOut, APP_REL_TYPE, "docProps/app.xml");
  if (entries["docProps/custom.xml"]) {
    relsOut = ensureRelationship(relsOut, CUSTOM_REL_TYPE, "docProps/custom.xml");
  }
  entries[relsPath] = strToU8(relsOut);

  const ctXml = strFromU8(entries[ctPath]);
  let ctOut = ensureContentTypeOverride(ctXml, "/docProps/core.xml", CORE_CT);
  ctOut = ensureContentTypeOverride(ctOut, "/docProps/app.xml", APP_CT);
  if (entries["docProps/custom.xml"]) {
    ctOut = ensureContentTypeOverride(ctOut, "/docProps/custom.xml", CUSTOM_CT);
  }
  entries[ctPath] = strToU8(ctOut);

  return zipSync(entries, { level: 6 });
}

async function parsePdfMetadata(bytes: Uint8Array): Promise<PdfMetaDraft> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const title = doc.getTitle() ?? "";
  const author = doc.getAuthor() ?? "";
  const subject = doc.getSubject() ?? "";
  const creator = doc.getCreator() ?? "";
  const producer = doc.getProducer() ?? "";
  const keywords = keywordsArrayToString(normalizeKeywordsToArray(doc.getKeywords() ?? ""));
  const creationDate = doc.getCreationDate() ? dateToDatetimeLocal(doc.getCreationDate() as Date) : "";
  const modificationDate = doc.getModificationDate() ? dateToDatetimeLocal(doc.getModificationDate() as Date) : "";
  return { title, author, subject, keywords, creator, producer, creationDate, modificationDate };
}

async function applyPdfMetadata(params: {
  bytes: Uint8Array;
  original: PdfMetaDraft;
  draft: PdfMetaDraft;
  errInvalidCreationDate?: string;
  errInvalidModificationDate?: string;
}): Promise<Uint8Array> {
  const {
    bytes,
    original,
    draft,
    errInvalidCreationDate = DEFAULT_UI.errInvalidCreationDate,
    errInvalidModificationDate = DEFAULT_UI.errInvalidModificationDate,
  } = params;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });

  if (draft.title !== original.title) doc.setTitle(draft.title);
  if (draft.author !== original.author) doc.setAuthor(draft.author);
  if (draft.subject !== original.subject) doc.setSubject(draft.subject);
  if (draft.creator !== original.creator) doc.setCreator(draft.creator);
  if (draft.producer !== original.producer) doc.setProducer(draft.producer);

  if (draft.keywords !== original.keywords) {
    const keywords = normalizeKeywordsToArray(draft.keywords);
    doc.setKeywords(keywords);
  }

  if (draft.creationDate !== original.creationDate) {
    if (!draft.creationDate.trim()) {
      if (original.creationDate.trim()) doc.setCreationDate(new Date(0));
    } else {
      const date = new Date(draft.creationDate);
      if (Number.isNaN(date.getTime())) throw new Error(errInvalidCreationDate);
      doc.setCreationDate(date);
    }
  }

  if (draft.modificationDate !== original.modificationDate) {
    if (!draft.modificationDate.trim()) {
      if (original.modificationDate.trim()) doc.setModificationDate(new Date(0));
    } else {
      const date = new Date(draft.modificationDate);
      if (Number.isNaN(date.getTime())) throw new Error(errInvalidModificationDate);
      doc.setModificationDate(date);
    }
  }

  return await doc.save();
}

export default function DocumentMetadataEditorClient() {
  return (
    <ToolPageLayout toolSlug="document-metadata-editor" maxWidthClassName="max-w-6xl">
      <DocumentMetadataEditorInner />
    </ToolPageLayout>
  );
}

function DocumentMetadataEditorInner() {
  const config = useOptionalToolConfig("document-metadata-editor");
  const ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) };

  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<FileKind>("unsupported");
  const [subtype, setSubtype] = useState<OoxmlSubtype>("unknown");
  const [bytes, setBytes] = useState<Uint8Array | null>(null);

  const [pdfOriginal, setPdfOriginal] = useState<PdfMetaDraft | null>(null);
  const [pdfDraft, setPdfDraft] = useState<PdfMetaDraft | null>(null);

  const [ooxmlDraft, setOoxmlDraft] = useState<OoxmlMetaDraft | null>(null);

  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("edited.bin");

  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const kindLabel = useMemo(() => {
    if (kind === "pdf") return ui.kindPdf;
    if (kind === "ooxml") {
      if (subtype === "docx" || subtype === "docm") return ui.kindWord;
      if (subtype === "xlsx" || subtype === "xlsm") return ui.kindExcel;
      if (subtype === "pptx" || subtype === "pptm") return ui.kindPpt;
      return ui.kindOoxml;
    }
    return ui.kindUnsupported;
  }, [kind, subtype, ui.kindExcel, ui.kindOoxml, ui.kindPdf, ui.kindPpt, ui.kindUnsupported, ui.kindWord]);

  const resetOutput = () => {
    setError(null);
    setWarnings([]);
    setJsonError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  };

  const clearAll = () => {
    resetOutput();
    setFile(null);
    setBytes(null);
    setKind("unsupported");
    setSubtype("unknown");
    setPdfOriginal(null);
    setPdfDraft(null);
    setOoxmlDraft(null);
    setJsonText("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const buildDownloadName = (selected: File) => {
    const ext = safeExt(selected.name);
    const base = selected.name.replace(/\.[^.]+$/, "") || "document";
    if (kind === "pdf") return `${base}.meta-edited.pdf`;
    if (kind === "ooxml" && ext) return `${base}.meta-edited.${ext}`;
    return `${base}.meta-edited.bin`;
  };

  const pick = async (selected: File) => {
    resetOutput();
    setIsParsing(true);
    setFile(selected);
    setPdfOriginal(null);
    setPdfDraft(null);
    setOoxmlDraft(null);
    setJsonText("");

    const detected = detectKind(selected);
    setKind(detected.kind);
    setSubtype(detected.subtype);

    try {
      const fileBytes = await readFileBytes(selected);
      setBytes(fileBytes);

      if (detected.kind === "pdf") {
        const draft = await parsePdfMetadata(fileBytes);
        setPdfOriginal(draft);
        setPdfDraft(draft);
        setDownloadName(`${selected.name.replace(/\.pdf$/i, "") || "document"}.meta-edited.pdf`);
      } else if (detected.kind === "ooxml") {
        const parsed = parseOoxmlMetadata(fileBytes);
        const draft = parsed.draft;
        setOoxmlDraft(draft);
        setDownloadName(buildDownloadName(selected));
      } else {
        setError(ui.unsupportedHint);
        setDownloadName(buildDownloadName(selected));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析失败");
    } finally {
      setIsParsing(false);
    }
  };

  const { inputRef, isDragging, handleInputChange, handleDrop, handleDragOver, handleDragLeave, openFilePicker } = useFileDropzone({
    onFile: (selected) => {
      void pick(selected);
    },
  });

  const setNowForPdf = () => {
    const now = dateToDatetimeLocal(new Date());
    setPdfDraft((prev) => (prev ? { ...prev, creationDate: now, modificationDate: now } : prev));
  };

  const setNowForOoxml = () => {
    const now = dateToDatetimeLocal(new Date());
    setOoxmlDraft((prev) =>
      prev
        ? {
            ...prev,
            core: { ...prev.core, created: now, modified: now, lastPrinted: prev.core.lastPrinted || "" },
          }
        : prev,
    );
  };

  const clearDatesForPdf = () => {
    setPdfDraft((prev) => (prev ? { ...prev, creationDate: "", modificationDate: "" } : prev));
  };

  const clearDatesForOoxml = () => {
    setOoxmlDraft((prev) =>
      prev
        ? {
            ...prev,
            core: { ...prev.core, created: "", modified: "", lastPrinted: "" },
          }
        : prev,
    );
  };

  const anonymizePdf = () => {
    setPdfDraft((prev) =>
      prev
        ? {
            ...prev,
            author: "",
            creator: "",
            producer: "",
          }
        : prev,
    );
  };

  const anonymizeOoxml = () => {
    setOoxmlDraft((prev) =>
      prev
        ? {
            ...prev,
            core: { ...prev.core, creator: "", lastModifiedBy: "" },
            app: { ...prev.app, company: "", manager: "" },
          }
        : prev,
    );
  };

  const exportJson = () => {
    setJsonError(null);
    const payload =
      kind === "pdf"
        ? { type: "pdf", info: pdfDraft ?? DEFAULT_PDF_DRAFT }
        : kind === "ooxml"
          ? { type: "ooxml", ooxml: ooxmlDraft ?? DEFAULT_OOXML_DRAFT }
          : { type: "unsupported" as const };
    setJsonText(`${JSON.stringify(payload, null, 2)}\n`);
  };

  const applyJson = () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      if (!parsed || typeof parsed !== "object") throw new Error(ui.errJsonNotObject);
      const obj = parsed as Record<string, unknown>;
      const type = obj.type;
      if (kind === "pdf") {
        if (type !== "pdf") throw new Error(ui.errJsonTypePdf);
        const info = obj.info;
        if (!info || typeof info !== "object") throw new Error(ui.errJsonInfoMissing);
        const next = { ...DEFAULT_PDF_DRAFT, ...(info as Partial<PdfMetaDraft>) };
        setPdfDraft(next);
      } else if (kind === "ooxml") {
        if (type !== "ooxml") throw new Error(ui.errJsonTypeOoxml);
        const ooxml = obj.ooxml;
        if (!ooxml || typeof ooxml !== "object") throw new Error(ui.errJsonOoxmlMissing);
        const o = ooxml as Partial<OoxmlMetaDraft>;
        const next: OoxmlMetaDraft = {
          core: { ...DEFAULT_OOXML_DRAFT.core, ...(o.core ?? {}) },
          app: { ...DEFAULT_OOXML_DRAFT.app, ...(o.app ?? {}) },
          custom: Array.isArray(o.custom) ? (o.custom as OoxmlCustomDraft[]) : [],
        };
        setOoxmlDraft(next);
      } else {
        throw new Error(ui.errJsonUnsupported);
      }
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : ui.errJsonParseFailed);
    }
  };

  const copyJson = async () => {
    setJsonError(null);
    try {
      await navigator.clipboard.writeText(jsonText);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : ui.errCopyFailed);
    }
  };

  const save = async () => {
    resetOutput();
    if (!file || !bytes) return;
    setIsSaving(true);
    try {
      const nextWarnings: string[] = [];

      if (kind === "pdf") {
        if (!pdfDraft || !pdfOriginal) throw new Error(ui.errPdfMetaNotReady);
        const outBytes = await applyPdfMetadata({ bytes, original: pdfOriginal, draft: pdfDraft });
        const url = URL.createObjectURL(
          new Blob([uint8ArrayToArrayBuffer(outBytes)], { type: "application/pdf" }),
        );
        setDownloadUrl(url);
        setDownloadName(buildDownloadName(file));
      } else if (kind === "ooxml") {
        if (!ooxmlDraft) throw new Error(ui.errOoxmlMetaNotReady);
        const outBytes = applyOoxmlMetadata({ bytes, subtype, draft: ooxmlDraft, warnings: nextWarnings });
        const mime = mimeForOoxmlSubtype(subtype);
        const url = URL.createObjectURL(new Blob([uint8ArrayToArrayBuffer(outBytes)], { type: mime }));
        setDownloadUrl(url);
        setDownloadName(buildDownloadName(file));
      } else {
        throw new Error(ui.unsupportedHint);
      }

      setWarnings(nextWarnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.errSaveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const accept =
    "application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,.docm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx,.pptm";

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div
          className={`rounded-2xl border-2 border-dashed p-3 transition ${
            isDragging ? "border-slate-400 bg-slate-50/70" : "border-slate-200 bg-slate-50/40"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleInputChange} />
              <button
                type="button"
                onClick={openFilePicker}
                className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                disabled={isParsing || isSaving}
              >
                {file ? ui.replace : ui.pick}
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
                disabled={isParsing || isSaving}
              >
                {ui.clear}
              </button>
              {file && (
                <div className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">{file.name}</span>{" "}
                  <span className="text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{kindLabel}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void save()}
                className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!file || isParsing || isSaving || kind === "unsupported"}
              >
                {isSaving ? ui.saving : ui.save}
              </button>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  {ui.download}
                </a>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">{ui.dropHint}</p>
        </div>

        <p className="mt-4 text-xs text-slate-600">{ui.privacyHint}</p>
        <p className="mt-1 text-xs text-slate-600">{ui.timezoneHint}</p>

        {isParsing && <p className="mt-3 text-sm text-slate-700">{ui.parsing}</p>}

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200" role="alert">
            {error}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
            <div className="font-semibold">{ui.tipNotice}</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {kind === "unsupported" && file && !error && (
          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
            {ui.unsupportedHint}
          </div>
        )}
      </div>

      {(kind === "pdf" || kind === "ooxml") && (
        <div className="mt-6 space-y-6">
          <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">{ui.quickActions}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (kind === "pdf") setNowForPdf();
                    else setNowForOoxml();
                  }}
                  className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
                  disabled={isParsing || isSaving}
                >
                  {ui.setNow}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (kind === "pdf") clearDatesForPdf();
                    else clearDatesForOoxml();
                  }}
                  className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
                  disabled={isParsing || isSaving}
                >
                  {ui.clearDates}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (kind === "pdf") anonymizePdf();
                    else anonymizeOoxml();
                  }}
                  className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
                  disabled={isParsing || isSaving}
                >
                  {ui.anonymize}
                </button>
              </div>
            </div>
          </div>

          {kind === "pdf" && pdfDraft && (
            <MetadataSection title={ui.pdfSection}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label={ui.labelTitle}>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                    value={pdfDraft.title}
                    onChange={(e) => setPdfDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                    placeholder={ui.placeholderTitle}
                  />
                </FormField>
                <FormField label={ui.labelAuthor}>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                    value={pdfDraft.author}
                    onChange={(e) => setPdfDraft((prev) => (prev ? { ...prev, author: e.target.value } : prev))}
                    placeholder={ui.placeholderAuthor}
                  />
                </FormField>
                <FormField label={ui.labelSubject}>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                    value={pdfDraft.subject}
                    onChange={(e) => setPdfDraft((prev) => (prev ? { ...prev, subject: e.target.value } : prev))}
                    placeholder={ui.placeholderSubject}
                  />
                </FormField>
                <FormField label={ui.labelKeywords} hint={ui.hintKeywords}>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                    value={pdfDraft.keywords}
                    onChange={(e) => setPdfDraft((prev) => (prev ? { ...prev, keywords: e.target.value } : prev))}
                    placeholder={ui.placeholderKeywords}
                  />
                </FormField>
                <FormField label={ui.labelCreationDate}>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                    value={pdfDraft.creationDate}
                    onChange={(e) => setPdfDraft((prev) => (prev ? { ...prev, creationDate: e.target.value } : prev))}
                  />
                </FormField>
                <FormField label={ui.labelModDate}>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                    value={pdfDraft.modificationDate}
                    onChange={(e) => setPdfDraft((prev) => (prev ? { ...prev, modificationDate: e.target.value } : prev))}
                  />
                </FormField>
                <FormField label={ui.labelCreatorTool}>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                    value={pdfDraft.creator}
                    onChange={(e) => setPdfDraft((prev) => (prev ? { ...prev, creator: e.target.value } : prev))}
                    placeholder={ui.placeholderCreatorTool}
                  />
                </FormField>
                <FormField label={ui.labelProducer}>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                    value={pdfDraft.producer}
                    onChange={(e) => setPdfDraft((prev) => (prev ? { ...prev, producer: e.target.value } : prev))}
                    placeholder={ui.placeholderProducer}
                  />
                </FormField>
              </div>
            </MetadataSection>
          )}

          {kind === "ooxml" && ooxmlDraft && (
            <>
              <MetadataSection title={ui.ooxmlCoreSection}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField label={ui.labelCoreTitle}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.title}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, core: { ...prev.core, title: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreSubject}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.subject}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, core: { ...prev.core, subject: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreAuthor}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.creator}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, core: { ...prev.core, creator: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreLastModifiedBy}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.lastModifiedBy}
                      onChange={(e) =>
                        setOoxmlDraft((prev) =>
                          prev ? { ...prev, core: { ...prev.core, lastModifiedBy: e.target.value } } : prev,
                        )
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreKeywords} hint={ui.hintCoreKeywords}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.keywords}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, core: { ...prev.core, keywords: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreDescription}>
                    <textarea
                      className="mt-1 min-h-[40px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.description}
                      onChange={(e) =>
                        setOoxmlDraft((prev) =>
                          prev ? { ...prev, core: { ...prev.core, description: e.target.value } } : prev,
                        )
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreCategory}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.category}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, core: { ...prev.core, category: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreContentStatus}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.contentStatus}
                      onChange={(e) =>
                        setOoxmlDraft((prev) =>
                          prev ? { ...prev, core: { ...prev.core, contentStatus: e.target.value } } : prev,
                        )
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreRevision}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.revision}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, core: { ...prev.core, revision: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreIdentifier}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.identifier}
                      onChange={(e) =>
                        setOoxmlDraft((prev) =>
                          prev ? { ...prev, core: { ...prev.core, identifier: e.target.value } } : prev,
                        )
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreLanguage}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.language}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, core: { ...prev.core, language: e.target.value } } : prev))
                      }
                      placeholder={ui.placeholderLanguage}
                    />
                  </FormField>
                  <FormField label={ui.labelCoreVersion}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.version}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, core: { ...prev.core, version: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreCreated}>
                    <input
                      type="datetime-local"
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.created}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, core: { ...prev.core, created: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreModified}>
                    <input
                      type="datetime-local"
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.modified}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, core: { ...prev.core, modified: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelCoreLastPrinted}>
                    <input
                      type="datetime-local"
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.core.lastPrinted}
                      onChange={(e) =>
                        setOoxmlDraft((prev) =>
                          prev ? { ...prev, core: { ...prev.core, lastPrinted: e.target.value } } : prev,
                        )
                      }
                    />
                  </FormField>
                </div>
              </MetadataSection>

              <MetadataSection title={ui.ooxmlAppSection}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField label={ui.labelAppCompany}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.app.company}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, app: { ...prev.app, company: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelAppManager}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.app.manager}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, app: { ...prev.app, manager: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelAppApplication}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.app.application}
                      onChange={(e) =>
                        setOoxmlDraft((prev) =>
                          prev ? { ...prev, app: { ...prev.app, application: e.target.value } } : prev,
                        )
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelAppVersion}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.app.appVersion}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, app: { ...prev.app, appVersion: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelAppTemplate}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.app.template}
                      onChange={(e) =>
                        setOoxmlDraft((prev) => (prev ? { ...prev, app: { ...prev.app, template: e.target.value } } : prev))
                      }
                    />
                  </FormField>
                  <FormField label={ui.labelAppHyperlinkBase}>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                      value={ooxmlDraft.app.hyperlinkBase}
                      onChange={(e) =>
                        setOoxmlDraft((prev) =>
                          prev ? { ...prev, app: { ...prev.app, hyperlinkBase: e.target.value } } : prev,
                        )
                      }
                    />
                  </FormField>
                </div>
              </MetadataSection>

              <MetadataSection title={ui.ooxmlCustomSection}>
                <div className="space-y-3">
                  {ooxmlDraft.custom.length === 0 ? (
                    <p className="text-sm text-slate-600">{ui.noCustomProps}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-separate border-spacing-0">
                        <thead>
                          <tr className="text-left text-xs text-slate-600">
                            <th className="px-2 py-2">{ui.thName}</th>
                            <th className="px-2 py-2">{ui.thType}</th>
                            <th className="px-2 py-2">{ui.thValue}</th>
                            <th className="px-2 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {ooxmlDraft.custom.map((item) => (
                            <tr key={item.id} className="border-t border-slate-100">
                              <td className="px-2 py-2">
                                <input
                                  className="w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                                  value={item.name}
                                  onChange={(e) =>
                                    setOoxmlDraft((prev) => {
                                      if (!prev) return prev;
                                      return {
                                        ...prev,
                                        custom: prev.custom.map((p) => (p.id === item.id ? { ...p, name: e.target.value } : p)),
                                      };
                                    })
                                  }
                                  placeholder={ui.customNamePlaceholder}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <select
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                                  value={item.type}
                                  onChange={(e) =>
                                    setOoxmlDraft((prev) => {
                                      if (!prev) return prev;
                                      const nextType = e.target.value as CustomPropType;
                                      const nextValue = nextType === "bool" ? "false" : "";
                                      return {
                                        ...prev,
                                        custom: prev.custom.map((p) =>
                                          p.id === item.id ? { ...p, type: nextType, value: p.value || nextValue } : p,
                                        ),
                                      };
                                    })
                                  }
                                >
                                  <option value="text">text</option>
                                  <option value="number">number</option>
                                  <option value="bool">bool</option>
                                  <option value="date">date</option>
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                {item.type === "bool" ? (
                                  <select
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                                    value={item.value === "true" ? "true" : "false"}
                                    onChange={(e) =>
                                      setOoxmlDraft((prev) => {
                                        if (!prev) return prev;
                                        return {
                                          ...prev,
                                          custom: prev.custom.map((p) =>
                                            p.id === item.id ? { ...p, value: e.target.value } : p,
                                          ),
                                        };
                                      })
                                    }
                                  >
                                    <option value="true">true</option>
                                    <option value="false">false</option>
                                  </select>
                                ) : item.type === "date" ? (
                                  <input
                                    type="datetime-local"
                                    className="w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                                    value={item.value}
                                    onChange={(e) =>
                                      setOoxmlDraft((prev) => {
                                        if (!prev) return prev;
                                        return {
                                          ...prev,
                                          custom: prev.custom.map((p) =>
                                            p.id === item.id ? { ...p, value: e.target.value } : p,
                                          ),
                                        };
                                      })
                                    }
                                  />
                                ) : (
                                  <input
                                    className="w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                                    value={item.value}
                                    onChange={(e) =>
                                      setOoxmlDraft((prev) => {
                                        if (!prev) return prev;
                                        return {
                                          ...prev,
                                          custom: prev.custom.map((p) =>
                                            p.id === item.id ? { ...p, value: e.target.value } : p,
                                          ),
                                        };
                                      })
                                    }
                                    placeholder={item.type === "number" ? ui.customNumberPlaceholder : ui.customTextPlaceholder}
                                  />
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOoxmlDraft((prev) => {
                                      if (!prev) return prev;
                                      return { ...prev, custom: prev.custom.filter((p) => p.id !== item.id) };
                                    })
                                  }
                                  className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
                                >
                                  {ui.remove}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setOoxmlDraft((prev) => {
                        if (!prev) return prev;
                        const next: OoxmlCustomDraft = {
                          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                          pid: null,
                          name: "",
                          type: "text",
                          value: "",
                        };
                        return { ...prev, custom: [...prev.custom, next] };
                      })
                    }
                    className="rounded-2xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-100"
                  >
                    {ui.addCustom}
                  </button>
                </div>
              </MetadataSection>
            </>
          )}

          <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">{ui.jsonEditor}</div>
              <button
                type="button"
                onClick={() => setShowJsonEditor((v) => !v)}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                {showJsonEditor ? ui.collapse : ui.expand}
              </button>
            </div>

            {showJsonEditor && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={exportJson}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    {ui.jsonFromForm}
                  </button>
                  <button
                    type="button"
                    onClick={applyJson}
                    className="rounded-2xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                  >
                    {ui.jsonApply}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyJson()}
                    className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
                    disabled={!jsonText.trim()}
                  >
                    {ui.jsonCopy}
                  </button>
                </div>
                <textarea
                  className="min-h-[180px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-blue-400"
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder='{"type":"pdf","info":{...}}'
                />
                {jsonError && (
                  <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{jsonError}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetadataSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-slate-700">
        {label}
        {hint ? <span className="ml-2 font-normal text-slate-500">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}
