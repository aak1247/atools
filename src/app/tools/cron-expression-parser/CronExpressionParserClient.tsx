"use client";

import { useCallback, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { CronParser, type CronField } from "../../../lib/cron";

interface CronResult {
  isValid: boolean;
  error?: string;
  nextRuns?: Date[];
  description?: string;
}

type CronExpressionParserUi = {
  expressionInputTitle: string;
  expressionLabel: string;
  expressionPlaceholder: string;
  expressionHint: string;
  parseButton: string;
  templatesTitle: string;
  generatorTitle: string;
  minuteLabel: string;
  minutePlaceholder: string;
  hourLabel: string;
  hourPlaceholder: string;
  dayLabel: string;
  dayPlaceholder: string;
  monthLabel: string;
  monthPlaceholder: string;
  weekdayLabel: string;
  weekdayPlaceholder: string;
  syntaxTitle: string;
  syntaxItems: string[];
  resultTitle: string;
  errorPrefix: string;
  descriptionTitle: string;
  nextRunsTitle: string;
  runIndexTemplate: string;
  descriptionMinute: string;
  descriptionHour: string;
  descriptionDay: string;
  descriptionMonth: string;
  descriptionWeekday: string;
  descriptionEveryTemplate: string;
  descriptionSeparator: string;
  errPartsCountTemplate: string;
  errInvalidValueTemplate: string;
  errParseError: string;
  templates: Array<{ name: string; expression: string }>;
} & Record<string, unknown>;

const DEFAULT_UI: CronExpressionParserUi = {
  expressionInputTitle: "Cron表达式输入",
  expressionLabel: "Cron表达式",
  expressionPlaceholder: "* * * * *",
  expressionHint: "格式: 分钟 小时 日 月 星期 (0 0 * * * = 每天午夜)",
  parseButton: "解析表达式",
  templatesTitle: "常用模板",
  generatorTitle: "可视化生成器",
  minuteLabel: "分钟 (0-59)",
  minutePlaceholder: "* 或 0,15,30,45",
  hourLabel: "小时 (0-23)",
  hourPlaceholder: "* 或 9,12,18",
  dayLabel: "日 (1-31)",
  dayPlaceholder: "* 或 1,15",
  monthLabel: "月 (1-12)",
  monthPlaceholder: "* 或 1,6,12",
  weekdayLabel: "星期 (0-6, 0=周日)",
  weekdayPlaceholder: "* 或 1-5 (工作日)",
  syntaxTitle: "语法说明:",
  syntaxItems: ["* = 任意值", ", = 多个值 (1,3,5)", "- = 范围 (1-5)", "/ = 步长 (*/5 = 每5)"],
  resultTitle: "解析结果",
  errorPrefix: "❌ ",
  descriptionTitle: "表达式说明",
  nextRunsTitle: "下次执行时间",
  runIndexTemplate: "第{index}次",
  descriptionMinute: "分钟",
  descriptionHour: "小时",
  descriptionDay: "日",
  descriptionMonth: "月",
  descriptionWeekday: "星期",
  descriptionEveryTemplate: "每{field}",
  descriptionSeparator: "，",
  errPartsCountTemplate: "Cron表达式应该有5个或6个部分，但发现了{count}个部分",
  errInvalidValueTemplate: "无效的值：{value}（范围 {min}-{max}）",
  errParseError: "解析错误",
  templates: [
    { name: "每分钟", expression: "* * * * *" },
    { name: "每小时", expression: "0 * * * *" },
    { name: "每天午夜", expression: "0 0 * * *" },
    { name: "每天中午", expression: "0 12 * * *" },
    { name: "每周一", expression: "0 0 * * 1" },
    { name: "每月1号", expression: "0 0 1 * *" },
    { name: "工作日上午9点", expression: "0 9 * * 1-5" },
    { name: "每30分钟", expression: "*/30 * * * *" },
    { name: "每2小时", expression: "0 */2 * * *" },
    { name: "每15,30,45分钟", expression: "15,30,45 * * * *" },
  ],
};

const applyTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);

const formatCronError = (raw: string | undefined, ui: CronExpressionParserUi): string | undefined => {
  if (!raw) return undefined;

  if (raw.startsWith("ERR_PARTS_COUNT:")) {
    const count = raw.slice("ERR_PARTS_COUNT:".length);
    return applyTemplate(ui.errPartsCountTemplate, { count });
  }

  if (raw.startsWith("ERR_INVALID_VALUE:")) {
    const parts = raw.split(":");
    const value = parts[1] ?? "";
    const min = parts[2] ?? "";
    const max = parts[3] ?? "";
    return applyTemplate(ui.errInvalidValueTemplate, { value, min, max });
  }

  if (raw === "ERR_PARSE") return ui.errParseError;
  if (raw === "ERR_INVALID_CRON") return ui.errParseError;

  return raw;
};

const describeCron = (fields: CronField, ui: CronExpressionParserUi): string => {
  const parts: Array<{ label: string; field: string }> = [
    { label: ui.descriptionMinute, field: fields.minute },
    { label: ui.descriptionHour, field: fields.hour },
    { label: ui.descriptionDay, field: fields.day },
    { label: ui.descriptionMonth, field: fields.month },
    { label: ui.descriptionWeekday, field: fields.weekday },
  ];

  return parts
    .map((p) => {
      const value =
        p.field === "*"
          ? applyTemplate(ui.descriptionEveryTemplate, { field: p.label })
          : p.field;
      return `${p.label}: ${value}`;
    })
    .join(ui.descriptionSeparator);
};

