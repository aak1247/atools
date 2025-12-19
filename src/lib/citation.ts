export type CitationStyle = "apa7" | "mla9" | "chicago" | "ieee" | "gbt7714";
export type CitationSourceType = "website" | "journal" | "book";

export type CitationWarningCode =
  | "missingTitle"
  | "missingAuthors"
  | "missingContainer"
  | "missingPublisher"
  | "missingUrl"
  | "missingDate";

export type CitationName = { given: string; family: string };

export type CitationInput = {
  style: CitationStyle;
  sourceType: CitationSourceType;
  authors: CitationName[];
  title: string;
  containerTitle: string;
  publisher: string;
  publishedDate: string;
  accessDate: string;
  volume: string;
  issue: string;
  pages: string;
  url: string;
  doi: string;
};

export type CitationFormatOptions = {
  monthNamesLong: string[];
  monthNamesShort: string[];
  accessedLabel: string;
  retrievedFromLabel: string;
  onlineLabel: string;
  availableLabel: string;
};

export type CitationFormatResult = {
  citation: string;
  warnings: CitationWarningCode[];
};

export type CitationStyleDetection = {
  style: CitationStyle | "unknown";
  confidence: number;
};

export type ParsedCitationFields = {
  style: CitationStyle | "unknown";
  sourceType?: CitationSourceType;
  authorsRaw?: string;
  title?: string;
  containerTitle?: string;
  publisher?: string;
  publishedDate?: string;
  accessDate?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  url?: string;
  doi?: string;
};

const compact = (s: string) => s.trim().replace(/\s+/gu, " ");

const stripTrailingPunctuation = (s: string) => s.replace(/[.。,，;；:：]+$/u, "").trim();

const normalizeUrl = (url: string) => {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//iu.test(u)) return u;
  if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/iu.test(u)) return `https://${u}`;
  return u;
};

