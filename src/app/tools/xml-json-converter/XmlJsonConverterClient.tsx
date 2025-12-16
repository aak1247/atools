"use client";

import { type ChangeEvent, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

interface ConversionOptions {
  indentSize: number;
  attributesToProperties: boolean;
  textContentToValue: boolean;
  compactOutput: boolean;
}

interface ConversionResult {
  json: string;
  error?: string;
  warnings?: string[];
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// XML转JSON转换器类
class XmlJsonConverter {
  static convert(xmlString: string, options: ConversionOptions): ConversionResult {
    const warnings: string[] = [];

    try {
      // 使用浏览器内置的DOMParser解析XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'application/xml');

      // 检查解析错误
      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        return {
          json: '',
          error: `XML解析错误: ${parseError.textContent || '未知错误'}`
        };
      }

      // 检查根元素
      const rootElement = xmlDoc.documentElement;
      if (!rootElement) {
        return {
          json: '',
          error: 'XML文档没有根元素'
        };
      }

      // 递归转换XML节点为JSON对象
      const jsonResult = this.xmlElementToJson(rootElement, options, warnings);

      // 格式化JSON输出
      let formattedJson: string;
      if (options.compactOutput) {
        formattedJson = JSON.stringify(jsonResult);
      } else {
        formattedJson = JSON.stringify(jsonResult, null, options.indentSize);
      }

      return {
        json: formattedJson,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      return {
        json: '',
        error: error instanceof Error ? error.message : '转换失败'
      };
    }
  }

  private static xmlElementToJson(element: Element, options: ConversionOptions, warnings: string[]): JsonValue {
    const result: { [key: string]: JsonValue } = {};

    // 处理子元素
    const childNodes = Array.from(element.childNodes);
    const elementChildren = childNodes.filter((node): node is Element => node.nodeType === Node.ELEMENT_NODE);
    const textContent = element.textContent?.trim() || '';

    // 处理属性
    if (element.attributes && element.attributes.length > 0) {
      if (options.attributesToProperties) {
        // 将属性转换为JSON属性
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          result[`@${attr.name}`] = attr.value;
        }
      }
    }

    // 处理子元素
    if (elementChildren.length > 0) {
      const childMap = new Map<string, JsonValue[]>();

      for (const child of elementChildren) {
        const childName = child.nodeName;
        const childJson = this.xmlElementToJson(child, options, warnings);

        if (!childMap.has(childName)) {
          childMap.set(childName, []);
        }
        childMap.get(childName)!.push(childJson);
      }

      // 处理重复子元素（数组）和单一子元素
      for (const [childName, childArray] of childMap) {
        if (childArray.length === 1) {
          result[childName] = childArray[0];
        } else {
          // 检查是否所有子元素都是简单的值类型
          const allSimpleValues = childArray.every(item =>
            typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
          );

          if (allSimpleValues) {
            result[childName] = childArray;
          } else {
            result[childName] = childArray;
          }
        }
      }
    }

    // 处理文本内容
    if (textContent && elementChildren.length === 0) {
      if (options.textContentToValue) {
        return textContent;
      } else {
        result['#text'] = textContent;
      }
    }

    // 如果没有属性和子元素，返回简单值
    if (Object.keys(result).length === 0) {
      return '';
    }

    // 如果只有文本内容且没有其他属性，返回文本
    if (Object.keys(result).length === 1 && result['#text'] && elementChildren.length === 0) {
      return result['#text'];
    }

    return result;
  }

  static validateXml(xmlString: string): { isValid: boolean; error?: string } {
    if (!xmlString.trim()) {
      return { isValid: false, error: 'XML内容为空' };
    }

    if (!xmlString.includes('<') || !xmlString.includes('>')) {
      return { isValid: false, error: '无效的XML格式' };
    }

    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'application/xml');

      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        return { isValid: false, error: 'XML语法错误' };
      }

      const rootElement = xmlDoc.documentElement;
      if (!rootElement) {
        return { isValid: false, error: 'XML文档没有根元素' };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'XML解析失败' };
    }
  }

  static formatXml(xmlString: string): string {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
      const serializer = new XMLSerializer();
      const formattedXml = serializer.serializeToString(xmlDoc);

      // 简单的格式化处理
      return formattedXml
        .replace(/></g, '>\n<')
        .replace(/(\s+)([a-zA-Z].*?>)/g, '\n$1$2')
        .replace(/(\/>)\n/g, '$1\n')
        .replace(/^\n+|\n+$/g, '');
    } catch (error) {
      return xmlString; // 格式化失败时返回原始字符串
    }
  }
}

