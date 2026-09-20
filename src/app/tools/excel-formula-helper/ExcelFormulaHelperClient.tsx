"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

const ALL_CATEGORY = "__ALL__";

const DEFAULT_UI = {
  title: "Excel 公式助手",
  searchPlaceholder: "搜索函数名称、用途或示例…",
  categoryAll: "全部",
  formulaListTitle: "常用公式",
  detailsTitle: "公式详情",
  syntaxLabel: "语法",
  categoryLabel: "分类",
  descriptionLabel: "说明",
  exampleLabel: "示例",
  copyFormula: "复制公式",
  noSelection: "请选择左侧的公式查看详情。",
  noResults: "未找到匹配的公式，请尝试更换关键词。",
  builtInFormulasBadge: "{count} 个内置公式模板",
  categoryStatistics: "统计",
  categoryLogic: "逻辑",
  categoryConditional: "条件统计",
  categoryLookup: "查找引用",
  categoryText: "文本",
  formulaSumDesc: "对一组数求和。",
  formulaSumExample: "示例：=SUM(B2:B10) 计算 B2 到 B10 的总和。",
  formulaAvgDesc: "返回一组数的平均值（算术平均）。",
  formulaAvgExample: "示例：=AVERAGE(C2:C100) 计算成绩的平均分。",
  formulaIfDesc: "根据条件返回不同结果，用于实现简单分支逻辑。",
  formulaIfExample: "示例：=IF(D2>=60, \"及格\", \"不及格\") 根据分数判断是否及格。",
  formulaCountifDesc: "统计满足单一条件的单元格数量。",
  formulaCountifExample: "示例：=COUNTIF(A2:A100, \"已完成\") 统计状态为“已完成”的任务数量。",
  formulaSumifDesc: "对满足条件的单元格求和。",
  formulaSumifExample: "示例：=SUMIF(B2:B100, \"市场部\", C2:C100) 按部门汇总销售额。",
  formulaVlookupDesc: "在表格首列中查找值，并返回指定列的对应结果。",
  formulaVlookupExample: "示例：=VLOOKUP(E2, A2:C100, 3, FALSE) 根据员工编号查找姓名。",
  formulaIndexMatchDesc: "组合 INDEX 与 MATCH 实现更灵活的查找，比 VLOOKUP 更稳健（支持左查找和插列）。",
  formulaIndexMatchExample: "示例：=INDEX(C2:C100, MATCH(E2, A2:A100, 0)) 在 A 列按编号查找，返回 C 列的值。",
  formulaTextDesc: "按指定格式将数值转换为文本（常用于日期、金额展示）。",
  formulaTextExample: "示例：=TEXT(TODAY(), \"yyyy-mm-dd\") 将当前日期格式化为 2024-01-01。",
} as const;

type ExcelFormulaHelperUi = typeof DEFAULT_UI;

interface FormulaItem {
  id: string;
  functionName: string;
  categoryKey: keyof ExcelFormulaHelperUi;
  syntax: string;
  descKey: keyof ExcelFormulaHelperUi;
  exampleKey: keyof ExcelFormulaHelperUi;
}

const RAW_FORMULAS: FormulaItem[] = [
  {
    id: "sum",
    functionName: "SUM",
    categoryKey: "categoryStatistics",
    syntax: "=SUM(number1, [number2], ...)",
    descKey: "formulaSumDesc",
    exampleKey: "formulaSumExample"
  },
  {
    id: "average",
    functionName: "AVERAGE",
    categoryKey: "categoryStatistics",
    syntax: "=AVERAGE(number1, [number2], ...)",
    descKey: "formulaAvgDesc",
    exampleKey: "formulaAvgExample"
  },
  {
    id: "if",
    functionName: "IF",
    categoryKey: "categoryLogic",
    syntax: "=IF(logical_test, value_if_true, value_if_false)",
    descKey: "formulaIfDesc",
    exampleKey: "formulaIfExample"
  },
  {
    id: "countif",
    functionName: "COUNTIF",
    categoryKey: "categoryConditional",
    syntax: "=COUNTIF(range, criteria)",
    descKey: "formulaCountifDesc",
    exampleKey: "formulaCountifExample"
  },
  {
    id: "sumif",
    functionName: "SUMIF",
    categoryKey: "categoryConditional",
    syntax: "=SUMIF(range, criteria, [sum_range])",
    descKey: "formulaSumifDesc",
    exampleKey: "formulaSumifExample"
  },
  {
    id: "vlookup",
    functionName: "VLOOKUP",
    categoryKey: "categoryLookup",
    syntax: "=VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])",
    descKey: "formulaVlookupDesc",
    exampleKey: "formulaVlookupExample"
  },
  {
    id: "index_match",
    functionName: "INDEX + MATCH",
    categoryKey: "categoryLookup",
    syntax: "=INDEX(return_range, MATCH(lookup_value, lookup_range, 0))",
    descKey: "formulaIndexMatchDesc",
    exampleKey: "formulaIndexMatchExample"
  },
  {
    id: "text",
    functionName: "TEXT",
    categoryKey: "categoryText",
    syntax: "=TEXT(value, format_text)",
    descKey: "formulaTextDesc",
    exampleKey: "formulaTextExample"
  }
];

