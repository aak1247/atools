"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Unit = { id: string; name: string };
type CategoryId = "length" | "mass" | "temperature" | "area" | "volume" | "speed" | "data";

type LinearCategory = {
  id: Exclude<CategoryId, "temperature">;
  name: string;
  baseUnit: string;
  units: Unit[];
  factorsToBase: Record<string, number>;
};

type TemperatureUnitId = "C" | "F" | "K";
type TemperatureCategory = {
  id: "temperature";
  name: string;
  units: Unit[];
  convert: (value: number, from: TemperatureUnitId, to: TemperatureUnitId) => number;
};

const DEFAULT_UI = {
  inputTitle: "输入",
  category: "分类",
  precision: "精度（小数位）",
  value: "数值",
  valuePlaceholder: "例如 1.23",
  from: "从",
  to: "到",
  swap: "交换",
  resultTitle: "结果",
  copy: "复制",
  copied: "已复制",
  tip: "提示：数据大小同时提供十进制（KB/MB/GB）与二进制（KiB/MiB/GiB）两套单位。",
  errValidNumber: "请输入有效数字",
  errCannotConvert: "无法换算",
  errCategoryNotFound: "分类不存在",
  catLength: "长度",
  catMass: "质量",
  catArea: "面积",
  catVolume: "体积",
  catSpeed: "速度",
  catData: "数据大小",
  catTemperature: "温度",
  unit_mm: "毫米 (mm)",
  unit_cm: "厘米 (cm)",
  unit_m: "米 (m)",
  unit_km: "千米 (km)",
  unit_in: "英寸 (in)",
  unit_ft: "英尺 (ft)",
  unit_yd: "码 (yd)",
  unit_mi: "英里 (mi)",
  unit_mg: "毫克 (mg)",
  unit_g: "克 (g)",
  unit_kg: "千克 (kg)",
  unit_t: "吨 (t)",
  unit_oz: "盎司 (oz)",
  unit_lb: "磅 (lb)",
  unit_cm2: "平方厘米 (cm²)",
  unit_m2: "平方米 (m²)",
  unit_km2: "平方千米 (km²)",
  unit_ha: "公顷 (ha)",
  unit_acre: "英亩 (acre)",
  unit_ft2: "平方英尺 (ft²)",
  unit_ml: "毫升 (mL)",
  unit_l: "升 (L)",
  unit_m3: "立方米 (m³)",
  unit_gal: "加仑(美) (gal)",
  unit_ft3: "立方英尺 (ft³)",
  unit_mps: "米/秒 (m/s)",
  unit_kph: "千米/小时 (km/h)",
  unit_mph: "英里/小时 (mph)",
  unit_knot: "节 (knot)",
  unit_B: "字节 (B)",
  unit_KB: "KB (10³)",
  unit_MB: "MB (10⁶)",
  unit_GB: "GB (10⁹)",
  unit_KiB: "KiB (2¹⁰)",
  unit_MiB: "MiB (2²⁰)",
  unit_GiB: "GiB (2³⁰)",
  unit_C: "摄氏度 (°C)",
  unit_F: "华氏度 (°F)",
  unit_K: "开尔文 (K)",
} as const;

type Ui = typeof DEFAULT_UI;

