"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type Item = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
};

type Packed = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const makeId = () => Math.random().toString(16).slice(2);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const DEFAULT_UI = {
  selectImages: "选择图片",
  sortByName: "按文件名排序",
  clear: "清空",
  selectedCount: "已选 {count} 张",
  generating: "生成中…",
  generateSpriteSheet: "生成雪碧图",
  inputImages: "输入图片",
  selectImagesHint: "请选择多张图片生成雪碧图。",
  delete: "删除",
  outputSpriteSheet: "输出雪碧图",
  download: "下载 {filename}",
  layoutSettings: "布局设置",
  maxWidth: "最大宽度（px）",
  padding: "padding（px）",
  background: "背景",
  transparent: "透明",
  white: "白色",
  layoutDescription: "说明：使用简单的\"货架（shelf）\"排布算法：按高度排序后逐行摆放，适合快速生成雪碧图。",
  coordinatesExport: "坐标导出",
  copyJson: "复制 JSON",
  copyCss: "复制 CSS",
  jsonPlaceholder: "生成后输出 sprites 坐标 JSON…",
  cssPlaceholder: "生成后输出基础 CSS…",
  coordinatesPreview: "坐标预览",
  readImageError: "读取图片失败",
  buildError: "生成失败"
} as const;

type SpriteSheetGeneratorUi = typeof DEFAULT_UI;

const readImageSize = async (file: File): Promise<{ width: number; height: number }> => {
  const bmp = await createImageBitmap(file);
  return { width: bmp.width, height: bmp.height };
};

const drawToCanvasPng = async (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to export PNG"))), "image/png", 1);
  });

export default function SpriteSheetGeneratorClient() {
  return (
    <ToolPageLayout toolSlug="sprite-sheet-generator" maxWidthClassName="max-w-6xl">
      <SpriteSheetGeneratorInner />
    </ToolPageLayout>
  );
}

