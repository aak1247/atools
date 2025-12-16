"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

interface FullScreenLoaderProps {
  isLoading: boolean;
  message?: string;
  progress?: number | null; // 0 to 1
}

export default function FullScreenLoader({
  isLoading,
  message = "处理中...",
  progress,
}: FullScreenLoaderProps) {
  const canUseDOM = typeof document !== "undefined";

  useEffect(() => {
    if (!canUseDOM) return;
    if (isLoading) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [canUseDOM, isLoading]);

  if (!canUseDOM || !isLoading) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/80 backdrop-blur-md transition-all duration-500 animate-in fade-in zoom-in-95">
      <div className="flex flex-col items-center p-8 animate-fade-in-up">
        {/* Progress Bar Container */}
        <div className="relative h-1.5 w-64 overflow-hidden rounded-full bg-slate-200/50 ring-1 ring-black/5">
          {/* Progress Bar */}
          {progress != null ? (
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-300 ease-out"
              style={{
                width: `${Math.max(5, Math.min(100, progress * 100))}%`,
              }}
            >
              <div className="absolute inset-0 w-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            </div>
          ) : (
            <div className="absolute inset-0 w-full origin-left animate-[indeterminate_1.5s_infinite] bg-gradient-to-r from-blue-500 to-purple-500" />
          )}
        </div>

        {/* Message */}
        <div className="mt-6 flex flex-col items-center space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">{message}</h3>
          {progress != null && (
            <p className="text-sm font-medium text-slate-500 tabular-nums">
              {Math.round(progress * 100)}%
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
