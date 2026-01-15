#!/usr/bin/env node

/**
 * 从 out 目录删除大文件（FFmpeg、RealCUGAN 等）
 * 这些文件应该从 R2 加载，不应该包含在 Workers 部署中
 *
 * 用法:
 *   npm run clean:assets
 *   node scripts/clean-large-assets.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "out");

// 要删除的大文件目录
const LARGE_ASSET_DIRS = [
  "vendor/ffmpeg",
  "vendor/realcugan",
];

async function main() {
  console.log("🧹 清理 out 目录中的大文件...\n");

  for (const dir of LARGE_ASSET_DIRS) {
    const fullPath = path.join(OUT_DIR, dir);
    try {
      await fs.rm(fullPath, { recursive: true, force: true });
      console.log(`  ✓ 已删除: out/${dir}`);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error(`  ✗ 删除失败: out/${dir}`, error.message);
      }
    }
  }

  // 检查 vendor 目录是否为空，如果为空则删除
  const vendorPath = path.join(OUT_DIR, "vendor");
  try {
    const entries = await fs.readdir(vendorPath);
    if (entries.length === 0) {
      await fs.rmdir(vendorPath);
      console.log(`  ✓ 已删除空目录: out/vendor`);
    }
  } catch {
    // 目录不存在或无法读取，忽略
  }

  console.log("\n✅ 清理完成！大文件将从 R2 加载。");
}

main().catch((error) => {
  console.error("❌ 清理失败:", error);
  process.exit(1);
});