// 示例XML数据
const XML_EXAMPLES = [
  {
    name: '简单XML',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<book>
  <title>JavaScript权威指南</title>
  <author>David Flanagan</author>
  <price>39.99</price>
  <available>true</available>
</book>`
  },
  {
    name: '包含属性的XML',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<user id="123" status="active">
  <name>张三</name>
  <email>zhangsan@example.com</email>
  <roles>
    <role>admin</role>
    <role>editor</role>
  </roles>
</user>`
  },
  {
    name: '复杂嵌套XML',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<products>
  <category id="electronics">
    <name>电子产品</name>
    <products>
      <product sku="P001" price="999.99">
        <name>智能手机</name>
        <brand>Apple</brand>
        <specs>
          <screen size="6.1">OLED</screen>
          <ram>8GB</ram>
          <storage>256GB</storage>
        </specs>
      </product>
      <product sku="P002" price="599.99">
        <name>平板电脑</name>
        <brand>Samsung</brand>
      </product>
    </products>
  </category>
</products>`
  },
  {
    name: '包含CDATA的XML',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<message>
  <title>Hello World</title>
  <content><![CDATA[这是一个包含特殊字符的内容：& < > " ']]></content>
  <description>正常文本内容</description>
</message>`
  }
];

export default function XmlJsonConverterClient() {
  const [xmlInput, setXmlInput] = useState("");
  const [jsonOutput, setJsonOutput] = useState("");
  const [options, setOptions] = useState<ConversionOptions>({
    indentSize: 2,
    attributesToProperties: true,
    textContentToValue: true,
    compactOutput: false
  });
  const [validation, setValidation] = useState<{ isValid: boolean; error?: string } | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setXmlInput(content);
        setFileInfo({ name: file.name, size: file.size });

        // 验证XML
        const result = XmlJsonConverter.validateXml(content);
        setValidation(result);

        // 自动转换
        if (result.isValid) {
          convertXmlToJson(content);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleXmlInputChange = (content: string) => {
    setXmlInput(content);
    setFileInfo(null);

    if (content.trim()) {
      const result = XmlJsonConverter.validateXml(content);
      setValidation(result);

      if (result.isValid) {
        convertXmlToJson(content);
      } else {
        setJsonOutput('');
        setConversionResult(null);
      }
    } else {
      setValidation(null);
      setJsonOutput('');
      setConversionResult(null);
    }
  };

  const convertXmlToJson = (xmlString: string) => {
    const result = XmlJsonConverter.convert(xmlString, options);
    setJsonOutput(result.json);
    setConversionResult(result);
  };

  const handleExampleSelect = (exampleXml: string) => {
    setXmlInput(exampleXml);
    setFileInfo(null);

    const result = XmlJsonConverter.validateXml(exampleXml);
    setValidation(result);

    if (result.isValid) {
      convertXmlToJson(exampleXml);
    }
  };

  const handleOptionChange = <K extends keyof ConversionOptions>(key: K, value: ConversionOptions[K]) => {
    const newOptions = { ...options, [key]: value } as ConversionOptions;
    setOptions(newOptions);

    // 如果有有效的XML，重新转换
    if (xmlInput.trim() && validation?.isValid) {
      const result = XmlJsonConverter.convert(xmlInput, newOptions);
      setJsonOutput(result.json);
      setConversionResult(result);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonOutput);
  };

  const handleFormatXml = () => {
    const formattedXml = XmlJsonConverter.formatXml(xmlInput);
    setXmlInput(formattedXml);
  };

  const handleDownloadJson = () => {
    if (jsonOutput) {
      const blob = new Blob([jsonOutput], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `converted-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleReset = () => {
    setXmlInput('');
    setJsonOutput('');
    setFileInfo(null);
    setValidation(null);
    setConversionResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <ToolPageLayout toolSlug="xml-json-converter">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            XML转JSON转换器
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            🔄 免费在线XML转JSON工具 - 智能解析XML结构，转换为JSON格式。
            100%本地处理，无需注册，保护您的数据隐私。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* XML输入区域 */}
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">XML输入</h2>
                {fileInfo && (
                  <span className="text-xs text-slate-600">
                    {fileInfo.name} ({Math.round(fileInfo.size / 1024)}KB)
                  </span>
                )}
              </div>

              {/* 文件选择 */}
              <div className="flex gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xml,text/xml"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                >
                  选择XML文件
                </button>
                <button
                  onClick={handleFormatXml}
                  disabled={!xmlInput.trim()}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  格式化XML
                </button>
              </div>

              {/* XML文本输入 */}
              <div>
                <textarea
                  value={xmlInput}
                  onChange={(e) => handleXmlInputChange(e.target.value)}
                  placeholder="在此输入XML代码，或选择文件后自动填充..."
                  className="w-full h-64 px-3 py-2 border border-slate-200 rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* 示例XML */}
              <div>
                <h3 className="text-sm font-medium text-slate-900 mb-2">示例XML</h3>
                <div className="space-y-2">
                  {XML_EXAMPLES.map((example, index) => (
                    <button
                      key={index}
                      onClick={() => handleExampleSelect(example.xml)}
                      className="w-full text-left px-3 py-2 text-sm bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 transition"
                    >
                      <div className="font-medium text-slate-900">{example.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 验证状态 */}
              {validation && (
                <div className={`p-3 rounded-lg ${
                  validation.isValid
                    ? 'border border-green-200 bg-green-50'
                    : 'border border-red-200 bg-red-50'
                }`}>
                  <p className={`text-sm ${
                    validation.isValid ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {validation.isValid ? '✓ XML格式正确' : `❌ ${validation.error}`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* JSON输出区域 */}
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-5 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">JSON输出</h2>

              {/* 转换选项 */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-slate-900">转换选项</h3>

                <label className="flex items-center">
                  <input
                    type="number"
                    min="0"
                    max="8"
                    value={options.indentSize}
                    onChange={(e) => handleOptionChange('indentSize', Number(e.target.value))}
                    className="w-16 px-2 py-1 border border-slate-200 rounded text-sm"
                  />
                  <span className="ml-2 text-sm text-slate-600">缩进空格数</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={options.compactOutput}
                    onChange={(e) => handleOptionChange('compactOutput', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-slate-600">紧凑输出</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={options.attributesToProperties}
                    onChange={(e) => handleOptionChange('attributesToProperties', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-slate-600">属性转为JSON属性</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={options.textContentToValue}
                    onChange={(e) => handleOptionChange('textContentToValue', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-slate-600">文本内容转为值</span>
                </label>
              </div>

              {/* JSON输出 */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-slate-700">JSON结果</span>
                  {jsonOutput && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleCopyJson}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                      >
                        复制
                      </button>
                      <button
                        onClick={handleDownloadJson}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition"
                      >
                        下载
                      </button>
                    </div>
                  )}
                </div>
                <textarea
                  value={jsonOutput}
                  readOnly
                  placeholder="转换后的JSON将显示在这里..."
                  className="w-full h-64 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 font-mono text-sm resize-none"
                />
              </div>

              {/* 转换结果警告 */}
              {conversionResult?.warnings && conversionResult.warnings.length > 0 && (
                <div className="p-3 rounded-lg border border-yellow-200 bg-yellow-50">
                  <p className="text-sm text-yellow-700">⚠️ 注意事项:</p>
                  <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside">
                    {conversionResult.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 统计信息 */}
              {jsonOutput && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-600">XML长度:</span>
                      <span className="ml-2 font-medium text-slate-900">{xmlInput.length} 字符</span>
                    </div>
                    <div>
                      <span className="text-slate-600">JSON长度:</span>
                      <span className="ml-2 font-medium text-slate-900">{jsonOutput.length} 字符</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            选择文件
          </button>
          <button
            onClick={handleReset}
            className="px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition"
          >
            重置
          </button>
        </div>

        {/* 使用说明 */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">使用说明</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-900">支持的功能</h3>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• XML语法验证</li>
                <li>• 智能JSON结构转换</li>
                <li>• 属性处理和保留</li>
                <li>• CDATA内容处理</li>
                <li>• 复杂嵌套结构支持</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-900">转换说明</h3>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• XML元素转为JSON对象</li>
                <li>• 多个子元素转为数组</li>
                <li>• 属性添加@前缀标识</li>
                <li>• 文本内容自动处理</li>
                <li>• 支持格式化和紧凑输出</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
