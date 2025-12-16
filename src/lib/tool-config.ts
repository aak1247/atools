import { existsSync, readFileSync } from "fs";
import { join } from 'path';
import type { ToolConfig } from "../types/tools";

function mergeToolConfig(baseConfig: ToolConfig, overrideConfig: Partial<ToolConfig> | null): ToolConfig {
  if (!overrideConfig) return baseConfig;
  const merged: ToolConfig = { ...baseConfig, ...overrideConfig };
  const baseUi = baseConfig.ui;
  const overrideUi = overrideConfig.ui;
  if (
    baseUi &&
    overrideUi &&
    typeof baseUi === "object" &&
    typeof overrideUi === "object" &&
    !Array.isArray(baseUi) &&
    !Array.isArray(overrideUi)
  ) {
    merged.ui = { ...baseUi, ...overrideUi };
  }
  return merged;
}

export function getToolConfig(toolSlug: string, locale?: string): ToolConfig {
  try {
    const basePath = join(process.cwd(), "src", "app", "tools", toolSlug, "tool.json");
    const baseContent = readFileSync(basePath, "utf-8");
    const baseConfig = JSON.parse(baseContent) as ToolConfig;

    if (!locale) return baseConfig;
    const localizedPath = join(process.cwd(), "src", "app", "tools", toolSlug, `tool.${locale}.json`);
    if (!existsSync(localizedPath)) return baseConfig;
    const localizedContent = readFileSync(localizedPath, "utf-8");
    const overrideConfig = JSON.parse(localizedContent) as Partial<ToolConfig>;
    return mergeToolConfig(baseConfig, overrideConfig);
  } catch (error) {
    console.error(`Failed to load tool config for ${toolSlug}:`, error);
    throw new Error(`Tool config not found for ${toolSlug}`);
  }
}