function SpriteSheetGeneratorInner() {
  const config = useOptionalToolConfig("sprite-sheet-generator");
  const ui: SpriteSheetGeneratorUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<SpriteSheetGeneratorUi>) };

  const inputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<Item[]>([]);
  const [padding, setPadding] = useState(2);
  const [maxWidth, setMaxWidth] = useState(2048);
  const [bg, setBg] = useState<"transparent" | "white">("transparent");

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState("sprite.png");
  const [mapping, setMapping] = useState<Packed[] | null>(null);
  const [mappingJson, setMappingJson] = useState("");
  const [css, setCss] = useState("");

  useEffect(() => {
    return () => {
      for (const it of items) URL.revokeObjectURL(it.url);
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
    };
  }, [items, sheetUrl]);

  const totalCount = items.length;

  const resetOutput = () => {
    setError(null);
    setMapping(null);
    setMappingJson("");
    setCss("");
    if (sheetUrl) URL.revokeObjectURL(sheetUrl);
    setSheetUrl(null);
  };

  const pick = async (files: File[]) => {
    resetOutput();
    const next: Item[] = [];
    for (const f of files) {
      const url = URL.createObjectURL(f);
      try {
        const { width, height } = await readImageSize(f);
        next.push({ id: makeId(), file: f, url, width, height });
      } catch (e) {
        URL.revokeObjectURL(url);
        setError(e instanceof Error ? e.message : ui.readImageError);
      }
    }
    setItems((prev) => [...prev, ...next]);
    if (files.length > 0) {
      const base = files[0].name.replace(/\.[^.]+$/, "") || "sprite";
      setSheetName(`${base}.sprite.png`);
    }
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) void pick(files);
  };

  const remove = (id: string) => {
    setItems((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((x) => x.id !== id);
    });
    resetOutput();
  };

  const clear = () => {
    for (const it of items) URL.revokeObjectURL(it.url);
    setItems([]);
    resetOutput();
    if (inputRef.current) inputRef.current.value = "";
  };

  const sortByName = () => {
    setItems((prev) =>
      prev
        .slice()
        .sort((a, b) => a.file.name.localeCompare(b.file.name, "zh-CN", { numeric: true })),
    );
    resetOutput();
  };

  const build = async () => {
    if (items.length === 0) return;
    setIsWorking(true);
    setError(null);
    resetOutput();

    try {
      const pad = clamp(Math.round(padding), 0, 64);
      const limitW = clamp(Math.round(maxWidth), 128, 8192);

      const sorted = items
        .slice()
        .sort((a, b) => b.height - a.height || b.width - a.width || a.file.name.localeCompare(b.file.name, "en"));

      let x = pad;
      let y = pad;
      let rowH = 0;
      let usedW = 0;
      const packed: Packed[] = [];

      for (const it of sorted) {
        const w = it.width;
        const h = it.height;
        if (x + w + pad > limitW && x > pad) {
          x = pad;
          y += rowH + pad;
          rowH = 0;
        }
        packed.push({ name: it.file.name, x, y, width: w, height: h });
        x += w + pad;
        rowH = Math.max(rowH, h);
        usedW = Math.max(usedW, x);
      }

      const sheetW = clamp(usedW + pad, 1, 16384);
      const sheetH = clamp(y + rowH + pad, 1, 16384);

      const canvas = document.createElement("canvas");
      canvas.width = sheetW;
      canvas.height = sheetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");

      if (bg === "white") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, sheetW, sheetH);
      } else {
        ctx.clearRect(0, 0, sheetW, sheetH);
      }

      const byName = new Map(items.map((it) => [it.file.name, it]));
      for (const p of packed) {
        const it = byName.get(p.name);
        if (!it) continue;
        const bmp = await createImageBitmap(it.file);
        ctx.drawImage(bmp, p.x, p.y);
      }

      const blob = await drawToCanvasPng(canvas);
      const url = URL.createObjectURL(blob);
      setSheetUrl(url);
      setMapping(packed);
      setMappingJson(`${JSON.stringify({ width: sheetW, height: sheetH, sprites: packed }, null, 2)}\n`);

      const classPrefix = "sprite";
      const cssLines = [
        `.${classPrefix} {`,
        `  background-image: url(${JSON.stringify(sheetName)});`,
        `  background-repeat: no-repeat;`,
        `  display: inline-block;`,
        `}`,
        "",
        ...packed.map((s) => {
          const safe = s.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
          return [
            `.${classPrefix}-${safe} {`,
            `  width: ${s.width}px;`,
            `  height: ${s.height}px;`,
            `  background-position: -${s.x}px -${s.y}px;`,
            `}`,
          ].join("\n");
        }),
      ].join("\n");
      setCss(`${cssLines}\n`);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.buildError);
    } finally {
      setIsWorking(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onChange} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {ui.selectImages}
            </button>
            <button
              type="button"
              onClick={sortByName}
              disabled={items.length < 2}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {ui.sortByName}
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {ui.clear}
            </button>
            <div className="text-sm text-slate-600">{ui.selectedCount.replace('{count}', totalCount.toString())}</div>
          </div>

          <button
            type="button"
            onClick={() => void build()}
            disabled={items.length === 0 || isWorking}
            className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isWorking ? ui.generating : ui.generateSpriteSheet}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.inputImages}</div>
              {items.length === 0 ? (
                <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                  {ui.selectImagesHint}
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {items.map((it) => (
                    <div key={it.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <div className="h-12 w-12 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={it.url} alt={it.file.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900">{it.file.name}</div>
                        <div className="mt-0.5 text-xs text-slate-600">
                          {it.width}×{it.height}px
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(it.id)}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100"
                      >
                        {ui.delete}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {sheetUrl && (
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">{ui.outputSpriteSheet}</div>
                  <a
                    href={sheetUrl}
                    download={sheetName}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    {ui.download.replace('{filename}', sheetName)}
                  </a>
                </div>
                <div className="mt-4 overflow-auto rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sheetUrl} alt="sprite sheet" className="max-w-none" />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">{ui.layoutSettings}</div>
              <div className="mt-4 grid gap-4">
                <label className="block text-sm text-slate-700">
                  {ui.maxWidth}
                  <input
                    type="number"
                    min={128}
                    max={8192}
                    step={1}
                    value={maxWidth}
                    onChange={(e) => setMaxWidth(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.padding}
                  <input
                    type="number"
                    min={0}
                    max={64}
                    step={1}
                    value={padding}
                    onChange={(e) => setPadding(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  {ui.background}
                  <select
                    value={bg}
                    onChange={(e) => setBg(e.target.value as "transparent" | "white")}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    <option value="transparent">{ui.transparent}</option>
                    <option value="white">{ui.white}</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 text-xs text-slate-500">
                {ui.layoutDescription}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{ui.coordinatesExport}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copy(mappingJson)}
                    disabled={!mappingJson}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    {ui.copyJson}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copy(css)}
                    disabled={!css}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {ui.copyCss}
                  </button>
                </div>
              </div>
              <textarea
                value={mappingJson}
                readOnly
                placeholder={ui.jsonPlaceholder}
                className="mt-3 h-40 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
              <textarea
                value={css}
                readOnly
                placeholder={ui.cssPlaceholder}
                className="mt-3 h-40 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
              />
            </div>

            {mapping && (
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.coordinatesPreview}</div>
                <div className="mt-3 max-h-56 overflow-auto rounded-2xl ring-1 ring-slate-200">
                  <table className="w-full table-fixed border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-700">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-2">name</th>
                        <th className="w-16 border-b border-slate-200 px-3 py-2">x</th>
                        <th className="w-16 border-b border-slate-200 px-3 py-2">y</th>
                        <th className="w-20 border-b border-slate-200 px-3 py-2">w</th>
                        <th className="w-20 border-b border-slate-200 px-3 py-2">h</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-800">
                      {mapping.slice(0, 200).map((m) => (
                        <tr key={m.name} className="odd:bg-white even:bg-slate-50/40">
                          <td className="border-b border-slate-100 px-3 py-2 font-mono break-all">{m.name}</td>
                          <td className="border-b border-slate-100 px-3 py-2">{m.x}</td>
                          <td className="border-b border-slate-100 px-3 py-2">{m.y}</td>
                          <td className="border-b border-slate-100 px-3 py-2">{m.width}</td>
                          <td className="border-b border-slate-100 px-3 py-2">{m.height}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

