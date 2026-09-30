"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  clampNumber,
  clampRectTo,
  drawEditedImage,
  effectiveCrop,
  IDENTITY_EDIT,
  isIdentityEdit,
  loadBitmap,
  maxScaleForEdge,
  MIN_SCALE,
  outputSize,
  rotateCropRect,
  rotatedDims,
  type ImageEdit,
  type Rect,
  type Rotation,
} from "./imageEdit";

type Mode = "scale" | "crop";
type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type CropDragHandle = HandleId | "move";

const DEFAULT_MODAL_UI = {
  editorTitle: "编辑图片",
  apply: "应用",
  cancel: "取消",
  rotateLeft: "左转 90°",
  rotateRight: "右转 90°",
  resetEdit: "重置",
  modeScale: "缩放",
  modeCrop: "裁剪",
  scaleHint: "拖动四角：等比例缩放；拖动四边中点：单方向缩放。",
  cropHint: "拖动控制点调整裁剪区域；拖动区域内部移动位置。",
  cropFull: "全图",
  originalLabel: "原始",
  outputLabel: "输出尺寸",
  editorLoadError: "图片加载失败",
} as const;

type ModalUi = Record<string, string>;

type ScaleDragState = {
  kind: "scale";
  handle: HandleId;
  startX: number;
  startY: number;
  sx0: number;
  sy0: number;
  w0: number;
  h0: number;
};

type CropDragState = {
  kind: "crop";
  handle: CropDragHandle;
  startX: number;
  startY: number;
  rect0: Rect;
  viewW: number;
  viewH: number;
  k: number;
};

const MIN_CROP_PX = 16;
const MAX_DISPLAY_EDGE = 2600;

const round3 = (value: number) => Math.round(value * 1000) / 1000;

const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

const HANDLE_CLASSES: Record<HandleId, string> = {
  nw: "left-0 top-0",
  n: "left-1/2 top-0",
  ne: "right-0 top-0",
  e: "right-0 top-1/2",
  se: "right-0 bottom-0",
  s: "left-1/2 bottom-0",
  sw: "left-0 bottom-0",
  w: "left-0 top-1/2",
};

const HANDLE_TRANSLATE: Record<HandleId, string> = {
  nw: "translate(-50%, -50%)",
  n: "translate(-50%, -50%)",
  ne: "translate(50%, -50%)",
  e: "translate(50%, -50%)",
  se: "translate(50%, 50%)",
  s: "translate(-50%, 50%)",
  sw: "translate(-50%, 50%)",
  w: "translate(-50%, -50%)",
};

