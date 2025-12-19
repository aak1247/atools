"use client";

import { useState, useRef } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

// 中文默认值
const DEFAULT_UI = {
  title: "API密钥生成器",
  keyTypeLabel: "密钥类型",
  lengthLabel: "密钥长度",
  prefixLabel: "密钥前缀",
  generateButton: "生成密钥",
  batchGenerateButton: "批量生成",
  copyButton: "复制",
  clearButton: "清空",
  selectAllButton: "全选",
  exportButton: "导出",
  outputPlaceholder: "生成的密钥将显示在这里...",
  copySuccess: "已复制到剪贴板！",
  copyFailed: "复制失败，请重试",
  batchCountLabel: "生成数量",
  includePrefix: "包含前缀",
  customPrefix: "自定义前缀",
  hexFormat: "十六进制 (Hex)",
  base64Format: "Base64格式",
  urlSafeFormat: "URL安全格式",
  strongEntropy: "高熵值安全",
  exportFormat: "导出格式",
  description: "安全随机生成各种类型的API密钥，支持自定义格式和批量生成",
  charactersText: "字符",
  batchGenerateText: "个",
  generatedKeysText: "生成的密钥",
  keysText: "个",
  deselectAllText: "取消全选",
  keyInfoText: "类型: {type} | 长度: {length} 字符",
  usageInstructionsTitle: "📋 使用说明",
  supportedFormatsTitle: "支持的安全格式：",
  securityFeaturesTitle: "安全特性：",
  apiKeyDescription: "标准字母数字组合，适合REST API",
  jwtDescription: "包含header、payload、signature",
  bearerDescription: "OAuth 2.0标准令牌格式",
  secretDescription: "Base64编码，适合加密用途",
  uuidDescription: "唯一标识符，128位长度",
  hexDescription: "十六进制/随机字符串格式",
  securityFeature1: "使用浏览器Crypto API生成真随机数",
  securityFeature2: "支持自定义密钥长度（8-128字符）",
  securityFeature3: "可添加自定义前缀标识用途",
  securityFeature4: "支持批量生成（最多50个）",
  securityFeature5: "多种导出格式（TXT/JSON/CSV）",
  securityFeature6: "完全本地生成，无网络传输风险",
  securityWarning: "⚠️ 安全提醒",
  securityWarningText: "生成的密钥仅在当前会话中显示，请妥善保存。定期更换密钥以提高安全性。",
  generationError: "生成失败: {message}",
  batchGenerationError: "批量生成失败: {message}",
  apiKeyStandard: "API Key (标准格式)",
  jwtTokenFormat: "JWT Token (JWT格式)",
  bearerTokenFormat: "Bearer Token (OAuth 2.0)",
  secretKeyFormat: "Secret Key (Base64编码)",
  uuidFormat: "UUID (唯一标识符)",
  hexFormatFull: "十六进制 (Hex)",
  randomString: "随机字符串",
  batchGenerateFull: "📦 {text} ({count}个)",
  copySelected: "📋 {text} ({count}个)"
} as const;

type ApiKeyGeneratorUi = typeof DEFAULT_UI;

type KeyType = "api_key" | "jwt" | "bearer" | "secret" | "random" | "uuid" | "hex" | "base64";

type ExportFormat = "txt" | "json" | "csv";

// API密钥生成器
class ApiKeyGenerator {
  // 生成安全的随机字节
  private static generateSecureRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      // 回退方案（仅用于开发环境）
      for (let i = 0; i < length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return bytes;
  }

  // 十六进制字符集
  private static get HEX_CHARS(): string {
    return '0123456789abcdef';
  }

  // Base64字符集
  private static get BASE64_CHARS(): string {
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  }

  // URL安全字符集
  private static get URL_SAFE_CHARS(): string {
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  }

  // 标准密钥字符集
  private static get STANDARD_CHARS(): string {
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  }

  // 生成十六进制字符串
  public static generateHex(length: number): string {
    const bytes = this.generateSecureRandomBytes(Math.ceil(length / 2));
    let result = '';
    for (let i = 0; i < bytes.length && result.length < length; i++) {
      result += bytes[i].toString(16).padStart(2, '0');
    }
    return result.substring(0, length);
  }