function getLinearCategories(ui: Ui): LinearCategory[] {
  return [
    {
      id: "length",
      name: ui.catLength,
      baseUnit: "m",
      units: [
        { id: "mm", name: ui.unit_mm },
        { id: "cm", name: ui.unit_cm },
        { id: "m", name: ui.unit_m },
        { id: "km", name: ui.unit_km },
        { id: "in", name: ui.unit_in },
        { id: "ft", name: ui.unit_ft },
        { id: "yd", name: ui.unit_yd },
        { id: "mi", name: ui.unit_mi },
      ],
      factorsToBase: {
        mm: 0.001,
        cm: 0.01,
        m: 1,
        km: 1000,
        in: 0.0254,
        ft: 0.3048,
        yd: 0.9144,
        mi: 1609.344,
      },
    },
    {
      id: "mass",
      name: ui.catMass,
      baseUnit: "kg",
      units: [
        { id: "mg", name: ui.unit_mg },
        { id: "g", name: ui.unit_g },
        { id: "kg", name: ui.unit_kg },
        { id: "t", name: ui.unit_t },
        { id: "oz", name: ui.unit_oz },
        { id: "lb", name: ui.unit_lb },
      ],
      factorsToBase: {
        mg: 0.000001,
        g: 0.001,
        kg: 1,
        t: 1000,
        oz: 0.028349523125,
        lb: 0.45359237,
      },
    },
    {
      id: "area",
      name: ui.catArea,
      baseUnit: "m2",
      units: [
        { id: "cm2", name: ui.unit_cm2 },
        { id: "m2", name: ui.unit_m2 },
        { id: "km2", name: ui.unit_km2 },
        { id: "ha", name: ui.unit_ha },
        { id: "acre", name: ui.unit_acre },
        { id: "ft2", name: ui.unit_ft2 },
      ],
      factorsToBase: {
        cm2: 0.0001,
        m2: 1,
        km2: 1_000_000,
        ha: 10_000,
        acre: 4046.8564224,
        ft2: 0.09290304,
      },
    },
    {
      id: "volume",
      name: ui.catVolume,
      baseUnit: "m3",
      units: [
        { id: "ml", name: ui.unit_ml },
        { id: "l", name: ui.unit_l },
        { id: "m3", name: ui.unit_m3 },
        { id: "gal", name: ui.unit_gal },
        { id: "ft3", name: ui.unit_ft3 },
      ],
      factorsToBase: {
        ml: 0.000001,
        l: 0.001,
        m3: 1,
        gal: 0.003785411784,
        ft3: 0.028316846592,
      },
    },
    {
      id: "speed",
      name: ui.catSpeed,
      baseUnit: "mps",
      units: [
        { id: "mps", name: ui.unit_mps },
        { id: "kph", name: ui.unit_kph },
        { id: "mph", name: ui.unit_mph },
        { id: "knot", name: ui.unit_knot },
      ],
      factorsToBase: {
        mps: 1,
        kph: 1000 / 3600,
        mph: 1609.344 / 3600,
        knot: 1852 / 3600,
      },
    },
    {
      id: "data",
      name: ui.catData,
      baseUnit: "B",
      units: [
        { id: "B", name: ui.unit_B },
        { id: "KB", name: ui.unit_KB },
        { id: "MB", name: ui.unit_MB },
        { id: "GB", name: ui.unit_GB },
        { id: "KiB", name: ui.unit_KiB },
        { id: "MiB", name: ui.unit_MiB },
        { id: "GiB", name: ui.unit_GiB },
      ],
      factorsToBase: {
        B: 1,
        KB: 1000,
        MB: 1_000_000,
        GB: 1_000_000_000,
        KiB: 1024,
        MiB: 1024 ** 2,
        GiB: 1024 ** 3,
      },
    },
  ];
}

function getTemperatureCategory(ui: Ui): TemperatureCategory {
  return {
    id: "temperature",
    name: ui.catTemperature,
    units: [
      { id: "C", name: ui.unit_C },
      { id: "F", name: ui.unit_F },
      { id: "K", name: ui.unit_K },
    ],
    convert: (value, from, to) => {
      const toC = (v: number): number => {
        if (from === "C") return v;
        if (from === "F") return (v - 32) * (5 / 9);
        return v - 273.15;
      };
      const c = toC(value);
      if (to === "C") return c;
      if (to === "F") return c * (9 / 5) + 32;
      return c + 273.15;
    },
  };
}

const convertLinear = (category: LinearCategory, value: number, from: string, to: string): number => {
  const fromFactor = category.factorsToBase[from];
  const toFactor = category.factorsToBase[to];
  if (!fromFactor || !toFactor) return Number.NaN;
  const base = value * fromFactor;
  return base / toFactor;
};

export default function UnitConverterClient() {
  return (
    <ToolPageLayout toolSlug="unit-converter" maxWidthClassName="max-w-5xl">
      <UnitConverterInner />
    </ToolPageLayout>
  );
}

