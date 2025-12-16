export interface ToolConfig {
  name: string;
  shortName?: string;
  description: string;
  seoDescription?: string;
  lang?: string;
  themeColor?: string;
  backgroundColor?: string;
  icon?: string;
  startUrl?: string;
  scope?: string;
  category?: string;
  keywords?: string[];
  ui?: Record<string, unknown>;
}