export function normalizeDoi(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const withoutPrefix = s.replace(/^doi:\s*/iu, "");
  const withoutUrl = withoutPrefix.replace(/^https?:\/\/doi\.org\//iu, "");
  return withoutUrl.trim();
}

const doiUrl = (doi: string) => (doi ? `https://doi.org/${doi}` : "");

type DateParts = { year: number; month?: number; day?: number };

const parseIsoDate = (value: string): DateParts | null => {
  const s = value.trim();
  if (!s) return null;

  const y = /^(\d{4})$/u.exec(s);
  if (y) {
    const year = Number(y[1]);
    if (!Number.isFinite(year)) return null;
    return { year };
  }

  const ym = /^(\d{4})-(\d{2})$/u.exec(s);
  if (ym) {
    const year = Number(ym[1]);
    const month = Number(ym[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
    if (month < 1 || month > 12) return null;
    return { year, month };
  }

  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(s);
  if (!ymd) return null;
  const year = Number(ymd[1]);
  const month = Number(ymd[2]);
  const day = Number(ymd[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year, month, day };
};

const formatDayMonthYear = (date: DateParts, monthNames: string[]) => {
  if (!date.month) return `${date.year}`;
  const monthName = monthNames[date.month - 1] ?? String(date.month);
  if (!date.day) return `${monthName} ${date.year}`;
  return `${date.day} ${monthName} ${date.year}`;
};

const formatMonthDayYear = (date: DateParts, monthNames: string[]) => {
  if (!date.month) return `${date.year}`;
  const monthName = monthNames[date.month - 1] ?? String(date.month);
  if (!date.day) return `${monthName} ${date.year}`;
  return `${monthName} ${date.day}, ${date.year}`;
};

const formatYearMonthDayNumeric = (date: DateParts) => {
  if (!date.month) return `${date.year}`;
  if (!date.day) return `${date.year}-${String(date.month).padStart(2, "0")}`;
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
};

const initials = (given: string) =>
  given
    .split(/[\s-]+/u)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `${p[0]!.toUpperCase()}.`)
    .join(" ");

export function parseAuthors(raw: string): CitationName[] {
  const s = raw.trim();
  if (!s) return [];

  const chunks = s
    .split(/\r?\n/gu)
    .flatMap((line) => line.split(/;|；/gu))
    .map((x) => x.trim())
    .filter(Boolean);

  return chunks
    .map((chunk) => {
      if (chunk.includes(",")) {
        const [family, ...rest] = chunk.split(",").map((p) => compact(p));
        return { family: family ?? "", given: compact(rest.join(" ")) };
      }
      const tokens = chunk.split(/\s+/gu).filter(Boolean);
      if (tokens.length <= 1) return { family: tokens[0] ?? chunk, given: "" };
      const family = tokens[tokens.length - 1]!;
      const given = tokens.slice(0, -1).join(" ");
      return { family, given };
    })
    .filter((n) => n.family || n.given);
}

const joinWithAnd = (items: string[]) => {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

const joinWithAmp = (items: string[]) => {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} & ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, & ${items[items.length - 1]}`;
};

const authorsApa = (names: CitationName[]) => {
  if (!names.length) return "";
  const formatted = names.map((n) => `${stripTrailingPunctuation(n.family)}, ${initials(n.given)}`.trim().replace(/\s+,/gu, ","));
  if (formatted.length <= 20) return joinWithAmp(formatted);
  const first19 = formatted.slice(0, 19).join(", ");
  const last = formatted[formatted.length - 1]!;
  return `${first19}, …, ${last}`;
};

const authorsMla = (names: CitationName[]) => {
  if (!names.length) return "";
  if (names.length === 1) return `${stripTrailingPunctuation(names[0]!.family)}, ${compact(names[0]!.given)}`.trim().replace(/\s+,/gu, ",");
  if (names.length === 2) {
    const first = `${stripTrailingPunctuation(names[0]!.family)}, ${compact(names[0]!.given)}`.trim().replace(/\s+,/gu, ",");
    const second = `${compact(names[1]!.given)} ${stripTrailingPunctuation(names[1]!.family)}`.trim();
    return `${first}, and ${second}`;
  }
  const first = `${stripTrailingPunctuation(names[0]!.family)}, ${compact(names[0]!.given)}`.trim().replace(/\s+,/gu, ",");
  return `${first}, et al.`;
};

const authorsChicago = (names: CitationName[]) => {
  if (!names.length) return "";
  const formatted = names.map((n, idx) => {
    const family = stripTrailingPunctuation(n.family);
    const given = compact(n.given);
    if (idx === 0) return `${family}, ${given}`.trim().replace(/\s+,/gu, ",");
    return `${given} ${family}`.trim();
  });
  return joinWithAnd(formatted);
};

const authorsIeee = (names: CitationName[]) => {
  if (!names.length) return "";
  const formatted = names.map((n) => {
    const given = initials(n.given).replace(/\s+/gu, " ");
    const family = stripTrailingPunctuation(n.family);
    return `${given} ${family}`.trim();
  });
  if (formatted.length === 1) return formatted[0]!;
  if (formatted.length === 2) return `${formatted[0]}, and ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(", ")}, and ${formatted[formatted.length - 1]}`;
};

const authorsGbt = (names: CitationName[]) => {
  if (!names.length) return "";
  const formatted = names.map((n) => {
    const family = stripTrailingPunctuation(n.family);
    const given = compact(n.given)
      .split(/\s+/gu)
      .filter(Boolean)
      .map((p) => p[0]!.toUpperCase())
      .join("");
    return `${family} ${given}`.trim();
  });
  if (formatted.length <= 3) return formatted.join(", ");
  return `${formatted.slice(0, 3).join(", ")}, et al.`;
};

const warn = (warnings: Set<CitationWarningCode>, ...codes: CitationWarningCode[]) => codes.forEach((c) => warnings.add(c));

const withPeriod = (s: string) => {
  const t = s.trim();
  if (!t) return "";
  return /[.!?。！？]$/u.test(t) ? t : `${t}.`;
};

const quoteIfNeeded = (s: string) => {
  const t = s.trim();
  if (!t) return "";
  if (/^["“].*["”]$/u.test(t)) return t;
  return `"${t}"`;
};

export function formatCitation(input: CitationInput, options: CitationFormatOptions): CitationFormatResult {
  const warnings = new Set<CitationWarningCode>();

  const title = compact(input.title);
  const containerTitle = compact(input.containerTitle);
  const publisher = compact(input.publisher);
  const volume = compact(input.volume);
  const issue = compact(input.issue);
  const pages = compact(input.pages);
  const url = normalizeUrl(input.url);
  const doi = normalizeDoi(input.doi);

  const published = input.publishedDate ? parseIsoDate(input.publishedDate) : null;
  const accessed = input.accessDate ? parseIsoDate(input.accessDate) : null;

  if (!title) warn(warnings, "missingTitle");
  if (!input.authors.length) warn(warnings, "missingAuthors");
  if (!published) warn(warnings, "missingDate");

  const cite = (() => {
    switch (input.style) {
      case "apa7":
        return formatApa(input.sourceType);
      case "mla9":
        return formatMla(input.sourceType);
      case "chicago":
        return formatChicago(input.sourceType);
      case "ieee":
        return formatIeee(input.sourceType);
      case "gbt7714":
        return formatGbt(input.sourceType);
      default: {
        const _exhaustive: never = input.style;
        return _exhaustive;
      }
    }
  })();

  return { citation: cite, warnings: Array.from(warnings) };

  function formatApa(sourceType: CitationSourceType) {
    const authorsText = authorsApa(input.authors);
    const dateText = (() => {
      if (!published) return "(n.d.).";
      if (published.month && published.day) return `(${published.year}, ${options.monthNamesLong[published.month - 1] ?? published.month} ${published.day}).`;
      if (published.month) return `(${published.year}, ${options.monthNamesLong[published.month - 1] ?? published.month}).`;
      return `(${published.year}).`;
    })();

    if (sourceType === "journal") {
      if (!containerTitle) warn(warnings, "missingContainer");
      const parts: string[] = [];
      if (authorsText) parts.push(withPeriod(authorsText));
      parts.push(dateText);
      if (title) parts.push(withPeriod(title));
      if (containerTitle) {
        const volIssue =
          volume && issue ? `${volume}(${issue})` : volume ? volume : issue ? `(${issue})` : "";
        const pagesText = pages ? `${pages}` : "";
        const containerBits = [containerTitle, volIssue].filter(Boolean).join(", ");
        const trailing = [containerBits, pagesText].filter(Boolean).join(", ");
        parts.push(withPeriod(trailing));
      }
      const link = doi ? doiUrl(doi) : url;
      if (link) parts.push(link);
      if (!link) warn(warnings, "missingUrl");
      return parts.join(" ").replace(/\s+/gu, " ").trim();
    }

    if (sourceType === "book") {
      const parts: string[] = [];
      if (authorsText) parts.push(withPeriod(authorsText));
      parts.push(dateText);
      if (title) parts.push(withPeriod(title));
      if (publisher) parts.push(withPeriod(publisher));
      if (!publisher) warn(warnings, "missingPublisher");
      const link = doi ? doiUrl(doi) : url;
      if (link) parts.push(link);
      return parts.join(" ").replace(/\s+/gu, " ").trim();
    }

    // website
    const parts: string[] = [];
    if (authorsText) parts.push(withPeriod(authorsText));
    parts.push(dateText);
    if (title) parts.push(withPeriod(title));
    if (containerTitle) parts.push(withPeriod(containerTitle));
    const link = doi ? doiUrl(doi) : url;
    if (link) parts.push(link);
    if (!link) warn(warnings, "missingUrl");
    return parts.join(" ").replace(/\s+/gu, " ").trim();
  }

  function formatMla(sourceType: CitationSourceType) {
    const authorsText = authorsMla(input.authors);
    const publishedText = published ? formatDayMonthYear(published, options.monthNamesShort) : "";
    const accessedText = accessed ? formatDayMonthYear(accessed, options.monthNamesShort) : "";
    if (sourceType === "journal") {
      if (!containerTitle) warn(warnings, "missingContainer");
      const parts: string[] = [];
      if (authorsText) parts.push(withPeriod(authorsText));
      if (title) parts.push(withPeriod(quoteIfNeeded(title)));
      if (containerTitle) parts.push(withPeriod(containerTitle));
      const volNo = [
        volume ? `vol. ${volume}` : "",
        issue ? `no. ${issue}` : "",
        published ? String(published.year) : "",
        pages ? `pp. ${pages}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      if (volNo) parts.push(withPeriod(volNo));
      const link = doi ? doiUrl(doi) : url;
      if (link) parts.push(withPeriod(link));
      if (!link) warn(warnings, "missingUrl");
      return parts.join(" ").replace(/\s+/gu, " ").trim();
    }

    if (sourceType === "book") {
      const parts: string[] = [];
      if (authorsText) parts.push(withPeriod(authorsText));
      if (title) parts.push(withPeriod(title));
      const pub = [publisher, published ? String(published.year) : ""].filter(Boolean).join(", ");
      if (pub) parts.push(withPeriod(pub));
      if (!publisher) warn(warnings, "missingPublisher");
      const link = doi ? doiUrl(doi) : url;
      if (link) parts.push(withPeriod(link));
      return parts.join(" ").replace(/\s+/gu, " ").trim();
    }

    // website
    const parts: string[] = [];
    if (authorsText) parts.push(withPeriod(authorsText));
    if (title) parts.push(withPeriod(quoteIfNeeded(title)));
    if (containerTitle) parts.push(withPeriod(containerTitle));
    if (publishedText) parts.push(withPeriod(publishedText));
    const link = doi ? doiUrl(doi) : url;
    if (link) parts.push(withPeriod(link));
    if (!link) warn(warnings, "missingUrl");
    if (accessedText) parts.push(withPeriod(`${options.accessedLabel} ${accessedText}`));
    return parts.join(" ").replace(/\s+/gu, " ").trim();
  }

  function formatChicago(sourceType: CitationSourceType) {
    const authorsText = authorsChicago(input.authors);
    const publishedText = published ? formatMonthDayYear(published, options.monthNamesLong) : "";
    const accessedText = accessed ? formatMonthDayYear(accessed, options.monthNamesLong) : "";

    if (sourceType === "journal") {
      if (!containerTitle) warn(warnings, "missingContainer");
      const parts: string[] = [];
      if (authorsText) parts.push(withPeriod(authorsText));
      if (title) parts.push(withPeriod(quoteIfNeeded(title)));
      if (containerTitle) {
        const volIssue = volume && issue ? `${volume}, no. ${issue}` : volume ? `${volume}` : issue ? `no. ${issue}` : "";
        const yearText = published ? `${published.year}` : "";
        const containerBits = [containerTitle, volIssue, yearText ? `(${yearText})` : ""].filter(Boolean).join(" ");
        parts.push(containerBits.trim() ? `${containerBits.trim()}:` : "");
      }
      if (pages) parts.push(withPeriod(pages));
      const link = doi ? doiUrl(doi) : url;
      if (link) parts.push(withPeriod(link));
      if (!link) warn(warnings, "missingUrl");
      return parts.join(" ").replace(/\s+/gu, " ").trim().replace(/\s+:\s+/gu, ": ");
    }

    if (sourceType === "book") {
      const parts: string[] = [];
      if (authorsText) parts.push(withPeriod(authorsText));
      if (title) parts.push(withPeriod(title));
      const pub = [publisher, published ? String(published.year) : ""].filter(Boolean).join(", ");
      if (pub) parts.push(withPeriod(pub));
      if (!publisher) warn(warnings, "missingPublisher");
      const link = doi ? doiUrl(doi) : url;
      if (link) parts.push(withPeriod(link));
      return parts.join(" ").replace(/\s+/gu, " ").trim();
    }

    // website
    const parts: string[] = [];
    if (authorsText) parts.push(withPeriod(authorsText));
    if (title) parts.push(withPeriod(quoteIfNeeded(title)));
    if (containerTitle) parts.push(withPeriod(containerTitle));
    if (publishedText) parts.push(withPeriod(publishedText));
    const link = doi ? doiUrl(doi) : url;
    if (link) parts.push(withPeriod(link));
    if (!link) warn(warnings, "missingUrl");
    if (accessedText) parts.push(withPeriod(`${options.accessedLabel} ${accessedText}`));
    return parts.join(" ").replace(/\s+/gu, " ").trim();
  }

  function formatIeee(sourceType: CitationSourceType) {
    const authorsText = authorsIeee(input.authors);
    const publishedText = published ? formatMonthDayYear(published, options.monthNamesShort) : "";
    const accessedText = accessed ? formatMonthDayYear(accessed, options.monthNamesShort) : "";

    if (sourceType === "journal") {
      if (!containerTitle) warn(warnings, "missingContainer");
      const parts: string[] = [];
      if (authorsText) parts.push(withPeriod(authorsText));
      if (title) parts.push(withPeriod(quoteIfNeeded(title)));
      if (containerTitle) parts.push(withPeriod(containerTitle));
      const volNoPages = [
        volume ? `vol. ${volume}` : "",
        issue ? `no. ${issue}` : "",
        pages ? `pp. ${pages}` : "",
        published ? `${published.year}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      if (volNoPages) parts.push(withPeriod(volNoPages));
      if (doi) parts.push(withPeriod(`doi: ${doi}`));
      const link = !doi ? url : "";
      if (link) parts.push(withPeriod(link));
      if (!doi && !link) warn(warnings, "missingUrl");
      return parts.join(" ").replace(/\s+/gu, " ").trim();
    }

    if (sourceType === "book") {
      const parts: string[] = [];
      if (authorsText) parts.push(withPeriod(authorsText));
      if (title) parts.push(withPeriod(title));
      const pub = [publisher, published ? String(published.year) : ""].filter(Boolean).join(", ");
      if (pub) parts.push(withPeriod(pub));
      if (!publisher) warn(warnings, "missingPublisher");
      if (doi) parts.push(withPeriod(`doi: ${doi}`));
      const link = !doi ? url : "";
      if (link) parts.push(withPeriod(link));
      return parts.join(" ").replace(/\s+/gu, " ").trim();
    }

    // website
    const parts: string[] = [];
    if (authorsText) parts.push(withPeriod(authorsText));
    if (title) parts.push(withPeriod(quoteIfNeeded(title)));
    if (containerTitle) parts.push(withPeriod(containerTitle));
    if (publishedText) parts.push(withPeriod(publishedText));
    const link = doi ? doiUrl(doi) : url;
    if (link) parts.push(withPeriod(`[${options.onlineLabel}]. ${options.availableLabel}: ${link}`));
    if (!link) warn(warnings, "missingUrl");
    if (accessedText) parts.push(withPeriod(`${options.accessedLabel}: ${accessedText}`));
    return parts.join(" ").replace(/\s+/gu, " ").trim();
  }

  function formatGbt(sourceType: CitationSourceType) {
    const authorsText = authorsGbt(input.authors);
    const year = published ? String(published.year) : "";
    const publishedNumeric = published ? formatYearMonthDayNumeric(published) : "";
    const accessedNumeric = accessed ? formatYearMonthDayNumeric(accessed) : "";

    if (sourceType === "journal") {
      if (!containerTitle) warn(warnings, "missingContainer");
      const parts: string[] = [];
      if (authorsText) parts.push(withPeriod(authorsText));
      if (title) parts.push(withPeriod(`${stripTrailingPunctuation(title)}[J]`));
      if (containerTitle) {
        const vi = volume && issue ? `${volume}(${issue})` : volume ? volume : issue ? `(${issue})` : "";
        const tail = [containerTitle, year, vi ? `${vi}` : "", pages ? `:${pages}` : ""].filter(Boolean).join(", ");
        parts.push(withPeriod(tail));
      }
      if (doi) parts.push(withPeriod(`DOI: ${doi}`));
      const link = !doi ? url : "";
      if (link) parts.push(withPeriod(link));
      if (!doi && !link) warn(warnings, "missingUrl");
      return parts.join(" ").replace(/\s+/gu, " ").trim();
    }

    if (sourceType === "book") {
      const parts: string[] = [];
      if (authorsText) parts.push(withPeriod(authorsText));
      if (title) parts.push(withPeriod(`${stripTrailingPunctuation(title)}[M]`));
      const pub = [publisher, year].filter(Boolean).join(", ");
      if (pub) parts.push(withPeriod(pub));
      if (!publisher) warn(warnings, "missingPublisher");
      if (doi) parts.push(withPeriod(`DOI: ${doi}`));
      const link = !doi ? url : "";
      if (link) parts.push(withPeriod(link));
      return parts.join(" ").replace(/\s+/gu, " ").trim();
    }

    // website
    const parts: string[] = [];
    if (authorsText) parts.push(withPeriod(authorsText));
    if (title) parts.push(withPeriod(`${stripTrailingPunctuation(title)}[EB/OL]`));
    if (containerTitle) parts.push(withPeriod(containerTitle));
    if (publishedNumeric) parts.push(withPeriod(`(${publishedNumeric})`));
    const link = doi ? doiUrl(doi) : url;
    if (link) parts.push(withPeriod(link));
    if (!link) warn(warnings, "missingUrl");
    if (accessedNumeric) parts.push(withPeriod(`[${options.accessedLabel}: ${accessedNumeric}]`));
    return parts.join(" ").replace(/\s+/gu, " ").trim();
  }
}

const stripLeadingIndex = (text: string) =>
  text.replace(
    /^\s*(?:(?:\[\s*\d+\s*\])|(?:【\s*\d+\s*】)|(?:\(\s*\d+\s*\))|(?:（\s*\d+\s*）)|(?:\d+\s*[.)])|(?:\d+\s*、)|(?:[\u2460-\u2473])|(?:[一二三四五六七八九十]+、))\s*/u,
    "",
  );

const toCleanText = (raw: string) =>
  stripLeadingIndex(
    raw
      .replace(/\r\n/gu, "\n")
      .replace(/[“”]/gu, '"')
      .replace(/[’]/gu, "'")
      .replace(/\s+/gu, " ")
      .trim(),
  );

const lastMatch = (re: RegExp, text: string) => {
  let m: RegExpExecArray | null = null;
  let cur: RegExpExecArray | null = null;
  while ((cur = re.exec(text))) m = cur;
  return m;
};

const normalizeDateToken = (token: string): string | "" => {
  const s = token.trim();
  const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/u.exec(s);
  if (ymd) return `${ymd[1]}-${String(Number(ymd[2])).padStart(2, "0")}-${String(Number(ymd[3])).padStart(2, "0")}`;
  const ym = /^(\d{4})[/-](\d{1,2})$/u.exec(s);
  if (ym) return `${ym[1]}-${String(Number(ym[2])).padStart(2, "0")}`;
  const y = /^(\d{4})$/u.exec(s);
  if (y) return y[1]!;
  return "";
};

export function detectCitationStyle(raw: string): CitationStyleDetection {
  const text = toCleanText(raw);
  if (!text) return { style: "unknown", confidence: 0 };

  const scores: Record<CitationStyle, number> = {
    apa7: 0,
    mla9: 0,
    chicago: 0,
    ieee: 0,
    gbt7714: 0,
  };

  const hasGbtMarker = /\[(?:J|M|EB\/OL)\]/iu.test(text);
  const hasIeeeIndex = /^\s*\[\d+\]\s+/u.test(text);
  const hasApaYear = /\(\d{4}[a-z]?\)/iu.test(text);
  const hasDoi = /\bdoi:\s*10\./iu.test(text) || /doi\.org\/10\./iu.test(text);
  const hasVol = /\bvol\.\s*\d+/iu.test(text);
  const hasNo = /\bno\.\s*\d+/iu.test(text);
  const hasPp = /\bpp\.\s*[\d-]+/iu.test(text);
  const hasRetrievedFrom = /\bretrieved from\b/iu.test(text);
  const hasOnline = /\[\s*online\s*\]/iu.test(text) || /\bonline\]/iu.test(text);
  const hasAccessed = /\baccessed\b/iu.test(text);

  if (hasGbtMarker) scores.gbt7714 += 0.9;
  if (/\bDOI:\s*10\./u.test(text)) scores.gbt7714 += 0.15;

  if (hasIeeeIndex) scores.ieee += 0.6;
  if (hasOnline) scores.ieee += 0.2;
  if (hasVol) scores.ieee += 0.15;
  if (hasNo) scores.ieee += 0.1;
  if (hasPp) scores.ieee += 0.1;
  if (hasDoi) scores.ieee += 0.15;

  if (hasApaYear) scores.apa7 += 0.55;
  if (/\s&\s/u.test(text) && /\b\w+,\s*[A-Z]\./u.test(text)) scores.apa7 += 0.15;
  if (hasRetrievedFrom) scores.apa7 += 0.15;
  if (/https?:\/\/doi\.org\/10\./iu.test(text)) scores.apa7 += 0.1;

  const hasMonthDayYear = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/iu.test(
    text,
  );
  const hasDayMonYear = /\b\d{1,2}\s+(Jan\.|Feb\.|Mar\.|Apr\.|May|Jun\.|Jul\.|Aug\.|Sep\.|Oct\.|Nov\.|Dec\.)\s+\d{4}/iu.test(text);

  if (hasAccessed) {
    scores.mla9 += 0.15;
    scores.chicago += 0.15;
  }
  if (hasDayMonYear) scores.mla9 += 0.45;
  if (hasMonthDayYear) scores.chicago += 0.45;

  const ranked = (Object.entries(scores) as Array<[CitationStyle, number]>).sort((a, b) => b[1] - a[1]);
  const top = ranked[0]!;
  const second = ranked[1]!;
  const topScore = top[1];
  const secondScore = second[1];

  if (topScore <= 0.35) return { style: "unknown", confidence: Math.max(0, topScore) };
  const confidence = Math.max(0, Math.min(1, (topScore - secondScore) / Math.max(0.35, topScore)));
  return { style: top[0], confidence };
}

const extractDoi = (text: string) => {
  const m = text.match(/(?:doi:\s*|doi\.org\/)(10\.\S+?)(?:[)\].,;]|$)/iu);
  if (!m) return "";
  return normalizeDoi(m[1] ?? "");
};

const extractUrl = (text: string) => {
  const m = lastMatch(/https?:\/\/[^\s)]+/giu, text);
  return m ? stripTrailingPunctuation(m[0]) : "";
};

const extractYear = (text: string) => {
  const m = text.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/u);
  return m ? m[1]! : "";
};

const extractQuotedTitle = (text: string) => {
  const m = text.match(/"([^"]{2,300})"/u);
  return m ? stripTrailingPunctuation(m[1] ?? "") : "";
};

const extractAccessedDate = (text: string) => {
  const m = text.match(/\baccessed\s+([^.,;]+?)(?:[.,;]|$)/iu);
  if (!m) return "";
  const t = m[1] ?? "";
  const numeric = t.match(/\b(\d{4}[/-]\d{1,2}(?:[/-]\d{1,2})?)\b/u);
  if (numeric) return normalizeDateToken(numeric[1]!) || "";
  const year = t.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/u);
  return year ? year[1]! : "";
};

const extractVolIssuePages = (text: string) => {
  const volume = (text.match(/\bvol\.\s*(\d+)/iu)?.[1] ?? "").trim();
  const issue = (text.match(/\bno\.\s*(\d+)/iu)?.[1] ?? "").trim();
  const pages = (text.match(/\bpp\.\s*([\d\u2013-]+)\b/iu)?.[1] ?? "").trim();
  return { volume, issue, pages };
};

const extractVolIssuePagesGbt = (text: string) => {
  const vi = text.match(/\b(\d+)\s*\(\s*(\d+)\s*\)/u);
  const volume = (vi?.[1] ?? "").trim();
  const issue = (vi?.[2] ?? "").trim();
  const pages = (text.match(/:\s*([\d\u2013-]+)\b/u)?.[1] ?? "").trim();
  return { volume, issue, pages };
};

const authorsFromApaSegment = (segment: string) => {
  const out: string[] = [];
  const re = /([A-Za-zÀ-ÖØ-öø-ÿ' -]+),\s*([A-Z](?:\.[A-Z]\.)*(?:\s*[A-Z]\.)?)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment))) {
    const family = compact(m[1] ?? "");
    const given = compact(m[2] ?? "");
    if (family) out.push(`${family}, ${given}`.trim());
  }
  return out;
};

const authorsFromIeeeSegment = (segment: string) => {
  const cleaned = segment
    .replace(/^\[\d+\]\s*/u, "")
    .replace(/\bet al\.\b/iu, "")
    .replace(/\band\b/giu, ",")
    .replace(/&/gu, ",");
  const out: string[] = [];
  const re = /((?:[A-Z]\.\s*){1,3})([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,80})/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    const initialsText = compact(m[1] ?? "");
    const family = compact(m[2] ?? "");
    if (family) out.push(`${family}, ${initialsText}`.trim());
  }
  return out;
};

const authorsFromGbtSegment = (segment: string) => {
  const cleaned = segment.replace(/\bet al\.\b/iu, "");
  const out: string[] = [];
  const parts = cleaned
    .split(/[,，;]/gu)
    .map((p) => compact(p))
    .filter(Boolean);
  for (const part of parts) {
    const m = /^(.+?)\s+([A-Z]{1,6})$/u.exec(part);
    if (m) out.push(`${compact(m[1] ?? "")}, ${compact(m[2] ?? "")}`.trim());
  }
  return out;
};

export function parseCitation(raw: string, preferredStyle?: CitationStyle): ParsedCitationFields {
  const text = toCleanText(raw);
  if (!text) return { style: "unknown" };

  const detection = preferredStyle ? ({ style: preferredStyle, confidence: 1 } satisfies CitationStyleDetection) : detectCitationStyle(text);
  const style = detection.style;

  const doi = extractDoi(text);
  const url = normalizeUrl(doi ? "" : extractUrl(text));
  const accessDate = extractAccessedDate(text);

  let sourceType: CitationSourceType | undefined;
  if (/\[EB\/OL\]/iu.test(text)) sourceType = "website";
  else if (/\[J\]/iu.test(text) || /\bvol\.\s*\d+/iu.test(text) || /\bpp\.\s*[\d\u2013-]+/iu.test(text)) sourceType = "journal";
  else if (/\[M\]/iu.test(text)) sourceType = "book";

  const publishedDate = (() => {
    if (style === "apa7") {
      const m = text.match(/\((18\d{2}|19\d{2}|20\d{2})[a-z]?\)/iu);
      return m ? m[1]! : "";
    }
    const year = extractYear(text);
    return year;
  })();

  const volIssuePages = (() => {
    if (/\[(?:J|M|EB\/OL)\]/iu.test(text)) return extractVolIssuePagesGbt(text);
    return extractVolIssuePages(text);
  })();

  const title = (() => {
    const q = extractQuotedTitle(text);
    if (q) return q;
    const gbt = text.match(/\.\s*([^[]+?)\s*\[(?:J|M|EB\/OL)\]/iu);
    if (gbt) return stripTrailingPunctuation(gbt[1] ?? "");
    const apa = text.match(/\)\.\s*([^.]{2,300}?)\./u);
    if (apa) return stripTrailingPunctuation(apa[1] ?? "");
    return "";
  })();

  const authorsRaw = (() => {
    if (style === "apa7") {
      const seg = text.split("(")[0] ?? "";
      const list = authorsFromApaSegment(seg);
      if (list.length) return list.join("\n");
    }
    if (style === "ieee") {
      const beforeTitle = text.split('"')[0] ?? text;
      const seg = beforeTitle.split(",")[0] ?? beforeTitle;
      const list = authorsFromIeeeSegment(seg);
      if (list.length) return list.join("\n");
    }
    if (style === "gbt7714") {
      const seg = (text.split(".")[0] ?? "").trim();
      const list = authorsFromGbtSegment(seg);
      if (list.length) return list.join("\n");
    }
    const seg = (text.split(".")[0] ?? "").trim();
    const fallback = parseAuthors(seg.replace(/\s+and\s+/giu, "\n").replace(/\s*&\s*/gu, "\n").replace(/;\s*/gu, "\n"));
    if (!fallback.length) return "";
    return fallback.map((n) => `${n.family}${n.given ? `, ${n.given}` : ""}`.trim()).join("\n");
  })();

  const containerTitle = (() => {
    const gbt = text.match(/\[(?:J|EB\/OL)\]\.\s*([^,，.]+)[,，]/iu);
    if (gbt) return stripTrailingPunctuation(gbt[1] ?? "");
    const ieee = text.match(/"\s*,\s*([^,]+?),\s*(?:vol\.|no\.|pp\.)/iu);
    if (ieee) return stripTrailingPunctuation(ieee[1] ?? "");
    const apa = text.match(/\)\.\s*[^.]+\.\s*([^,]+),\s*\d+/u);
    if (apa) return stripTrailingPunctuation(apa[1] ?? "");
    const afterTitle = title ? text.split(title)[1] ?? "" : "";
    const m = afterTitle.match(/^\s*\.?\s*([^,]+),/u);
    return m ? stripTrailingPunctuation(m[1] ?? "") : "";
  })();

  const publisher = (() => {
    if (sourceType !== "book") return "";
    if (!title) return "";
    const after = text.split(title)[1] ?? "";
    const m = after.match(/\.?\s*([^,]+),\s*(18\d{2}|19\d{2}|20\d{2})/u);
    return m ? stripTrailingPunctuation(m[1] ?? "") : "";
  })();

  return {
    style,
    sourceType,
    authorsRaw,
    title,
    containerTitle,
    publisher,
    publishedDate: publishedDate || "",
    accessDate: accessDate || "",
    volume: volIssuePages.volume || "",
    issue: volIssuePages.issue || "",
    pages: volIssuePages.pages || "",
    url: url || "",
    doi: doi || "",
  };
}
