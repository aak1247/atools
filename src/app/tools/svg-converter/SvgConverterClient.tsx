"use client";

import { useState, useRef, useEffect } from "react";
import NextImage from "next/image";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

const DEFAULT_UI = {
  title: "SVG转PNG/JPG转换器",
  subtitle: "🖼️ 免费在线SVG转换工具 - 将矢量图转换为位图格式。100%本地转换，保护隐私，无需注册。",
  inputLabel: "选择SVG文件或输入SVG代码",
  dropReplacePrompt: "点击替换或拖拽 SVG 到此处",
  dropSelectPrompt: "点击选择或拖拽 SVG 到此处",
  dropFormatHint: "支持 .svg / image/svg+xml，也支持拖拽 SVG 代码片段",
  dropReplaceHint: "支持拖拽新 SVG 到此区域直接替换",
  selectedPrefix: "已选择: {name} ({size}KB)",
  codePlaceholder: "在此输入SVG代码，或选择文件后自动填充...",
  exampleSvgTitle: "示例SVG",
  exampleSimpleIcon: "简单图标",
  exampleComplexGraphic: "复杂图形",
  exampleTextElement: "文本元素",
  conversionOptions: "转换选项",
  outputFormat: "输出格式",
  widthLabel: "宽度 (px)",
  heightLabel: "高度 (px)",
  qualityLabel: "质量 ({quality}%)",
  backgroundColorLabel: "背景色",
  transparent: "透明",
  white: "白色",
  preserveAspectRatio: "保持宽高比",
  converting: "转换中...",
  convertButton: "转换图片",
  resetButton: "重置",
  validSvg: "✓ SVG格式正确",
  svgPreview: "SVG预览",
  conversionResult: "转换结果",
  downloadImage: "下载图片",
  formatLabel: "格式:",
  sizeLabel: "尺寸:",
  qualityMetricLabel: "质量:",
  backgroundMetricLabel: "背景:",
  tipMessage: "💡 提示: SVG是矢量图形，可以无损缩放。转换为位图后，建议保持适当的分辨率以获得最佳效果。",
  errCanvasUnavailable: "无法创建canvas上下文",
  errConvertFailed: "转换失败",
  errLoadFailed: "SVG加载失败",
  errEmptySvg: "SVG内容为空",
  errInvalidFormat: "无效的SVG格式",
  errSyntaxError: "SVG语法错误",
  errNoRootElement: "未找到SVG根元素",
  errParseFailed: "SVG解析失败",
  errSelectSvgFile: "请选择SVG文件",
  errInputSvgContent: "请输入SVG内容"
} as const;

type SvgConverterUi = typeof DEFAULT_UI;

interface ConversionOptions {
  format: 'png' | 'jpg';
  width: number;
  height: number;
  quality: number;
  backgroundColor: string;
  preserveAspectRatio: boolean;
}

