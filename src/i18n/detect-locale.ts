import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

export const PREFERRED_LOCALE_KEY = "preferred_locale";

/**
 * 匹配单个语言标识
 */
export function matchLocaleFromLanguage(lang: string): Locale | null {
  if (!lang) return null;
  const normalized = lang.toLowerCase().trim();
  if (normalized.startsWith("zh")) return "zh-cn";
  if (normalized.startsWith("en")) return "en-us";
  return null;
}

/**
 * 遍历优先级语言列表（如 navigator.languages 或解析后的 Accept-Language）
 */
export function matchLocaleFromLanguages(languages: readonly string[]): Locale | null {
  for (const lang of languages) {
    const matched = matchLocaleFromLanguage(lang);
    if (matched) return matched;
  }
  return null;
}

/**
 * 大中华区国家与地区代码
 */
const GREATER_CHINA_COUNTRIES = new Set(["CN", "HK", "MO", "TW"]);

/**
 * 根据国家/地区代码判定语言
 */
export function matchLocaleFromCountry(countryCode?: string | null): Locale | null {
  if (!countryCode) return null;
  const code = countryCode.toUpperCase().trim();
  if (!code || code === "XX" || code === "T1") return null;
  if (GREATER_CHINA_COUNTRIES.has(code)) {
    return "zh-cn";
  }
  // 属于其他国家/地区，在目前仅支持中英双语的情况下匹配为英文
  return "en-us";
}

/**
 * 中国主要时区标识
 */
const GREATER_CHINA_TIMEZONES = new Set([
  "Asia/Shanghai",
  "Asia/Urumqi",
  "Asia/Chongqing",
  "Asia/Harbin",
  "Asia/Kashgar",
  "Asia/Hong_Kong",
  "Asia/Macau",
  "Asia/Taipei",
  "PRC",
]);

/**
 * 客户端根据设备时区推断地理位置语言偏好
 */
export function matchLocaleFromTimezone(timeZone?: string | null): Locale | null {
  if (!timeZone) return null;
  const tz = timeZone.trim();
  if (!tz) return null;
  if (GREATER_CHINA_TIMEZONES.has(tz)) {
    return "zh-cn";
  }
  // 海外时区归属为英文
  return "en-us";
}

/**
 * 解析 Accept-Language 标头并按权重 q 降序排列
 */
export function parseAcceptLanguage(header?: string | null): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [lang, qPart] = part.split(";");
      const trimmedLang = lang?.trim() ?? "";
      let q = 1.0;
      if (qPart) {
        const match = /q=([0-9.]+)/.exec(qPart);
        if (match?.[1]) {
          const parsed = parseFloat(match[1]);
          if (!isNaN(parsed)) q = parsed;
        }
      }
      return { lang: trimmedLang, q };
    })
    .filter((item) => Boolean(item.lang))
    .sort((a, b) => b.q - a.q)
    .map((item) => item.lang);
}

/**
 * 从 Cookie 字符串中提取指定的语言偏好
 */
export function parseCookieLocale(cookieHeader?: string | null): Locale | null {
  if (!cookieHeader) return null;
  const match = new RegExp(`(?:^|;\\s*)${PREFERRED_LOCALE_KEY}=([^;]+)`).exec(cookieHeader);
  if (!match?.[1]) return null;
  const value = decodeURIComponent(match[1]).trim().toLowerCase();
  return isLocale(value) ? value : null;
}

/**
 * 服务端/边缘计算环境综合判定逻辑：
 * 优先级：
 * 0. 用户手动保存的 Cookie 偏好
 * 1. 操作系统/浏览器语言（Accept-Language 标头）
 * 2. 地理位置（国家代码）
 * 3. 默认兜底（zh-cn）
 */
export function detectServerLocale(params: {
  cookieHeader?: string | null;
  acceptLanguageHeader?: string | null;
  country?: string | null;
}): Locale {
  // 0. 手动偏好
  const savedLocale = parseCookieLocale(params.cookieHeader);
  if (savedLocale) return savedLocale;

  // 1. 操作系统/浏览器语言优先
  const languages = parseAcceptLanguage(params.acceptLanguageHeader);
  const matchedLang = matchLocaleFromLanguages(languages);
  if (matchedLang) return matchedLang;

  // 2. 其次看地理位置
  const matchedCountry = matchLocaleFromCountry(params.country);
  if (matchedCountry) return matchedCountry;

  // 3. 兜底
  return DEFAULT_LOCALE;
}

/**
 * 客户端环境综合判定逻辑：
 * 优先级：
 * 0. localStorage / Cookie 用户手动设置
 * 1. 操作系统/浏览器语言（navigator.languages / navigator.language）
 * 2. 地理位置（时区检测）
 * 3. 默认兜底（zh-cn）
 */
export function detectClientLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  try {
    const local = localStorage.getItem(PREFERRED_LOCALE_KEY);
    if (local && isLocale(local)) return local;
  } catch {}

  const cookieLocale = parseCookieLocale(document.cookie);
  if (cookieLocale) return cookieLocale;

  const nav = typeof navigator !== "undefined" ? navigator : null;
  const langs = nav?.languages && nav.languages.length > 0 ? nav.languages : [nav?.language ?? ""];
  const matchedLang = matchLocaleFromLanguages(langs.filter(Boolean) as string[]);
  if (matchedLang) return matchedLang;

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const matchedTz = matchLocaleFromTimezone(tz);
    if (matchedTz) return matchedTz;
  } catch {}

  return DEFAULT_LOCALE;
}

/**
 * 生成内联在静态根页面 HTML 中的极速检测与重定向脚本
 * 确保在客户端加载第一帧前完成 0 延迟无闪烁跳转
 */
export function buildClientRedirectScript(): string {
  return `(function(){try{var k='${PREFERRED_LOCALE_KEY}';var s=localStorage.getItem(k);if(s==='zh-cn'||s==='en-us'){window.location.replace('/'+s+window.location.search+window.location.hash);return;}}catch(e){}try{var m=document.cookie.match(/(?:^|;\\\\s*)${PREFERRED_LOCALE_KEY}=([^;]+)/);if(m&&m[1]){var c=decodeURIComponent(m[1]).toLowerCase();if(c==='zh-cn'||c==='en-us'){window.location.replace('/'+c+window.location.search+window.location.hash);return;}}}catch(e){}try{var ls=navigator.languages||[navigator.language||''];for(var i=0;i<ls.length;i++){var l=(ls[i]||'').toLowerCase();if(l.indexOf('zh')===0){window.location.replace('/zh-cn'+window.location.search+window.location.hash);return;}if(l.indexOf('en')===0){window.location.replace('/en-us'+window.location.search+window.location.hash);return;}}}catch(e){}try{var tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';var cnTz=['Asia/Shanghai','Asia/Urumqi','Asia/Chongqing','Asia/Harbin','Asia/Kashgar','Asia/Hong_Kong','Asia/Macau','Asia/Taipei','PRC'];for(var j=0;j<cnTz.length;j++){if(tz===cnTz[j]){window.location.replace('/zh-cn'+window.location.search+window.location.hash);return;}}if(tz){window.location.replace('/en-us'+window.location.search+window.location.hash);return;}}catch(e){}window.location.replace('/${DEFAULT_LOCALE}'+window.location.search+window.location.hash);})();`;
}
