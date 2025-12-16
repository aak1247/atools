"use client";

import { useMemo, useState } from "react";

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

const linearCategories: LinearCategory[] = [
  {
    id: "length",
    name: "长度",
    baseUnit: "m",
    units: [
      { id: "mm", name: "毫米 (mm)" },
      { id: "cm", name: "厘米 (cm)" },
      { id: "m", name: "米 (m)" },
      { id: "km", name: "千米 (km)" },
      { id: "in", name: "英寸 (in)" },
      { id: "ft", name: "英尺 (ft)" },
      { id: "yd", name: "码 (yd)" },
      { id: "mi", name: "英里 (mi)" },
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
    name: "质量",
    baseUnit: "kg",
    units: [
      { id: "mg", name: "毫克 (mg)" },
      { id: "g", name: "克 (g)" },
      { id: "kg", name: "千克 (kg)" },
      { id: "t", name: "吨 (t)" },
      { id: "oz", name: "盎司 (oz)" },
      { id: "lb", name: "磅 (lb)" },
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
    name: "面积",
    baseUnit: "m2",
    units: [
      { id: "cm2", name: "平方厘米 (cm²)" },
      { id: "m2", name: "平方米 (m²)" },
      { id: "km2", name: "平方千米 (km²)" },
      { id: "ha", name: "公顷 (ha)" },
      { id: "acre", name: "英亩 (acre)" },
      { id: "ft2", name: "平方英尺 (ft²)" },
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
    name: "体积",
    baseUnit: "m3",
    units: [
      { id: "ml", name: "毫升 (mL)" },
      { id: "l", name: "升 (L)" },
      { id: "m3", name: "立方米 (m³)" },
      { id: "gal", name: "加仑(美) (gal)" },
      { id: "ft3", name: "立方英尺 (ft³)" },
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
    name: "速度",
    baseUnit: "mps",
    units: [
      { id: "mps", name: "米/秒 (m/s)" },
      { id: "kph", name: "千米/小时 (km/h)" },
      { id: "mph", name: "英里/小时 (mph)" },
      { id: "knot", name: "节 (knot)" },
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
    name: "数据大小",
    baseUnit: "B",
    units: [
      { id: "B", name: "字节 (B)" },
      { id: "KB", name: "KB (10³)" },
      { id: "MB", name: "MB (10⁶)" },
      { id: "GB", name: "GB (10⁹)" },
      { id: "KiB", name: "KiB (2¹⁰)" },
      { id: "MiB", name: "MiB (2²⁰)" },
      { id: "GiB", name: "GiB (2³⁰)" },
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

const temperatureCategory: TemperatureCategory = {
  id: "temperature",
  name: "温度",
  units: [
    { id: "C", name: "摄氏度 (°C)" },
    { id: "F", name: "华氏度 (°F)" },
    { id: "K", name: "开尔文 (K)" },
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

const allCategories = [
  ...linearCategories.map((c) => ({ id: c.id, name: c.name })),
  { id: temperatureCategory.id, name: temperatureCategory.name },
] satisfies { id: CategoryId; name: string }[];

const convertLinear = (category: LinearCategory, value: number, from: string, to: string): number => {
  const fromFactor = category.factorsToBase[from];
  const toFactor = category.factorsToBase[to];
  if (!fromFactor || !toFactor) return Number.NaN;
  const base = value * fromFactor;
  return base / toFactor;
};

export default function UnitConverterClient() {
  const [categoryId, setCategoryId] = useState<CategoryId>("length");
  const [raw, setRaw] = useState<string>("1");
  const [fromUnit, setFromUnit] = useState<string>("m");
  const [toUnit, setToUnit] = useState<string>("km");
  const [precision, setPrecision] = useState(6);

  const category = useMemo(() => {
    if (categoryId === "temperature") return temperatureCategory;
    return linearCategories.find((c) => c.id === categoryId) ?? linearCategories[0];
  }, [categoryId]);

  const units = useMemo(() => category.units, [category]);

  const result = useMemo(() => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return { ok: false as const, text: "", error: "请输入有效数字" };
    if (categoryId === "temperature") {
      const out = temperatureCategory.convert(value, fromUnit as TemperatureUnitId, toUnit as TemperatureUnitId);
      if (!Number.isFinite(out)) return { ok: false as const, text: "", error: "无法换算" };
      return { ok: true as const, text: String(Number(out.toFixed(precision))) };
    }
    const linear = linearCategories.find((c) => c.id === categoryId);
    if (!linear) return { ok: false as const, text: "", error: "分类不存在" };
    const out = convertLinear(linear, value, fromUnit, toUnit);
    if (!Number.isFinite(out)) return { ok: false as const, text: "", error: "无法换算" };
    return { ok: true as const, text: String(Number(out.toFixed(precision))) };
  }, [categoryId, fromUnit, precision, raw, toUnit]);

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
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">单位换算</h1>
        <p className="mt-2 text-sm text-slate-500">常用单位互转，支持精度设置与复制结果</p>
      </div>

      <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">输入</div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  分类
                  <select
                    value={categoryId}
                    onChange={(e) => onCategoryChange(e.target.value as CategoryId)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    {allCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-slate-700">
                  精度（小数位）
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
                  数值
                  <input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    inputMode="decimal"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    placeholder="例如 1.23"
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  从
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
                  到
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
                  交换
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">结果</div>
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
                  复制
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 text-xs text-slate-500">
              提示：数据大小同时提供十进制（KB/MB/GB）与二进制（KiB/MiB/GiB）两套单位。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

