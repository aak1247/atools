import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TOOLS_DIR = path.join(ROOT, "src", "app", "tools");
const PUBLIC_TOOLS_DIR = path.join(ROOT, "public", "tools");

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

function generateManifestForTool(slug, config) {
  /** @type {ToolConfig} */
  const tool = config;

  if (!tool.name || !tool.description) {
    console.warn(
      `[manifest] 工具 ${slug} 的 tool.json 中缺少必填字段 name/description，已跳过。`,
    );
    return;
  }

  const basePath = `/tools/${slug}`;

  const startUrl = tool.startUrl || basePath;
  const scope = tool.scope || basePath;
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

  const outPath = path.join(outDir, "manifest.webmanifest");
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`[manifest] 已生成 ${outPath}`);
}

function main() {
  if (!fs.existsSync(TOOLS_DIR)) {
    console.warn(
      `[manifest] 未找到工具目录: ${TOOLS_DIR}，跳过 manifest.webmanifest 生成。`,
    );
    return;
  }

  ensureDir(PUBLIC_TOOLS_DIR);

  const entries = fs.readdirSync(TOOLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const slug = entry.name;
    const toolJsonPath = path.join(TOOLS_DIR, slug, "tool.json");

    if (!fs.existsSync(toolJsonPath)) {
      console.warn(
        `[manifest] 工具目录 ${slug} 下未找到 tool.json，跳过该工具的 manifest 生成。`,
      );
      continue;
    }

    try {
      const config = readJson(toolJsonPath);
      generateManifestForTool(slug, config);
    } catch (error) {
      console.error(
        `[manifest] 解析 ${toolJsonPath} 时出错，已跳过该工具。`,
        error,
      );
    }
  }
}

main();
