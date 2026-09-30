"use client";

import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  MindMapBoundary,
  MindMapLayoutMode,
  MindMapNode,
  MindMapRelationship,
  MindMapSummary,
  MindMapTheme,
} from "./types";

export type XmindMindMapCanvasHandle = {
  fitToView: () => void;
  resetView: () => void;
  zoomByFactor: (factor: number) => void;
  toggleFullscreen: () => void;
  getViewState: () => ViewState;
  setViewState: (viewState: ViewState) => void;
  getViewStateBundle: () => ViewStateBundle;
  setViewStateBundle: (bundle: ViewStateBundle) => void;
  exportAsPng: (options?: { scale?: number; padding?: number }) => Promise<Blob>;
  exportAsSvg: (options?: { padding?: number }) => string;
};

type Props = {
  rootTopic: MindMapNode | null;
  layoutMode: MindMapLayoutMode;
  theme: MindMapTheme;
  isEnglish?: boolean;
  mode?: "edit" | "read";
  relationships?: MindMapRelationship[];
  boundaries?: MindMapBoundary[];
  summaries?: MindMapSummary[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onRenameNode: (nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onMoveNode: (draggedNodeId: string, targetNodeId: string, placement: "before" | "after" | "child") => void;
  viewResetKey?: number;
  fullscreenSidebar?: ReactNode;
  fullscreenToolbar?: ReactNode;
  fullscreenOverlay?: ReactNode;
};

export type ViewState = { scale: number; offsetX: number; offsetY: number };

export type ViewStateBundle = { normal: ViewState; fullscreen: ViewState };

type LayoutNode = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
  hasChildren: boolean;
  collapsed: boolean;
  direction: -1 | 1;
};

type Layout = {
  nodes: LayoutNode[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

type InternalNode = {
  id: string;
  title: string;
  width: number;
  height: number;
  children: InternalNode[];
  subtreeHeight: number;
  subtreeWidth: number;
  hasChildren: boolean;
  collapsed: boolean;
};

const NODE_HEIGHT = 34;
const NODE_PADDING_X = 14;
const NODE_RADIUS = 12;
const LEVEL_GAP_X = 220;
const SIBLING_GAP_Y = 18;
const LEVEL_GAP_Y = 130;
const SIBLING_GAP_X = 32;
const COLLAPSE_MARKER_RADIUS = 8;
const COMPACT_LEVEL_GAP_Y = 20;
const COMPACT_INDENT_X = 180;
const COMPACT2_BRANCH_GAP_X = 80;
const SUPER_COMPACT_LEVEL_GAP_X = 70;
const SUPER_COMPACT_LEVEL_GAP_Y = 56;
const SUPER_COMPACT_SIBLING_GAP_X = 12;
const SUPER_COMPACT_SIBLING_GAP_Y = 8;
const SUPER_COMPACT_NODE_RADIUS = 4;
const SUPER_COMPACT_VERTICAL_NODE_WIDTH = 36;
const VERTICAL_TEXT_LINE_HEIGHT = 14;

const defaultView: ViewState = { scale: 1, offsetX: 0, offsetY: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const worldToScreen = (x: number, y: number, view: ViewState) => ({
  x: x * view.scale + view.offsetX,
  y: y * view.scale + view.offsetY,
});

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");

const withDefault = <T,>(value: T | undefined, fallback: T): T => (value === undefined ? fallback : value);

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

const truncateVerticalText = (text: string, maxChars: number): string[] => {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return chars;
  if (maxChars <= 1) return ["…"];
  return [...chars.slice(0, maxChars - 1), "…"];
};

const measureVerticalNodeHeight = (title: string): number => {
  const chars = Array.from(title);
  const raw = chars.length * VERTICAL_TEXT_LINE_HEIGHT + NODE_PADDING_X * 2;
  return clamp(raw, NODE_HEIGHT, 460);
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

const drawNodeTitleCanvas = (
  ctx: CanvasRenderingContext2D,
  options: { title: string; x: number; y: number; width: number; height: number },
  layoutMode: MindMapLayoutMode,
) => {
  ctx.font = "14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (layoutMode === "superCompactDownVertical") {
    const maxChars = Math.max(1, Math.floor((options.height - NODE_PADDING_X * 2) / VERTICAL_TEXT_LINE_HEIGHT));
    const chars = truncateVerticalText(options.title, maxChars);
    const startY = options.y - ((chars.length - 1) * VERTICAL_TEXT_LINE_HEIGHT) / 2;
    for (let index = 0; index < chars.length; index += 1) {
      ctx.fillText(chars[index]!, options.x, startY + index * VERTICAL_TEXT_LINE_HEIGHT);
    }
    return;
  }

  const displayText = truncateText(ctx, options.title, Math.max(10, options.width - NODE_PADDING_X * 2));
  ctx.fillText(displayText, options.x, options.y);
};

const nodeTitleToSvg = (
  options: { title: string; x: number; y: number; width: number; height: number; textFill: string },
  layoutMode: MindMapLayoutMode,
) => {
  if (layoutMode === "superCompactDownVertical") {
    const maxChars = Math.max(1, Math.floor((options.height - NODE_PADDING_X * 2) / VERTICAL_TEXT_LINE_HEIGHT));
    const chars = truncateVerticalText(options.title, maxChars);
    const startY = options.y - ((chars.length - 1) * VERTICAL_TEXT_LINE_HEIGHT) / 2;
    return chars.map(
      (char, index) =>
        `<text x="${options.x}" y="${startY + index * VERTICAL_TEXT_LINE_HEIGHT}" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="14" fill="${options.textFill}">${escapeXml(char)}</text>`,
    );
  }

  return [
    `<text x="${options.x}" y="${options.y}" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="14" fill="${options.textFill}">${escapeXml(options.title)}</text>`,
  ];
};

const buildInternalTree = (topic: MindMapNode, ctx: CanvasRenderingContext2D): InternalNode => {
  const title = topic.title.trim() || "(无标题)";
  const width = measureNodeWidth(ctx, title);
  const children = Array.isArray(topic.children) ? topic.children : [];
  const hasChildren = children.length > 0;
  const collapsed = Boolean(topic.collapsed);
  const visibleChildren = collapsed ? [] : children;

  return {
    id: topic.id,
    title,
    width,
    height: NODE_HEIGHT,
    children: visibleChildren.map((child) => buildInternalTree(child, ctx)),
    subtreeHeight: NODE_HEIGHT,
    subtreeWidth: width,
    hasChildren,
    collapsed,
  };
};

const applyVerticalTextNodeSizing = (node: InternalNode) => {
  node.width = SUPER_COMPACT_VERTICAL_NODE_WIDTH;
  node.height = measureVerticalNodeHeight(node.title);
  for (const child of node.children) applyVerticalTextNodeSizing(child);
};

const computeSubtreeHeightsWithGap = (node: InternalNode, siblingGapY: number): number => {
  if (node.children.length === 0) {
    node.subtreeHeight = node.height;
    return node.subtreeHeight;
  }
  const childrenHeights = node.children.map((child) => computeSubtreeHeightsWithGap(child, siblingGapY));
  const stacked = childrenHeights.reduce((sum, h) => sum + h, 0) + siblingGapY * (childrenHeights.length - 1);
  node.subtreeHeight = Math.max(node.height, stacked);
  return node.subtreeHeight;
};

const computeSubtreeWidthsWithGap = (node: InternalNode, siblingGapX: number): number => {
  if (node.children.length === 0) {
    node.subtreeWidth = node.width;
    return node.subtreeWidth;
  }
  const childrenWidths = node.children.map((child) => computeSubtreeWidthsWithGap(child, siblingGapX));
  const stacked = childrenWidths.reduce((sum, w) => sum + w, 0) + siblingGapX * (childrenWidths.length - 1);
  node.subtreeWidth = Math.max(node.width, stacked);
  return node.subtreeWidth;
};

const computeSubtreeHeights = (node: InternalNode): number => computeSubtreeHeightsWithGap(node, SIBLING_GAP_Y);

const computeSubtreeWidths = (node: InternalNode): number => computeSubtreeWidthsWithGap(node, SIBLING_GAP_X);

const isVerticalLayoutMode = (mode: MindMapLayoutMode) =>
  mode === "up" ||
  mode === "down" ||
  mode === "downCompact" ||
  mode === "downCompact2" ||
  mode === "superCompactDown" ||
  mode === "superCompactDownVertical";

const isVerticalConnectorLayoutMode = (mode: MindMapLayoutMode) =>
  mode === "up" ||
  mode === "down" ||
  mode === "downCompact" ||
  mode === "downCompact2" ||
  mode === "superCompactDown" ||
  mode === "superCompactDownVertical";

const isSuperCompactLayoutMode = (mode: MindMapLayoutMode) =>
  mode === "superCompactDown" || mode === "superCompactRight" || mode === "superCompactDownVertical";

const isOrthogonalConnectorLayoutMode = (mode: MindMapLayoutMode) => isSuperCompactLayoutMode(mode);

const isHorizontalReorderMode = (mode: MindMapLayoutMode) =>
  mode === "up" || mode === "down" || mode === "superCompactDown" || mode === "superCompactDownVertical";

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

    const childNodes = out.filter((layoutNode) => node.children.some((child) => child.id === layoutNode.id));
    if (childNodes.length > 0) {
      y = (childNodes[0]!.y + childNodes[childNodes.length - 1]!.y) / 2;
    }
  }

  out.push({
    id: node.id,
    title: node.title,
    x,
    y,
    width: node.width,
    height: node.height,
    parentId,
    hasChildren: node.hasChildren,
    collapsed: node.collapsed,
    direction,
  });
};

const computeLayoutBounds = (nodes: LayoutNode[], mode: MindMapLayoutMode) => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const isVertical = isVerticalLayoutMode(mode);
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.width / 2);
    maxX = Math.max(maxX, node.x + node.width / 2);
    minY = Math.min(minY, node.y - node.height / 2);
    maxY = Math.max(maxY, node.y + node.height / 2);

    if (!node.hasChildren) continue;
    const markerPadding = COLLAPSE_MARKER_RADIUS + 4;
    if (isVertical) {
      const markerY = node.y + node.direction * (node.height / 2 + COLLAPSE_MARKER_RADIUS + 8);
      minX = Math.min(minX, node.x - markerPadding);
      maxX = Math.max(maxX, node.x + markerPadding);
      minY = Math.min(minY, markerY - markerPadding);
      maxY = Math.max(maxY, markerY + markerPadding);
    } else {
      const side = node.parentId === null ? 1 : node.direction;
      const markerX = node.x + side * (node.width / 2 + COLLAPSE_MARKER_RADIUS + 8);
      minX = Math.min(minX, markerX - markerPadding);
      maxX = Math.max(maxX, markerX + markerPadding);
      minY = Math.min(minY, node.y - markerPadding);
      maxY = Math.max(maxY, node.y + markerPadding);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  return { minX, maxX, minY, maxY };
};

const layoutMindMapHorizontal = (rootTopic: MindMapNode, ctx: CanvasRenderingContext2D, mode: MindMapLayoutMode): Layout => {
  const root = buildInternalTree(rootTopic, ctx);
  computeSubtreeHeights(root);

  const nodes: LayoutNode[] = [
    {
      id: root.id,
      title: root.title,
      x: 0,
      y: 0,
      width: root.width,
      height: root.height,
      parentId: null,
      hasChildren: root.hasChildren,
      collapsed: root.collapsed,
      direction: 1,
    },
  ];

  const leftChildren: InternalNode[] = [];
  const rightChildren: InternalNode[] = [];

  if (mode === "balanced") {
    root.children.forEach((child, index) => {
      if (index % 2 === 0) rightChildren.push(child);
      else leftChildren.push(child);
    });
  } else if (mode === "left") {
    leftChildren.push(...root.children);
  } else {
    rightChildren.push(...root.children);
  }

  const totalHeight = (items: InternalNode[]) =>
    items.reduce((sum, item) => sum + item.subtreeHeight, 0) + Math.max(0, items.length - 1) * SIBLING_GAP_Y;

  let cursorLeft = -totalHeight(leftChildren) / 2;
  for (const child of leftChildren) {
    assignPositions(child, -1, 0, root.width, cursorLeft, nodes, root.id);
    cursorLeft += child.subtreeHeight + SIBLING_GAP_Y;
  }

  let cursorRight = -totalHeight(rightChildren) / 2;
  for (const child of rightChildren) {
    assignPositions(child, 1, 0, root.width, cursorRight, nodes, root.id);
    cursorRight += child.subtreeHeight + SIBLING_GAP_Y;
  }

  return { nodes, bounds: computeLayoutBounds(nodes, mode) };
};

const layoutMindMapVertical = (rootTopic: MindMapNode, ctx: CanvasRenderingContext2D, mode: MindMapLayoutMode): Layout => {
  const root = buildInternalTree(rootTopic, ctx);
  computeSubtreeWidths(root);

  const direction: -1 | 1 = mode === "up" ? -1 : 1;
  const nodes: LayoutNode[] = [];

  const assign = (
    node: InternalNode,
    subtreeLeftX: number,
    y: number,
    parentId: string | null,
  ): number => {
    let nodeX = subtreeLeftX + node.subtreeWidth / 2;
    const nodeY = y;

    if (node.children.length > 0) {
      const totalChildrenWidth =
        node.children.reduce((sum, child) => sum + child.subtreeWidth, 0) + SIBLING_GAP_X * (node.children.length - 1);
      let cursorX = subtreeLeftX + (node.subtreeWidth - totalChildrenWidth) / 2;
      const childXs: number[] = [];
      for (const child of node.children) {
        const childY = nodeY + direction * (node.height / 2 + LEVEL_GAP_Y + child.height / 2);
        childXs.push(assign(child, cursorX, childY, node.id));
        cursorX += child.subtreeWidth + SIBLING_GAP_X;
      }
      if (childXs.length > 0) {
        nodeX = (childXs[0]! + childXs[childXs.length - 1]!) / 2;
      }
    }

    nodes.push({
      id: node.id,
      title: node.title,
      x: nodeX,
      y: nodeY,
      width: node.width,
      height: node.height,
      parentId,
      hasChildren: node.hasChildren,
      collapsed: node.collapsed,
      direction,
    });

    return nodeX;
  };

  assign(root, -root.subtreeWidth / 2, 0, null);
  return { nodes, bounds: computeLayoutBounds(nodes, mode) };
};

const layoutMindMapSuperCompactDown = (
  rootTopic: MindMapNode,
  ctx: CanvasRenderingContext2D,
  mode: MindMapLayoutMode,
  options?: { verticalText?: boolean },
): Layout => {
  const root = buildInternalTree(rootTopic, ctx);
  if (options?.verticalText) applyVerticalTextNodeSizing(root);
  computeSubtreeWidthsWithGap(root, SUPER_COMPACT_SIBLING_GAP_X);

  const nodes: LayoutNode[] = [];
  const direction: -1 | 1 = 1;

  const assign = (
    node: InternalNode,
    subtreeLeftX: number,
    y: number,
    parentId: string | null,
  ): number => {
    let nodeX = subtreeLeftX + node.subtreeWidth / 2;
    const nodeY = y;

    if (node.children.length > 0) {
      const totalChildrenWidth =
        node.children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
        SUPER_COMPACT_SIBLING_GAP_X * (node.children.length - 1);
      let cursorX = subtreeLeftX + (node.subtreeWidth - totalChildrenWidth) / 2;
      const childXs: number[] = [];
      for (const child of node.children) {
        const childY = nodeY + direction * (node.height / 2 + SUPER_COMPACT_LEVEL_GAP_Y + child.height / 2);
        childXs.push(assign(child, cursorX, childY, node.id));
        cursorX += child.subtreeWidth + SUPER_COMPACT_SIBLING_GAP_X;
      }
      if (childXs.length > 0) {
        nodeX = (childXs[0]! + childXs[childXs.length - 1]!) / 2;
      }
    }

    nodes.push({
      id: node.id,
      title: node.title,
      x: nodeX,
      y: nodeY,
      width: node.width,
      height: node.height,
      parentId,
      hasChildren: node.hasChildren,
      collapsed: node.collapsed,
      direction,
    });

    return nodeX;
  };

  assign(root, -root.subtreeWidth / 2, 0, null);
  return { nodes, bounds: computeLayoutBounds(nodes, mode) };
};

const layoutMindMapSuperCompactRight = (
  rootTopic: MindMapNode,
  ctx: CanvasRenderingContext2D,
  mode: MindMapLayoutMode,
): Layout => {
  const root = buildInternalTree(rootTopic, ctx);
  computeSubtreeHeightsWithGap(root, SUPER_COMPACT_SIBLING_GAP_Y);

  const nodes: LayoutNode[] = [
    {
      id: root.id,
      title: root.title,
      x: 0,
      y: 0,
      width: root.width,
      height: root.height,
      parentId: null,
      hasChildren: root.hasChildren,
      collapsed: root.collapsed,
      direction: 1,
    },
  ];

  const assign = (
    node: InternalNode,
    parentX: number,
    parentWidth: number,
    subtreeTopY: number,
    parentId: string | null,
  ) => {
    const x = parentX + (parentWidth / 2 + SUPER_COMPACT_LEVEL_GAP_X + node.width / 2);
    let y = subtreeTopY + node.height / 2;

    if (node.children.length > 0) {
      let cursorY = subtreeTopY;
      const childYs: number[] = [];
      for (const child of node.children) {
        assign(child, x, node.width, cursorY, node.id);
        childYs.push(nodes[nodes.length - 1]!.y);
        cursorY += child.subtreeHeight + SUPER_COMPACT_SIBLING_GAP_Y;
      }
      if (childYs.length > 0) {
        y = (childYs[0]! + childYs[childYs.length - 1]!) / 2;
      }
    }

    nodes.push({
      id: node.id,
      title: node.title,
      x,
      y,
      width: node.width,
      height: node.height,
      parentId,
      hasChildren: node.hasChildren,
      collapsed: node.collapsed,
      direction: 1,
    });
  };

  const totalHeight = (items: InternalNode[]) =>
    items.reduce((sum, item) => sum + item.subtreeHeight, 0) +
    Math.max(0, items.length - 1) * SUPER_COMPACT_SIBLING_GAP_Y;

  let cursorY = -totalHeight(root.children) / 2;
  for (const child of root.children) {
    assign(child, 0, root.width, cursorY, root.id);
    cursorY += child.subtreeHeight + SUPER_COMPACT_SIBLING_GAP_Y;
  }

  return { nodes, bounds: computeLayoutBounds(nodes, mode) };
};

const layoutMindMapDownCompact = (rootTopic: MindMapNode, ctx: CanvasRenderingContext2D, mode: MindMapLayoutMode): Layout => {
  const root = buildInternalTree(rootTopic, ctx);
  computeSubtreeHeights(root);
  const nodes: LayoutNode[] = [];

  const assign = (node: InternalNode, depth: number, topY: number, parentId: string | null) => {
    const x = depth * COMPACT_INDENT_X;
    const y = topY + node.height / 2;

    nodes.push({
      id: node.id,
      title: node.title,
      x,
      y,
      width: node.width,
      height: node.height,
      parentId,
      hasChildren: node.hasChildren,
      collapsed: node.collapsed,
      direction: 1,
    });

    let cursorY = topY + node.height + COMPACT_LEVEL_GAP_Y;
    for (const child of node.children) {
      assign(child, depth + 1, cursorY, node.id);
      cursorY += child.subtreeHeight + COMPACT_LEVEL_GAP_Y;
    }
  };

  assign(root, 0, 0, null);
  return { nodes, bounds: computeLayoutBounds(nodes, mode) };
};

const computeCompactListHeights = (node: InternalNode): number => {
  if (node.children.length === 0) {
    node.subtreeHeight = node.height;
    return node.subtreeHeight;
  }

  const childHeights = node.children.map(computeCompactListHeights);
  const stacked = childHeights.reduce((sum, h) => sum + h, 0) + COMPACT_LEVEL_GAP_Y * Math.max(0, childHeights.length - 1);
  node.subtreeHeight = node.height + COMPACT_LEVEL_GAP_Y + stacked;
  return node.subtreeHeight;
};

const layoutMindMapDownCompact2 = (rootTopic: MindMapNode, ctx: CanvasRenderingContext2D, mode: MindMapLayoutMode): Layout => {
  const root = buildInternalTree(rootTopic, ctx);
  computeCompactListHeights(root);
  const nodes: LayoutNode[] = [];

  nodes.push({
    id: root.id,
    title: root.title,
    x: 0,
    y: 0,
    width: root.width,
    height: root.height,
    parentId: null,
    hasChildren: root.hasChildren,
    collapsed: root.collapsed,
    direction: 1,
  });

  if (root.children.length === 0) {
    return { nodes, bounds: computeLayoutBounds(nodes, mode) };
  }

  type BranchLayout = { nodes: LayoutNode[]; bounds: { minX: number; maxX: number; minY: number; maxY: number } };
  const branches: BranchLayout[] = [];

  const firstLevelY = root.height / 2 + LEVEL_GAP_Y;

  const assignCompactBranch = (branchRoot: InternalNode, startY: number, branchNodes: LayoutNode[]) => {
    const assign = (node: InternalNode, depth: number, topY: number, parentId: string | null) => {
      const x = depth * COMPACT_INDENT_X;
      const y = topY + node.height / 2;

      branchNodes.push({
        id: node.id,
        title: node.title,
        x,
        y,
        width: node.width,
        height: node.height,
        parentId,
        hasChildren: node.hasChildren,
        collapsed: node.collapsed,
        direction: 1,
      });

      let cursorY = topY + node.height + COMPACT_LEVEL_GAP_Y;
      for (const child of node.children) {
        assign(child, depth + 1, cursorY, node.id);
        cursorY += child.subtreeHeight + COMPACT_LEVEL_GAP_Y;
      }
    };

    assign(branchRoot, 0, startY, root.id);
  };

  for (const child of root.children) {
    const branchNodes: LayoutNode[] = [];
    assignCompactBranch(child, firstLevelY, branchNodes);
    branches.push({ nodes: branchNodes, bounds: computeLayoutBounds(branchNodes, "downCompact") });
  }

  const branchWidths = branches.map((branch) => Math.max(1, branch.bounds.maxX - branch.bounds.minX));
  const totalWidth = branchWidths.reduce((sum, w) => sum + w, 0) + COMPACT2_BRANCH_GAP_X * Math.max(0, branches.length - 1);
  let cursorLeftX = -totalWidth / 2;
  for (let index = 0; index < branches.length; index += 1) {
    const branch = branches[index]!;
    const width = branchWidths[index]!;
    const dx = cursorLeftX - branch.bounds.minX;
    for (const node of branch.nodes) {
      nodes.push({ ...node, x: node.x + dx });
    }
    cursorLeftX += width + COMPACT2_BRANCH_GAP_X;
  }

  return { nodes, bounds: computeLayoutBounds(nodes, mode) };
};

const layoutMindMap = (rootTopic: MindMapNode, ctx: CanvasRenderingContext2D, mode: MindMapLayoutMode): Layout => {
  if (mode === "superCompactDownVertical") {
    return layoutMindMapSuperCompactDown(rootTopic, ctx, mode, { verticalText: true });
  }
  if (mode === "superCompactDown") return layoutMindMapSuperCompactDown(rootTopic, ctx, mode);
  if (mode === "superCompactRight") return layoutMindMapSuperCompactRight(rootTopic, ctx, mode);
  if (mode === "downCompact2") return layoutMindMapDownCompact2(rootTopic, ctx, mode);
  if (mode === "downCompact") return layoutMindMapDownCompact(rootTopic, ctx, mode);
  if (mode === "up" || mode === "down") return layoutMindMapVertical(rootTopic, ctx, mode);
  return layoutMindMapHorizontal(rootTopic, ctx, mode);
};

const getToggleCenter = (node: LayoutNode, mode: MindMapLayoutMode) => {
  if (isVerticalLayoutMode(mode)) {
    return {
      x: node.x,
      y: node.y + node.direction * (node.height / 2 + COLLAPSE_MARKER_RADIUS + 8),
    };
  }
  const side = node.parentId === null ? 1 : node.direction;
  return {
    x: node.x + side * (node.width / 2 + COLLAPSE_MARKER_RADIUS + 8),
    y: node.y,
  };
};

type ConnectorEndpoints = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

const getConnectorEndpoints = (parent: LayoutNode, node: LayoutNode, verticalLinks: boolean): ConnectorEndpoints => {
  const isDown = node.y > parent.y;
  const isRight = node.x > parent.x;
  return {
    fromX: verticalLinks ? parent.x : parent.x + (isRight ? parent.width / 2 : -parent.width / 2),
    fromY: verticalLinks ? parent.y + (isDown ? parent.height / 2 : -parent.height / 2) : parent.y,
    toX: verticalLinks ? node.x : node.x + (isRight ? -node.width / 2 : node.width / 2),
    toY: verticalLinks ? node.y + (isDown ? -node.height / 2 : node.height / 2) : node.y,
  };
};

const drawConnectorPathCanvas = (
  ctx: CanvasRenderingContext2D,
  endpoints: ConnectorEndpoints,
  verticalLinks: boolean,
  orthogonal: boolean,
) => {
  const { fromX, fromY, toX, toY } = endpoints;
  const dx = toX - fromX;
  const dy = toY - fromY;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);

  if (orthogonal) {
    if (verticalLinks) {
      const midY = fromY + dy * 0.5;
      ctx.lineTo(fromX, midY);
      ctx.lineTo(toX, midY);
      ctx.lineTo(toX, toY);
    } else {
      const midX = fromX + dx * 0.5;
      ctx.lineTo(midX, fromY);
      ctx.lineTo(midX, toY);
      ctx.lineTo(toX, toY);
    }
    return;
  }

  if (verticalLinks) {
    ctx.bezierCurveTo(fromX, fromY + dy * 0.5, toX, toY - dy * 0.5, toX, toY);
  } else {
    ctx.bezierCurveTo(fromX + dx * 0.5, fromY, toX - dx * 0.5, toY, toX, toY);
  }
};

