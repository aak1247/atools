"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import type { ToolConfig } from "../types/tools";

type ProvidedToolConfig = {
  toolSlug: string;
  locale: string;
  config: ToolConfig;
};

const ToolConfigContext = createContext<ProvidedToolConfig | null>(null);

export function ToolConfigProvider({
  toolSlug,
  locale,
  config,
  children,
}: {
  toolSlug: string;
  locale: string;
  config: ToolConfig;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ toolSlug, locale, config }), [config, locale, toolSlug]);
  return <ToolConfigContext.Provider value={value}>{children}</ToolConfigContext.Provider>;
}

export function useOptionalToolConfig(toolSlug: string, locale?: string): ToolConfig | null {
  const ctx = useContext(ToolConfigContext);
  if (!ctx) return null;
  if (ctx.toolSlug !== toolSlug) return null;
  if (locale && ctx.locale !== locale) return null;
  return ctx.config;
}

