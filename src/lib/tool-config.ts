import { readFileSync } from 'fs';
import { join } from 'path';

export interface ToolConfig {
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

export function getToolConfig(toolSlug: string): ToolConfig {
  try {
    const configPath = join(process.cwd(), 'src', 'app', 'tools', toolSlug, 'tool.json');
    const configContent = readFileSync(configPath, 'utf-8');
    return JSON.parse(configContent);
  } catch (error) {
    console.error(`Failed to load tool config for ${toolSlug}:`, error);
    throw new Error(`Tool config not found for ${toolSlug}`);
  }
}