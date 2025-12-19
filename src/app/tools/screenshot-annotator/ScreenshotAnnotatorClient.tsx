"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, FabricImage, Line, Rect, Textbox } from "fabric";
import ToolPageLayout from "../../../components/ToolPageLayout";

type ToolMode = "select" | "pen" | "rect" | "arrow" | "text";

type Ui = {
  hint: string;
  pick: string;
  clear: string;
  mode: string;
  select: string;
  pen: string;
  rect: string;
  arrow: string;
  text: string;
  stroke: string;
  fill: string;
  width: string;
  fontSize: string;
  undo: string;
  redo: string;
  downloadPng: string;
  copyPng: string;
  errPickImage: string;
  copied: string;
};

const DEFAULT_UI: Ui = {
  hint: "截图标注工具：上传截图后可画笔、矩形、箭头、文字标注，导出 PNG（全程本地处理不上传）。",
  pick: "选择图片",
  clear: "清空",
  mode: "工具",
  select: "选择/移动",
  pen: "画笔",
  rect: "矩形",
  arrow: "箭头",
  text: "文字",
  stroke: "描边",
  fill: "填充",
  width: "线宽",
  fontSize: "字号",
  undo: "撤销",
  redo: "重做",
  downloadPng: "下载 PNG",
  copyPng: "复制 PNG",
  errPickImage: "请选择图片文件（PNG/JPG/WebP）。",
  copied: "已复制",
};

const dataUrlToBlob = async (dataUrl: string) => {
  const res = await fetch(dataUrl);
  return res.blob();
};

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export default function ScreenshotAnnotatorClient() {
  return (
    <ToolPageLayout toolSlug="screenshot-annotator" maxWidthClassName="max-w-6xl">
      {({ config }) => <Inner ui={{ ...DEFAULT_UI, ...((config.ui ?? {}) as Partial<Ui>) }} />}
    </ToolPageLayout>
  );
}