const ALL_HANDLES: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export default function ImageEditorModal({
  file,
  edit,
  ui,
  onApply,
  onClose,
}: {
  file: File;
  edit: ImageEdit;
  ui?: ModalUi;
  onApply: (edit: ImageEdit) => void;
  onClose: () => void;
}) {
  const t = { ...DEFAULT_MODAL_UI, ...ui };

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<ImageEdit>(edit);
  const [mode, setMode] = useState<Mode>("scale");
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<ScaleDragState | CropDragState | null>(null);
  const drawKeyRef = useRef("");
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // glass-card 的 backdrop-filter 会改变 fixed 定位基准，弹窗必须挂到 body
    setPortalHost(document.body);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadBitmap(file)
      .then((bmp) => {
        if (cancelled) {
          bmp.close();
          return;
        }
        setBitmap(bmp);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    return () => {
      if (bitmap) bitmap.close();
    };
  }, [bitmap]);

  useEffect(() => {
    const measure = () => {
      const el = stageRef.current;
      if (!el) return;
      const style = window.getComputedStyle(el);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      setStageSize({
        w: Math.max(120, el.clientWidth - padX),
        h: Math.max(120, el.clientHeight - padY),
      });
    };
    // portal 挂载后舞台才存在于 DOM 中
    if (!portalHost) return;
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [portalHost]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const fullRotated = useMemo(
    () => (bitmap ? rotatedDims(bitmap.width, bitmap.height, draft.rotation) : null),
    [bitmap, draft.rotation],
  );

  const cropRect = useMemo(
    () => (bitmap ? effectiveCrop(draft, bitmap.width, bitmap.height) : null),
    [bitmap, draft],
  );

  const outSize = useMemo(
    () => (bitmap ? outputSize(draft, bitmap.width, bitmap.height) : null),
    [bitmap, draft],
  );

  // 预览视图：缩放模式显示裁剪区域（用户缩放通过 CSS 拉伸），裁剪模式显示完整旋转图
  const viewRect: Rect | null = useMemo(() => {
    if (!bitmap || !fullRotated) return null;
    if (mode === "crop") return { x: 0, y: 0, w: fullRotated.w, h: fullRotated.h };
    return cropRect;
  }, [bitmap, fullRotated, cropRect, mode]);

  const dispBox = useMemo(() => {
    if (!viewRect || !stageSize) return null;
    const k = Math.min(
      stageSize.w / viewRect.w,
      stageSize.h / viewRect.h,
      MAX_DISPLAY_EDGE / Math.max(viewRect.w, viewRect.h),
    );
    return {
      w: Math.max(1, Math.round(viewRect.w * k)),
      h: Math.max(1, Math.round(viewRect.h * k)),
    };
  }, [viewRect, stageSize]);

  const scaledBox = useMemo(
    () =>
      dispBox
        ? {
            w: Math.max(1, Math.round(dispBox.w * draft.scaleX)),
            h: Math.max(1, Math.round(dispBox.h * draft.scaleY)),
          }
        : null,
    [dispBox, draft.scaleX, draft.scaleY],
  );

  // 绘制画布（用户缩放不重绘，交给 CSS）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap || !viewRect || !dispBox) return;
    const dpr = window.devicePixelRatio || 1;
    const backingW = Math.max(1, Math.round(dispBox.w * dpr));
    const backingH = Math.max(1, Math.round(dispBox.h * dpr));
    const drawKey = `${mode}:${viewRect.x},${viewRect.y},${viewRect.w},${viewRect.h}:${draft.rotation}:${backingW}x${backingH}`;
    if (drawKey === drawKeyRef.current && canvas.width === backingW && canvas.height === backingH) return;
    drawKeyRef.current = drawKey;
    canvas.width = backingW;
    canvas.height = backingH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, backingW, backingH);
    drawEditedImage(ctx, bitmap, bitmap.width, bitmap.height, draft, viewRect, backingW, backingH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap, viewRect, dispBox, mode, draft.rotation]);

  const rotate = useCallback(
    (dir: 1 | -1) => {
      if (!bitmap) return;
      setDraft((prev) => {
        const { w, h } = rotatedDims(bitmap.width, bitmap.height, prev.rotation);
        const rotation = ((((prev.rotation + dir * 90) % 360) + 360) % 360) as Rotation;
        const crop = prev.crop ? clampRectTo(rotateCropRect(prev.crop, w, h, dir), h, w) : null;
        return { rotation, crop, scaleX: prev.scaleY, scaleY: prev.scaleX };
      });
    },
    [bitmap],
  );

  const resetEdit = useCallback(() => {
    setDraft({ ...IDENTITY_EDIT });
    setMode("scale");
  }, []);

  const resetCropFull = useCallback(() => {
    setDraft((prev) => ({ ...prev, crop: null }));
  }, []);

  const startScaleDrag = (handle: HandleId) => (event: React.PointerEvent) => {
    if (!bitmap || !dispBox) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // 忽略捕获失败
    }
    dragRef.current = {
      kind: "scale",
      handle,
      startX: event.clientX,
      startY: event.clientY,
      sx0: draft.scaleX,
      sy0: draft.scaleY,
      w0: dispBox.w * draft.scaleX,
      h0: dispBox.h * draft.scaleY,
    };
  };

  const startCropDrag = (handle: CropDragHandle) => (event: React.PointerEvent) => {
    if (!bitmap || !cropRect || !fullRotated || !dispBox) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // 忽略捕获失败
    }
    const k = dispBox.w / fullRotated.w;
    dragRef.current = {
      kind: "crop",
      handle,
      startX: event.clientX,
      startY: event.clientY,
      rect0: draft.crop ? { ...draft.crop } : { x: 0, y: 0, w: fullRotated.w, h: fullRotated.h },
      viewW: fullRotated.w,
      viewH: fullRotated.h,
      k,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "scale") {
      if (!cropRect) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.handle.length === 2) {
        const signX = drag.handle.includes("e") ? 1 : -1;
        const signY = drag.handle.includes("s") ? 1 : -1;
        let ratio = Math.max(
          (drag.w0 + signX * dx) / drag.w0,
          (drag.h0 + signY * dy) / drag.h0,
          0.02,
        );
        const capRatio = Math.min(
          maxScaleForEdge(cropRect.w) / drag.sx0,
          maxScaleForEdge(cropRect.h) / drag.sy0,
        );
        const floorRatio = Math.max(MIN_SCALE / drag.sx0, MIN_SCALE / drag.sy0);
        ratio = clampNumber(ratio, floorRatio, capRatio);
        setDraft((prev) => ({
          ...prev,
          scaleX: round3(drag.sx0 * ratio),
          scaleY: round3(drag.sy0 * ratio),
        }));
      } else if (drag.handle === "e" || drag.handle === "w") {
        const ratio = (drag.w0 + (drag.handle === "e" ? dx : -dx)) / drag.w0;
        const clamped = clampNumber(
          ratio,
          MIN_SCALE / drag.sx0,
          maxScaleForEdge(cropRect.w) / drag.sx0,
        );
        setDraft((prev) => ({ ...prev, scaleX: round3(drag.sx0 * clamped) }));
      } else {
        const ratio = (drag.h0 + (drag.handle === "s" ? dy : -dy)) / drag.h0;
        const clamped = clampNumber(
          ratio,
          MIN_SCALE / drag.sy0,
          maxScaleForEdge(cropRect.h) / drag.sy0,
        );
        setDraft((prev) => ({ ...prev, scaleY: round3(drag.sy0 * clamped) }));
      }
      return;
    }

    const dx = (event.clientX - drag.startX) / drag.k;
    const dy = (event.clientY - drag.startY) / drag.k;
    if (drag.handle === "move") {
      const x = clampNumber(drag.rect0.x + dx, 0, drag.viewW - drag.rect0.w);
      const y = clampNumber(drag.rect0.y + dy, 0, drag.viewH - drag.rect0.h);
      setDraft((prev) => ({
        ...prev,
        crop: { x: Math.round(x), y: Math.round(y), w: drag.rect0.w, h: drag.rect0.h },
      }));
      return;
    }
    const left0 = drag.rect0.x;
    const right0 = drag.rect0.x + drag.rect0.w;
    const top0 = drag.rect0.y;
    const bottom0 = drag.rect0.y + drag.rect0.h;
    let left = left0;
    let right = right0;
    let top = top0;
    let bottom = bottom0;
    if (drag.handle.includes("w")) left = clampNumber(left0 + dx, 0, right0 - MIN_CROP_PX);
    if (drag.handle.includes("e")) right = clampNumber(right0 + dx, left0 + MIN_CROP_PX, drag.viewW);
    if (drag.handle.includes("n")) top = clampNumber(top0 + dy, 0, bottom0 - MIN_CROP_PX);
    if (drag.handle.includes("s")) bottom = clampNumber(bottom0 + dy, top0 + MIN_CROP_PX, drag.viewH);
    setDraft((prev) => ({
      ...prev,
      crop: {
        x: Math.round(left),
        y: Math.round(top),
        w: Math.max(1, Math.round(right - left)),
        h: Math.max(1, Math.round(bottom - top)),
      },
    }));
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // 指针可能已释放
    }
  };

  const apply = () => {
    if (!bitmap) return;
    const { w, h } = rotatedDims(bitmap.width, bitmap.height, draft.rotation);
    const isFull =
      !draft.crop ||
      (draft.crop.x <= 0 && draft.crop.y <= 0 && draft.crop.w >= w && draft.crop.h >= h);
    onApply({
      rotation: draft.rotation,
      crop: isFull ? null : draft.crop,
      scaleX: round3(draft.scaleX),
      scaleY: round3(draft.scaleY),
    });
  };

  const cropViewRect = (() => {
    if (mode !== "crop" || !cropRect || !fullRotated || !dispBox) return null;
    const k = dispBox.w / fullRotated.w;
    return {
      left: cropRect.x * k,
      top: cropRect.y * k,
      w: cropRect.w * k,
      h: cropRect.h * k,
    };
  })();

  const edited = !isIdentityEdit(draft);

  if (!portalHost) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{t.editorTitle}</div>
            <div className="truncate text-xs text-slate-500">{file.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            aria-label={t.cancel}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => rotate(-1)}
              disabled={!bitmap}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-50"
            >
              ↺ {t.rotateLeft}
            </button>
            <button
              type="button"
              onClick={() => rotate(1)}
              disabled={!bitmap}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-50"
            >
              ↻ {t.rotateRight}
            </button>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {(["scale", "crop"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {m === "scale" ? t.modeScale : t.modeCrop}
              </button>
            ))}
          </div>

          {mode === "crop" && (
            <button
              type="button"
              onClick={resetCropFull}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {t.cropFull}
            </button>
          )}

          <button
            type="button"
            onClick={resetEdit}
            disabled={!edited}
            className="ml-auto rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-50"
          >
            {t.resetEdit}
          </button>
        </div>

        <div
          ref={stageRef}
          className="flex min-h-[320px] flex-1 items-center justify-center overflow-auto bg-slate-100 p-6"
          style={{
            backgroundImage:
              "linear-gradient(45deg, #e8edf3 25%, transparent 25%, transparent 75%, #e8edf3 75%), linear-gradient(45deg, #e8edf3 25%, transparent 25%, transparent 75%, #e8edf3 75%)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 10px 10px",
          }}
        >
          {loadError ? (
            <div className="text-sm text-rose-600">{t.editorLoadError}</div>
          ) : !bitmap || !scaledBox ? (
            <div className="text-sm text-slate-400">…</div>
          ) : (
            <div className="relative shadow-lg" style={{ width: scaledBox.w, height: scaledBox.h }}>
              <canvas
                ref={canvasRef}
                style={{ width: scaledBox.w, height: scaledBox.h }}
                className="block"
              />

              {mode === "scale" &&
                ALL_HANDLES.map((handle) => (
                  <div
                    key={handle}
                    onPointerDown={startScaleDrag(handle)}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className={`absolute z-10 h-4 w-4 rounded-sm border-2 border-blue-500 bg-white shadow ${HANDLE_CLASSES[handle]}`}
                    style={{ touchAction: "none", cursor: HANDLE_CURSORS[handle] }}
                  />
                ))}

              {mode === "crop" && cropViewRect && (
                <>
                  <div
                    onPointerDown={startCropDrag("move")}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className="absolute cursor-move"
                    style={{
                      left: cropViewRect.left,
                      top: cropViewRect.top,
                      width: cropViewRect.w,
                      height: cropViewRect.h,
                      boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
                      border: "2px solid rgba(255, 255, 255, 0.95)",
                      touchAction: "none",
                    }}
                  />
                  {ALL_HANDLES.map((handle) => {
                    const hx = handle.includes("w")
                      ? cropViewRect.left
                      : handle.includes("e")
                        ? cropViewRect.left + cropViewRect.w
                        : cropViewRect.left + cropViewRect.w / 2;
                    const hy = handle.includes("n")
                      ? cropViewRect.top
                      : handle.includes("s")
                        ? cropViewRect.top + cropViewRect.h
                        : cropViewRect.top + cropViewRect.h / 2;
                    return (
                      <div
                        key={handle}
                        onPointerDown={startCropDrag(handle)}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        className="absolute z-10 h-3.5 w-3.5 rounded-full border-2 border-blue-500 bg-white shadow"
                        style={{
                          touchAction: "none",
                          cursor: HANDLE_CURSORS[handle],
                          left: hx,
                          top: hy,
                          transform: HANDLE_TRANSLATE[handle],
                        }}
                      />
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-600">
              {bitmap && outSize ? (
                <>
                  {t.originalLabel} {bitmap.width}×{bitmap.height}px · {t.outputLabel} {outSize.w}×
                  {outSize.h}px
                  {edited && (
                    <span className="ml-2 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">
                      {(draft.scaleX * 100).toFixed(0)}% × {(draft.scaleY * 100).toFixed(0)}%
                    </span>
                  )}
                </>
              ) : (
                "…"
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              {mode === "scale" ? t.scaleHint : t.cropHint}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!bitmap}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {t.apply}
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalHost,
  );
}
