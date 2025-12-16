export const SUPPORTED_LOCALES = ["zh-cn", "en-us"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh-cn";

export const LOCALE_TAG: Record<Locale, string> = {
  "zh-cn": "zh-CN",
  "en-us": "en-US",
};

export const LOCALE_LABEL: Record<Locale, string> = {
  "zh-cn": "中文",
  "en-us": "English",
};

export const isLocale = (value: string): value is Locale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(value);

