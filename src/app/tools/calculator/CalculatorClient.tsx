"use client";

import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

const scientificFunctions = [
  { label: "sin", fn: "sin" },
  { label: "cos", fn: "cos" },
  { label: "tan", fn: "tan" },
  { label: "√", fn: "sqrt" },
  { label: "log", fn: "log" },
] as const;

type ScientificFn = (typeof scientificFunctions)[number]["fn"];

const DEFAULT_UI = {
  footer: "支持键盘输入 • 纯本地计算",
} as const;

type CalculatorUi = typeof DEFAULT_UI;

const CalculatorClient: FC = () => {
  const config = useOptionalToolConfig("calculator");
  const ui: CalculatorUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<CalculatorUi>) };

  const [display, setDisplay] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const appendValue = useCallback((value: string) => {
    setError(null);
    setDisplay((prev) => {
      if (lastResult && prev === lastResult) {
        setLastResult(null);
        return /[0-9.]/.test(value) ? value : prev + value;
      }
      if (prev === "0" && /^[0-9]$/.test(value)) return value;
      return prev + value;
    });
  }, [lastResult]);

  const handleFunction = useCallback((fn: ScientificFn) => {
    setError(null);
    const token = `${fn}(`;
    setDisplay((prev) => {
      if (lastResult && prev === lastResult) {
        setLastResult(null);
        return token;
      }
      return prev === "0" ? token : prev + token;
    });
  }, [lastResult]);

  const handleClear = useCallback(() => {
    setError(null);
    setDisplay("0");
    setLastResult(null);
  }, []);

  const handleDelete = useCallback(() => {
    setError(null);
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
  }, []);

  const handleCalculate = useCallback(() => {
    setError(null);
    try {
      const expressionForEval = display
        .replace(/sin\(/g, "Math.sin(")
        .replace(/cos\(/g, "Math.cos(")
        .replace(/tan\(/g, "Math.tan(")
        .replace(/sqrt\(/g, "Math.sqrt(")
        .replace(/log\(/g, "Math.log10(");

      const result = Function(`"use strict"; return (${expressionForEval});`)();

      if (typeof result === "number" && Number.isFinite(result)) {
        // Format to avoid long decimals
        const formatted = String(Math.round(result * 10000000000) / 10000000000);
        setDisplay(formatted);
        setLastResult(formatted);
      } else {
        setError("NaN");
      }
    } catch {
      setError("Error");
    }
  }, [display]);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      if (/[0-9.]/.test(key)) appendValue(key);
      if (["+", "-", "*", "/"].includes(key)) appendValue(key);
      if (key === "Enter" || key === "=") handleCalculate();
      if (key === "Backspace") handleDelete();
      if (key === "Escape") handleClear();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appendValue, handleCalculate, handleClear, handleDelete]);

  const mainButtons = [
    { label: "C", action: handleClear, type: "danger" },
    { label: "(", action: () => appendValue("("), type: "secondary" },
    { label: ")", action: () => appendValue(")"), type: "secondary" },
    { label: "÷", action: () => appendValue("/"), type: "primary" },
    { label: "7", action: () => appendValue("7"), type: "default" },
    { label: "8", action: () => appendValue("8"), type: "default" },
    { label: "9", action: () => appendValue("9"), type: "default" },
    { label: "×", action: () => appendValue("*"), type: "primary" },
    { label: "4", action: () => appendValue("4"), type: "default" },
    { label: "5", action: () => appendValue("5"), type: "default" },
    { label: "6", action: () => appendValue("6"), type: "default" },
    { label: "-", action: () => appendValue("-"), type: "primary" },
    { label: "1", action: () => appendValue("1"), type: "default" },
    { label: "2", action: () => appendValue("2"), type: "default" },
    { label: "3", action: () => appendValue("3"), type: "default" },
    { label: "+", action: () => appendValue("+"), type: "primary" },
    { label: "0", action: () => appendValue("0"), type: "default", wide: true },
    { label: ".", action: () => appendValue("."), type: "default" },
    { label: "=", action: handleCalculate, type: "accent" },
  ];

  return (
    <ToolPageLayout toolSlug="calculator" maxWidthClassName="max-w-2xl">
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-sm">

        <div className="glass-card overflow-hidden rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          {/* Display Screen */}
          <div className="mb-6 relative rounded-2xl bg-slate-100/50 p-6 text-right shadow-inner">
            <div className="min-h-[3rem] overflow-x-auto whitespace-nowrap text-4xl font-light tracking-tight text-slate-900 scrollbar-hide">
              {display}
            </div>
            {error && (
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-rose-500">
                {error}
              </div>
            )}
          </div>

          {/* Scientific Functions */}
          <div className="mb-4 grid grid-cols-5 gap-2">
            {scientificFunctions.map((item) => (
              <button
                key={item.fn}
                onClick={() => handleFunction(item.fn)}
                className="flex h-10 items-center justify-center rounded-lg bg-slate-200/50 text-xs font-medium text-slate-700 transition-all hover:bg-slate-300/50 active:scale-95"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Main Keypad */}
          <div className="grid grid-cols-4 gap-3">
            {mainButtons.map((btn, idx) => (
              <button
                key={idx}
                onClick={btn.action}
                className={`
                  flex h-16 items-center justify-center rounded-2xl text-xl font-medium transition-all active:scale-95
                  ${btn.wide ? "col-span-2" : ""}
                  ${
                    btn.type === "default"
                      ? "bg-white text-slate-900 shadow-sm hover:bg-slate-50"
                      : btn.type === "primary"
                      ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                      : btn.type === "secondary"
                      ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                      : btn.type === "danger"
                      ? "bg-rose-100 text-rose-600 hover:bg-rose-200"
                      : "bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700"
                  }
                `}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="mt-8 text-center text-xs text-slate-400">
          <p>{ui.footer}</p>
        </div>
      </div>
    </div>
    </ToolPageLayout>
  );
};

export default CalculatorClient;
