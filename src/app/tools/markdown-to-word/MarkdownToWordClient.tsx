"use client";

import { useState, useEffect, useRef } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

// 中文默认值
const DEFAULT_UI = {
  title: "Markdown转Word内容转换器",
  inputLabel: "Markdown输入",
  outputLabel: "Word格式内容",
  previewLabel: "预览",
  formatLabel: "输出格式",
  copyButton: "复制到剪贴板",
  uploadButton: "上传.md文件",
  clearButton: "清空",
  inputPlaceholder: "在此粘贴Markdown内容...",
  outputPlaceholder: "Word格式化内容将显示在这里...",
  uploadSuccess: "文件上传成功！",
  copySuccess: "已复制到剪贴板！",
  conversionError: "转换错误：{message}",
  richTextFormat: "富文本格式",
  plainTextFormat: "纯文本格式",
  sampleText: "试试示例Markdown",
  realTimePreview: "实时预览",
  copyFailed: "复制失败，请重试",
  fileError: "文件错误：{message}",
  unsupportedFormat: "不支持的文件格式",
  pasteInstructions: "使用说明：复制下方内容，直接粘贴到Word文档中即可保留格式",
  description: "将Markdown格式转换为Word兼容格式，保留富文本样式",
  richTextDescription: "富文本格式：生成HTML格式，复制到Word中可保留完整的格式样式",
  plainTextDescription: "纯文本格式：保持原始Markdown格式，适合在Word中进行进一步编辑",
  charactersCount: "字符",
  featuresTitle: "支持的转换功能：",
  formatFeatures: {
    richtext: "富文本格式",
    plaintext: "纯文本格式"
  },
  richtextFeatures: {
    headers: "标题转换 (H1-H4 带样式)",
    textStyles: "文本样式 (粗体、斜体、下划线、删除线)",
    codeBlocks: "代码块 (带背景色和边框)",
    inlineCode: "行内代码 (背景色突出显示)",
    lists: "列表 (有序和无序列表)",
    tables: "表格 (带边框和表头样式)",
    quotes: "引用块 (左边框和背景色)",
    links: "链接 (可点击的蓝色链接)",
    images: "图片 (保持 ![alt](url) 格式)",
    separators: "水平分割线 (标准分割线)",
    paragraphSpacing: "段落间距 (标准行间距)"
  },
  plaintextFeatures: {
    headers: "标题格式 (保持 # ## ### ####)",
    textStyles: "文本样式 (保持 **粗体**、*斜体* 格式)",
    codeBlocks: "代码块 (保持 \`\`\` 格式)",
    inlineCode: "行内代码 (保持 \`code\` 格式)",
    lists: "列表 (保持 * 和 1. 格式)",
    tables: "表格 (保持 |列|列| 格式)",
    quotes: "引用块 (保持 &gt; 格式)",
    links: "链接 (保持 [text](url) 格式)",
    images: "图片 (保持 ![alt](url) 格式)",
    separators: "分割线 (保持 --- 格式)"
  },
  advantagesTitle: "优势说明：",
  advantagesDescription: "富文本格式直接在Word中显示最终效果，无需额外处理；纯文本格式保留Markdown语法，便于在Word中进一步编辑和样式调整。"
} as const;

type MarkdownToWordUi = typeof DEFAULT_UI;

type OutputFormat = "richtext" | "plaintext";

// 示例Markdown内容
const SAMPLE_MARKDOWN = `# 主要标题

这是一个**粗体**和*斜体*的示例，还有\`行内代码\`。

## 二级标题

### 三级标题

#### 四级标题

## 列表示例

### 无序列表
- 项目1
- 项目2
  - 嵌套项目1
  - 嵌套项目2

### 有序列表
1. 第一步
2. 第二步
3. 第三步

## 代码示例

### JavaScript 代码
\`\`\`javascript
function hello() {
  console.log("Hello, Word!");

  // 包含花括号的示例
  const data = {
    name: "test",
    value: 123
  };
}
\`\`\`

### Python 代码（包含注释）
\`\`\`python
# 这是一个Python函数
def calculate_distance(x1, y1, x2, y2):
    """
    计算两点之间的距离

    Args:
        x1, y1: 第一个点的坐标
        x2, y2: 第二个点的坐标

    Returns:
        float: 两点之间的距离
    """
    # 使用勾股定理计算距离
    distance = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    return distance

# 测试函数
result = calculate_distance(0, 0, 3, 4)  # 应该返回 5.0
print(f"距离: {result}")
\`\`\`

## 表格示例

| 坐标系 | 定义 | 备注 |
|--------|------|------|
| 世界坐标系（W） | 物理实体的3D坐标 | 单位m |
| 相机坐标系（C） | 以摄像头光心为原点 | Z轴朝向拍摄方向 |
| 图像坐标系（I） | 摄像头画面的2D像素坐标系 | 左上角为原点 |

## 链接和图片

[访问GitHub](https://github.com)

> 这是一个引用块
> 可以有多行

---

**注意**：这是一个转换示例

## 特殊格式

### 混合格式
这里有**粗体**和*斜体*，还有\`行内代码\`和[链接](https://example.com)的混合。

### 水平分割线
上面是水平分割线

### 下划线和删除线
~~这是删除线~~
<u>这是下划线</u>（HTML格式）`;

