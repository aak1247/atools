"use client";

import { useEffect, useState } from "react";
import { useOptionalToolConfig } from "../components/ToolConfigProvider";
import type { ToolConfig } from "../types/tools";

export function useToolConfig(toolSlug: string, locale?: string) {
  const providedConfig = useOptionalToolConfig(toolSlug, locale);
  const [config, setConfig] = useState<ToolConfig | null>(providedConfig ?? null);
  const [loading, setLoading] = useState(!providedConfig);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      if (providedConfig) {
        setConfig(providedConfig);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const urls = locale
          ? [`/tools/${toolSlug}/tool.${locale}.json`, `/tools/${toolSlug}/tool.json`]
          : [`/tools/${toolSlug}/tool.json`];

        for (const url of urls) {
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) continue;
          const data = (await response.json()) as ToolConfig;
          setConfig(data);
          return;
        }
        throw new Error("Failed to load tool config");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setConfig(null);
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, [locale, providedConfig, toolSlug]);

  return { config, loading, error };
}