// SVG转换器类
class SvgConverter {
  static async convertToImage(
    svgContent: string,
    options: ConversionOptions,
    messages: { errCanvasUnavailable: string; errConvertFailed: string; errLoadFailed: string }
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        // 创建SVG元素
        const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        // 创建图片元素
        const img = new window.Image();
        img.onload = () => {
          try {
            // 创建canvas
            const canvas = document.createElement('canvas');
            canvas.width = options.width;
            canvas.height = options.height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              reject(new Error(messages.errCanvasUnavailable));
              return;
            }

            // 设置背景色
            ctx.fillStyle = options.backgroundColor;
            ctx.fillRect(0, 0, options.width, options.height);

            // 计算缩放和居中位置
            let drawWidth = img.width;
            let drawHeight = img.height;

            if (options.preserveAspectRatio) {
              // 保持宽高比
              const scale = Math.min(options.width / img.width, options.height / img.height);
              drawWidth = img.width * scale;
              drawHeight = img.height * scale;
            } else {
              // 拉伸填充
              drawWidth = options.width;
              drawHeight = options.height;
            }

            const x = (options.width - drawWidth) / 2;
            const y = (options.height - drawHeight) / 2;

            // 绘制SVG
            ctx.drawImage(img, x, y, drawWidth, drawHeight);

            // 转换为blob
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error(messages.errConvertFailed));
              }
              URL.revokeObjectURL(svgUrl);
            }, `image/${options.format}`, options.quality / 100);

          } catch (error) {
            reject(error);
            URL.revokeObjectURL(svgUrl);
          }
        };

        img.onerror = () => {
          reject(new Error(messages.errLoadFailed));
          URL.revokeObjectURL(svgUrl);
        };

        img.src = svgUrl;
      } catch (error) {
        reject(error);
      }
    });
  }

  static validateSvg(
    svgContent: string,
    messages: {
      errEmptySvg: string;
      errInvalidFormat: string;
      errSyntaxError: string;
      errNoRootElement: string;
      errParseFailed: string;
    }
  ): { isValid: boolean; error?: string } {
    if (!svgContent.trim()) {
      return { isValid: false, error: messages.errEmptySvg };
    }

    if (!svgContent.includes('<svg')) {
      return { isValid: false, error: messages.errInvalidFormat };
    }

    // 简单的XML结构验证
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      const parserError = doc.querySelector('parsererror');

      if (parserError) {
        return { isValid: false, error: messages.errSyntaxError };
      }

      const svgElement = doc.querySelector('svg');
      if (!svgElement) {
        return { isValid: false, error: messages.errNoRootElement };
      }

      return { isValid: true };
    } catch {
      return { isValid: false, error: messages.errParseFailed };
    }
  }

  static getDefaultSize(svgContent: string): { width: number; height: number } {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      const svgElement = doc.querySelector('svg');

      if (svgElement) {
        const width = svgElement.getAttribute('width');
        const height = svgElement.getAttribute('height');

        const svgWidth = width ? parseInt(width) : 200;
        const svgHeight = height ? parseInt(height) : 200;

        return { width: svgWidth, height: svgHeight };
      }
    } catch {
      // 解析失败时返回默认尺寸
    }

    return { width: 200, height: 200 };
  }

  static getSvgDimensions(svgContent: string): { width: number; height: number; viewBox?: string } {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      const svgElement = doc.querySelector('svg');

      if (svgElement) {
        const width = svgElement.getAttribute('width');
        const height = svgElement.getAttribute('height');
        const viewBox = svgElement.getAttribute('viewBox');

        const dimensions: { width: number; height: number; viewBox?: string } = {
          width: width ? parseInt(width) : 200,
          height: height ? parseInt(height) : 200,
        };

        if (viewBox) {
          dimensions.viewBox = viewBox;
        }

        return dimensions;
      }
    } catch {
      // 解析失败时返回默认尺寸
    }

    return { width: 200, height: 200 };
  }
}

// 示例SVG内容
const SVG_EXAMPLES = [
  {
    key: 'exampleSimpleIcon' as const,
    svg: `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="#4F46E5"/>
  <text x="50" y="55" text-anchor="middle" fill="white" font-size="24" font-weight="bold">SVG</text>
</svg>`
  },
  {
    key: 'exampleComplexGraphic' as const,
    svg: `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4F46E5;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#7C3AED;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect x="10" y="10" width="180" height="180" rx="20" fill="url(#grad1)"/>
  <circle cx="100" cy="100" r="60" fill="white" opacity="0.3"/>
  <path d="M 50 100 L 100 50 L 150 100 Z" fill="white" opacity="0.5"/>
</svg>`
  },
  {
    key: 'exampleTextElement' as const,
    svg: `<svg width="300" height="150" viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg">
  <rect width="300" height="150" fill="#F3F4F6"/>
  <text x="150" y="40" text-anchor="middle" font-size="24" font-weight="bold" fill="#1F2937">
    Hello SVG!
  </text>
  <text x="150" y="80" text-anchor="middle" font-size="16" fill="#6B7280">
    矢量图形示例
  </text>
  <line x="50" y="100" x2="250" y2="100" stroke="#4F46E5" stroke-width="2"/>
</svg>`
  }
];