const connectorPathSvg = (
  endpoints: ConnectorEndpoints,
  verticalLinks: boolean,
  orthogonal: boolean,
): string => {
  const { fromX, fromY, toX, toY } = endpoints;
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (orthogonal) {
    if (verticalLinks) {
      const midY = fromY + dy * 0.5;
      return `M ${fromX} ${fromY} L ${fromX} ${midY} L ${toX} ${midY} L ${toX} ${toY}`;
    }
    const midX = fromX + dx * 0.5;
    return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
  }
  return verticalLinks
    ? `M ${fromX} ${fromY} C ${fromX} ${fromY + dy * 0.5}, ${toX} ${toY - dy * 0.5}, ${toX} ${toY}`
    : `M ${fromX} ${fromY} C ${fromX + dx * 0.5} ${fromY}, ${toX - dx * 0.5} ${toY}, ${toX} ${toY}`;
};

type BoundaryBox = {
  id: string;
  title?: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

const computeBoundaryBoxes = (layout: Layout, boundaries: MindMapBoundary[]): BoundaryBox[] => {
  if (boundaries.length === 0) return [];

  const byId = new Map(layout.nodes.map((node) => [node.id, node] as const));
  const childrenByParent = new Map<string, string[]>();
  for (const node of layout.nodes) {
    if (!node.parentId) continue;
    const arr = childrenByParent.get(node.parentId);
    if (arr) arr.push(node.id);
    else childrenByParent.set(node.parentId, [node.id]);
  }

  const collectSubtreeIds = (rootId: string): string[] => {
    const out: string[] = [];
    const stack = [rootId];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      out.push(current);
      const children = childrenByParent.get(current) ?? [];
      for (const childId of children) stack.push(childId);
    }
    return out;
  };

  const boxes: BoundaryBox[] = [];
  for (const boundary of boundaries) {
    const root = byId.get(boundary.nodeId);
    if (!root) continue;
    const subtreeIds = collectSubtreeIds(root.id);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const nodeId of subtreeIds) {
      const node = byId.get(nodeId);
      if (!node) continue;
      minX = Math.min(minX, node.x - node.width / 2);
      maxX = Math.max(maxX, node.x + node.width / 2);
      minY = Math.min(minY, node.y - node.height / 2);
      maxY = Math.max(maxY, node.y + node.height / 2);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) continue;
    const padding = 18;
    boxes.push({
      id: boundary.id,
      title: boundary.title?.trim() || undefined,
      left: minX - padding,
      top: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    });
  }
  return boxes;
};