const normalize = (value: string): string => value.toLowerCase();

export default function ExcelFormulaHelperClient() {
  const config = useOptionalToolConfig("excel-formula-helper");
  const ui: ExcelFormulaHelperUi = useMemo(() => ({
    ...DEFAULT_UI,
    ...((config?.ui ?? {}) as Partial<ExcelFormulaHelperUi>)
  }), [config?.ui]);

  const formulas = useMemo(() => {
    return RAW_FORMULAS.map((item) => ({
      id: item.id,
      functionName: item.functionName,
      category: ui[item.categoryKey] as string,
      categoryKey: item.categoryKey,
      syntax: item.syntax,
      description: ui[item.descKey] as string,
      example: ui[item.exampleKey] as string,
    }));
  }, [ui]);

  const [query, setQuery] = useState("");
  const [activeCategoryKey, setActiveCategoryKey] = useState<string>(ALL_CATEGORY);
  const [selectedId, setSelectedId] = useState<string | null>(RAW_FORMULAS[0]?.id ?? null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of RAW_FORMULAS) {
      set.add(item.categoryKey);
    }
    return [ALL_CATEGORY, ...Array.from(set)];
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return formulas.filter((item) => {
      if (activeCategoryKey !== ALL_CATEGORY && item.categoryKey !== activeCategoryKey) {
        return false;
      }
      if (!q) return true;
      const source = normalize(
        `${item.functionName} ${item.category} ${item.description} ${item.example}`,
      );
      return q
        .split(/\s+/)
        .filter(Boolean)
        .every((token) => source.includes(token));
    });
  }, [activeCategoryKey, formulas, query]);

  const selected = useMemo(() => {
    if (filtered.length === 0) return null;
    const byId = filtered.find((item) => item.id === selectedId);
    return byId ?? filtered[0];
  }, [filtered, selectedId]);

  const handleCopy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.syntax);
  };

  return (
    <ToolPageLayout toolSlug="excel-formula-helper" maxWidthClassName="max-w-6xl">
      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-base font-semibold text-slate-900">{ui.title}</div>
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ui.searchPlaceholder}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 sm:w-72"
            />
            <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-1.5 text-[11px] text-slate-600">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span>{ui.builtInFormulasBadge.replace("{count}", String(RAW_FORMULAS.length))}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          {/* 左侧：公式列表 */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {categories.map((catKey) => {
                const isActive = catKey === activeCategoryKey;
                const label =
                  catKey === ALL_CATEGORY ? ui.categoryAll : (ui[catKey as keyof ExcelFormulaHelperUi] as string);
                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setActiveCategoryKey(catKey)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? "bg-slate-900 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  {ui.noResults}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((item) => {
                    const isActive = item.id === selected?.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className={`flex w-full items-start justify-between gap-2 px-4 py-3 text-left text-xs transition ${
                            isActive
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-700 hover:bg-white/70"
                          }`}
                        >
                          <div>
                            <div className="font-mono text-[11px] text-slate-500">
                              ={item.functionName}
                            </div>
                            <div className="mt-1 font-medium text-slate-900">
                              {item.category}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                              {item.description}
                            </div>
                          </div>
                          <span className="mt-1 inline-flex h-5 items-center rounded-full bg-slate-800 px-2 text-[10px] font-medium text-slate-50">
                            fx
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* 右侧：详情 */}
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            {!selected ? (
              <div className="py-10 text-center text-sm text-slate-500">
                {ui.noSelection}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      {ui.detailsTitle}
                    </div>
                    <div className="mt-1 font-mono text-lg font-semibold text-slate-900">
                      ={selected.functionName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    {ui.copyFormula}
                  </button>
                </div>

                <div className="space-y-3 text-sm text-slate-800">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {ui.syntaxLabel}
                    </div>
                    <div className="mt-1 rounded-2xl bg-slate-900 px-4 py-3 font-mono text-xs text-emerald-100">
                      {selected.syntax}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div>
                      <div className="text-xs font-medium text-slate-500">
                        {ui.descriptionLabel}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-slate-800">
                        {selected.description}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">
                        {ui.categoryLabel}
                      </div>
                      <div className="mt-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800">
                        {selected.category}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      {ui.exampleLabel}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                      {selected.example}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}

