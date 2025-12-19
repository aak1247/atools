import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const TOOLS_DIR = path.join(ROOT, "src", "app", "tools");
const PUBLIC_TOOLS_DIR = path.join(ROOT, "public", "tools");
const NAV_DATA_PATH = path.join(ROOT, "src", "app", "tools", "tools-meta.json");
const TOOL_REGISTRY_PATH = path.join(ROOT, "src", "app", "tools", "tool-registry.ts");

const SUPPORTED_LOCALES = ["zh-cn", "en-us"];
const DEFAULT_LOCALE = "zh-cn";

/**
 * @typedef {import("../src/types/tools").ToolConfig} ToolConfig
 */

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function listToolSlugs() {
  const slugs = new Set();

  try {
    const out = execSync('git ls-files "src/app/tools/*/tool.json"', {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString("utf8")
      .trim();
    if (out) {
      for (const line of out.split(/\r?\n/)) {
        const filePath = line.trim();
        if (!filePath) continue;
        const slug = filePath
          .replace(/^src\/app\/tools\//, "")
          .replace(/\/tool\.json$/, "")
          .trim();
        if (slug) slugs.add(slug);
      }
    }
  } catch {
    // Ignore git failures and fall back to filesystem scanning below.
  }

  if (fs.existsSync(TOOLS_DIR)) {
    for (const entry of fs.readdirSync(TOOLS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const slug = entry.name;
      if (!slug) continue;
      const toolJsonPath = path.join(TOOLS_DIR, slug, "tool.json");
      if (!fs.existsSync(toolJsonPath)) continue;
      slugs.add(slug);
    }
  }

  return Array.from(slugs).sort((a, b) => String(a).localeCompare(String(b), "en"));
}

function readOptionalJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return readJson(filePath);
  } catch (error) {
    console.error(`[manifest] 解析 ${filePath} 失败，已忽略该覆盖文件。`, error);
    return null;
  }
}

function mergeToolConfig(baseConfig, overrideConfig) {
  if (!overrideConfig) return baseConfig;
  if (typeof overrideConfig !== "object" || Array.isArray(overrideConfig)) return baseConfig;
  /** @type {ToolConfig} */
  const merged = { ...baseConfig, ...overrideConfig };

  const baseUi = baseConfig?.ui;
  const overrideUi = overrideConfig?.ui;
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

function generateManifestForTool(slug, config, navItems) {
  /** @type {ToolConfig} */
  const tool = config;

  if (!tool.name || !tool.description) {
    console.warn(
      `[manifest] 工具 ${slug} 的 tool.json 中缺少必填字段 name/description，已跳过。`,
    );
    return;
  }

  const basePath = `/tools/${slug}`;
  const localizedBasePath = `/${DEFAULT_LOCALE}${basePath}`;

  const startUrl = tool.startUrl || localizedBasePath;
  const scope = tool.scope || localizedBasePath;
  const lang = tool.lang || "zh-CN";
  const backgroundColor = tool.backgroundColor || "#0f172a";
  const themeColor = tool.themeColor || "#0f172a";

  let iconSrc = tool.icon || "/icon.svg";
  if (!iconSrc.startsWith("/")) {
    iconSrc = `/${iconSrc}`;
  }

  /** @type {string} */
  let iconType = "image/svg+xml";
  /** @type {string} */
  let iconSizes = "any";

  const lowerIcon = iconSrc.toLowerCase();
  if (lowerIcon.endsWith(".ico")) {
    iconType = "image/x-icon";
    iconSizes = "any";
  } else if (
    lowerIcon.endsWith(".png") ||
    lowerIcon.endsWith(".jpg") ||
    lowerIcon.endsWith(".jpeg")
  ) {
    iconType = "image/png";
    iconSizes = "512x512";
  }

  const manifest = {
    name: tool.name,
    short_name: tool.shortName || tool.name,
    description: tool.description,
    start_url: startUrl,
    scope,
    display: "standalone",
    lang,
    background_color: backgroundColor,
    theme_color: themeColor,
    icons: [
      {
        src: iconSrc,
        sizes: iconSizes,
        type: iconType,
      },
    ],
  };

  const outDir = path.join(PUBLIC_TOOLS_DIR, slug);
  ensureDir(outDir);

  const toolJsonOutPath = path.join(outDir, "tool.json");
  fs.writeFileSync(toolJsonOutPath, `${JSON.stringify(tool, null, 2)}\n`, "utf8");
  console.log(`[manifest] 已生成 ${toolJsonOutPath}`);

  const outPath = path.join(outDir, "manifest.webmanifest");
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`[manifest] 已生成 ${outPath}`);

  const category =
    typeof tool.category === "string" && tool.category.trim()
      ? tool.category.trim()
      : "其他工具";

  const keywords = Array.isArray(tool.keywords)
    ? tool.keywords.map((keyword) => String(keyword))
    : [];

  navItems.push({
    slug,
    path: basePath,
    name: tool.name,
    shortName: tool.shortName || tool.name,
    description: tool.description,
    category,
    icon: iconSrc,
    keywords,
  });
}

function writeNavData(navItems) {
  const sorted = navItems.slice().sort((a, b) =>
    String(a.name).localeCompare(String(b.name), "zh-CN"),
  );

  ensureDir(path.dirname(NAV_DATA_PATH));
  fs.writeFileSync(
    NAV_DATA_PATH,
    `${JSON.stringify(sorted, null, 2)}\n`,
    "utf8",
  );

  console.log(`[manifest] 已生成工具导航数据 ${NAV_DATA_PATH}`);
}

function writeNavDataForLocale(locale, navItems) {
  const sorted = navItems.slice().sort((a, b) =>
    String(a.name).localeCompare(String(b.name), locale === "en-us" ? "en" : "zh-CN"),
  );

  const filePath = path.join(ROOT, "src", "app", "tools", `tools-meta.${locale}.json`);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  console.log(`[manifest] 已生成工具导航数据 ${filePath}`);
}

function writeToolRegistry(toolEntries) {
  const lines = [];
  lines.push("// This file is auto-generated by scripts/generate-tool-manifests.mjs");
  lines.push("");
  lines.push("export const toolLoaders = {");
  for (const entry of toolEntries) {
    lines.push(`  ${JSON.stringify(entry.slug)}: () => import(${JSON.stringify(entry.importPath)}),`);
  }
  lines.push("} as const;");
  lines.push("");
  lines.push("export type ToolSlug = keyof typeof toolLoaders;");
  lines.push("export const toolSlugs = Object.keys(toolLoaders) as ToolSlug[];");
  lines.push("");

  ensureDir(path.dirname(TOOL_REGISTRY_PATH));
  fs.writeFileSync(TOOL_REGISTRY_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(`[manifest] 已生成工具注册表 ${TOOL_REGISTRY_PATH}`);
}

function main() {
  if (!fs.existsSync(TOOLS_DIR)) {
    console.warn(
      `[manifest] 未找到工具目录: ${TOOLS_DIR}，跳过 manifest.webmanifest 生成。`,
    );
    return;
  }

  ensureDir(PUBLIC_TOOLS_DIR);

  const slugs = listToolSlugs();
  const navItems = [];
  /** @type {Record<string, any[]>} */
  const navItemsByLocale = Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, []]));
  const toolRegistryEntries = [];

  for (const slug of slugs) {
    const toolJsonPath = path.join(TOOLS_DIR, slug, "tool.json");

    if (!fs.existsSync(toolJsonPath)) {
      console.warn(
        `[manifest] 工具目录 ${slug} 下未找到 tool.json，跳过该工具的 manifest 生成。`,
      );
      continue;
    }

    try {
      const baseConfig = readJson(toolJsonPath);
      generateManifestForTool(slug, baseConfig, navItems);

      const outDir = path.join(PUBLIC_TOOLS_DIR, slug);
      for (const locale of SUPPORTED_LOCALES) {
        const overridePath = path.join(TOOLS_DIR, slug, `tool.${locale}.json`);
        const overrideConfig = readOptionalJson(overridePath);
        const localizedConfig = mergeToolConfig(baseConfig, overrideConfig);
        localizedConfig.lang =
          typeof overrideConfig?.lang === "string" && overrideConfig.lang.trim()
            ? overrideConfig.lang.trim()
            : locale === "en-us"
              ? "en-US"
              : "zh-CN";
        if (localizedConfig.icon && typeof localizedConfig.icon === "string" && !localizedConfig.icon.startsWith("/")) {
          localizedConfig.icon = `/${localizedConfig.icon}`;
        }

        const localizedOutPath = path.join(outDir, `tool.${locale}.json`);
        fs.writeFileSync(localizedOutPath, `${JSON.stringify(localizedConfig, null, 2)}\n`, "utf8");

        const category =
          typeof localizedConfig.category === "string" && localizedConfig.category.trim()
            ? localizedConfig.category.trim()
            : "其他工具";
        const keywords = Array.isArray(localizedConfig.keywords)
          ? localizedConfig.keywords.map((keyword) => String(keyword))
          : [];

        navItemsByLocale[locale].push({
          slug,
          path: `/tools/${slug}`,
          name: localizedConfig.name,
          shortName: localizedConfig.shortName || localizedConfig.name,
          description: localizedConfig.description,
          category,
          icon: localizedConfig.icon || "/icon.svg",
          keywords,
        });
      }

      const pagePath = path.join(TOOLS_DIR, slug, "page.tsx");
      if (fs.existsSync(pagePath)) {
        const pageRaw = fs.readFileSync(pagePath, "utf8");
        const importMatches = [...pageRaw.matchAll(/import\s+\w+\s+from\s+["']\.\/([^"']+)["'];/g)].map(
          (m) => m[1],
        );
        const clientImport = importMatches[0] ?? null;
        if (clientImport) toolRegistryEntries.push({ slug, importPath: `./${slug}/${clientImport}` });
      }
    } catch (error) {
      console.error(
        `[manifest] 解析 ${toolJsonPath} 时出错，已跳过该工具。`,
        error,
      );
    }
  }

  writeNavData(navItems);
  for (const locale of SUPPORTED_LOCALES) {
    writeNavDataForLocale(locale, navItemsByLocale[locale]);
  }
  toolRegistryEntries.sort((a, b) => String(a.slug).localeCompare(String(b.slug), "en"));
  writeToolRegistry(toolRegistryEntries);
}

main();