const drawBoundaryBoxesCanvas = (
  ctx: CanvasRenderingContext2D,
  boxes: BoundaryBox[],
  theme: MindMapTheme,
) => {
  if (boxes.length === 0) return;
  for (const box of boxes) {
    ctx.save();
    drawRoundedRect(ctx, box.left, box.top, box.width, box.height, 14);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = theme.accent;
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = theme.accent;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    if (box.title) {
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = theme.nodeText;
      ctx.fillText(box.title, box.left + 10, box.top + 8);
    }
    ctx.restore();
  }
};

type SummaryBox = {
  id: string;
  title?: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

const computeSummaryBoxes = (layout: Layout, summaries: MindMapSummary[]): SummaryBox[] => {
  if (summaries.length === 0) return [];

  const childrenByParent = new Map<string, LayoutNode[]>();
  for (const node of layout.nodes) {
    if (!node.parentId) continue;
    const list = childrenByParent.get(node.parentId);
    if (list) list.push(node);
    else childrenByParent.set(node.parentId, [node]);
  }

  const boxes: SummaryBox[] = [];
  for (const summary of summaries) {
    const children = childrenByParent.get(summary.nodeId) ?? [];
    if (children.length === 0) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of children) {
      minX = Math.min(minX, node.x - node.width / 2);
      maxX = Math.max(maxX, node.x + node.width / 2);
      minY = Math.min(minY, node.y - node.height / 2);
      maxY = Math.max(maxY, node.y + node.height / 2);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) continue;
    const padding = 12;
    boxes.push({
      id: summary.id,
      title: summary.title?.trim() || undefined,
      left: minX - padding,
      top: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    });
  }
  return boxes;
};