function SvgConverterInner() {
  const config = useOptionalToolConfig("svg-converter");
  const ui: SvgConverterUi = {
    ...DEFAULT_UI,
    ...((config?.ui ?? {}) as Partial<SvgConverterUi>)
  };

  const [svgContent, setSvgContent] = useState("");
  const [svgPreview, setSvgPreview] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [options, setOptions] = useState<ConversionOptions>({
    format: 'png',
    width: 512,
    height: 512,
    quality: 90,
    backgroundColor: 'transparent',
    preserveAspectRatio: true
  });
  const [convertedImage, setConvertedImage] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validation, setValidation] = useState<{ isValid: boolean; error?: string } | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  const loadSvgContentFromFile = (file: File) => {
    if (file.type !== "image/svg+xml" && !file.name.toLowerCase().endsWith(".svg")) {
      setValidation({ isValid: false, error: ui.errSelectSvgFile });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setSvgContent(content);
      setSvgPreview(content);
      setFileInfo({ name: file.name, size: file.size });

      const result = SvgConverter.validateSvg(content, ui);
      setValidation(result);

      if (result.isValid) {
        const dimensions = SvgConverter.getDefaultSize(content);
        setOptions((prev) => ({
          ...prev,
          width: Math.min(dimensions.width * 2, 1024),
          height: Math.min(dimensions.height * 2, 1024),
        }));
      }
    };
    reader.readAsText(file);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    loadSvgContentFromFile(file);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      loadSvgContentFromFile(file);
      return;
    }

    const text = event.dataTransfer.getData("text/plain");
    if (text && text.includes("<svg")) {
      handleSvgContentChange(text);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const openFilePicker = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const handleSvgContentChange = (content: string) => {
    setSvgContent(content);
    setSvgPreview(content);

    if (content.trim()) {
      const result = SvgConverter.validateSvg(content, ui);
      setValidation(result);

      if (result.isValid) {
        const dimensions = SvgConverter.getDefaultSize(content);
        setOptions(prev => ({
          ...prev,
          width: Math.min(dimensions.width * 2, 1024),
          height: Math.min(dimensions.height * 2, 1024)
        }));
      }
    } else {
      setValidation(null);
    }
  };

  const handleConvert = async () => {
    if (!svgContent.trim()) {
      setValidation({ isValid: false, error: ui.errInputSvgContent });
      return;
    }

    setIsProcessing(true);
    setValidation({ isValid: true });

    try {
      const blob = await SvgConverter.convertToImage(svgContent, options, ui);
      const url = URL.createObjectURL(blob);

      // 清理之前的URL
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }

      setDownloadUrl(url);
      setConvertedImage(url);
    } catch (error) {
      setValidation({
        isValid: false,
        error: error instanceof Error ? error.message : ui.errConvertFailed
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExampleSelect = (exampleSvg: string) => {
    setSvgContent(exampleSvg);
    setSvgPreview(exampleSvg);
    setFileInfo(null);

    const result = SvgConverter.validateSvg(exampleSvg, ui);
    setValidation(result);

    if (result.isValid) {
      const dimensions = SvgConverter.getDefaultSize(exampleSvg);
      setOptions(prev => ({
        ...prev,
        width: Math.min(dimensions.width * 2, 1024),
        height: Math.min(dimensions.height * 2, 1024)
      }));
    }
  };

  const handleDownload = () => {
    if (downloadUrl) {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `converted-${Date.now()}.${options.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleReset = () => {
    setSvgContent('');
    setSvgPreview('');
    setFileInfo(null);
    setConvertedImage(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    setValidation(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          {ui.title}
        </h2>
        <p className="mt-3 text-sm text-slate-600">
          {ui.subtitle}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 输入区域 */}
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div>
              <label htmlFor="svg-input" className="block text-sm font-medium text-slate-900 mb-2">
                {ui.inputLabel}
              </label>

              {/* 文件选择 */}
              <div className="mb-4">
                <input
                  ref={fileInputRef}
                  id="svg-input"
                  type="file"
                  accept=".svg,image/svg+xml"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div
                  className={`rounded-lg border-2 border-dashed p-4 transition ${
                    isDragging
                      ? "border-blue-500 bg-blue-50/50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={openFilePicker}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openFilePicker();
                    }
                  }}
                >
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-700">
                      {fileInfo
                        ? ui.dropReplacePrompt
                        : ui.dropSelectPrompt}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {ui.dropFormatHint}
                    </p>
                    {fileInfo && (
                      <p className="mt-1 text-xs text-slate-500">
                        {ui.dropReplaceHint}
                      </p>
                    )}
                  </div>
                </div>
                {fileInfo && (
                  <p className="mt-2 text-xs text-slate-600">
                    {ui.selectedPrefix
                      .replace('{name}', fileInfo.name)
                      .replace('{size}', Math.round(fileInfo.size / 1024).toString())}
                  </p>
                )}
              </div>

              {/* SVG代码输入 */}
              <div>
                <textarea
                  value={svgContent}
                  onChange={(e) => handleSvgContentChange(e.target.value)}
                  placeholder={ui.codePlaceholder}
                  className="w-full h-64 px-3 py-2 border border-slate-200 rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* 示例 */}
              <div>
                <h3 className="text-sm font-medium text-slate-900 mb-2">{ui.exampleSvgTitle}</h3>
                <div className="space-y-2">
                  {SVG_EXAMPLES.map((example) => (
                    <button
                      key={example.key}
                      onClick={() => handleExampleSelect(example.svg)}
                      className="w-full text-left px-3 py-2 text-sm bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 transition"
                    >
                      <div className="font-medium text-slate-900">{ui[example.key]}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 预览和选项区域 */}
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">{ui.conversionOptions}</h2>

            {/* 格式选择 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">{ui.outputFormat}</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setOptions(prev => ({ ...prev, format: 'png' }))}
                  className={`flex-1 px-3 py-2 rounded-lg border transition ${
                    options.format === 'png'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  PNG
                </button>
                <button
                  onClick={() => setOptions(prev => ({ ...prev, format: 'jpg' }))}
                  className={`flex-1 px-3 py-2 rounded-lg border transition ${
                    options.format === 'jpg'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  JPG
                </button>
              </div>
            </div>

            {/* 尺寸设置 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{ui.widthLabel}</label>
                <input
                  type="number"
                  min="1"
                  max="2048"
                  value={options.width}
                  onChange={(e) => setOptions(prev => ({ ...prev, width: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{ui.heightLabel}</label>
                <input
                  type="number"
                  min="1"
                  max="2048"
                  value={options.height}
                  onChange={(e) => setOptions(prev => ({ ...prev, height: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* 质量和背景设置 */}
            <div className="space-y-3">
              {options.format === 'jpg' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {ui.qualityLabel.replace('{quality}', options.quality.toString())}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={options.quality}
                    onChange={(e) => setOptions(prev => ({ ...prev, quality: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{ui.backgroundColorLabel}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOptions(prev => ({ ...prev, backgroundColor: 'transparent' }))}
                    className={`flex-1 px-3 py-2 text-sm border rounded transition ${
                      options.backgroundColor === 'transparent'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {ui.transparent}
                  </button>
                  <button
                    onClick={() => setOptions(prev => ({ ...prev, backgroundColor: '#ffffff' }))}
                    className={`flex-1 px-3 py-2 text-sm border rounded transition ${
                      options.backgroundColor === '#ffffff'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {ui.white}
                  </button>
                  <input
                    type="color"
                    value={options.backgroundColor === 'transparent' ? '#000000' : options.backgroundColor}
                    onChange={(e) => setOptions(prev => ({ ...prev, backgroundColor: e.target.value }))}
                    className="w-12 h-10 border border-slate-200 rounded cursor-pointer"
                  />
                </div>
              </div>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={options.preserveAspectRatio}
                  onChange={(e) => setOptions(prev => ({ ...prev, preserveAspectRatio: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-slate-600">{ui.preserveAspectRatio}</span>
              </label>
            </div>

            {/* 转换按钮 */}
            <div className="flex gap-3">
              <button
                onClick={handleConvert}
                disabled={!svgContent.trim() || isProcessing}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isProcessing ? ui.converting : ui.convertButton}
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition"
              >
                {ui.resetButton}
              </button>
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
                  {validation.isValid ? ui.validSvg : `❌ ${validation.error}`}
                </p>
              </div>
            )}
          </div>

          {/* SVG预览 */}
          {svgPreview && (
            <div className="glass-card rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-medium text-slate-900">{ui.svgPreview}</h3>
              <div className="border border-slate-200 rounded-lg p-4 bg-white flex items-center justify-center" style={{ minHeight: '150px' }}>
                <div dangerouslySetInnerHTML={{ __html: svgPreview }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 转换结果 */}
      {convertedImage && (
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{ui.conversionResult}</h2>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              {ui.downloadImage}
            </button>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-white">
            <NextImage
              src={convertedImage}
              alt="Converted image"
              unoptimized
              width={Math.max(1, options.width)}
              height={Math.max(1, options.height)}
              className="max-w-full h-auto mx-auto"
              style={{ maxHeight: '400px' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-600">{ui.formatLabel}</span>
              <span className="ml-2 font-medium text-slate-900">{options.format.toUpperCase()}</span>
            </div>
            <div>
              <span className="text-slate-600">{ui.sizeLabel}</span>
              <span className="ml-2 font-medium text-slate-900">{options.width} × {options.height}px</span>
            </div>
            {options.format === 'jpg' && (
              <div>
                <span className="text-slate-600">{ui.qualityMetricLabel}</span>
                <span className="ml-2 font-medium text-slate-900">{options.quality}%</span>
              </div>
            )}
            <div>
              <span className="text-slate-600">{ui.backgroundMetricLabel}</span>
              <span className="ml-2 font-medium text-slate-900">
                {options.backgroundColor === 'transparent' ? ui.transparent : options.backgroundColor}
              </span>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">
              {ui.tipMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SvgConverterClient() {
  return (
    <ToolPageLayout toolSlug="svg-converter">
      <SvgConverterInner />
    </ToolPageLayout>
  );
}
