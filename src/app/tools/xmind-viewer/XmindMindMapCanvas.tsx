"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type TopicNode = {
  title?: string;
  labels?: string[];
  children?: {
    attached?: TopicNode[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type XmindMindMapCanvasHandle = {
  fitToView: () => void;
  resetView: () => void;
};

type LayoutNode = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
};

type Layout = {
  nodes: LayoutNode[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

type Props = {
  rootTopic: TopicNode | null;
};

const NODE_HEIGHT = 34;
const NODE_PADDING_X = 14;
const NODE_RADIUS = 12;
const LEVEL_GAP_X = 240;
const SIBLING_GAP_Y = 18;

const getTitle = (topic: TopicNode): string => (topic.title ?? "").trim() || "(无标题)";

const getChildren = (topic: TopicNode): TopicNode[] => {
  const children = topic.children?.attached;
  return Array.isArray(children) ? children : [];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const createMeasureContext = (): CanvasRenderingContext2D | null => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = "14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  return ctx;
};

const measureNodeWidth = (ctx: CanvasRenderingContext2D, title: string) => {
  const metrics = ctx.measureText(title);
  const width = Math.ceil(metrics.width + NODE_PADDING_X * 2);
  return clamp(width, 110, 420);
};

const truncateText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const suffix = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = text.slice(0, mid) + suffix;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  return text.slice(0, Math.max(0, lo - 1)) + suffix;
};

type InternalNode = {
  id: string;
  title: string;
  width: number;
  height: number;
  children: InternalNode[];
  subtreeHeight: number;
};

const buildInternalTree = (topic: TopicNode, ctx: CanvasRenderingContext2D, idPrefix: string): InternalNode => {
  const title = getTitle(topic);
  const width = measureNodeWidth(ctx, title);
  const children = getChildren(topic).map((child, index) =>
    buildInternalTree(child, ctx, `${idPrefix}.${index + 1}`),
  );
  return { id: idPrefix, title, width, height: NODE_HEIGHT, children, subtreeHeight: NODE_HEIGHT };
};

const computeSubtreeHeights = (node: InternalNode): number => {
  if (node.children.length === 0) {
    node.subtreeHeight = node.height;
    return node.subtreeHeight;
  }
  const childrenHeights = node.children.map(computeSubtreeHeights);
  const stacked = childrenHeights.reduce((sum, h) => sum + h, 0) + SIBLING_GAP_Y * (childrenHeights.length - 1);
  node.subtreeHeight = Math.max(node.height, stacked);
  return node.subtreeHeight;
};

const assignPositions = (
  node: InternalNode,
  direction: -1 | 1,
  parentX: number,
  parentWidth: number,
  subtreeTopY: number,
  out: LayoutNode[],
  parentId: string | null,
) => {
  const x = parentX + direction * (parentWidth / 2 + LEVEL_GAP_X + node.width / 2);
  let y = subtreeTopY + node.height / 2;

  if (node.children.length > 0) {
    let cursorY = subtreeTopY;
    for (const child of node.children) {
      assignPositions(child, direction, x, node.width, cursorY, out, node.id);
      cursorY += child.subtreeHeight + SIBLING_GAP_Y;
    }
    const firstChild = out.find((n) => n.id === node.children[0]!.id);
    const lastChild = out.find((n) => n.id === node.children[node.children.length - 1]!.id);
    if (firstChild && lastChild) y = (firstChild.y + lastChild.y) / 2;
  }

  out.push({ id: node.id, title: node.title, x, y, width: node.width, height: node.height, parentId });
};

const layoutMindMap = (rootTopic: TopicNode, ctx: CanvasRenderingContext2D): Layout => {
  const root = buildInternalTree(rootTopic, ctx, "root");
  computeSubtreeHeights(root);

  const topChildren = root.children;
  const leftChildren: InternalNode[] = [];
  const rightChildren: InternalNode[] = [];
  topChildren.forEach((child, index) => {
    if (index % 2 === 0) rightChildren.push(child);
    else leftChildren.push(child);
  });

  const nodes: LayoutNode[] = [];
  nodes.push({
    id: root.id,
    title: root.title,
    x: 0,
    y: 0,
    width: root.width,
    height: root.height,
    parentId: null,
  });

  const totalHeight = (items: InternalNode[]) =>
    items.reduce((sum, n) => sum + n.subtreeHeight, 0) + Math.max(0, items.length - 1) * SIBLING_GAP_Y;

  const leftHeight = totalHeight(leftChildren);
  const rightHeight = totalHeight(rightChildren);

  let cursorLeft = -leftHeight / 2;
  for (const child of leftChildren) {
    assignPositions(child, -1, 0, root.width, cursorLeft, nodes, root.id);
    cursorLeft += child.subtreeHeight + SIBLING_GAP_Y;
  }

  let cursorRight = -rightHeight / 2;
  for (const child of rightChildren) {
    assignPositions(child, 1, 0, root.width, cursorRight, nodes, root.id);
    cursorRight += child.subtreeHeight + SIBLING_GAP_Y;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.width / 2);
    maxX = Math.max(maxX, node.x + node.width / 2);
    minY = Math.min(minY, node.y - node.height / 2);
    maxY = Math.max(maxY, node.y + node.height / 2);
  }

  return { nodes, bounds: { minX, maxX, minY, maxY } };
};

const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const worldToScreen = (x: number, y: number, view: ViewState) => ({
  x: x * view.scale + view.offsetX,
  y: y * view.scale + view.offsetY,
});

type ViewState = { scale: number; offsetX: number; offsetY: number };

const defaultView: ViewState = { scale: 1, offsetX: 0, offsetY: 0 };

const XmindMindMapCanvas = forwardRef<XmindMindMapCanvasHandle, Props>(function XmindMindMapCanvas({ rootTopic }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ViewState>({ ...defaultView });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const rafRef = useRef<number | null>(null);
  const drawRef = useRef<(() => void) | null>(null);

  const measureCtx = useMemo(() => createMeasureContext(), []);
  const layout = useMemo(() => {
    if (!rootTopic || !measureCtx) return null;
    return layoutMindMap(rootTopic, measureCtx);
  }, [measureCtx, rootTopic]);

  const requestDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      drawRef.current?.();
      setZoomPercent(Math.round(viewRef.current.scale * 100));
    });
  }, []);

  const fitToView = useCallback(() => {
    if (!layout) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = containerRef.current;
    if (!container) return;

    const padding = 36;
    const rect = container.getBoundingClientRect();
    const usableWidth = Math.max(1, rect.width - padding * 2);
    const usableHeight = Math.max(1, rect.height - padding * 2);

    const boundsWidth = Math.max(1, layout.bounds.maxX - layout.bounds.minX);
    const boundsHeight = Math.max(1, layout.bounds.maxY - layout.bounds.minY);

    const scale = clamp(Math.min(usableWidth / boundsWidth, usableHeight / boundsHeight), 0.2, 3);
    const centerX = (layout.bounds.minX + layout.bounds.maxX) / 2;
    const centerY = (layout.bounds.minY + layout.bounds.maxY) / 2;

    viewRef.current.scale = scale;
    viewRef.current.offsetX = rect.width / 2 - centerX * scale;
    viewRef.current.offsetY = rect.height / 2 - centerY * scale;
    requestDraw();
  }, [layout, requestDraw]);

  const resetView = useCallback(() => {
    viewRef.current = { ...defaultView };
    fitToView();
  }, [fitToView]);

  useImperativeHandle(ref, () => ({ fitToView, resetView }));

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      requestDraw();
      fitToView();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitToView, requestDraw]);

  const zoomAround = useCallback((nextScale: number, screenX: number, screenY: number) => {
    const view = viewRef.current;
    const before = {
      x: (screenX - view.offsetX) / view.scale,
      y: (screenY - view.offsetY) / view.scale,
    };
    view.scale = nextScale;
    const after = worldToScreen(before.x, before.y, view);
    view.offsetX += screenX - after.x;
    view.offsetY += screenY - after.y;
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const view = viewRef.current;
      const nextScale = clamp(view.scale * factor, 0.15, 4);
      zoomAround(nextScale, centerX, centerY);
      requestDraw();
    },
    [requestDraw, zoomAround],
  );

  const hitTest = useCallback(
    (screenX: number, screenY: number) => {
      if (!layout) return null;
      const view = viewRef.current;
      const worldX = (screenX - view.offsetX) / view.scale;
      const worldY = (screenY - view.offsetY) / view.scale;
      for (let i = layout.nodes.length - 1; i >= 0; i -= 1) {
        const node = layout.nodes[i]!;
        const left = node.x - node.width / 2;
        const top = node.y - node.height / 2;
        if (worldX >= left && worldX <= left + node.width && worldY >= top && worldY <= top + node.height) {
          return node;
        }
      }
      return null;
    },
    [layout],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!layout) {
      ctx.fillStyle = "#64748b";
      ctx.font = "14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("选择 .xmind 文件后将在这里渲染思维导图（Canvas）", rect.width / 2, rect.height / 2);
      return;
    }

    const view = viewRef.current;
    ctx.save();
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.scale, view.scale);

    const byId = new Map(layout.nodes.map((n) => [n.id, n] as const));

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#cbd5e1";
    for (const node of layout.nodes) {
      if (!node.parentId) continue;
      const parent = byId.get(node.parentId);
      if (!parent) continue;
      const isRight = node.x > parent.x;
      const fromX = parent.x + (isRight ? parent.width / 2 : -parent.width / 2);
      const fromY = parent.y;
      const toX = node.x + (isRight ? -node.width / 2 : node.width / 2);
      const toY = node.y;
      const dx = toX - fromX;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.bezierCurveTo(fromX + dx * 0.5, fromY, toX - dx * 0.5, toY, toX, toY);
      ctx.stroke();
    }

    const hover = hoveredNodeId ? byId.get(hoveredNodeId) ?? null : null;

    for (const node of layout.nodes) {
      const left = node.x - node.width / 2;
      const top = node.y - node.height / 2;

      const isRoot = node.parentId === null;
      const isHovered = hover?.id === node.id;

      ctx.save();
      if (isHovered) {
        ctx.shadowColor = "rgba(15, 23, 42, 0.25)";
        ctx.shadowBlur = 14 / view.scale;
      }

      drawRoundedRect(ctx, left, top, node.width, node.height, NODE_RADIUS);
      ctx.fillStyle = isRoot ? "#0f172a" : "#ffffff";
      ctx.fill();
      ctx.lineWidth = isRoot ? 2.5 : 2;
      ctx.strokeStyle = isRoot ? "#0f172a" : isHovered ? "#0f172a" : "#e2e8f0";
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = isRoot ? "#ffffff" : "#0f172a";
      ctx.font = "14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const displayText = truncateText(ctx, node.title, Math.max(10, node.width - NODE_PADDING_X * 2));
      ctx.fillText(displayText, node.x, node.y);
      ctx.restore();
    }

    ctx.restore();

    // Corner hints (screen space)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#64748b";
    ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("拖拽平移 · 滚轮缩放 · 双击自适应", 14, rect.height - 12);
  }, [hoveredNodeId, layout]);

  useLayoutEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useEffect(() => {
    requestDraw();
  }, [layout, hoveredNodeId, requestDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startOffsetX = 0;
    let startOffsetY = 0;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startOffsetX = viewRef.current.offsetX;
      startOffsetY = viewRef.current.offsetY;
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (isDragging) {
        viewRef.current.offsetX = startOffsetX + (e.clientX - startX);
        viewRef.current.offsetY = startOffsetY + (e.clientY - startY);
        requestDraw();
        return;
      }
      const hit = hitTest(x, y);
      setHoveredNodeId(hit?.id ?? null);
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (!layout) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = -e.deltaY;
      const view = viewRef.current;
      const nextScale = clamp(view.scale * (delta > 0 ? 1.08 : 0.92), 0.15, 4);
      zoomAround(nextScale, mouseX, mouseY);
      requestDraw();
    };

    const onDblClick = () => fitToView();

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDblClick);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDblClick);
    };
  }, [fitToView, hitTest, layout, requestDraw, zoomAround]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">思维导图预览（Canvas）</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
            {zoomPercent}%
          </div>
          <button
            type="button"
            onClick={() => zoomBy(0.9)}
            className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            aria-label="缩小"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1.1)}
            className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            aria-label="放大"
          >
            +
          </button>
          <button
            type="button"
            onClick={fitToView}
            className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
          >
            自适应
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
          >
            重置
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative h-[70vh] w-full overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200">
        <canvas ref={canvasRef} className="absolute inset-0" />
        {hoveredNodeId && layout?.nodes && (
          <div className="pointer-events-none absolute left-4 top-4 max-w-[min(520px,calc(100%-2rem))] rounded-2xl bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg">
            {layout.nodes.find((n) => n.id === hoveredNodeId)?.title ?? ""}
          </div>
        )}
      </div>
    </div>
  );
});

export default XmindMindMapCanvas;
