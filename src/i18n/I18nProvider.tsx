"use client";

import { createContext, useContext } from "react";
import type { Locale } from "./locales";
import type { Messages } from "./messages";

type I18nContextValue = {
  locale: Locale;
  messages: Messages;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: Readonly<{ locale: Locale; messages: Messages; children: React.ReactNode }>) {
  return <I18nContext.Provider value={{ locale, messages }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

export function useOptionalI18n() {
  return useContext(I18nContext);
}
