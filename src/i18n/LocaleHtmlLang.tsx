"use client";

import { useEffect } from "react";
import type { Locale } from "./locales";
import { LOCALE_TAG } from "./locales";

export default function LocaleHtmlLang({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = LOCALE_TAG[locale] ?? "en";
  }, [locale]);

  return null;
}

