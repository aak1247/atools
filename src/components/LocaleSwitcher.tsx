"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { LOCALE_LABEL, SUPPORTED_LOCALES, type Locale } from "../i18n/locales";
import { useI18n } from "../i18n/I18nProvider";

const switchLocaleInPath = (pathname: string, nextLocale: Locale): string => {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length > 0 && (SUPPORTED_LOCALES as readonly string[]).includes(parts[0]!)) {
    parts[0] = nextLocale;
    return `/${parts.join("/")}`;
  }
  return `/${nextLocale}${normalized}`;
};

export default function LocaleSwitcher() {
  const pathname = usePathname() ?? "/";
  const { locale } = useI18n();

  const nextLocale = useMemo<Locale>(() => (locale === "zh-cn" ? "en-us" : "zh-cn"), [locale]);
  const href = useMemo(() => switchLocaleInPath(pathname, nextLocale), [nextLocale, pathname]);

  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm transition hover:border-slate-300 hover:bg-slate-50"
      prefetch={false}
      aria-label={`Switch language to ${LOCALE_LABEL[nextLocale]}`}
    >
      {LOCALE_LABEL[nextLocale]}
    </Link>
  );
}

