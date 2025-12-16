import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CORE_DIST_DIR = path.join(ROOT, "node_modules", "@ffmpeg", "core", "dist", "umd");
const OUT_DIR = path.join(ROOT, "public", "vendor", "ffmpeg", "core");

const FILES = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfChanged(from, to) {
  const [fromStat, toStat] = await Promise.all([
    fs.stat(from),
    exists(to).then((ok) => (ok ? fs.stat(to) : null)),
  ]);

  if (toStat && toStat.size === fromStat.size && toStat.mtimeMs >= fromStat.mtimeMs) {
    return false;
  }
  await fs.copyFile(from, to);
  return true;
}

async function main() {
  const distExists = await exists(CORE_DIST_DIR);
  if (!distExists) {
    throw new Error(
      `未找到 @ffmpeg/core 的 dist 目录：${CORE_DIST_DIR}。请先安装依赖（例如 yarn install / npm install）。`,
    );
  }

  await ensureDir(OUT_DIR);

  let copied = 0;
  for (const file of FILES) {
    const from = path.join(CORE_DIST_DIR, file);
    const to = path.join(OUT_DIR, file);
    const ok = await exists(from);
    if (!ok) {
      throw new Error(`未找到 FFmpeg core 文件：${from}`);
    }
    if (await copyIfChanged(from, to)) copied += 1;
  }

  console.log(`[ffmpeg] core 资源已就绪：${OUT_DIR}（更新 ${copied} 个文件）`);
}

main().catch((error) => {
  console.error("[ffmpeg] 复制 core 资源失败：", error);
  process.exitCode = 1;
});
