import type { Locale } from "./locales";

export type ToolText = {
  "zh-cn": string;
  "en-us": string;
};

export const pickToolText = (locale: Locale, text: ToolText): string =>
  locale === "en-us" ? text["en-us"] : text["zh-cn"];