const computeCronResult = (cronExpression: string, ui: CronExpressionParserUi): CronResult => {
  try {
    const parseResult = CronParser.parse(cronExpression);
    if (parseResult.isValid && parseResult.fields) {
      const nextRuns = CronParser.getNextRuns(cronExpression, 5);
      const description = describeCron(parseResult.fields, ui);
      return { isValid: true, nextRuns, description };
    }
    return { isValid: false, error: formatCronError(parseResult.error, ui) };
  } catch (error) {
    return {
      isValid: false,
      error: formatCronError(error instanceof Error ? error.message : "ERR_PARSE", ui),
    };
  }
};

export default function CronExpressionParserClient() {
  return (
    <ToolPageLayout toolSlug="cron-expression-parser" maxWidthClassName="max-w-5xl">
      {({ config, locale }) => (
        <CronExpressionParserInner
          ui={{
            ...DEFAULT_UI,
            ...((config.ui as Partial<CronExpressionParserUi> | undefined) ?? {}),
          }}
          locale={locale}
        />
      )}
    </ToolPageLayout>
  );
}

function CronExpressionParserInner({ ui, locale }: { ui: CronExpressionParserUi; locale: string }) {
  const initialExpression = "0 12 * * *";
  const [expression, setExpression] = useState(initialExpression);
  const [result, setResult] = useState<CronResult>(() => computeCronResult(initialExpression, ui));
  const [customFields, setCustomFields] = useState<CronField>({
    minute: "0",
    hour: "12",
    day: "*",
    month: "*",
    weekday: "*",
  });

  const parseExpression = useCallback((value: string) => {
    setResult(computeCronResult(value, ui));
  }, [ui]);

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
    <div className="mt-8 space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">{ui.expressionInputTitle}</h2>

            <div>
              <label htmlFor="expression" className="block text-sm font-medium text-slate-700 mb-2">
                {ui.expressionLabel}
              </label>
              <input
                id="expression"
                type="text"
                value={expression}
                onChange={(e) => handleExpressionChange(e.target.value)}
                onBlur={() => parseExpression(expression)}
                placeholder={ui.expressionPlaceholder}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <p className="mt-1 text-xs text-slate-500">{ui.expressionHint}</p>
            </div>

            <button
              onClick={() => parseExpression(expression)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              {ui.parseButton}
            </button>

            <div>
              <h3 className="text-sm font-medium text-slate-900 mb-2">{ui.templatesTitle}</h3>
              <div className="grid grid-cols-2 gap-2">
                {ui.templates.map((template, index) => (
                  <button
                    key={`${template.expression}-${index}`}
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

        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">{ui.generatorTitle}</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{ui.minuteLabel}</label>
                <input
                  type="text"
                  value={customFields.minute}
                  onChange={(e) => handleCustomFieldChange("minute", e.target.value)}
                  placeholder={ui.minutePlaceholder}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{ui.hourLabel}</label>
                <input
                  type="text"
                  value={customFields.hour}
                  onChange={(e) => handleCustomFieldChange("hour", e.target.value)}
                  placeholder={ui.hourPlaceholder}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{ui.dayLabel}</label>
                <input
                  type="text"
                  value={customFields.day}
                  onChange={(e) => handleCustomFieldChange("day", e.target.value)}
                  placeholder={ui.dayPlaceholder}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{ui.monthLabel}</label>
                <input
                  type="text"
                  value={customFields.month}
                  onChange={(e) => handleCustomFieldChange("month", e.target.value)}
                  placeholder={ui.monthPlaceholder}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{ui.weekdayLabel}</label>
                <input
                  type="text"
                  value={customFields.weekday}
                  onChange={(e) => handleCustomFieldChange("weekday", e.target.value)}
                  placeholder={ui.weekdayPlaceholder}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-600">
                <strong>{ui.syntaxTitle}</strong>
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {ui.syntaxItems.map((item, index) => (
                  <li key={`${index}-${item}`}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{ui.resultTitle}</h2>

        {!result.isValid && result.error ? (
          <div className="p-4 rounded-lg border border-red-200 bg-red-50">
            <p className="text-sm text-red-700">
              {ui.errorPrefix}
              {result.error}
            </p>
          </div>
        ) : (
          <>
            {result.description && (
              <div className="p-4 rounded-lg border border-blue-200 bg-blue-50">
                <h3 className="text-sm font-medium text-blue-900 mb-2">{ui.descriptionTitle}</h3>
                <p className="text-sm text-blue-700">{result.description}</p>
              </div>
            )}

            {result.nextRuns && result.nextRuns.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-900">{ui.nextRunsTitle}</h3>
                <div className="grid gap-2">
                  {result.nextRuns.map((date, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm font-medium text-slate-900">
                        {applyTemplate(ui.runIndexTemplate, { index: String(index + 1) })}
                      </span>
                      <span className="text-sm text-slate-600">
                        {date.toLocaleString(locale === "en-us" ? "en-US" : "zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
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
  );
}
