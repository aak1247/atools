"use client";

import { useCallback, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

interface CronField {
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
  year?: string;
}

interface CronResult {
  isValid: boolean;
  error?: string;
  nextRuns?: Date[];
  description?: string;
}

// Cron表达式解析和计算
class CronParser {
  private static readonly WEEKDAY_MAP: { [key: string]: number } = {
    'SUN': 0, 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6,
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6
  };

  private static readonly MONTH_MAP: { [key: string]: number } = {
    'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
    'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
  };

  static parseField(field: string, min: number, max: number): number[] {
    if (field === '*') return Array.from({ length: max - min + 1 }, (_, i) => min + i);

    const values: number[] = [];
    const parts = field.split(',');

    for (const part of parts) {
      if (part.includes('/')) {
        const [range, step] = part.split('/');
        const stepNum = parseInt(step);

        if (range === '*') {
          for (let i = min; i <= max; i += stepNum) {
            values.push(i);
          }
        } else if (range.includes('-')) {
          const [start, end] = range.split('-');
          const startNum = this.parseValue(start, min, max);
          const endNum = this.parseValue(end, min, max);

          for (let i = startNum; i <= endNum; i += stepNum) {
            values.push(i);
          }
        }
      } else if (part.includes('-')) {
        const [start, end] = part.split('-');
        const startNum = this.parseValue(start, min, max);
        const endNum = this.parseValue(end, min, max);

        for (let i = startNum; i <= endNum; i++) {
          values.push(i);
        }
      } else {
        const value = this.parseValue(part, min, max);
        values.push(value);
      }
    }

    return [...new Set(values)].sort((a, b) => a - b);
  }

  private static parseValue(value: string, min: number, max: number): number {
    if (min === 0 && max === 6) {
      // Weekday field
      const upperValue = value.toUpperCase();
      if (this.WEEKDAY_MAP[upperValue] !== undefined) {
        return this.WEEKDAY_MAP[upperValue];
      }
    }

    if (min === 1 && max === 12) {
      // Month field
      const upperValue = value.toUpperCase();
      if (this.MONTH_MAP[upperValue] !== undefined) {
        return this.MONTH_MAP[upperValue];
      }
    }

    const num = parseInt(value);
    if (num >= min && num <= max) {
      return num;
    }

    throw new Error(`Invalid value: ${value} for range ${min}-${max}`);
  }

  static parse(cronExpression: string): { isValid: boolean; error?: string; fields?: CronField } {
    const parts = cronExpression.trim().split(/\s+/);

    if (parts.length !== 5 && parts.length !== 6) {
      return {
        isValid: false,
        error: `Cron表达式应该有5个或6个部分，但发现了${parts.length}个部分`
      };
    }

    try {
      const fields: CronField = {
        minute: parts[0],
        hour: parts[1],
        day: parts[2],
        month: parts[3],
        weekday: parts[4],
      };

      if (parts.length === 6) {
        fields.year = parts[5];
      }

      // 验证每个字段
      this.parseField(fields.minute, 0, 59);
      this.parseField(fields.hour, 0, 23);
      this.parseField(fields.day, 1, 31);
      this.parseField(fields.month, 1, 12);
      this.parseField(fields.weekday, 0, 6);

      if (fields.year) {
        this.parseField(fields.year, 1970, 2100);
      }

      return { isValid: true, fields };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : '解析错误'
      };
    }
  }

  static getNextRuns(cronExpression: string, count: number = 5): Date[] {
    const result = this.parse(cronExpression);
    if (!result.isValid || !result.fields) {
      throw new Error(result.error || 'Invalid cron expression');
    }

    const fields = result.fields;
    const runs: Date[] = [];
    const now = new Date();

    // 解析字段为数值数组
    const minutes = this.parseField(fields.minute, 0, 59);
    const hours = this.parseField(fields.hour, 0, 23);
    const days = this.parseField(fields.day, 1, 31);
    const months = this.parseField(fields.month, 1, 12);
    const weekdays = this.parseField(fields.weekday, 0, 6);

    const current = new Date(now);
    current.setSeconds(0);
    current.setMilliseconds(0);

    while (runs.length < count && current.getTime() < now.getTime() + 365 * 24 * 60 * 60 * 1000) {
      current.setMinutes(current.getMinutes() + 1);

      const minute = current.getMinutes();
      const hour = current.getHours();
      const day = current.getDate();
      const month = current.getMonth() + 1;
      const weekday = current.getDay();

      if (minutes.includes(minute) &&
          hours.includes(hour) &&
          months.includes(month) &&
          days.includes(day) &&
          weekdays.includes(weekday)) {
        runs.push(new Date(current));
      }
    }

    return runs.slice(0, count);
  }

  static generateDescription(cronExpression: string): string {
    const result = this.parse(cronExpression);
    if (!result.isValid || !result.fields) {
      return '';
    }

    const fields = result.fields;
    const parts = [
      { name: '分钟', field: fields.minute, range: '0-59' },
      { name: '小时', field: fields.hour, range: '0-23' },
      { name: '日', field: fields.day, range: '1-31' },
      { name: '月', field: fields.month, range: '1-12' },
      { name: '星期', field: fields.weekday, range: '0-6' }
    ];

    return parts.map(p => `${p.name}: ${p.field === '*' ? '每' + p.name : p.field}`).join(', ');
  }
}