  // 生成Base64字符串
  public static generateBase64(length: number): string {
    const bytes = this.generateSecureRandomBytes(Math.ceil(length * 3 / 4));
    return btoa(String.fromCharCode(...bytes)).substring(0, length).replace(/[+=]/g, '');
  }

  // 生成URL安全字符串
  public static generateUrlSafe(length: number): string {
    const chars = this.URL_SAFE_CHARS;
    let result = '';
    const bytes = this.generateSecureRandomBytes(length);
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }

  // 生成标准字符串
  public static generateStandard(length: number): string {
    const chars = this.STANDARD_CHARS;
    let result = '';
    const bytes = this.generateSecureRandomBytes(length);
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }

  // 生成UUID v4
  public static generateUUID(): string {
    const bytes = this.generateSecureRandomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant

    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20, 32)
    ].join('-');
  }

  // 生成JWT Token（简化版，仅包含header和payload）
  public static generateJWT(payload: string): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const encodedPayload = btoa(JSON.stringify({
      sub: payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    }));
    const signature = this.generateStandard(32);

    return `${header}.${encodedPayload}.${btoa(signature)}`;
  }

  // 生成指定类型的密钥
  public static generateKey(type: KeyType, options: {
    length?: number;
    prefix?: string;
    includePrefix?: boolean;
  } = {}): string {
    const { length = 32, prefix, includePrefix = true } = options;

    let key = '';

    switch (type) {
      case 'api_key':
        key = this.generateStandard(length);
        break;
      case 'jwt':
        key = this.generateJWT(this.generateStandard(8));
        break;
      case 'bearer':
        key = this.generateStandard(length);
        break;
      case 'secret':
        key = this.generateBase64(length);
        break;
      case 'random':
        key = this.generateUrlSafe(length);
        break;
      case 'uuid':
        key = this.generateUUID();
        break;
      case 'hex':
        key = this.generateHex(length);
        break;
      case 'base64':
        key = this.generateBase64(length);
        break;
      default:
        key = this.generateStandard(length);
    }

    // 添加前缀
    if (includePrefix && prefix) {
      key = `${prefix}_${key}`;
    }

    return key;
  }

  // 批量生成密钥
  public static generateKeys(type: KeyType, count: number, options: {
    length?: number;
    prefix?: string;
    includePrefix?: boolean;
  } = {}): string[] {
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      keys.push(this.generateKey(type, options));
    }
    return keys;
  }
}