// Markdown转Word内容转换器
class MarkdownToWordConverter {
  private outputFormat: OutputFormat;

  constructor(outputFormat: OutputFormat = "richtext") {
    this.outputFormat = outputFormat;
  }

  convert(markdown: string): string {
    if (!markdown) return "";

    let result = markdown;

    // 首先提取和保护代码块内容
    const codeBlocks: string[] = [];
    result = result.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const index = codeBlocks.length;
      codeBlocks.push(code);
      return `__CODE_BLOCK_${index}__`;
    });

    if (this.outputFormat === 'plaintext') {
      // 纯文本格式处理
      // 恢复代码块内容
      result = result.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        const blockIndex = parseInt(index);
        const originalCode = codeBlocks[blockIndex];
        return originalCode.trim();
      });

      // 标题转换 - 保持原样
      // 文本样式保持原样
      // 列表保持原样
      // 引用块保持原样
      // 表格保持原样
    } else {
      // 富文本格式处理 - 生成HTML格式以便Word识别
      result = result.replace(/&/g, "&amp;");
      result = result.replace(/</g, "&lt;");
      result = result.replace(/>/g, "&gt;");

      // 恢复代码块内容并格式化
      result = result.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        const blockIndex = parseInt(index);
        const originalCode = codeBlocks[blockIndex];
        const escapedCode = originalCode
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<div style="background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; padding: 1em; margin: 1em 0; font-family: 'Courier New', monospace; white-space: pre-wrap;">${escapedCode}</div>`;
      });

      // 处理粗体 **text**
      result = result.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

      // 处理斜体 *text*
      result = result.replace(/(?<!\*)\*(?!\*)(.*?)\*(?!\*)/g, "<em>$1</em>");

      // 处理行内代码 `code`
      result = result.replace(/`([^`]+)`/g, "<code style=\"background-color: #f1f3f4; padding: 0.2em 0.4em; border-radius: 3px; font-family: 'Courier New', monospace;\">$1</code>");

      // 处理标题
      result = result.replace(/^#### (.*$)/gim, "<h4 style=\"font-size: 14pt; color: #2c3e50; margin: 16px 0 8px 0; font-weight: bold;\">$1</h4>");
      result = result.replace(/^### (.*$)/gim, "<h3 style=\"font-size: 16pt; color: #2c3e50; margin: 20px 0 10px 0; font-weight: bold;\">$1</h3>");
      result = result.replace(/^## (.*$)/gim, "<h2 style=\"font-size: 18pt; color: #2c3e50; margin: 24px 0 12px 0; font-weight: bold;\">$1</h2>");
      result = result.replace(/^# (.*$)/gim, "<h1 style=\"font-size: 22pt; color: #1a252f; margin: 28px 0 14px 0; font-weight: bold;\">$1</h1>");

      // 处理无序列表
      result = result.replace(/^[\*\+\-] (.*)$/gim, (match, text) => {
        return `<div style=\"margin: 4px 0; padding-left: 20px; position: relative;\"><span style=\"position: absolute; left: 0; color: #495057;\">•</span> ${text}</div>`;
      });

      // 处理有序列表
      result = result.replace(/^\d+\. (.*)$/gim, (match, text) => {
        const number = match.match(/^\d+/)?.[0] || "1";
        return `<div style=\"margin: 4px 0; padding-left: 30px; position: relative;\"><span style=\"position: absolute; left: 0; color: #495057; font-weight: bold;\">${number}.</span> ${text}</div>`;
      });

      // 处理引用块
      result = result.replace(/^> (.*)$/gim, "<div style=\"border-left: 4px solid #007bff; padding: 0.5em 1em; margin: 1em 0; background-color: #f8f9fa; color: #495057; font-style: italic;\">$1</div>");

      // 处理水平分割线
      result = result.replace(/^---+$/gim, "<hr style=\"border: none; border-top: 1px solid #dee2e6; margin: 2em 0;\" />");

      // 处理表格
      result = this.convertTablesToHtml(result);

      // 处理链接 [text](url)
      result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #007bff; text-decoration: underline;">$1</a>');

      // 处理图片 ![alt](url)
      result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
        const altText = alt || "image";
        return `<img src="${url}" alt="${altText}" style="max-width: 100%; height: auto; margin: 1em 0;" />`;
      });

      // 处理删除线
      result = result.replace(/~~(.*?)~~/g, "<del>$1</del>");

      // 处理下划线（HTML格式）
      result = result.replace(/<u>(.*?)<\/u>/g, "<u>$1</u>");

      // 处理换行和段落
      result = result.replace(/\n\s*\n/g, "</p><p style=\"margin: 1em 0; line-height: 1.6;\">");
      result = `<p style=\"margin: 1em 0; line-height: 1.6; font-family: 'Segoe UI', Arial, sans-serif;\">${result}</p>`;
    }

    return result.trim();
  }

  private convertTablesToHtml(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let inTable = false;
    let tableRows: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检查是否为表格行
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|') && trimmedLine.split('|').length > 3) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        tableRows.push(trimmedLine);
      } else if (inTable) {
        // 表格结束
        const tableHtml = this.convertTableToHtml(tableRows);
        result.push(tableHtml);
        inTable = false;
        tableRows = [];
        result.push(line);
      } else {
        result.push(line);
      }
    }

    // 处理文档末尾的表格
    if (inTable && tableRows.length > 0) {
      const tableHtml = this.convertTableToHtml(tableRows);
      result.push(tableHtml);
    }

    return result.join('\n');
  }

  private convertTableToHtml(rows: string[]): string {
    if (rows.length === 0) return '';

    // 过滤掉分隔行
    const dataRows = rows.filter(row => {
      const cells = row.split('|').slice(1, -1);
      return cells.some(cell => !cell.match(/^-+$/));
    });

    if (dataRows.length === 0) return '';

    let html = '<table style="border-collapse: collapse; width: 100%; margin: 1em 0;">';

    // 第一行作为表头
    if (dataRows.length > 0) {
      const headerCells = dataRows[0].split('|').slice(1, -1);
      html += '<thead><tr>';
      headerCells.forEach(cell => {
        html += `<th style="border: 1px solid #dee2e6; padding: 8px 12px; background-color: #f8f9fa; text-align: left; font-weight: bold;">${cell.trim()}</th>`;
      });
      html += '</tr></thead>';

      // 处理数据行
      const dataRowsOnly = dataRows.slice(1);
      if (dataRowsOnly.length > 0) {
        html += '<tbody>';
        dataRowsOnly.forEach(row => {
          const cells = row.split('|').slice(1, -1);
          html += '<tr>';
          cells.forEach(cell => {
            html += `<td style="border: 1px solid #dee2e6; padding: 8px 12px; text-align: left;">${cell.trim()}</td>`;
          });
          html += '</tr>';
        });
        html += '</tbody>';
      }
    }

    html += '</table>';
    return html;
  }
}