// 常用Cron表达式模板
const CRON_TEMPLATES = [
  { name: '每分钟', expression: '* * * * *' },
  { name: '每小时', expression: '0 * * * *' },
  { name: '每天午夜', expression: '0 0 * * *' },
  { name: '每天中午', expression: '0 12 * * *' },
  { name: '每周一', expression: '0 0 * * 1' },
  { name: '每月1号', expression: '0 0 1 * *' },
  { name: '工作日上午9点', expression: '0 9 * * 1-5' },
  { name: '每30分钟', expression: '*/30 * * * *' },
  { name: '每2小时', expression: '0 */2 * * *' },
  { name: '每15,30,45分钟', expression: '15,30,45 * * * *' },
];

const computeCronResult = (cronExpression: string): CronResult => {
  try {
    const parseResult = CronParser.parse(cronExpression);
    if (parseResult.isValid && parseResult.fields) {
      const nextRuns = CronParser.getNextRuns(cronExpression, 5);
      const description = CronParser.generateDescription(cronExpression);
      return { isValid: true, nextRuns, description };
    }
    return { isValid: false, error: parseResult.error };
  } catch (error) {
    return { isValid: false, error: error instanceof Error ? error.message : '解析失败' };
  }
};

export default function CronExpressionParserClient() {
  const initialExpression = "0 12 * * *";
  const [expression, setExpression] = useState(initialExpression);
  const [result, setResult] = useState<CronResult>(() => computeCronResult(initialExpression));
  const [customFields, setCustomFields] = useState<CronField>({
    minute: '0',
    hour: '12',
    day: '*',
    month: '*',
    weekday: '*'
  });

  const parseExpression = useCallback((value: string) => {
    setResult(computeCronResult(value));
  }, []);

  const handleExpressionChange = (value: string) => {
    setExpression(value);
    parseExpression(value);
  };

  const handleCustomFieldChange = (field: keyof CronField, value: string) => {
    const newFields = { ...customFields, [field]: value };
    setCustomFields(newFields);

    // 组合成表达式
    const parts = [
      newFields.minute,
      newFields.hour,
      newFields.day,
      newFields.month,
      newFields.weekday
    ].filter(Boolean);

    const nextExpression = parts.join(' ');
    setExpression(nextExpression);
    parseExpression(nextExpression);
  };

  const handleTemplateSelect = (templateExpression: string) => {
    setExpression(templateExpression);
    parseExpression(templateExpression);

    // 解析模板到自定义字段
    const parseResult = CronParser.parse(templateExpression);
    if (parseResult.isValid && parseResult.fields) {
      setCustomFields(parseResult.fields);
    }
  };

  return (
    <ToolPageLayout toolSlug="cron-expression-parser">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Cron表达式解析器
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            ⚡ 免费在线Cron解析工具 - 解析、验证、生成cron表达式，显示执行时间。
            100%本地处理，无需注册，保护您的隐私。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 输入区域 */}
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-5 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Cron表达式输入</h2>

              <div>
                <label htmlFor="expression" className="block text-sm font-medium text-slate-700 mb-2">
                  Cron表达式
                </label>
                <input
                  id="expression"
                  type="text"
                  value={expression}
                  onChange={(e) => handleExpressionChange(e.target.value)}
                  onBlur={() => parseExpression(expression)}
                  placeholder="* * * * *"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  格式: 分钟 小时 日 月 星期 (0 0 * * * = 每天午夜)
                </p>
              </div>

              <button
                onClick={() => parseExpression(expression)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                解析表达式
              </button>

              {/* 常用模板 */}
              <div>
                <h3 className="text-sm font-medium text-slate-900 mb-2">常用模板</h3>
                <div className="grid grid-cols-2 gap-2">
                  {CRON_TEMPLATES.map((template, index) => (
                    <button
                      key={index}
                      onClick={() => handleTemplateSelect(template.expression)}
                      className="text-left px-3 py-2 text-sm bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 transition"
                    >
                      <div className="font-medium text-slate-900">{template.name}</div>
                      <div className="text-xs text-slate-500">{template.expression}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 自定义字段生成器 */}
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-5 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">可视化生成器</h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">分钟 (0-59)</label>
                  <input
                    type="text"
                    value={customFields.minute}
                    onChange={(e) => handleCustomFieldChange('minute', e.target.value)}
                    placeholder="* 或 0,15,30,45"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">小时 (0-23)</label>
                  <input
                    type="text"
                    value={customFields.hour}
                    onChange={(e) => handleCustomFieldChange('hour', e.target.value)}
                    placeholder="* 或 9,12,18"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">日 (1-31)</label>
                  <input
                    type="text"
                    value={customFields.day}
                    onChange={(e) => handleCustomFieldChange('day', e.target.value)}
                    placeholder="* 或 1,15"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">月 (1-12)</label>
                  <input
                    type="text"
                    value={customFields.month}
                    onChange={(e) => handleCustomFieldChange('month', e.target.value)}
                    placeholder="* 或 1,6,12"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">星期 (0-6, 0=周日)</label>
                  <input
                    type="text"
                    value={customFields.weekday}
                    onChange={(e) => handleCustomFieldChange('weekday', e.target.value)}
                    placeholder="* 或 1-5 (工作日)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600">
                  <strong>语法说明:</strong><br/>
                  • * = 任意值<br/>
                  • , = 多个值 (1,3,5)<br/>
                  • - = 范围 (1-5)<br/>
                  • / = 步长 (*/5 = 每5)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 解析结果 */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">解析结果</h2>

          {!result.isValid && result.error ? (
            <div className="p-4 rounded-lg border border-red-200 bg-red-50">
              <p className="text-sm text-red-700">❌ {result.error}</p>
            </div>
          ) : (
            <>
              {result.description && (
                <div className="p-4 rounded-lg border border-blue-200 bg-blue-50">
                  <h3 className="text-sm font-medium text-blue-900 mb-2">表达式说明</h3>
                  <p className="text-sm text-blue-700">{result.description}</p>
                </div>
              )}

              {result.nextRuns && result.nextRuns.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-slate-900">下次执行时间</h3>
                  <div className="grid gap-2">
                    {result.nextRuns.map((date, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span className="text-sm font-medium text-slate-900">
                          第{index + 1}次
                        </span>
                        <span className="text-sm text-slate-600">
                          {date.toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ToolPageLayout>
  );
}
