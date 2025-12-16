"use client";

import { useEffect, useState } from "react";

interface ToolConfig {
  name: string;
  shortName: string;
  description: string;
  seoDescription?: string;
  category: string;
  lang: string;
  themeColor: string;
  backgroundColor: string;
  icon: string;
  keywords?: string[];
}

export function useToolConfig(toolSlug: string) {
  const [config, setConfig] = useState<ToolConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch(`/tools/${toolSlug}/tool.json`);
        if (!response.ok) {
          throw new Error(`Failed to load tool config: ${response.statusText}`);
        }
        const data = await response.json();
        setConfig(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, [toolSlug]);

  return { config, loading, error };
}