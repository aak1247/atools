import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.resolve(p), "utf-8");

test("图片编辑模块导出旋转/裁剪/缩放与 EXIF 解析能力", () => {
  const content = read("src/app/tools/image-to-pdf/imageEdit.ts");

  assert.ok(content.includes("export const loadBitmap"), "必须导出 loadBitmap");
  assert.ok(
    content.includes('imageOrientation: "from-image"'),
    "解码时必须显式应用 EXIF 方向，保持与系统显示一致",
  );
  assert.ok(content.includes("export const parseJpegOrientation"), "必须导出 parseJpegOrientation");
  assert.ok(content.includes("export const rotateCropRect"), "必须导出 rotateCropRect");
  assert.ok(content.includes("export const drawEditedImage"), "必须导出 drawEditedImage");
  assert.ok(content.includes("export const bakeImageToBytes"), "必须导出 bakeImageToBytes");
  assert.ok(content.includes("export const outputSize"), "必须导出 outputSize");
});

test("生成时保持原方向：默认方向为自动跟随图片，未编辑的 JPEG 直接嵌入", () => {
  const content = read("src/app/tools/image-to-pdf/ImageToPdfClient.tsx");

  assert.ok(
    content.includes('useState<OrientationPreset>("auto")'),
    "默认方向必须为自动（跟随图片）",
  );
  assert.ok(content.includes("parseJpegOrientation"), "必须解析 JPEG EXIF 方向，纠正手机照片方向");
  assert.ok(
    content.includes("isIdentityEdit(it.edit)"),
    "未编辑的图片必须走直嵌路径，保留原始字节",
  );
  assert.ok(content.includes("outputSize(it.edit"), "页面尺寸与适配必须基于编辑后的输出尺寸");
});

test("页面结构模拟预览与原地 PDF 预览", () => {
  const content = read("src/app/tools/image-to-pdf/ImageToPdfClient.tsx");

  assert.ok(content.includes("resolvePagePt"), "模拟预览与生成必须共用页面尺寸计算");
  assert.ok(content.includes("PageThumb"), "必须提供单页模拟渲染组件");
  assert.ok(content.includes("aspectRatio"), "页面必须按最终 pt 比例渲染");
  assert.ok(content.includes('useState<PreviewMode>("simulate")') || content.includes('previewMode'), "生成后必须支持原地切换 PDF 视图");
  assert.ok(content.includes("structureKey"), "图片或设置变化后已生成 PDF 必须失效");
});

test("编辑器支持等比例缩放（角点）、单方向缩放（边点）与裁剪", () => {
  const content = read("src/app/tools/image-to-pdf/ImageEditorModal.tsx");

  assert.ok(content.includes('kind: "scale"'), "必须包含缩放交互");
  assert.ok(content.includes('kind: "crop"'), "必须包含裁剪交互");
  assert.ok(
    content.includes("drag.handle.length === 2"),
    "角点控制柄必须走等比例缩放分支",
  );
  assert.ok(content.includes('"move"'), "裁剪区域必须支持整体移动");
  assert.ok(content.includes("rotateCropRect"), "旋转后裁剪框必须随内容变换");
});

test("工具 UI 配置项与多语言键一致性", () => {
  const zhPath = "src/app/tools/image-to-pdf/tool.json";
  const enPath = "src/app/tools/image-to-pdf/tool.en-us.json";

  const zh = JSON.parse(read(zhPath));
  const en = JSON.parse(read(enPath));

  for (const key of ["orientationAuto", "edit", "editedBadge", "pdfPreview"]) {
    assert.ok(zh.ui[key], `中文配置必须包含 ${key}`);
    assert.ok(en.ui[key], `英文配置必须包含 ${key}`);
  }

  const zhKeys = Object.keys(zh.ui).sort();
  const enKeys = Object.keys(en.ui).sort();
  assert.deepEqual(zhKeys, enKeys, "中文与英文 UI 键必须严格保持一致");
});