const drawSummaryBoxesCanvas = (
  ctx: CanvasRenderingContext2D,
  boxes: SummaryBox[],
  theme: MindMapTheme,
) => {
  if (boxes.length === 0) return;
  for (const box of boxes) {
    ctx.save();
    drawRoundedRect(ctx, box.left, box.top, box.width, box.height, 10);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = theme.accent;
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = theme.accent;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    if (box.title) {
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = theme.nodeText;
      ctx.fillText(box.title, box.left + 8, box.top + 6);
    }
    ctx.restore();
  }
};

const drawRelationshipCurves = (
  ctx: CanvasRenderingContext2D,
  byId: Map<string, LayoutNode>,
  relationships: MindMapRelationship[],
  theme: MindMapTheme,
) => {
  if (relationships.length === 0) return;

  for (const relation of relationships) {
    const from = byId.get(relation.fromId);
    const to = byId.get(relation.toId);
    if (!from || !to || from.id === to.id) continue;

    const fromX = from.x;
    const fromY = from.y;
    const toX = to.x;
    const toY = to.y;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / distance;
    const ny = dx / distance;
    const controlOffset = clamp(distance * 0.1, 18, 30);
    const cx = (fromX + toX) / 2 + nx * controlOffset;
    const cy = (fromY + toY) / 2 + ny * controlOffset;

    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = theme.accent;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.quadraticCurveTo(cx, cy, toX, toY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (relation.title && relation.title.trim()) {
      const label = relation.title.trim();
      const lx = (fromX + 2 * cx + toX) / 4;
      const ly = (fromY + 2 * cy + toY) / 4;
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
      const textWidth = Math.ceil(ctx.measureText(label).width);
      const padX = 8;
      const h = 20;
      drawRoundedRect(ctx, lx - textWidth / 2 - padX, ly - h / 2, textWidth + padX * 2, h, 8);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fill();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = theme.nodeText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lx, ly + 0.5);
    }

    ctx.restore();
  }
};

