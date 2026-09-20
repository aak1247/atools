import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("WebGPU 模块构建与 WGSL 语法完备性", () => {
  const filePath = path.resolve("src/lib/webgpu-upscaler.ts");
  assert.ok(fs.existsSync(filePath), "webgpu-upscaler.ts 必须存在");

  const content = fs.readFileSync(filePath, "utf-8");

  // 必须导出核心函数与类型
  assert.ok(content.includes("export async function checkWebGPUSupport"), "必须导出 checkWebGPUSupport");
  assert.ok(content.includes("export async function upscaleImageWebGPU"), "必须导出 upscaleImageWebGPU");

  // 检查 WGSL 核心 Pass 定义
  assert.ok(content.includes("EASU_WGSL"), "必须包含 EASU 定向插值着色器");
  assert.ok(content.includes("RCAS_WGSL"), "必须包含 RCAS 自适应锐化着色器");
  assert.ok(content.includes("@fragment"), "WGSL 必须包含片元着色器入口");
  assert.ok(content.includes("@vertex"), "WGSL 必须包含顶点着色器入口");
});

test("工具 UI 配置项与多语言键一致性", () => {
  const zhPath = path.resolve("src/app/tools/image-upscaler/tool.json");
  const enPath = path.resolve("src/app/tools/image-upscaler/tool.en-us.json");

  const zh = JSON.parse(fs.readFileSync(zhPath, "utf-8"));
  const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));

  assert.ok(zh.ui.modeWebGPU, "中文配置必须包含 modeWebGPU");
  assert.ok(en.ui.modeWebGPU, "英文配置必须包含 modeWebGPU");
  assert.ok(zh.ui.presetAnime, "中文配置必须包含 presetAnime");
  assert.ok(en.ui.presetAnime, "英文配置必须包含 presetAnime");

  const zhKeys = Object.keys(zh.ui).sort();
  const enKeys = Object.keys(en.ui).sort();
  assert.deepEqual(zhKeys, enKeys, "中文与英文 UI 键必须严格保持一致");
});