export default function ApiKeyGeneratorClient() {
  const [keyType, setKeyType] = useState<KeyType>("api_key");
  const [length, setLength] = useState<number>(32);
  const [prefix, setPrefix] = useState<string>("");
  const [includePrefix, setIncludePrefix] = useState<boolean>(false);
  const [batchCount, setBatchCount] = useState<number>(1);
  const [generatedKeys, setGeneratedKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<number>>(new Set());
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("txt");

  const config = useOptionalToolConfig("api-key-generator");

  // 配置合并，英文优先，中文回退
  const ui: ApiKeyGeneratorUi = {
    ...DEFAULT_UI,
    ...((config?.ui ?? {}) as Partial<ApiKeyGeneratorUi>)
  };

  // 获取密钥类型的前缀
  const getKeyPrefix = (type: KeyType): string => {
    switch (type) {
      case 'api_key': return 'sk';
      case 'jwt': return 'jwt';
      case 'bearer': return 'Bearer';
      case 'secret': return 'secret';
      case 'random': return '';
      case 'uuid': return '';
      case 'hex': return '';
      case 'base64': return '';
      default: return '';
    }
  };

  // 获取类型的默认长度
  const getDefaultLength = (type: KeyType): number => {
    switch (type) {
      case 'api_key': return 32;
      case 'jwt': return 0; // JWT固定格式
      case 'bearer': return 32;
      case 'secret': return 32;
      case 'random': return 32;
      case 'uuid': return 0; // UUID固定格式
      case 'hex': return 32;
      case 'base64': return 32;
      default: return 32;
    }
  };

  // 类型改变时更新前缀和长度
  const handleKeyTypeChange = (newType: KeyType) => {
    setKeyType(newType);
    const defaultPrefix = getKeyPrefix(newType);
    setPrefix(defaultPrefix);
    const defaultLength = getDefaultLength(newType);
    if (defaultLength > 0) {
      setLength(defaultLength);
    }
  };

  // 生成单个密钥
  const generateSingleKey = () => {
    try {
      const options = {
        length: getDefaultLength(keyType) > 0 ? length : undefined,
        prefix: includePrefix ? prefix : undefined,
        includePrefix
      };
      const key = ApiKeyGenerator.generateKey(keyType, options);
      setGeneratedKeys([key]);
      setSelectedKeys(new Set());
      setError("");
    } catch (err) {
      setError(ui.generationError.replace("{message}", err instanceof Error ? err.message : "未知错误"));
    }
  };

  // 批量生成密钥
  const generateBatchKeys = () => {
    try {
      const options = {
        length: getDefaultLength(keyType) > 0 ? length : undefined,
        prefix: includePrefix ? prefix : undefined,
        includePrefix
      };
      const keys = ApiKeyGenerator.generateKeys(keyType, batchCount, options);
      setGeneratedKeys(keys);
      setSelectedKeys(new Set());
      setError("");
    } catch (err) {
      setError(ui.batchGenerationError.replace("{message}", err instanceof Error ? err.message : "未知错误"));
    }
  };

  // 复制选中的密钥
  const copySelectedKeys = async () => {
    try {
      const selectedKeysList = Array.from(selectedKeys).sort((a, b) => a - b);
      const selectedText = selectedKeysList.map(index => generatedKeys[index]).join('\n');

      await navigator.clipboard.writeText(selectedText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setError(ui.copyFailed);
    }
  };

  // 复制单个密钥
  const copySingleKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setError(ui.copyFailed);
    }
  };

  // 切换密钥选中状态
  const toggleKeySelection = (index: number) => {
    const newSelected = new Set(selectedKeys);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedKeys(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedKeys.size === generatedKeys.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(generatedKeys.map((_, index) => index)));
    }
  };

  // 导出密钥
  const exportKeys = () => {
    const selectedKeysList = selectedKeys.size > 0
      ? Array.from(selectedKeys).sort((a, b) => a - b).map(index => generatedKeys[index])
      : generatedKeys;

    let content = '';
    let filename = '';
    let mimeType = '';

    switch (exportFormat) {
      case 'txt':
        content = selectedKeysList.join('\n');
        filename = `api-keys-${Date.now()}.txt`;
        mimeType = 'text/plain';
        break;
      case 'json':
        content = JSON.stringify({
          type: keyType,
          generated_at: new Date().toISOString(),
          keys: selectedKeysList.map((key, index) => ({
            index: index + 1,
            key: key,
            type: keyType,
            generated_at: new Date().toISOString()
          }))
        }, null, 2);
        filename = `api-keys-${Date.now()}.json`;
        mimeType = 'application/json';
        break;
      case 'csv':
        content = 'Index,Key,Type,Generated At\n' +
          selectedKeysList.map((key, index) =>
            `${index + 1},"${key}","${keyType}","${new Date().toISOString()}"`
          ).join('\n');
        filename = `api-keys-${Date.now()}.csv`;
        mimeType = 'text/csv';
        break;
    }

    // 创建下载链接
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 清空结果
  const clearResults = () => {
    setGeneratedKeys([]);
    setSelectedKeys(new Set());
    setError("");
  };

  const defaultLength = getDefaultLength(keyType);

  return (
    <ToolPageLayout toolSlug="api-key-generator">
      <div className="space-y-6">
        {/* 工具标题和说明 */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{ui.title}</h1>
          <p className="text-slate-600">{ui.description}</p>
        </div>

        {/* 配置选项 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* 密钥类型 */}
            <div className="space-y-2">
              <label className="text-slate-700 font-medium">{ui.keyTypeLabel}</label>
              <select
                value={keyType}
                onChange={(e) => handleKeyTypeChange(e.target.value as KeyType)}
                className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-none"
              >
                <option value="api_key">{ui.apiKeyStandard}</option>
                <option value="jwt">JWT Token</option>
                <option value="bearer">Bearer Token</option>
                <option value="secret">Secret Key (Base64)</option>
                <option value="random">Random String</option>
                <option value="uuid">UUID v4</option>
                <option value="hex">Hexadecimal</option>
                <option value="base64">Base64</option>
              </select>
            </div>

            {/* 密钥长度 */}
            {defaultLength > 0 && (
              <div className="space-y-2">
                <label className="text-slate-700 font-medium">
                  {ui.lengthLabel}: {length} {ui.charactersText}
                </label>
                <input
                  type="range"
                  min="8"
                  max="128"
                  value={length}
                  onChange={(e) => setLength(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>8</span>
                  <span>128</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* 前缀选项 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="includePrefix"
                  checked={includePrefix}
                  onChange={(e) => setIncludePrefix(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="includePrefix" className="text-slate-700 font-medium">
                  {ui.includePrefix}
                </label>
              </div>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder={ui.customPrefix}
                disabled={!includePrefix}
                className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* 批量生成数量 */}
            <div className="space-y-2">
              <label className="text-slate-700 font-medium">
                {ui.batchCountLabel}: {batchCount}
              </label>
              <input
                type="range"
                min="1"
                max="50"
                value={batchCount}
                onChange={(e) => setBatchCount(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>1</span>
                <span>50</span>
              </div>
            </div>
          </div>
        </div>

        {/* 生成按钮 */}
        <div className="flex flex-wrap gap-4 justify-center">
          <button
            onClick={generateSingleKey}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium"
          >
            🔑 {ui.generateButton}
          </button>

          <button
            onClick={generateBatchKeys}
            className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition font-medium"
          >
            {ui.batchGenerateFull.replace("{text}", ui.batchGenerateButton).replace("{count}", batchCount + ui.batchGenerateText)}
          </button>

          <button
            onClick={clearResults}
            disabled={generatedKeys.length === 0}
            className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🗑️ {ui.clearButton}
          </button>
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

        {/* 生成结果 */}
        {generatedKeys.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">
                {ui.generatedKeysText} ({generatedKeys.length}{ui.keysText})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSelectAll}
                  className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition text-sm font-medium"
                >
                  {selectedKeys.size === generatedKeys.length ? ui.deselectAllText : ui.selectAllButton}
                </button>

                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="txt">TXT</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                </select>

                <button
                  onClick={exportKeys}
                  className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition text-sm font-medium"
                >
                  📄 {ui.exportButton}
                </button>

                {selectedKeys.size > 0 && (
                  <button
                    onClick={copySelectedKeys}
                    className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition text-sm font-medium"
                  >
                    {ui.copySelected.replace("{text}", ui.copyButton).replace("{count}", selectedKeys.size + ui.keysText)}
                  </button>
                )}
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 max-h-96 overflow-y-auto">
              <div className="space-y-3">
                {generatedKeys.map((key, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedKeys.has(index)
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                    onClick={() => toggleKeySelection(index)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(index)}
                          onChange={() => toggleKeySelection(index)}
                          className="mt-1 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="font-mono text-sm break-all bg-white p-2 rounded border border-slate-200">
                            {key}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {ui.keyInfoText.replace("{type}", keyType).replace("{length}", key.length.toString())}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copySingleKey(key);
                        }}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition text-sm font-medium"
                      >
                        {ui.copyButton}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 使用说明 */}
        <div className="bg-slate-50 rounded-2xl p-6 text-sm text-slate-600">
          <h3 className="font-semibold text-slate-800 mb-3">{ui.usageInstructionsTitle}</h3>
          <div className="space-y-2 grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-slate-700 mb-2">{ui.supportedFormatsTitle}</h4>
              <ul className="space-y-1 text-xs">
                <li>• <strong>API Key</strong>: {ui.apiKeyDescription}</li>
                <li>• <strong>JWT Token</strong>: {ui.jwtDescription}</li>
                <li>• <strong>Bearer Token</strong>: {ui.bearerDescription}</li>
                <li>• <strong>Secret Key</strong>: {ui.secretDescription}</li>
                <li>• <strong>UUID</strong>: {ui.uuidDescription}</li>
                <li>• <strong>Hex/Random</strong>: {ui.hexDescription}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-slate-700 mb-2">{ui.securityFeaturesTitle}</h4>
              <ul className="space-y-1 text-xs">
                <li>• {ui.securityFeature1}</li>
                <li>• {ui.securityFeature2}</li>
                <li>• {ui.securityFeature3}</li>
                <li>• {ui.securityFeature4}</li>
                <li>• {ui.securityFeature5}</li>
                <li>• {ui.securityFeature6}</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="text-amber-800 font-medium text-sm">{ui.securityWarning}</div>
            <div className="text-amber-700 text-xs mt-1">
              {ui.securityWarningText}
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}