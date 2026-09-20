#!/usr/bin/env node

/**
 * Ensure RealCUGAN static assets exist when using local `/vendor` base.
 *
 * - If NEXT_PUBLIC_R2_ASSETS_URL is an http(s) URL, assets are expected to be hosted remotely.
 * - Otherwise, assets must exist under `public/vendor/realcugan/` for static export deployments.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const base = String(process.env.NEXT_PUBLIC_R2_ASSETS_URL || "").trim();
const usesRemoteAssets = /^https?:\/\//iu.test(base);

if (usesRemoteAssets) {
  process.exit(0);
}

const realcuganDir = path.join(ROOT, "public", "vendor", "realcugan");
const requiredFilesThreads = [
  "realcugan-ncnn-webassembly-simd-threads.js",
  "realcugan-ncnn-webassembly-simd-threads.wasm",
  "realcugan-ncnn-webassembly-simd-threads.data",
  "realcugan-ncnn-webassembly-simd-threads.worker.js",
];
const requiredFilesStandard = [
  "realcugan-ncnn-webassembly-simd.js",
  "realcugan-ncnn-webassembly-simd.wasm",
  "realcugan-ncnn-webassembly-simd.data",
];

async function main() {
  const checkList = async (files) => {
    for (const f of files) {
      try {
        await fs.access(path.join(realcuganDir, f));
      } catch {
        return false;
      }
    }
    return true;
  };

  const hasThreads = await checkList(requiredFilesThreads);
  const hasStandard = await checkList(requiredFilesStandard);

  if (hasThreads || hasStandard) return;

  console.error("[realcugan] 缺少本地静态资源（用于纯静态部署）:");
  for (const f of requiredFilesThreads) console.error(`  - public/vendor/realcugan/${f}`);
  console.error("\n解决方案（二选一）：");
  console.error("1) 把上述文件放入 `public/vendor/realcugan/`（会随 `out/` 一起上传到静态托管/CDN）");
  console.error("2) 配置 `NEXT_PUBLIC_R2_ASSETS_URL` 为远程资源域名（例如 https://assets.example.com），并确保对应文件可访问");
  process.exit(1);
}

await main();

