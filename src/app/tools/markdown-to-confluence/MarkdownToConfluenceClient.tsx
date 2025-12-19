"use client";

import { useState, useEffect, useRef } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

// 中文默认值
const DEFAULT_UI = {
  title: "Markdown转Confluence转换器",
  inputLabel: "Markdown输入",
  outputLabel: "Confluence输出",
  previewLabel: "预览",
  formatLabel: "输出格式",
  copyButton: "复制到剪贴板",
  uploadButton: "上传.md文件",
  clearButton: "清空",
  inputPlaceholder: "在此粘贴Markdown内容...",
  outputPlaceholder: "Confluence格式化内容将显示在这里...",
  uploadSuccess: "文件上传成功！",
  copySuccess: "已复制到剪贴板！",
  conversionError: "转换错误：{message}",
  enterpriseWiki: "企业维基",
  wikiMarkup: "进行标记 (Wiki Markup)",
  storageFormat: "存储格式 (XML)",
  sampleText: "试试示例Markdown",
  realTimePreview: "实时预览",
  copyFailed: "复制失败，请重试",
  fileError: "文件错误：{message}",
  unsupportedFormat: "不支持的文件格式",
  description: "将Markdown格式转换为Confluence Wiki Markup格式",
  enterpriseWikiDescription: "企业维基格式：适用于企业版 Confluence，提供更丰富的格式支持",
  wikiMarkupDescription: "Wiki Markup 标准格式：适用于所有 Confluence 版本，兼容性最好",
  featuresTitle: "支持的转换功能：",
  wikiFormatFeatures: "Wiki Markup 格式",
  enterpriseFormatFeatures: "企业维基格式",
  features: {
    wikiHeaders: "标题转换 (保持 #/##/###/#### 格式)",
    wikiTextStyles: "文本样式 (保持 **粗体**、*斜体* 格式)",
    wikiCodeBlocks: "代码块 (保持 ``` 格式)",
    wikiInlineCode: "行内代码 (保持 `code` 格式)",
    wikiLists: "列表 (保持 * 和 1. 格式)",
    wikiQuotes: "引用块 (保持 > 格式)",
    enterpriseHeaders: "标题转换 (#/##/###/#### → h1./h2./h3./h4.)",
    enterpriseTextStyles: "文本样式 (**粗体** → *粗体*, *斜体* → _斜体_)",
    enterpriseCodeBlocks: "代码块 (``` → {code:language=...})",
    enterpriseInlineCode: "行内代码 (`code` → {{code}})",
    enterpriseLists: "列表转换 (* → #, 支持嵌套)",
    enterpriseQuotes: "引用块 (> → bq.)",
    tables: "表格格式 (|列1|列2| → Confluence表格)",
    links: "链接转换 ([text](url) → [text|url])",
    images: "图片转换 (![alt](url) → !url!)",
    separator: "分割线 (--- → ----)"
  },
  formatDescription: {
    wiki: " Wiki Markup 更接近原生 Markdown 语法，适用于所有 Confluence 版本，直接粘贴即可使用。",
    enterprise: " 企业维基使用 Confluence 特有语法，如 h1. 标题、{{代码}} 等，需要配合相应插件使用。"
  },
  charactersCount: "字符",
  formatNote: "格式说明："
} as const;

type MarkdownToConfluenceUi = typeof DEFAULT_UI;

type OutputFormat = "enterprise" | "wiki" | "storage";

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
  console.log("Hello, Confluence!");

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