function UnitConverterInner() {
  const config = useOptionalToolConfig("unit-converter");
  const ui = useMemo(
    () => ({ ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<typeof DEFAULT_UI>) }),
    [config]
  );

  const linearCats = useMemo(() => getLinearCategories(ui), [ui]);
  const tempCat = useMemo(() => getTemperatureCategory(ui), [ui]);
  const allCats = useMemo(
    () => [
      ...linearCats.map((c) => ({ id: c.id, name: c.name })),
      { id: tempCat.id, name: tempCat.name },
    ] satisfies { id: CategoryId; name: string }[],
    [linearCats, tempCat]
  );

  const [categoryId, setCategoryId] = useState<CategoryId>("length");
  const [raw, setRaw] = useState<string>("1");
  const [fromUnit, setFromUnit] = useState<string>("m");
  const [toUnit, setToUnit] = useState<string>("km");
  const [precision, setPrecision] = useState(6);
  const [copied, setCopied] = useState(false);

  const category = useMemo(() => {
    if (categoryId === "temperature") return tempCat;
    return linearCats.find((c) => c.id === categoryId) ?? linearCats[0];
  }, [categoryId, linearCats, tempCat]);

  const units = useMemo(() => category.units, [category]);

  const result = useMemo(() => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return { ok: false as const, text: "", error: ui.errValidNumber };
    if (categoryId === "temperature") {
      const out = tempCat.convert(value, fromUnit as TemperatureUnitId, toUnit as TemperatureUnitId);
      if (!Number.isFinite(out)) return { ok: false as const, text: "", error: ui.errCannotConvert };
      return { ok: true as const, text: String(Number(out.toFixed(precision))) };
    }
    const linear = linearCats.find((c) => c.id === categoryId);
    if (!linear) return { ok: false as const, text: "", error: ui.errCategoryNotFound };
    const out = convertLinear(linear, value, fromUnit, toUnit);
    if (!Number.isFinite(out)) return { ok: false as const, text: "", error: ui.errCannotConvert };
    return { ok: true as const, text: String(Number(out.toFixed(precision))) };
  }, [categoryId, fromUnit, linearCats, precision, raw, tempCat, toUnit, ui.errCannotConvert, ui.errCategoryNotFound, ui.errValidNumber]);

  const swap = () => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  };

  const onCategoryChange = (next: CategoryId) => {
    setCategoryId(next);
    if (next === "temperature") {
      setFromUnit("C");
      setToUnit("F");
      return;
    }
    if (next === "data") {
      setFromUnit("MB");
      setToUnit("MiB");
      return;
    }
    if (next === "length") {
      setFromUnit("m");
      setToUnit("km");
      return;
    }
    if (next === "mass") {
      setFromUnit("kg");
      setToUnit("g");
      return;
    }
    if (next === "area") {
      setFromUnit("m2");
      setToUnit("ha");
      return;
    }
    if (next === "volume") {
      setFromUnit("l");
      setToUnit("m3");
      return;
    }
    setFromUnit("mps");
    setToUnit("kph");
  };

  const copy = async () => {
    if (!result.ok) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.inputTitle}</div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-slate-700">
                {ui.category}
                <select
                  value={categoryId}
                  onChange={(e) => onCategoryChange(e.target.value as CategoryId)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  {allCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-slate-700">
                {ui.precision}
                <select
                  value={precision}
                  onChange={(e) => setPrecision(Number(e.target.value))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  {[0, 2, 4, 6, 8, 10].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="block text-sm text-slate-700 sm:col-span-1">
                {ui.value}
                <input
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  inputMode="decimal"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  placeholder={ui.valuePlaceholder}
                />
              </label>

              <label className="block text-sm text-slate-700">
                {ui.from}
                <select
                  value={fromUnit}
                  onChange={(e) => setFromUnit(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-slate-700">
                {ui.to}
                <select
                  value={toUnit}
                  onChange={(e) => setToUnit(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={swap}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                {ui.swap}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{ui.resultTitle}</div>
            <div className="mt-3 flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <div className="text-3xl font-bold tracking-tight text-slate-900 break-words">
                  {result.ok ? result.text : "-"}
                </div>
                {!result.ok && <div className="mt-2 text-sm text-rose-600">{result.error}</div>}
                {result.ok && (
                  <div className="mt-2 text-xs text-slate-500">
                    {raw || "0"} {fromUnit} → {result.text} {toUnit}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={!result.ok}
                onClick={() => void copy()}
                className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {copied ? ui.copied : ui.copy}
              </button>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 text-xs text-slate-500">
            {ui.tip}
          </div>
        </div>
      </div>
    </div>
  );
}
