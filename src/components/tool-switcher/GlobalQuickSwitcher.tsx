"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Search, Command } from "lucide-react";
import type { Locale } from "../../i18n/locales";
import { getMessages, type Messages } from "../../i18n/messages";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { recordRecentToolSlug } from "../../lib/recent-tools";

// Lazy-load the heavy tool switcher modal and its JSON metadata
const ToolSwitcherModal = dynamic(
  () => import("./ToolSwitcherModal"),
  { ssr: false }
);

const emptySubscribe = () => () => {};

const getIsApplePlatform = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
};

export default function GlobalQuickSwitcher() {
  const i18n = useOptionalI18n();
  const locale: Locale = i18n?.locale ?? "zh-cn";
  const messages: Messages = i18n?.messages ?? getMessages("zh-cn");

  const pathname = usePathname() || "";
  const [isOpen, setIsOpen] = useState(false);

  const isApplePlatform = useSyncExternalStore(
    emptySubscribe,
    getIsApplePlatform,
    () => false
  );

  // Extract current tool slug if in a tool page
  const currentSlug = pathname.match(/\/tools\/([^/?#]+)/)?.[1];

  // Check if user is currently on the home page
  const isHomePage =
    pathname === `/${locale}` ||
    pathname === `/${locale}/` ||
    pathname === "/" ||
    pathname === "";

  // Automatically record current tool visit in recent tools
  useEffect(() => {
    if (currentSlug) {
      recordRecentToolSlug(currentSlug);
    }
  }, [currentSlug]);

  const preloadModal = useCallback(() => {
    import("./ToolSwitcherModal");
  }, []);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Preload chunk as soon as Ctrl or Meta is pressed
      if (event.metaKey || event.ctrlKey) {
        preloadModal();
      }

      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") {
        return;
      }

      // If on home page, let ToolNavClient handle focusing the on-page search box
      if (isHomePage) {
        return;
      }

      event.preventDefault();
      setIsOpen((prev) => !prev);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isHomePage, preloadModal]);

  // Support programmatic opening via custom event
  useEffect(() => {
    const handleOpenEvent = () => setIsOpen(true);
    window.addEventListener("open-tool-switcher", handleOpenEvent);
    return () => window.removeEventListener("open-tool-switcher", handleOpenEvent);
  }, []);

  // On the home page, the full tool catalog with search is already prominent,
  // so we don't need the floating trigger button on the home page.
  const showFloatingTrigger = !isHomePage;

  return (
    <>
      {showFloatingTrigger && (
        <div
          className="fixed bottom-5 left-5 z-40 sm:bottom-6 sm:left-6 animate-fade-in"
          style={{ animationDuration: "200ms" }}
        >
          {/* Desktop pill trigger */}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            onMouseEnter={preloadModal}
            onFocus={preloadModal}
            aria-label={messages.quickSwitcherTitle}
            className="group hidden sm:inline-flex items-center gap-2.5 rounded-full border border-slate-200/80 bg-white/90 px-3.5 py-2 text-xs font-medium text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-md transition-all duration-200 hover:border-indigo-300 hover:bg-white hover:text-indigo-600 hover:shadow-indigo-500/10 hover:-translate-y-0.5 active:scale-95"
          >
            <Search className="h-3.5 w-3.5 text-indigo-500 transition-transform duration-200 group-hover:scale-110" />
            <span>{messages.quickSwitcherShortcutHint}</span>
            <kbd className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 transition-colors group-hover:border-indigo-200 group-hover:text-indigo-600">
              {isApplePlatform ? (
                <Command className="h-2.5 w-2.5" />
              ) : (
                "Ctrl"
              )}
              K
            </kbd>
          </button>

          {/* Mobile circular trigger */}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            onMouseEnter={preloadModal}
            onTouchStart={preloadModal}
            aria-label={messages.quickSwitcherTitle}
            className="inline-flex sm:hidden h-11 w-11 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-md transition-all hover:bg-white hover:text-indigo-600 active:scale-95"
          >
            <Search className="h-4 w-4 text-indigo-600" />
          </button>
        </div>
      )}

      {/* Lazy-loaded Modal */}
      {isOpen && (
        <ToolSwitcherModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          locale={locale}
          messages={messages}
          currentSlug={currentSlug}
          isApplePlatform={isApplePlatform}
        />
      )}
    </>
  );
}