export default function MarkdownToWordClient() {
  const [markdown, setMarkdown] = useState<string>("");
  const [wordOutput, setWordOutput] = useState<string>("");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("richtext");
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const config = useOptionalToolConfig("markdown-to-word");

  // 配置合并，英文优先，中文回退
  const ui: MarkdownToWordUi = {
    ...DEFAULT_UI,
    ...((config?.ui ?? {}) as Partial<MarkdownToWordUi>)
  };

  // 实时转换
  useEffect(() => {
    const converter = new MarkdownToWordConverter(outputFormat);
    try {
      const result = converter.convert(markdown);
      setWordOutput(result);
      setError("");
    } catch (err) {
      setError(ui.conversionError.replace("{message}", err instanceof Error ? err.message : "未知错误"));
    }
  }, [markdown, outputFormat, ui.conversionError]);

  // 处理文件上传
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.md')) {
      setError(ui.unsupportedFormat);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setMarkdown(content);
      setError("");
    };
    reader.onerror = () => {
      setError(ui.fileError.replace("{message}", "文件读取失败"));
    };
    reader.readAsText(file);
  };

  // 复制到剪贴板
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(wordOutput);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setError(ui.copyFailed);
    }
  };

  // 加载示例
  const loadSample = () => {
    setMarkdown(SAMPLE_MARKDOWN);
  };

  // 清空内容
  const clearContent = () => {
    setMarkdown("");
    setWordOutput("");
    setError("");
    setCopySuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <ToolPageLayout toolSlug="markdown-to-word">
      <div className="space-y-6">
        {/* 工具标题和说明 */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{ui.title}</h1>
          <p className="text-slate-600">{ui.description}</p>
        </div>

        {/* 控制按钮 */}
        <div className="flex flex-wrap gap-3 justify-center">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".md"
              onChange={handleFileUpload}
              ref={fileInputRef}
              className="hidden"
            />
            <span className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition">
              📁 {ui.uploadButton}
            </span>
          </label>

          <button
            onClick={loadSample}
            className="px-4 py-2 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition"
          >
            📝 {ui.sampleText}
          </button>

          <button
            onClick={clearContent}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-2xl hover:bg-slate-200 transition"
          >
            🗑️ {ui.clearButton}
          </button>
        </div>

        {/* 格式选择 */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-4">
            <label className="text-slate-700 font-medium">{ui.formatLabel}:</label>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
              className="px-3 py-1 border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-none"
            >
              <option value="richtext">{ui.richTextFormat}</option>
              <option value="plaintext">{ui.plainTextFormat}</option>
            </select>
          </div>
          <div className="text-xs text-slate-500 text-center max-w-md">
            {outputFormat === 'richtext' ?
              ui.richTextDescription :
              ui.plainTextDescription
            }
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* 复制成功提示 */}
        {copySuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl">
            {ui.copySuccess}
          </div>
        )}

        {/* 主要内容区域 */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Markdown 输入区 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-slate-700 font-semibold">{ui.inputLabel}</label>
              <span className="text-sm text-slate-500">
                {markdown.length} {ui.charactersCount}
              </span>
            </div>
            <div className="relative">
              <textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                placeholder={ui.inputPlaceholder}
                className="w-full h-96 p-4 border border-slate-300 rounded-2xl font-mono text-sm focus:border-blue-500 focus:outline-none resize-none"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Word 输出区 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-slate-700 font-semibold">{ui.outputLabel}</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">
                  {wordOutput.length} {ui.charactersCount}
                </span>
                <button
                  onClick={copyToClipboard}
                  disabled={!wordOutput}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  {ui.copyButton}
                </button>
              </div>
            </div>
            <div className="relative">
              <textarea
                value={wordOutput}
                readOnly
                placeholder={ui.outputPlaceholder}
                className="w-full h-96 p-4 border border-slate-300 rounded-2xl font-mono text-sm bg-slate-50 resize-none"
              />
            </div>
          </div>
        </div>

        {/* 使用说明 */}
        <div className="bg-slate-50 rounded-2xl p-6 text-sm text-slate-600">
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="font-semibold text-blue-800 mb-2">📋 {ui.pasteInstructions}</div>
            <div className="text-blue-700">
              1. 点击"复制到剪贴板"按钮<br/>
              2. 打开Word文档<br/>
              3. 直接粘贴 (Ctrl+V)<br/>
              {outputFormat === 'richtext' ? '4. 格式和样式将自动保留' : '4. 可以在Word中应用样式'}
            </div>
          </div>

          <h3 className="font-semibold text-slate-800 mb-3">{ui.featuresTitle}</h3>
          <div className="mb-4">
            <div className="font-medium text-slate-700 mb-2">
              {outputFormat === 'richtext' ? ui.formatFeatures.richtext : ui.formatFeatures.plaintext}：
            </div>
            <ul className="space-y-2 grid md:grid-cols-2 gap-2">
              {outputFormat === 'richtext' ? (
                <>
                  <li>✅ {ui.richtextFeatures.headers}</li>
                  <li>✅ {ui.richtextFeatures.textStyles}</li>
                  <li>✅ {ui.richtextFeatures.codeBlocks}</li>
                  <li>✅ {ui.richtextFeatures.inlineCode}</li>
                  <li>✅ {ui.richtextFeatures.lists}</li>
                  <li>✅ {ui.richtextFeatures.tables}</li>
                  <li>✅ {ui.richtextFeatures.quotes}</li>
                  <li>✅ {ui.richtextFeatures.links}</li>
                  <li>✅ {ui.richtextFeatures.separators}</li>
                  <li>✅ {ui.richtextFeatures.paragraphSpacing}</li>
                </>
              ) : (
                <>
                  <li>✅ {ui.plaintextFeatures.headers}</li>
                  <li>✅ {ui.plaintextFeatures.textStyles}</li>
                  <li>✅ {ui.plaintextFeatures.codeBlocks}</li>
                  <li>✅ {ui.plaintextFeatures.inlineCode}</li>
                  <li>✅ {ui.plaintextFeatures.lists}</li>
                  <li>✅ {ui.plaintextFeatures.tables}</li>
                  <li>✅ {ui.plaintextFeatures.quotes}</li>
                  <li>✅ {ui.plaintextFeatures.links}</li>
                  <li>✅ {ui.plaintextFeatures.images}</li>
                  <li>✅ {ui.plaintextFeatures.separators}</li>
                </>
              )}
            </ul>
          </div>
          <div className="text-xs text-slate-500 bg-green-50 rounded-lg p-3">
            <strong>{ui.advantagesTitle}</strong>
            {ui.advantagesDescription}
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}