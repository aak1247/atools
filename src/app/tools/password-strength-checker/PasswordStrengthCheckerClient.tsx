"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

interface PasswordStrength {
  score: number;
  level: "weak" | "moderate" | "strong" | "very-strong";
  feedback: string[];
  suggestions: string[];
}

interface BreachCheck {
  found: boolean;
  count: number;
  lastBreach?: string;
  isLoading: boolean;
  error?: string;
}

// 密码强度评估算法
function evaluatePasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  // 长度检查
  if (password.length >= 12) {
    score += 25;
  } else if (password.length >= 8) {
    score += 15;
    suggestions.push("建议密码长度至少12个字符");
  } else {
    suggestions.push("密码长度太短，建议至少8个字符");
  }

  // 大写字母检查
  if (/[A-Z]/.test(password)) {
    score += 15;
  } else {
    suggestions.push("建议包含大写字母");
  }

  // 小写字母检查
  if (/[a-z]/.test(password)) {
    score += 15;
  } else {
    suggestions.push("建议包含小写字母");
  }

  // 数字检查
  if (/\d/.test(password)) {
    score += 15;
  } else {
    suggestions.push("建议包含数字");
  }

  // 特殊字符检查
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score += 20;
  } else {
    suggestions.push("建议包含特殊字符");
  }

  // 字符多样性检查
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= password.length * 0.6) {
    score += 10;
  } else if (uniqueChars < password.length * 0.3) {
    suggestions.push("避免过多重复字符");
  }

  // 常见密码模式检查
  const commonPatterns = [
    /123456/,
    /password/i,
    /qwerty/i,
    /abc123/i,
    /admin/i,
    /letmein/i,
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      score -= 20;
      suggestions.push("避免使用常见密码模式");
      break;
    }
  }

  // 生成分数等级
  let level: PasswordStrength["level"];
  if (score >= 80) {
    level = "very-strong";
    feedback.push("密码强度：非常强");
  } else if (score >= 60) {
    level = "strong";
    feedback.push("密码强度：强");
  } else if (score >= 40) {
    level = "moderate";
    feedback.push("密码强度：中等");
  } else {
    level = "weak";
    feedback.push("密码强度：弱");
  }

  return { score: Math.max(0, Math.min(100, score)), level, feedback, suggestions };
}

// HaveIBeenPwned API 查询（使用k-anonymity）
async function checkPasswordBreach(password: string): Promise<{ found: boolean; count: number }> {
  try {
    // 使用Web Crypto API生成SHA1哈希
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

    // k-anonymity: 只发送哈希前5位
    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!response.ok) {
      throw new Error('查询失败');
    }

    const dataText = await response.text();
    const lines = dataText.split('\n');

    for (const line of lines) {
      const [lineSuffix, countStr] = line.split(':');
      if (lineSuffix === suffix) {
        return { found: true, count: parseInt(countStr, 10) };
      }
    }

    return { found: false, count: 0 };
  } catch {
    throw new Error('数据库查询失败，请稍后重试');
  }
}

export default function PasswordStrengthCheckerClient() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const strength = useMemo(() => (password ? evaluatePasswordStrength(password) : null), [password]);
  const [breachCheck, setBreachCheck] = useState<BreachCheck>({
    found: false,
    count: 0,
    isLoading: false,
  });

  // 密码泄露检查
  const checkBreach = async () => {
    if (!password) return;

    setBreachCheck(prev => ({ ...prev, isLoading: true, error: undefined }));

    try {
      const result = await checkPasswordBreach(password);
      setBreachCheck({
        ...result,
        isLoading: false,
      });
    } catch (error) {
      setBreachCheck({
        found: false,
        count: 0,
        isLoading: false,
        error: error instanceof Error ? error.message : '查询失败',
      });
    }
  };

  const getStrengthColor = (level: PasswordStrength["level"]) => {
    switch (level) {
      case "very-strong": return "text-green-600 bg-green-50 border-green-200";
      case "strong": return "text-blue-600 bg-blue-50 border-blue-200";
      case "moderate": return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "weak": return "text-red-600 bg-red-50 border-red-200";
      default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getStrengthLevelText = (level: PasswordStrength["level"]) => {
    switch (level) {
      case "very-strong": return "非常强";
      case "strong": return "强";
      case "moderate": return "中等";
      case "weak": return "弱";
      default: return "";
    }
  };

  return (
    <ToolPageLayout toolSlug="password-strength-checker">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            密码强度检测器
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            🆓 免费在线密码强度检测 - 实时评估密码安全性，数据库泄露查询，
            密码永不上传，100%本地处理保护您的隐私。
          </p>
        </div>

        <div className="glass-card rounded-2xl p-6 space-y-6">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-900 mb-2">
              输入密码进行强度检测
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码..."
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
              >
                {showPassword ? "隐藏" : "显示"}
              </button>
            </div>
          </div>

          {strength && (
            <div className="space-y-4">
              {/* 强度评分 */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-900">强度评分</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStrengthColor(strength.level)}`}>
                    {getStrengthLevelText(strength.level)} ({strength.score}/100)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      strength.score >= 80 ? "bg-green-500" :
                      strength.score >= 60 ? "bg-blue-500" :
                      strength.score >= 40 ? "bg-yellow-500" : "bg-red-500"
                    }`}
                    style={{ width: `${strength.score}%` }}
                  />
                </div>
              </div>

              {/* 反馈信息 */}
              {strength.feedback.length > 0 && (
                <div className={`p-4 rounded-lg border ${getStrengthColor(strength.level)}`}>
                  <h3 className="font-medium mb-2">评估结果</h3>
                  <ul className="text-sm space-y-1">
                    {strength.feedback.map((item, index) => (
                      <li key={index}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 改进建议 */}
              {strength.suggestions.length > 0 && (
                <div className="p-4 rounded-lg border border-yellow-200 bg-yellow-50">
                  <h3 className="font-medium text-yellow-800 mb-2">改进建议</h3>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    {strength.suggestions.map((suggestion, index) => (
                      <li key={index}>• {suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 数据库泄露检查 */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-slate-900">数据库泄露查询</h3>
              <button
                onClick={checkBreach}
                disabled={!password || breachCheck.isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {breachCheck.isLoading ? "查询中..." : "查询数据库"}
              </button>
            </div>

            {breachCheck.error && (
              <div className="p-4 rounded-lg border border-red-200 bg-red-50">
                <p className="text-sm text-red-700">❌ {breachCheck.error}</p>
              </div>
            )}

            {breachCheck.found && !breachCheck.isLoading && !breachCheck.error && (
              <div className="p-4 rounded-lg border border-red-200 bg-red-50">
                <p className="text-sm text-red-700">
                  ⚠️ <strong>警告:</strong> 此密码在数据库泄露记录中被发现 {breachCheck.count} 次。
                  强烈建议立即更换密码！
                </p>
              </div>
            )}

            {!breachCheck.found && breachCheck.count === 0 && !breachCheck.isLoading && !breachCheck.error && (
              <div className="p-4 rounded-lg border border-green-200 bg-green-50">
                <p className="text-sm text-green-700">
                  ✅ 很好！此密码在已知的数据库泄露记录中未被发现。
                </p>
              </div>
            )}

            <div className="mt-4 p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-600">
                <strong>隐私保护:</strong> 使用k-anonymity技术，只发送密码哈希的前5位到查询服务器，
                您的完整密码永远不会离开您的设备。
              </p>
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