![示例图片](https://via.placeholder.com/300x200)

> 这是一个引用块
> 可以有多行

---

**注意**：这是一个转换示例`;

// Markdown转Confluence转换器
class MarkdownToConfluenceConverter {
  private outputFormat: OutputFormat;

  constructor(outputFormat: OutputFormat = "enterprise") {
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

    // 根据格式类型处理不同的语法
    if (this.outputFormat === 'wiki') {
      // Wiki Markup 格式处理
      // 首先恢复代码块内容（保持 ``` 格式）
      result = result.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        const blockIndex = parseInt(index);
        const originalCode = codeBlocks[blockIndex];
        return "```\n" + originalCode.trim() + "\n```";
      });

      // 粗体保持原样
      result = result.replace(/\*\*(.*?)\*\*/g, "**$1**");

      // 斜体保持原样
      result = result.replace(/(?<!\*)\*(?!\*)(.*?)\*(?!\*)/g, "*$1*");

      // 行内代码保持原样
      result = result.replace(/`([^`]+)`/g, "`$1`");

      // 无序列表保持原样
      result = result.replace(/^[\*\+\-] (.*)$/gim, "* $1");

      // 有序列表保持原样（修复错误）
      result = result.replace(/^\d+\. (.*)$/gim, "1. $1");

      // 引用块保持原样
      result = result.replace(/^> (.*)$/gim, "> $1");

      // 分割线保持原样
      result = result.replace(/^---+$/gim, "----");

      // Wiki Markup 格式不处理标题，保持原有的 # ## ### #### 格式
    } else {
      // 企业维基格式处理
      // 处理粗体 **text**
      result = result.replace(/\*\*(.*?)\*\*/g, "*$1*");

      // 处理斜体 *text*
      result = result.replace(/(?<!\*)\*(?!\*)(.*?)\*(?!\*)/g, "_$1_");

      // 处理行内代码 `code` (在代码块处理之后)
      result = result.replace(/`([^`]+)`/g, "{{$1}}");

      // 处理无序列表 - *. + -
      result = result.replace(/^[\*\+\-] (.*)$/gim, "* $1");

      // 处理有序列表
      result = result.replace(/^\d+\. (.*)$/gim, "# $1");

      // 处理嵌套列表 (缩进)
      result = result.replace(/^(\s*)\* (.*)$/gim, (match, indent, text) => {
        const indentLevel = Math.floor(indent.length / 2);
        return "  ".repeat(indentLevel) + "* " + text;
      });

      // 处理引用块 > text
      result = result.replace(/^> (.*)$/gim, "bq. $1");

      // 处理水平分割线
      result = result.replace(/^---+$/gim, "----");

      // 处理标题（企业维基格式）- 在恢复代码块之前处理
      result = result.replace(/^###### (.*$)/gim, "h6. $1");
      result = result.replace(/^##### (.*$)/gim, "h5. $1");
      result = result.replace(/^#### (.*$)/gim, "h4. $1");
      result = result.replace(/^### (.*$)/gim, "h3. $1");
      result = result.replace(/^## (.*$)/gim, "h2. $1");
      result = result.replace(/^# (.*$)/gim, "h1. $1");

      // 最后恢复代码块内容
      result = result.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        const blockIndex = parseInt(index);
        const originalCode = codeBlocks[blockIndex];
        return `{code:borderStyle=solid}\n${originalCode.trim()}\n{code}`;
      });
    }

    // 两种格式都需要处理的元素
    // 处理表格
    result = this.convertTables(result);

    // 处理链接 [text](url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[$1|$2]");

    // 处理图片 ![alt](url)
    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
      const altText = alt || "image";
      return `!${url}|alt=${altText}!`;
    });

    // 处理空行
    result = result.replace(/\n\s*\n/g, "\n\n");

    return result.trim();
  }

  private convertTables(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let inTable = false;
    let tableRows: string[] = [];

    const flushTable = () => {
      if (!tableRows.length) return;
      const tableConfluence = this.convertTableToConfluence(tableRows);
      if (tableConfluence) {
        result.push(tableConfluence);
      }
      tableRows = [];
    };

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (this.isTableRow(trimmedLine)) {
        inTable = true;
        tableRows.push(trimmedLine);
        continue;
      }

      if (inTable) {
        flushTable();
        inTable = false;
      }

      result.push(line);
    }

    if (inTable) {
      flushTable();
    }

    return result.join('\n');
  }

  private convertTableToConfluence(rows: string[]): string {
    if (!rows.length) return '';

    const parsedRows = rows
      .map(row => this.splitTableRow(row))
      .filter(cells => cells.length > 0);

    const dataRows = parsedRows.filter(cells => !this.isSeparatorRow(cells));
    if (!dataRows.length) return '';

    const formattedRows = dataRows.map((cells, index) => {
      const delimiter = index === 0 ? '||' : '|';
      return `${delimiter}${cells.join(delimiter)}${delimiter}`;
    });

    return formattedRows.join('\n');
  }

  private isTableRow(line: string): boolean {
    if (!line) return false;
    if (!line.startsWith('|')) return false;
    const pipeMatches = line.match(/\|/g);
    return !!pipeMatches && pipeMatches.length >= 2;
  }

  private splitTableRow(row: string): string[] {
    if (!row) return [];
    let normalized = row.trim();

    if (!normalized.startsWith('|')) {
      normalized = '|' + normalized;
    }
    if (!normalized.endsWith('|')) {
      normalized = normalized + '|';
    }

    return normalized
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
  }

  private isSeparatorRow(cells: string[]): boolean {
    if (!cells.length) return false;
    return cells.every(cell => {
      const trimmed = cell.trim();
      return trimmed.length > 0 && /^:?-{3,}:?$/.test(trimmed);
    });
  }
}

