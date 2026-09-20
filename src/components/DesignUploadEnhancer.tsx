"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isLocale, type Locale } from "../i18n/locales";
import { toolPageFeatures, type ToolSlug } from "../app/tools/tool-registry";
import { useOptionalI18n } from "../i18n/I18nProvider";

type ToolRoute = {
  slug: string;
};

const getToolRouteFromPathname = (pathname: string): ToolRoute | null => {
  const parts = pathname.split("/").filter(Boolean);
  const hasLocalePrefix = parts[0] ? isLocale(parts[0]) : false;
  const toolsIndex = hasLocalePrefix ? 1 : 0;
  if (parts[toolsIndex] !== "tools") return null;
  const slug = parts[toolsIndex + 1];
  if (!slug) return null;
  return { slug };
};

const isFileDragEvent = (event: DragEvent): boolean => {
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) return true;
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
};

const pickPrimaryFileInput = (): HTMLInputElement | null => {
  const input = document.querySelector<HTMLInputElement>("input[type='file']:not(:disabled)");
  return input ?? null;
};

const applyFilesToInput = (input: HTMLInputElement, files: FileList): boolean => {
  if (typeof DataTransfer === "undefined") return false;
  const transfer = new DataTransfer();
  if (input.multiple) {
    for (const file of files) transfer.items.add(file);
  } else if (files[0]) {
    transfer.items.add(files[0]);
  }
  if (transfer.files.length === 0) return false;
  try {
    input.files = transfer.files;
  } catch {
    return false;
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
};

export default function DesignUploadEnhancer() {
  const pathname = usePathname();
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const i18n = useOptionalI18n();
  const locale: Locale = useMemo(() => {
    if (i18n?.locale) return i18n.locale;
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] && isLocale(parts[0])) return parts[0] as Locale;
    return "zh-cn";
  }, [i18n?.locale, pathname]);

  const isZh = locale === "zh-cn";

  const toolRoute = useMemo(() => getToolRouteFromPathname(pathname), [pathname]);
  const pageFeatures =
    toolRoute && toolRoute.slug in toolPageFeatures ? toolPageFeatures[toolRoute.slug as ToolSlug] : null;
  const floatingUploadAction = pageFeatures?.floatingUploadAction === true;
  const globalDropZone = pageFeatures?.globalDropZone === true;

  useEffect(() => {
    if (!globalDropZone) return;

    let dragDepth = 0;
    let noticeTimer: number | null = null;

    const showNotice = (text: string) => {
      setNotice(text);
      if (noticeTimer !== null) window.clearTimeout(noticeTimer);
      noticeTimer = window.setTimeout(() => setNotice(null), 1800);
    };

    const resetDrag = () => {
      dragDepth = 0;
      setIsDragging(false);
    };

    const onDragEnterCapture = (event: DragEvent) => {
      if (!isFileDragEvent(event)) return;
      dragDepth += 1;
      setIsDragging(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!isFileDragEvent(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      setIsDragging(true);
    };

    const onDragLeaveCapture = (event: DragEvent) => {
      if (!isFileDragEvent(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (
        dragDepth === 0 ||
        !event.relatedTarget ||
        (event.clientX <= 0 && event.clientY <= 0)
      ) {
        resetDrag();
      }
    };

    const onDropCapture = (event: DragEvent) => {
      if (!isFileDragEvent(event)) return;
      resetDrag();
    };

    const onDropBubble = (event: DragEvent) => {
      if (!isFileDragEvent(event)) return;
      resetDrag();

      if (event.defaultPrevented) return;
      event.preventDefault();

      const input = pickPrimaryFileInput();
      const files = event.dataTransfer?.files;
      if (!input || !files || files.length === 0) {
        showNotice(isZh ? "当前页面未找到可用上传入口" : "No available upload input found on this page");
        return;
      }

      if (!applyFilesToInput(input, files)) {
        showNotice(isZh ? "拖拽文件失败，请改用点击上传" : "Failed to drop file, please click to upload");
      }
    };

    const onDragEnd = () => {
      resetDrag();
    };

    const onWindowBlur = () => {
      resetDrag();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        resetDrag();
      }
    };

    window.addEventListener("dragenter", onDragEnterCapture, true);
    window.addEventListener("dragover", onDragOver, false);
    window.addEventListener("dragleave", onDragLeaveCapture, true);
    window.addEventListener("drop", onDropCapture, true);
    window.addEventListener("drop", onDropBubble, false);
    window.addEventListener("dragend", onDragEnd);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      if (noticeTimer !== null) window.clearTimeout(noticeTimer);
      window.removeEventListener("dragenter", onDragEnterCapture, true);
      window.removeEventListener("dragover", onDragOver, false);
      window.removeEventListener("dragleave", onDragLeaveCapture, true);
      window.removeEventListener("drop", onDropCapture, true);
      window.removeEventListener("drop", onDropBubble, false);
      window.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("keydown", onKeyDown);
      resetDrag();
    };
  }, [globalDropZone, isZh]);

  if (!floatingUploadAction && !globalDropZone) return null;

  return (
    <>
      {globalDropZone && isDragging && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/35 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/30 bg-white/95 px-6 py-4 text-center shadow-2xl">
            <div className="text-sm font-semibold text-slate-900">
              {isZh ? "松开即可上传或替换文件" : "Release to upload or replace file"}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              {isZh ? "统一上传增强模式已生效" : "Upload enhancer mode active"}
            </div>
          </div>
        </div>
      )}
      {(floatingUploadAction || notice) && (
        <div className="fixed bottom-5 right-5 z-[71] flex flex-col items-end gap-2">
          {notice && (
            <div className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg">
              {notice}
            </div>
          )}
          {floatingUploadAction && (
            <button
              type="button"
              onClick={() => {
                const input = pickPrimaryFileInput();
                if (!input) {
                  setNotice(isZh ? "当前页面未找到可用上传入口" : "No available upload input found on this page");
                  return;
                }
                input.value = "";
                input.click();
              }}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-slate-800 active:scale-95"
            >
              {isZh ? "点击上传/替换" : "Click to upload/replace"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