function Inner({ ui }: { ui: Ui }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);

  const [mode, setMode] = useState<ToolMode>("select");
  const [stroke, setStroke] = useState("#ef4444");
  const [fill, setFill] = useState("#00000000");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fontSize, setFontSize] = useState(28);

  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [hasUndo, setHasUndo] = useState(false);
  const [hasRedo, setHasRedo] = useState(false);

  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const syncHistoryFlags = () => {
    const idx = historyIndexRef.current;
    const len = historyRef.current.length;
    setHasUndo(idx > 0);
    setHasRedo(idx >= 0 && idx < len - 1);
  };

  const pushHistory = (json: string) => {
    const idx = historyIndexRef.current;
    historyRef.current = historyRef.current.slice(0, idx + 1);
    historyRef.current.push(json);
    historyIndexRef.current = historyRef.current.length - 1;
    syncHistoryFlags();
  };

  const loadFromHistory = async (index: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const json = historyRef.current[index];
    if (!json) return;
    await canvas.loadFromJSON(json);
    canvas.renderAll();
    historyIndexRef.current = index;
    syncHistoryFlags();
  };

  const initCanvas = () => {
    if (!canvasElRef.current) return;
    if (fabricRef.current) return;

    const canvas = new Canvas(canvasElRef.current, {
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: "#ffffff",
    });
    fabricRef.current = canvas;

    const onMutate = () => {
      const json = JSON.stringify(canvas.toJSON());
      pushHistory(json);
    };
    canvas.on("object:added", onMutate);
    canvas.on("object:modified", onMutate);
    canvas.on("object:removed", onMutate);

    pushHistory(JSON.stringify(canvas.toJSON()));
  };

  useEffect(() => {
    initCanvas();
    return () => {
      fabricRef.current?.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyMode = useMemo(() => {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    canvas.isDrawingMode = mode === "pen";
    canvas.selection = mode === "select";
    canvas.forEachObject((obj) => obj.set({ selectable: mode === "select" }));
    canvas.renderAll();
    return true;
  }, [mode]);

  useEffect(() => {
    void applyMode;
  }, [applyMode]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (!canvas.freeDrawingBrush) return;
    canvas.freeDrawingBrush.color = stroke;
    canvas.freeDrawingBrush.width = clampInt(strokeWidth, 1, 40);
  }, [stroke, strokeWidth]);

  const clear = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.clear();
    canvas.backgroundColor = "#ffffff";
    canvas.renderAll();
    pushHistory(JSON.stringify(canvas.toJSON()));
  };

  const setBackgroundImage = async (file: File) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const url = URL.createObjectURL(file);
    try {
      const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });

      const w = img.width ?? 1;
      const h = img.height ?? 1;
      canvas.setWidth(w);
      canvas.setHeight(h);
      img.set({ originX: "left", originY: "top", left: 0, top: 0, selectable: false, evented: false });
      canvas.backgroundImage = img;
      canvas.renderAll();

      pushHistory(JSON.stringify(canvas.toJSON()));
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert(ui.errPickImage);
      return;
    }
    await setBackgroundImage(file);
    event.target.value = "";
  };

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    let start: { x: number; y: number } | null = null;
    let temp: Rect | Line | null = null;

    const onDown = (opt: { e: MouseEvent | TouchEvent }) => {
      if (mode === "rect" || mode === "arrow") {
        const p = canvas.getPointer(opt.e);
        start = { x: p.x, y: p.y };
      }
      if (mode === "text") {
        const p = canvas.getPointer(opt.e);
        const textbox = new Textbox("", {
          left: p.x,
          top: p.y,
          fill: stroke,
          fontSize: clampInt(fontSize, 10, 120),
          editable: true,
          width: 320,
        });
        canvas.add(textbox);
        canvas.setActiveObject(textbox);
        (textbox as unknown as { enterEditing?: () => void }).enterEditing?.();
      }
    };

    const onMove = (opt: { e: MouseEvent | TouchEvent }) => {
      if (!start) return;
      const p = canvas.getPointer(opt.e);

      if (mode === "rect") {
        const left = Math.min(start.x, p.x);
        const top = Math.min(start.y, p.y);
        const width = Math.abs(p.x - start.x);
        const height = Math.abs(p.y - start.y);
        if (!temp) {
          temp = new Rect({
            left,
            top,
            width,
            height,
            fill,
            stroke,
            strokeWidth: clampInt(strokeWidth, 1, 40),
            selectable: false,
            evented: false,
          });
          canvas.add(temp);
        } else {
          temp.set({ left, top, width, height });
          canvas.renderAll();
        }
      }

      if (mode === "arrow") {
        if (!temp) {
          const line = new Line([start.x, start.y, p.x, p.y], {
            stroke,
            strokeWidth: clampInt(strokeWidth, 1, 40),
            selectable: false,
            evented: false,
          });
          temp = line;
          canvas.add(temp);
        } else if (temp instanceof Line) {
          temp.set({ x2: p.x, y2: p.y });
          canvas.renderAll();
        }
      }
    };

    const onUp = () => {
      start = null;
      temp = null;
    };

    canvas.on("mouse:down", onDown);
    canvas.on("mouse:move", onMove);
    canvas.on("mouse:up", onUp);
    return () => {
      canvas.off("mouse:down", onDown);
      canvas.off("mouse:move", onMove);
      canvas.off("mouse:up", onUp);
    };
  }, [fill, fontSize, mode, stroke, strokeWidth, ui.errPickImage]);

  const undo = async () => {
    const idx = historyIndexRef.current;
    if (idx <= 0) return;
    await loadFromHistory(idx - 1);
  };

  const redo = async () => {
    const idx = historyIndexRef.current;
    const len = historyRef.current.length;
    if (idx < 0 || idx >= len - 1) return;
    await loadFromHistory(idx + 1);
  };

  const exportPngDataUrl = () => {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    canvas.discardActiveObject();
    canvas.renderAll();
    return canvas.toDataURL({ format: "png", multiplier: 1, enableRetinaScaling: true });
  };

  const download = async () => {
    const dataUrl = exportPngDataUrl();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "annotated.png";
    a.click();
  };

  const copyPng = async () => {
    const dataUrl = exportPngDataUrl();
    if (!dataUrl) return;
    const blob = await dataUrlToBlob(dataUrl);
    // Clipboard API requires secure context
    const ClipboardItemCtor = window.ClipboardItem;
    if (!ClipboardItemCtor) return;
    const item = new ClipboardItemCtor({ "image/png": blob });
    await navigator.clipboard.write([item]);
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 900);
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">{ui.hint}</div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {ui.pick}
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {ui.clear}
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <div className="overflow-auto rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <canvas ref={canvasElRef} className="block max-w-full" />
          </div>

          <div className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="text-xs font-medium text-slate-700">{ui.mode}</div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["select", ui.select],
                  ["pen", ui.pen],
                  ["rect", ui.rect],
                  ["arrow", ui.arrow],
                  ["text", ui.text],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMode(k)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                    mode === k ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1 text-xs text-slate-600">
                {ui.stroke}
                <input type="color" value={stroke} onChange={(e) => setStroke(e.target.value)} className="h-10 w-full" />
              </label>
              <label className="grid gap-1 text-xs text-slate-600">
                {ui.fill}
                <input type="color" value={fill} onChange={(e) => setFill(e.target.value)} className="h-10 w-full" />
              </label>
              <label className="grid gap-1 text-xs text-slate-600">
                {ui.width}
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(clampInt(Number(e.target.value), 1, 40))}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-600">
                {ui.fontSize}
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={fontSize}
                  onChange={(e) => setFontSize(clampInt(Number(e.target.value), 10, 120))}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => void undo()}
                disabled={!hasUndo}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {ui.undo}
              </button>
              <button
                type="button"
                onClick={() => void redo()}
                disabled={!hasRedo}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {ui.redo}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => void download()}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                {ui.downloadPng}
              </button>
              <button
                type="button"
                onClick={() => void copyPng()}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                {copyState === "copied" ? ui.copied : ui.copyPng}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