export default function MarkdownToConfluenceClient() {
  const [markdown, setMarkdown] = useState<string>("");
  const [confluenceOutput, setConfluenceOutput] = useState<string>("");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("enterprise");
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const config = useOptionalToolConfig("markdown-to-confluence");

  // 配置合并，英文优先，中文回退
  const ui: MarkdownToConfluenceUi = {
    ...DEFAULT_UI,
    ...((config?.ui ?? {}) as Partial<MarkdownToConfluenceUi>)
  };

  // 实时转换
  useEffect(() => {
    const converter = new MarkdownToConfluenceConverter(outputFormat);
    try {
      const result = converter.convert(markdown);
      setConfluenceOutput(result);
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
      await navigator.clipboard.writeText(confluenceOutput);
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
    setConfluenceOutput("");
    setError("");
    setCopySuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <ToolPageLayout toolSlug="markdown-to-confluence">
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
              <option value="enterprise">{ui.enterpriseWiki}</option>
              <option value="wiki">{ui.wikiMarkup}</option>
              <option value="storage" disabled>{ui.storageFormat} (开发中)</option>
            </select>
          </div>
          <div className="text-xs text-slate-500 text-center max-w-md">
            {outputFormat === 'enterprise' ?
              ui.enterpriseWikiDescription :
              ui.wikiMarkupDescription
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

          {/* Confluence 输出区 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-slate-700 font-semibold">{ui.outputLabel}</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">
                  {confluenceOutput.length} {ui.charactersCount}
                </span>
                <button
                  onClick={copyToClipboard}
                  disabled={!confluenceOutput}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  {ui.copyButton}
                </button>
              </div>
            </div>
            <div className="relative">
              <textarea
                value={confluenceOutput}
                readOnly
                placeholder={ui.outputPlaceholder}
                className="w-full h-96 p-4 border border-slate-300 rounded-2xl font-mono text-sm bg-slate-50 resize-none"
              />
            </div>
          </div>
        </div>

        {/* 使用说明 */}
        <div className="bg-slate-50 rounded-2xl p-6 text-sm text-slate-600">
          <h3 className="font-semibold text-slate-800 mb-3">{ui.featuresTitle}</h3>
          <div className="mb-4">
            <div className="font-medium text-slate-700 mb-2">
              {outputFormat === 'wiki' ? ui.wikiFormatFeatures : ui.enterpriseFormatFeatures}：
            </div>
            <ul className="space-y-2 grid md:grid-cols-2 gap-2">
              {outputFormat === 'wiki' ? (
                <>
                  <li>✅ {ui.features.wikiHeaders}</li>
                  <li>✅ {ui.features.wikiTextStyles}</li>
                  <li>✅ {ui.features.wikiCodeBlocks}</li>
                  <li>✅ {ui.features.wikiInlineCode}</li>
                  <li>✅ {ui.features.wikiLists}</li>
                  <li>✅ {ui.features.wikiQuotes}</li>
                </>
              ) : (
                <>
                  <li>✅ {ui.features.enterpriseHeaders}</li>
                  <li>✅ {ui.features.enterpriseTextStyles}</li>
                  <li>✅ {ui.features.enterpriseLists}</li>
                  <li>✅ {ui.features.enterpriseCodeBlocks}</li>
                  <li>✅ {ui.features.enterpriseInlineCode}</li>
                  <li>✅ {ui.features.enterpriseQuotes}</li>
                </>
              )}
              <li>✅ {ui.features.tables}</li>
              <li>✅ {ui.features.links}</li>
              <li>✅ {ui.features.images}</li>
              <li>✅ {ui.features.separator}</li>
            </ul>
          </div>
          <div className="text-xs text-slate-500 bg-blue-50 rounded-lg p-3">
            <strong>{ui.formatNote}</strong>
            {outputFormat === 'wiki'
              ? ui.formatDescription.wiki
              : ui.formatDescription.enterprise
            }
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}