const drawLayoutStatic = (
  ctx: CanvasRenderingContext2D,
  rect: { width: number; height: number },
  layout: Layout,
  layoutMode: MindMapLayoutMode,
  theme: MindMapTheme,
  relationships: MindMapRelationship[],
  boundaries: MindMapBoundary[],
  summaries: MindMapSummary[],
  view: ViewState,
) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = theme.canvasBackground;
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);

  const byId = new Map(layout.nodes.map((node) => [node.id, node] as const));
  const boundaryBoxes = computeBoundaryBoxes(layout, boundaries);
  const summaryBoxes = computeSummaryBoxes(layout, summaries);
  const verticalLinks = isVerticalConnectorLayoutMode(layoutMode);
  const orthogonalConnectors = isOrthogonalConnectorLayoutMode(layoutMode);
  const nodeRadius = isSuperCompactLayoutMode(layoutMode) ? SUPER_COMPACT_NODE_RADIUS : NODE_RADIUS;

  drawBoundaryBoxesCanvas(ctx, boundaryBoxes, theme);
  drawSummaryBoxesCanvas(ctx, summaryBoxes, theme);

  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.linkStroke;
  for (const node of layout.nodes) {
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent) continue;
    const endpoints = getConnectorEndpoints(parent, node, verticalLinks);
    drawConnectorPathCanvas(ctx, endpoints, verticalLinks, orthogonalConnectors);
    ctx.stroke();
  }

  drawRelationshipCurves(ctx, byId, relationships, theme);

  for (const node of layout.nodes) {
    const left = node.x - node.width / 2;
    const top = node.y - node.height / 2;
    const isRoot = node.parentId === null;

    ctx.save();
    drawRoundedRect(ctx, left, top, node.width, node.height, nodeRadius);
    ctx.fillStyle = isRoot ? theme.rootFill : theme.nodeFill;
    ctx.fill();
    ctx.lineWidth = isRoot ? 2.5 : 2;
    ctx.strokeStyle = isRoot ? theme.rootStroke : theme.nodeStroke;
    ctx.stroke();

    ctx.fillStyle = isRoot ? theme.rootText : theme.nodeText;
    drawNodeTitleCanvas(
      ctx,
      { title: node.title, x: node.x, y: node.y, width: node.width, height: node.height },
      layoutMode,
    );
    ctx.restore();

    if (node.hasChildren) {
      const marker = getToggleCenter(node, layoutMode);
      ctx.save();
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, COLLAPSE_MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = theme.toggleFill;
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = theme.toggleStroke;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(marker.x - 3.5, marker.y);
      ctx.lineTo(marker.x + 3.5, marker.y);
      if (node.collapsed) {
        ctx.moveTo(marker.x, marker.y - 3.5);
        ctx.lineTo(marker.x, marker.y + 3.5);
      }
      ctx.strokeStyle = theme.toggleText;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
};

const layoutToSvg = (
  layout: Layout,
  layoutMode: MindMapLayoutMode,
  theme: MindMapTheme,
  relationships: MindMapRelationship[],
  boundaries: MindMapBoundary[],
  summaries: MindMapSummary[],
  padding: number,
) => {
  const width = Math.max(1, Math.ceil(layout.bounds.maxX - layout.bounds.minX + padding * 2));
  const height = Math.max(1, Math.ceil(layout.bounds.maxY - layout.bounds.minY + padding * 2));
  const dx = padding - layout.bounds.minX;
  const dy = padding - layout.bounds.minY;
  const byId = new Map(layout.nodes.map((node) => [node.id, node] as const));
  const boundaryBoxes = computeBoundaryBoxes(layout, boundaries);
  const summaryBoxes = computeSummaryBoxes(layout, summaries);
  const verticalLinks = isVerticalConnectorLayoutMode(layoutMode);
  const orthogonalConnectors = isOrthogonalConnectorLayoutMode(layoutMode);
  const nodeRadius = isSuperCompactLayoutMode(layoutMode) ? SUPER_COMPACT_NODE_RADIUS : NODE_RADIUS;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="${theme.canvasBackground}"/>`);

  for (const box of boundaryBoxes) {
    parts.push(
      `<rect x="${box.left + dx}" y="${box.top + dy}" width="${box.width}" height="${box.height}" rx="14" ry="14" fill="${theme.accent}" fill-opacity="0.1" stroke="${theme.accent}" stroke-width="1.4" stroke-dasharray="6 4" stroke-opacity="0.55"/>`,
    );
    if (box.title) {
      parts.push(
        `<text x="${box.left + dx + 10}" y="${box.top + dy + 9}" text-anchor="start" dominant-baseline="hanging" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="12" fill="${theme.nodeText}">${escapeXml(box.title)}</text>`,
      );
    }
  }

  for (const box of summaryBoxes) {
    parts.push(
      `<rect x="${box.left + dx}" y="${box.top + dy}" width="${box.width}" height="${box.height}" rx="10" ry="10" fill="${theme.accent}" fill-opacity="0.08" stroke="${theme.accent}" stroke-width="1.3" stroke-dasharray="3 3" stroke-opacity="0.85"/>`,
    );
    if (box.title) {
      parts.push(
        `<text x="${box.left + dx + 8}" y="${box.top + dy + 7}" text-anchor="start" dominant-baseline="hanging" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="12" fill="${theme.nodeText}">${escapeXml(box.title)}</text>`,
      );
    }
  }

  for (const node of layout.nodes) {
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent) continue;
    const endpoints = getConnectorEndpoints(parent, node, verticalLinks);
    const d = connectorPathSvg(
      {
        fromX: endpoints.fromX + dx,
        fromY: endpoints.fromY + dy,
        toX: endpoints.toX + dx,
        toY: endpoints.toY + dy,
      },
      verticalLinks,
      orthogonalConnectors,
    );
    parts.push(`<path d="${d}" fill="none" stroke="${theme.linkStroke}" stroke-width="2"/>`);
  }

  for (const relation of relationships) {
    const from = byId.get(relation.fromId);
    const to = byId.get(relation.toId);
    if (!from || !to || from.id === to.id) continue;

    const fromX = from.x + dx;
    const fromY = from.y + dy;
    const toX = to.x + dx;
    const toY = to.y + dy;
    const vx = toX - fromX;
    const vy = toY - fromY;
    const distance = Math.max(1, Math.hypot(vx, vy));
    const nx = -vy / distance;
    const ny = vx / distance;
    const controlOffset = clamp(distance * 0.1, 18, 30);
    const cx = (fromX + toX) / 2 + nx * controlOffset;
    const cy = (fromY + toY) / 2 + ny * controlOffset;
    const d = `M ${fromX} ${fromY} Q ${cx} ${cy}, ${toX} ${toY}`;
    parts.push(`<path d="${d}" fill="none" stroke="${theme.accent}" stroke-width="1.8" stroke-dasharray="8 6"/>`);

    if (relation.title && relation.title.trim()) {
      const label = escapeXml(relation.title.trim());
      const lx = (fromX + 2 * cx + toX) / 4;
      const ly = (fromY + 2 * cy + toY) / 4;
      parts.push(`<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="12" fill="${theme.nodeText}">${label}</text>`);
    }
  }

  for (const node of layout.nodes) {
    const left = node.x - node.width / 2 + dx;
    const top = node.y - node.height / 2 + dy;
    const isRoot = node.parentId === null;
    const fill = isRoot ? theme.rootFill : theme.nodeFill;
    const stroke = isRoot ? theme.rootStroke : theme.nodeStroke;
    const textFill = isRoot ? theme.rootText : theme.nodeText;
    parts.push(
      `<rect x="${left}" y="${top}" width="${node.width}" height="${node.height}" rx="${nodeRadius}" ry="${nodeRadius}" fill="${fill}" stroke="${stroke}" stroke-width="${isRoot ? 2.5 : 2}"/>`,
    );
    parts.push(
      ...nodeTitleToSvg(
        {
          title: node.title,
          x: node.x + dx,
          y: node.y + dy,
          width: node.width,
          height: node.height,
          textFill,
        },
        layoutMode,
      ),
    );

    if (node.hasChildren) {
      const marker = getToggleCenter(node, layoutMode);
      const mx = marker.x + dx;
      const my = marker.y + dy;
      parts.push(
        `<circle cx="${mx}" cy="${my}" r="${COLLAPSE_MARKER_RADIUS}" fill="${theme.toggleFill}" stroke="${theme.toggleStroke}" stroke-width="1.8"/>`,
      );
      parts.push(`<line x1="${mx - 3.5}" y1="${my}" x2="${mx + 3.5}" y2="${my}" stroke="${theme.toggleText}" stroke-width="1.5" stroke-linecap="round"/>`);
      if (node.collapsed) {
        parts.push(
          `<line x1="${mx}" y1="${my - 3.5}" x2="${mx}" y2="${my + 3.5}" stroke="${theme.toggleText}" stroke-width="1.5" stroke-linecap="round"/>`,
        );
      }
    }
  }

  parts.push("</svg>");
  return parts.join("");
};

const XmindMindMapCanvas = forwardRef<XmindMindMapCanvasHandle, Props>(function XmindMindMapCanvas(
  {
    rootTopic,
    layoutMode,
    theme,
    isEnglish = false,
    mode = "edit",
    relationships = [],
    boundaries = [],
    summaries = [],
    selectedNodeId,
    onSelectNode,
    onRenameNode,
    onToggleCollapse,
    onMoveNode,
    viewResetKey,
    fullscreenSidebar,
    fullscreenToolbar,
    fullscreenOverlay,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ViewState>({ ...defaultView });
  const normalViewRef = useRef<ViewState>({ ...defaultView });
  const fullscreenViewRef = useRef<ViewState>({ ...defaultView });
  const appliedResetKeyRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const dropTargetRef = useRef<{ nodeId: string; placement: "before" | "after" | "child" } | null>(null);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredToggleNodeId, setHoveredToggleNodeId] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragCursorWorld, setDragCursorWorld] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ nodeId: string; placement: "before" | "after" | "child" } | null>(
    null,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSidebarWidth, setFullscreenSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return 360;
    try {
      const widthRaw = window.localStorage.getItem("atools:xmind-viewer:fullscreen:sidebarWidth:v1");
      if (!widthRaw) return 360;
      const widthParsed = Number.parseFloat(widthRaw);
      if (!Number.isFinite(widthParsed)) return 360;
      return clamp(widthParsed, 280, 560);
    } catch {
      return 360;
    }
  });
  const [fullscreenSidebarCollapsed, setFullscreenSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("atools:xmind-viewer:fullscreen:sidebarCollapsed:v1") === "1";
    } catch {
      return false;
    }
  });
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "atools:xmind-viewer:fullscreen:sidebarWidth:v1",
        String(clamp(fullscreenSidebarWidth, 280, 560)),
      );
      window.localStorage.setItem("atools:xmind-viewer:fullscreen:sidebarCollapsed:v1", fullscreenSidebarCollapsed ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [fullscreenSidebarCollapsed, fullscreenSidebarWidth]);

  const measureCtx = useMemo(() => createMeasureContext(), []);
  const layout = useMemo(() => {
    if (!rootTopic || !measureCtx) return null;
    return layoutMindMap(rootTopic, measureCtx, layoutMode);
  }, [layoutMode, measureCtx, rootTopic]);

  const requestDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      drawRef.current?.();
      const snapshot = { ...viewRef.current };
      if (isFullscreen) fullscreenViewRef.current = snapshot;
      else normalViewRef.current = snapshot;
      setZoomPercent(Math.round(viewRef.current.scale * 100));
    });
  }, [isFullscreen]);

  const fitToView = useCallback(() => {
    if (!layout) return;
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

  const getViewStateBundle = useCallback(
    (): ViewStateBundle => ({
      normal: { ...normalViewRef.current },
      fullscreen: { ...fullscreenViewRef.current },
    }),
    [],
  );

  const setViewStateBundle = useCallback(
    (bundle: ViewStateBundle) => {
      normalViewRef.current = { ...bundle.normal };
      fullscreenViewRef.current = { ...bundle.fullscreen };
      viewRef.current = { ...(isFullscreen ? fullscreenViewRef.current : normalViewRef.current) };
      requestDraw();
    },
    [isFullscreen, requestDraw],
  );

  const getViewState = useCallback((): ViewState => ({ ...viewRef.current }), []);

  const setViewState = useCallback(
    (viewState: ViewState) => {
      viewRef.current = { ...viewState };
      requestDraw();
    },
    [requestDraw],
  );

  const exportAsPng = useCallback(
    async (options?: { scale?: number; padding?: number }) => {
      if (!layout) throw new Error("No mind map loaded");
      const scale = withDefault(options?.scale, 2);
      const padding = withDefault(options?.padding, 48);
      const width = Math.max(1, Math.ceil(layout.bounds.maxX - layout.bounds.minX + padding * 2));
      const height = Math.max(1, Math.ceil(layout.bounds.maxY - layout.bounds.minY + padding * 2));

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(width * scale));
      canvas.height = Math.max(1, Math.floor(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to create canvas context");

      drawLayoutStatic(
        ctx,
        { width: canvas.width, height: canvas.height },
        layout,
        layoutMode,
        theme,
        relationships,
        boundaries,
        summaries,
        {
          scale,
          offsetX: (padding - layout.bounds.minX) * scale,
          offsetY: (padding - layout.bounds.minY) * scale,
        },
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (!result) reject(new Error("Failed to export PNG"));
          else resolve(result);
        }, "image/png");
      });
      return blob;
    },
    [boundaries, layout, layoutMode, relationships, summaries, theme],
  );

  const exportAsSvg = useCallback(
    (options?: { padding?: number }) => {
      if (!layout) throw new Error("No mind map loaded");
      const padding = withDefault(options?.padding, 48);
      return layoutToSvg(layout, layoutMode, theme, relationships, boundaries, summaries, padding);
    },
    [boundaries, layout, layoutMode, relationships, summaries, theme],
  );

  const setFullscreen = useCallback(
    (nextFullscreen: boolean) => {
      if (nextFullscreen === isFullscreen) return;
      const container = containerRef.current;
      if (!container) {
        setIsFullscreen(nextFullscreen);
        return;
      }
      const rect = container.getBoundingClientRect();
      const currentView = viewRef.current;
      const centerWorld = {
        x: (rect.width / 2 - currentView.offsetX) / currentView.scale,
        y: (rect.height / 2 - currentView.offsetY) / currentView.scale,
      };

      if (isFullscreen) fullscreenViewRef.current = { ...currentView };
      else normalViewRef.current = { ...currentView };

      const nextBase = nextFullscreen ? fullscreenViewRef.current : normalViewRef.current;
      let shouldFitWhenEnterFullscreen = false;
      if (nextFullscreen) {
        const stored = fullscreenViewRef.current;
        const isDefaultStored =
          stored.scale === defaultView.scale &&
          stored.offsetX === defaultView.offsetX &&
          stored.offsetY === defaultView.offsetY;
        if (isDefaultStored) {
          shouldFitWhenEnterFullscreen = true;
        }
      }
      setIsFullscreen(nextFullscreen);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const nextContainer = containerRef.current;
          if (!nextContainer) return;
          if (nextFullscreen && shouldFitWhenEnterFullscreen) {
            fitToView();
            return;
          }
          const nextRect = nextContainer.getBoundingClientRect();
          const scale = nextBase.scale;
          viewRef.current = {
            ...nextBase,
            offsetX: nextRect.width / 2 - centerWorld.x * scale,
            offsetY: nextRect.height / 2 - centerWorld.y * scale,
          };
          requestDraw();
        });
      });
    },
    [fitToView, isFullscreen, requestDraw],
  );

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen, setFullscreen]);

  useEffect(() => {
    if (!layout) return;
    if (typeof viewResetKey !== "number") return;
    if (appliedResetKeyRef.current === viewResetKey) return;
    appliedResetKeyRef.current = viewResetKey;
    fitToView();
  }, [fitToView, layout, viewResetKey]);

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
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [requestDraw]);

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
      const nextScale = clamp(viewRef.current.scale * factor, 0.15, 4);
      zoomAround(nextScale, centerX, centerY);
      requestDraw();
    },
    [requestDraw, zoomAround],
  );

  const toggleFullscreen = useCallback(() => {
    setFullscreen(!isFullscreen);
  }, [isFullscreen, setFullscreen]);

  useImperativeHandle(
    ref,
    () => ({
      fitToView,
      resetView,
      zoomByFactor: zoomBy,
      toggleFullscreen,
      getViewState,
      setViewState,
      getViewStateBundle,
      setViewStateBundle,
      exportAsPng,
      exportAsSvg,
    }),
    [
      exportAsPng,
      exportAsSvg,
      fitToView,
      getViewState,
      getViewStateBundle,
      resetView,
      setViewState,
      setViewStateBundle,
      toggleFullscreen,
      zoomBy,
    ],
  );

  const hitTest = useCallback(
    (screenX: number, screenY: number): LayoutNode | null => {
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

  const hitToggle = useCallback(
    (screenX: number, screenY: number): LayoutNode | null => {
      if (!layout) return null;
      const view = viewRef.current;
      const worldX = (screenX - view.offsetX) / view.scale;
      const worldY = (screenY - view.offsetY) / view.scale;

      for (let index = layout.nodes.length - 1; index >= 0; index -= 1) {
        const node = layout.nodes[index]!;
        if (!node.hasChildren) continue;
        const isToggleVisible = !isSuperCompactLayoutMode(layoutMode) || selectedNodeId === node.id;
        if (!isToggleVisible) continue;
        const marker = getToggleCenter(node, layoutMode);
        const dx = worldX - marker.x;
        const dy = worldY - marker.y;
        if (dx * dx + dy * dy <= (COLLAPSE_MARKER_RADIUS + 2) ** 2) return node;
      }
      return null;
    },
    [layout, layoutMode, selectedNodeId],
  );

  const getPlacementForNode = useCallback(
    (node: LayoutNode, worldX: number, worldY: number) => {
      if (isHorizontalReorderMode(layoutMode)) {
        const left = node.x - node.width / 2;
        const rel = (worldX - left) / Math.max(1, node.width);
        if (rel < 0.25) return "before" as const;
        if (rel > 0.75) return "after" as const;
        return "child" as const;
      }

      const top = node.y - node.height / 2;
      const rel = (worldY - top) / Math.max(1, node.height);
      if (rel < 0.25) return "before" as const;
      if (rel > 0.75) return "after" as const;
      return "child" as const;
    },
    [layoutMode],
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

    ctx.fillStyle = theme.canvasBackground;
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!layout) {
      ctx.fillStyle = "#64748b";
      ctx.font = "14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        isEnglish
          ? "Choose a .xmind file to render the mind map in Canvas"
          : "选择 .xmind 文件后将在这里渲染思维导图（Canvas）",
        rect.width / 2,
        rect.height / 2,
      );
      return;
    }

    const view = viewRef.current;
    ctx.save();
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.scale, view.scale);

    const byId = new Map(layout.nodes.map((node) => [node.id, node] as const));
    const boundaryBoxes = computeBoundaryBoxes(layout, boundaries);
    const summaryBoxes = computeSummaryBoxes(layout, summaries);

    drawBoundaryBoxesCanvas(ctx, boundaryBoxes, theme);
    drawSummaryBoxesCanvas(ctx, summaryBoxes, theme);

    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.linkStroke;
    const verticalLinks = isVerticalConnectorLayoutMode(layoutMode);
    const orthogonalConnectors = isOrthogonalConnectorLayoutMode(layoutMode);
    const nodeRadius = isSuperCompactLayoutMode(layoutMode) ? SUPER_COMPACT_NODE_RADIUS : NODE_RADIUS;
    for (const node of layout.nodes) {
      if (!node.parentId) continue;
      const parent = byId.get(node.parentId);
      if (!parent) continue;
      const endpoints = getConnectorEndpoints(parent, node, verticalLinks);
      drawConnectorPathCanvas(ctx, endpoints, verticalLinks, orthogonalConnectors);
      ctx.stroke();
    }

    drawRelationshipCurves(ctx, byId, relationships, theme);

    for (const node of layout.nodes) {
      const left = node.x - node.width / 2;
      const top = node.y - node.height / 2;
      const isRoot = node.parentId === null;
      const isSelected = selectedNodeId === node.id;
      const isHovered = hoveredNodeId === node.id;

      ctx.save();
      if (isHovered || isSelected) {
        ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
        ctx.shadowBlur = 14 / view.scale;
      }

      drawRoundedRect(ctx, left, top, node.width, node.height, nodeRadius);
      if (isRoot) ctx.fillStyle = theme.rootFill;
      else if (isSelected) ctx.fillStyle = theme.selectedFill;
      else ctx.fillStyle = theme.nodeFill;
      ctx.fill();

      ctx.lineWidth = isRoot ? 2.5 : 2;
      if (isRoot) ctx.strokeStyle = theme.rootStroke;
      else if (isSelected) ctx.strokeStyle = theme.selectedStroke;
      else if (isHovered) ctx.strokeStyle = theme.hoverStroke;
      else ctx.strokeStyle = theme.nodeStroke;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = isRoot ? theme.rootText : theme.nodeText;
      drawNodeTitleCanvas(
        ctx,
        { title: node.title, x: node.x, y: node.y, width: node.width, height: node.height },
        layoutMode,
      );
      ctx.restore();

      const showToggle =
        node.hasChildren &&
        (!isSuperCompactLayoutMode(layoutMode) || selectedNodeId === node.id);
      if (showToggle) {
        const marker = getToggleCenter(node, layoutMode);
        const isToggleHovered = hoveredToggleNodeId === node.id;
        ctx.save();
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, COLLAPSE_MARKER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = isToggleHovered ? theme.accent : theme.toggleFill;
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = isToggleHovered ? theme.accent : theme.toggleStroke;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(marker.x - 3.5, marker.y);
        ctx.lineTo(marker.x + 3.5, marker.y);
        if (node.collapsed) {
          ctx.moveTo(marker.x, marker.y - 3.5);
          ctx.lineTo(marker.x, marker.y + 3.5);
        }
        ctx.strokeStyle = isToggleHovered ? theme.toggleFill : theme.toggleText;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    }

    if (dropTarget) {
      const target = byId.get(dropTarget.nodeId);
      if (target) {
        const left = target.x - target.width / 2;
        const top = target.y - target.height / 2;
        const right = left + target.width;
        const bottom = top + target.height;

        ctx.save();
        ctx.lineWidth = 3 / view.scale;
        ctx.strokeStyle = theme.accent;
        ctx.fillStyle = theme.accent;
        if (dropTarget.placement === "child") {
          drawRoundedRect(ctx, left - 6, top - 6, target.width + 12, target.height + 12, nodeRadius + 4);
          ctx.stroke();
        } else {
          const verticalDrop = isHorizontalReorderMode(layoutMode);
          if (verticalDrop) {
            const x = dropTarget.placement === "before" ? left - 10 : right + 10;
            ctx.beginPath();
            ctx.moveTo(x, top - 18);
            ctx.lineTo(x, bottom + 18);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, top - 18, 4 / view.scale, 0, Math.PI * 2);
            ctx.arc(x, bottom + 18, 4 / view.scale, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const y = dropTarget.placement === "before" ? top - 8 : bottom + 8;
            ctx.beginPath();
            ctx.moveTo(left - 18, y);
            ctx.lineTo(left + target.width + 18, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(left - 18, y, 4 / view.scale, 0, Math.PI * 2);
            ctx.arc(left + target.width + 18, y, 4 / view.scale, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }

    if (draggedNodeId && dragCursorWorld) {
      const dragged = byId.get(draggedNodeId);
      if (dragged) {
        ctx.save();
        ctx.globalAlpha = 0.75;
        drawRoundedRect(
          ctx,
          dragCursorWorld.x - dragged.width / 2,
          dragCursorWorld.y - dragged.height / 2,
          dragged.width,
          dragged.height,
          nodeRadius,
        );
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = theme.accent;
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.nodeText;
        drawNodeTitleCanvas(
          ctx,
          {
            title: dragged.title,
            x: dragCursorWorld.x,
            y: dragCursorWorld.y,
            width: dragged.width,
            height: dragged.height,
          },
          layoutMode,
        );
        ctx.restore();
      }
    }

    ctx.restore();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.nodeText;
    ctx.globalAlpha = 0.6;
    ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      isEnglish
        ? "Drag nodes to reorder · drag blank area to pan · wheel to zoom · double-click node to rename · double-click blank to fit"
        : "拖拽节点重排 · 空白拖拽平移 · 滚轮缩放 · 双击节点改名 · 双击空白自适应",
      14,
      rect.height - 12,
    );
    ctx.globalAlpha = 1;
  }, [
    boundaries,
    dragCursorWorld,
    draggedNodeId,
    dropTarget,
    hoveredNodeId,
    hoveredToggleNodeId,
    isEnglish,
    layout,
    layoutMode,
    relationships,
    summaries,
    selectedNodeId,
    theme,
  ]);

  useLayoutEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useEffect(() => {
    requestDraw();
  }, [
    boundaries,
    dragCursorWorld,
    draggedNodeId,
    dropTarget,
    hoveredNodeId,
    hoveredToggleNodeId,
    layout,
    relationships,
    summaries,
    requestDraw,
    selectedNodeId,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let pointerDown = false;
    let panning = false;
    let draggingNode = false;
    let startClientX = 0;
    let startClientY = 0;
    let startOffsetX = 0;
    let startOffsetY = 0;
    let pressedToggleNodeId: string | null = null;
    let pressedNodeId: string | null = null;
    let pressedNodeIsRoot = false;

    const setDropTargetSafe = (next: { nodeId: string; placement: "before" | "after" | "child" } | null) => {
      dropTargetRef.current = next;
      setDropTarget(next);
    };

    const updateHover = (x: number, y: number) => {
      if (pointerDown || draggingNode) return;
      const toggleHit = hitToggle(x, y);
      const nodeHit = toggleHit ? null : hitTest(x, y);
      setHoveredToggleNodeId(toggleHit?.id ?? null);
      setHoveredNodeId(nodeHit?.id ?? null);
      canvas.style.cursor = toggleHit || nodeHit ? "pointer" : "grab";
    };

    const onPointerDown = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      pointerDown = true;
      panning = false;
      draggingNode = false;
      startClientX = event.clientX;
      startClientY = event.clientY;
      startOffsetX = viewRef.current.offsetX;
      startOffsetY = viewRef.current.offsetY;
      pressedToggleNodeId = hitToggle(x, y)?.id ?? null;
      const nodeHit = pressedToggleNodeId ? null : hitTest(x, y);
      pressedNodeId = nodeHit?.id ?? null;
      pressedNodeIsRoot = Boolean(nodeHit?.parentId === null);
      setDraggedNodeId(null);
      setDragCursorWorld(null);
      setDropTargetSafe(null);
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (!pointerDown) {
        updateHover(x, y);
        return;
      }

      const dx = event.clientX - startClientX;
      const dy = event.clientY - startClientY;
      const distance = Math.hypot(dx, dy);

      if (!panning && !draggingNode && distance > 6) {
        const canDragNode = mode !== "read" && Boolean(pressedNodeId && !pressedNodeIsRoot && pressedToggleNodeId === null);
        if (canDragNode) {
          draggingNode = true;
          setDraggedNodeId(pressedNodeId);
          canvas.style.cursor = "grabbing";
        } else {
          panning = pressedToggleNodeId === null;
          if (panning) canvas.style.cursor = "grabbing";
        }
      }

      if (draggingNode && pressedNodeId) {
        const view = viewRef.current;
        const worldX = (x - view.offsetX) / view.scale;
        const worldY = (y - view.offsetY) / view.scale;
        setDragCursorWorld({ x: worldX, y: worldY });

        const nodeHit = hitTest(x, y);
        if (!nodeHit || nodeHit.id === pressedNodeId) {
          setDropTargetSafe(null);
          return;
        }

        const placement = getPlacementForNode(nodeHit, worldX, worldY);
        setDropTargetSafe({ nodeId: nodeHit.id, placement });
        return;
      }

      if (panning) {
        viewRef.current.offsetX = startOffsetX + dx;
        viewRef.current.offsetY = startOffsetY + dy;
        requestDraw();
        return;
      }

      const toggleHit = hitToggle(x, y);
      const nodeHit = toggleHit ? null : hitTest(x, y);
      setHoveredToggleNodeId(toggleHit?.id ?? null);
      setHoveredNodeId(nodeHit?.id ?? null);
      canvas.style.cursor = toggleHit || nodeHit ? "pointer" : "grab";
    };

    const onPointerUp = (event: PointerEvent) => {
      pointerDown = false;

      if (draggingNode && pressedNodeId && dropTargetRef.current) {
        const target = dropTargetRef.current;
        onMoveNode(pressedNodeId, target.nodeId, target.placement);
        onSelectNode(pressedNodeId);
      } else if (!panning) {
        if (pressedToggleNodeId) onToggleCollapse(pressedToggleNodeId);
        else onSelectNode(pressedNodeId);
      }

      pressedToggleNodeId = null;
      pressedNodeId = null;
      panning = false;
      draggingNode = false;
      pressedNodeIsRoot = false;
      setDraggedNodeId(null);
      setDragCursorWorld(null);
      setDropTargetSafe(null);

      const rect = container.getBoundingClientRect();
      updateHover(event.clientX - rect.left, event.clientY - rect.top);
    };

    const onPointerCancel = () => {
      pointerDown = false;
      panning = false;
      draggingNode = false;
      pressedToggleNodeId = null;
      pressedNodeId = null;
      canvas.style.cursor = "grab";
      setDraggedNodeId(null);
      setDragCursorWorld(null);
      setDropTargetSafe(null);
    };

    const onWheel = (event: WheelEvent) => {
      if (!layout) return;
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const delta = -event.deltaY;
      const nextScale = clamp(viewRef.current.scale * (delta > 0 ? 1.08 : 0.92), 0.15, 4);
      zoomAround(nextScale, mouseX, mouseY);
      requestDraw();
    };

    const onDblClick = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const nodeHit = hitTest(x, y);
      if (nodeHit) {
        onSelectNode(nodeHit.id);
        if (mode !== "read") onRenameNode(nodeHit.id);
      } else {
        fitToView();
      }
    };

    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDblClick);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDblClick);
    };
  }, [
    fitToView,
    getPlacementForNode,
    hitTest,
    hitToggle,
    layout,
    layoutMode,
    onMoveNode,
    onRenameNode,
    onSelectNode,
    onToggleCollapse,
    requestDraw,
    zoomAround,
    mode,
  ]);

  const hoveredNodeTitle = useMemo(
    () => layout?.nodes.find((node) => node.id === hoveredNodeId)?.title ?? "",
    [hoveredNodeId, layout?.nodes],
  );

  const controls = (
    <>
      <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
        {zoomPercent}%
      </div>
      <button
        type="button"
        onClick={() => zoomBy(0.9)}
        className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
        aria-label={isEnglish ? "Zoom out" : "缩小"}
      >
        -
      </button>
      <button
        type="button"
        onClick={() => zoomBy(1.1)}
        className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
        aria-label={isEnglish ? "Zoom in" : "放大"}
      >
        +
      </button>
      <button
        type="button"
        onClick={fitToView}
        className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
      >
        {isEnglish ? "Fit" : "自适应"}
      </button>
      <button
        type="button"
        onClick={resetView}
        className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
      >
        {isEnglish ? "Reset" : "重置"}
      </button>
      <button
        type="button"
        onClick={toggleFullscreen}
        className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
      >
        {isFullscreen ? (isEnglish ? "Exit Fullscreen" : "退出全屏") : isEnglish ? "Fullscreen" : "全屏"}
      </button>
    </>
  );

  useEffect(() => {
    if (!isFullscreen) {
      resizeStateRef.current = null;
      return;
    }

    const onMove = (event: PointerEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const delta = state.startX - event.clientX;
      setFullscreenSidebarWidth(clamp(state.startWidth + delta, 280, 560));
    };

    const onUp = () => {
      resizeStateRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isFullscreen]);

  if (isFullscreen) {
    const fullscreenView = (
      <div className="fixed inset-0 z-50 bg-slate-50">
        <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-white">
          <canvas ref={canvasRef} className="absolute inset-0" />
          {hoveredNodeId && hoveredNodeTitle && (
            <div className="pointer-events-none absolute left-4 top-16 max-w-[min(520px,calc(100%-2rem))] rounded-2xl bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg">
              {hoveredNodeTitle}
            </div>
          )}

          {fullscreenOverlay ? <div className="absolute inset-0 z-10 overflow-auto bg-white/95 p-4 pt-20">{fullscreenOverlay}</div> : null}

          <div className="absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2 rounded-2xl bg-white/90 p-2 shadow-xl ring-1 ring-slate-200 backdrop-blur">
            {controls}
            {fullscreenToolbar ? <div className="h-6 w-px bg-slate-200" /> : null}
            {fullscreenToolbar}
          </div>
        </div>

        {fullscreenSidebar ? (
          <div
            className="absolute bottom-4 right-4 top-4 z-20 flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-xl backdrop-blur"
            style={{ width: fullscreenSidebarCollapsed ? 52 : fullscreenSidebarWidth }}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 px-2 py-2">
              {fullscreenSidebarCollapsed ? null : (
                <div className="min-w-0 truncate text-xs font-semibold text-slate-700">{isEnglish ? "Panel" : "面板"}</div>
              )}
              <button
                type="button"
                onClick={() => setFullscreenSidebarCollapsed((prev) => !prev)}
                className="rounded-xl bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                aria-label={fullscreenSidebarCollapsed ? (isEnglish ? "Expand panel" : "展开面板") : isEnglish ? "Collapse panel" : "收起面板"}
              >
                {fullscreenSidebarCollapsed ? "»" : "«"}
              </button>
            </div>

            {!fullscreenSidebarCollapsed ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {fullscreenSidebar}
                <div className="pt-2 text-center text-[11px] text-slate-500">{isEnglish ? "Press Esc to exit" : "Esc 退出"}</div>
              </div>
            ) : (
              <div className="flex-1" />
            )}

            {!fullscreenSidebarCollapsed ? (
              <div
                className="absolute left-0 top-0 h-full w-2 cursor-col-resize"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  resizeStateRef.current = { startX: event.clientX, startWidth: fullscreenSidebarWidth };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                aria-hidden="true"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    );
    if (typeof document !== "undefined") {
      return createPortal(fullscreenView, document.body);
    }
    return fullscreenView;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">
          {isEnglish ? "Mind Map Editor (Canvas)" : "思维导图编辑（Canvas）"}
        </div>
        <div className="flex flex-wrap items-center gap-2">{controls}</div>
      </div>

      <div
        ref={containerRef}
        className="relative min-h-[500px] h-[70vh] supports-[height:70svh]:h-[70svh] w-full overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200"
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
        {hoveredNodeId && hoveredNodeTitle && (
          <div className="pointer-events-none absolute left-4 top-4 max-w-[min(520px,calc(100%-2rem))] rounded-2xl bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg">
            {hoveredNodeTitle}
          </div>
        )}
      </div>
    </div>
  );
});

export default XmindMindMapCanvas;
