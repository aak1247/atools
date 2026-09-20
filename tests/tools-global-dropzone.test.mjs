import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const TOOLS_DIR = path.join(ROOT_DIR, "src", "app", "tools");
const REGISTRY_FILE = path.join(TOOLS_DIR, "tool-registry.ts");

describe("全站 globalDropZone 工具页面健全性测试", () => {
  test("所有在 tool-registry 中声明 globalDropZone 的工具页面均具备文件上传入口", () => {
    assert.ok(fs.existsSync(REGISTRY_FILE), "tool-registry.ts 文件必须存在");
    const registryContent = fs.readFileSync(REGISTRY_FILE, "utf-8");

    // 提取所有配置了 globalDropZone: true 的 slug
    const globalDropZoneSlugs = [];
    const matchRegex = /"([^"]+)":\s*\{[^}]*"globalDropZone":\s*true[^}]*\}/g;
    let match;
    while ((match = matchRegex.exec(registryContent)) !== null) {
      globalDropZoneSlugs.push(match[1]);
    }

    assert.ok(globalDropZoneSlugs.length > 0, "应检测到开启 globalDropZone 的工具");

    const issues = [];

    for (const slug of globalDropZoneSlugs) {
      const toolDir = path.join(TOOLS_DIR, slug);
      if (!fs.existsSync(toolDir)) {
        issues.push(`[${slug}] 目录不存在: ${toolDir}`);
        continue;
      }

      // 寻找 Client 组件文件
      const files = fs.readdirSync(toolDir);
      const clientFile = files.find((f) => f.endsWith("Client.tsx"));
      if (!clientFile) {
        issues.push(`[${slug}] 缺少 Client 组件 (如 ${slug}Client.tsx)`);
        continue;
      }

      const clientFilePath = path.join(toolDir, clientFile);
      const clientContent = fs.readFileSync(clientFilePath, "utf-8");

      // 验证是否具备可用的上传机制：
      // 1. input type="file" 或者
      // 2. useFileDropzone 或者
      // 3. onDrop 监听器
      const hasFileInput = clientContent.includes('type="file"') || clientContent.includes("type='file'");
      const hasDropzoneHook = clientContent.includes("useFileDropzone");
      const hasOnDrop = clientContent.includes("onDrop");

      if (!hasFileInput && !hasDropzoneHook && !hasOnDrop) {
        issues.push(`[${slug}] 开启了 globalDropZone 但组件内未找到 file input 或 drop 处理`);
      }

      // 验证是否存在子组件私自绑定 window.addEventListener("drop") 的情况（防止冲突）
      if (clientContent.includes('window.addEventListener("drop"') || clientContent.includes("window.addEventListener('drop'")) {
        issues.push(`[${slug}] 禁止在子组件直接绑定全局 window drop 监听器，应统一由 DesignUploadEnhancer 托管`);
      }
    }

    assert.deepEqual(issues, [], `全站开启 globalDropZone 的工具页面检查发现异常:\n${issues.join("\n")}`);
  });
});
