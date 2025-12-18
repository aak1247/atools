"use client";

import { useMemo, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type GradientType = "linear" | "radial";

type Stop = { id: string; color: string; pos: number };

const DEFAULT_UI = {
  type: "类型",
  linear: "线性渐变",
  radial: "径向渐变",
  angle: "角度（deg）",
  stops: "颜色节点",
  add: "添加节点",
  remove: "删除",
  random: "随机",
  preview: "预览",
  css: "CSS",
  copy: "复制",
} as const;

type Ui = typeof DEFAULT_UI;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const randomHex = (): string => {
  const n = Math.floor(Math.random() * 0xffffff);
  return `#${n.toString(16).padStart(6, "0")}`.toUpperCase();
};

const makeId = () => Math.random().toString(16).slice(2);

const normalizeStops = (stops: Stop[]): Stop[] =>
  stops
    .map((s) => ({ ...s, pos: clamp(Math.round(s.pos), 0, 100) }))
    .sort((a, b) => a.pos - b.pos);

export default function CssGradientGeneratorClient() {
  return (
    <ToolPageLayout toolSlug="css-gradient-generator" maxWidthClassName="max-w-6xl">
      <CssGradientGeneratorInner />
    </ToolPageLayout>
  );
}

function CssGradientGeneratorInner() {
  const config = useOptionalToolConfig("css-gradient-generator");
  const ui: Ui = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<Ui>) };

  const [type, setType] = useState<GradientType>("linear");
  const [angle, setAngle] = useState(135);
  const [stops, setStops] = useState<Stop[]>([
    { id: makeId(), color: "#3B82F6", pos: 0 },
    { id: makeId(), color: "#EC4899", pos: 100 },
  ]);

  const normalizedStops = useMemo(() => normalizeStops(stops), [stops]);

  const gradient = useMemo(() => {
    const stopsText = normalizedStops.map((s) => `${s.color} ${s.pos}%`).join(", ");
    if (type === "radial") return `radial-gradient(circle at center, ${stopsText})`;
    const deg = clamp(Math.round(angle), 0, 360);
    return `linear-gradient(${deg}deg, ${stopsText})`;
  }, [angle, normalizedStops, type]);

  const css = useMemo(() => `background: ${gradient};`, [gradient]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const addStop = () => {
    const mid = 50;
    setStops((prev) => [...prev, { id: makeId(), color: randomHex(), pos: mid }]);
  };

  const removeStop = (id: string) => {
    setStops((prev) => (prev.length <= 2 ? prev : prev.filter((s) => s.id !== id)));
  };

  const randomize = () => {
    const count = 3 + Math.floor(Math.random() * 3);
    const next: Stop[] = [];
    for (let i = 0; i < count; i += 1) {
      next.push({ id: makeId(), color: randomHex(), pos: Math.round((i / (count - 1)) * 100) });
    }
    setStops(next);
    setAngle(Math.floor(Math.random() * 361));
    setType(Math.random() > 0.75 ? "radial" : "linear");
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{ui.preview}</div>
                <button
                  type="button"
                  onClick={randomize}
                  className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
                >
                  {ui.random}
                </button>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <div className="h-56 w-full" style={{ background: gradient }} />
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{ui.css}</div>
                <button
                  type="button"
                  onClick={() => void copy(css)}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {ui.copy}
                </button>
              </div>
              <textarea
                value={css}
                readOnly
                className="mt-3 h-24 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.type}</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setType("linear")}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold ring-1 transition ${
                    type === "linear" ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-slate-800 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {ui.linear}
                </button>
                <button
                  type="button"
                  onClick={() => setType("radial")}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold ring-1 transition ${
                    type === "radial" ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-slate-800 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {ui.radial}
                </button>
              </div>

              <label className={`mt-4 block text-sm text-slate-700 ${type === "linear" ? "" : "opacity-60"}`}>
                {ui.angle}
                <input
                  type="number"
                  min={0}
                  max={360}
                  step={1}
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  disabled={type !== "linear"}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
                />
              </label>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{ui.stops}</div>
                <button
                  type="button"
                  onClick={addStop}
                  className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  {ui.add}
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {normalizedStops.map((s) => (
                  <div key={s.id} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={s.color}
                          onChange={(e) =>
                            setStops((prev) => prev.map((p) => (p.id === s.id ? { ...p, color: e.target.value.toUpperCase() } : p)))
                          }
                          className="h-10 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                          aria-label="选择颜色"
                        />
                        <input
                          value={s.color}
                          onChange={(e) =>
                            setStops((prev) => prev.map((p) => (p.id === s.id ? { ...p, color: e.target.value.toUpperCase() } : p)))
                          }
                          className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeStop(s.id)}
                        disabled={normalizedStops.length <= 2}
                        className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-60"
                      >
                        {ui.remove}
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={s.pos}
                        onChange={(e) =>
                          setStops((prev) => prev.map((p) => (p.id === s.id ? { ...p, pos: Number(e.target.value) } : p)))
                        }
                        className="w-full accent-blue-600"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={s.pos}
                        onChange={(e) =>
                          setStops((prev) => prev.map((p) => (p.id === s.id ? { ...p, pos: Number(e.target.value) } : p)))
                        }
                        className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                      />
                      <div className="text-xs text-slate-500">%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

