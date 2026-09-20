"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

const DEFAULT_UI = {
  title: "语音转文字",
  outputLabel: "识别结果",
  languageSelect: "选择识别语言",
  statusLabel: "当前状态",
  startButton: "开始识别",
  stopButton: "停止识别",
  clearButton: "清空",
  copyButton: "复制",
  statusReady: "就绪",
  statusListening: "正在聆听...",
  statusStopped: "已停止",
  noSupport: "当前浏览器不支持语音识别",
  noSupportDesc: "请使用 Chrome、Edge 或 Safari 浏览器访问此功能。",
  interimResults: "临时识别结果",
  finalResults: "最终识别结果",
  note: "说明：语音识别依赖浏览器内置 Web Speech API（推荐使用 Chrome 或 Edge）。识别准确度取决于网络连接和语音引擎。",
} as const;

type SpeechToTextUi = typeof DEFAULT_UI;

export default function SpeechToTextClient() {
  const config = useOptionalToolConfig("speech-to-text");
  const ui: SpeechToTextUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<SpeechToTextUi>) };

  const [isSupported] = useState(() => {
    if (typeof window === "undefined") return true;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  });
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("zh-CN");
  const [status, setStatus] = useState<"ready" | "listening" | "stopped">("ready");

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // 初始化语音识别
  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    let isActive = true;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLanguage;

    recognition.onstart = () => {
      if (!isActive) return;
      setIsListening(true);
      setStatus("listening");
    };

    recognition.onend = () => {
      if (!isActive) return;
      setIsListening(false);
      setStatus("stopped");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = "";
      let finalChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalChunk += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (!isActive) return;
      if (finalChunk) setTranscript((prev) => prev + finalChunk);
      setInterimTranscript(interimText);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      if (!isActive) return;
      setIsListening(false);
      setStatus("stopped");
    };

    recognitionRef.current = recognition;

    return () => {
      isActive = false;
      if (recognition) {
        recognition.stop();
      }
    };
  }, [selectedLanguage, isSupported]);

  // 开始录音
  const handleStart = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return;

    // 更新语言设置
    recognitionRef.current.lang = selectedLanguage;
    recognitionRef.current.start();
  }, [isSupported, selectedLanguage]);

  // 停止录音
  const handleStop = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return;
    recognitionRef.current.stop();
  }, [isSupported]);

  // 清空
  const handleClear = useCallback(() => {
    handleStop();
    setTranscript("");
    setInterimTranscript("");
    setStatus("ready");
  }, [handleStop]);

  // 复制
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(transcript + interimTranscript);
  }, [transcript, interimTranscript]);

  if (!isSupported) {
    return (
      <ToolPageLayout toolSlug="speech-to-text">
        <div className="mt-8 glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="rounded-2xl bg-rose-50 px-6 py-8 text-center ring-1 ring-rose-200">
            <div className="mb-4 text-6xl">⚠️</div>
            <h3 className="mb-2 text-xl font-semibold text-rose-900">{ui.noSupport}</h3>
            <p className="text-sm text-rose-700">{ui.noSupportDesc}</p>
          </div>
        </div>
      </ToolPageLayout>
    );
  }

  return (
    <ToolPageLayout toolSlug="speech-to-text">
      <div className="mt-8 space-y-6">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          {/* 控制面板 */}
          <div className="mb-6 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* 语言选择 */}
              <div className="flex-1 min-w-[200px]">
                <label className="mb-2 block text-sm font-medium text-slate-700">{ui.languageSelect}</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  disabled={isListening}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 disabled:opacity-50"
                >
                  <option value="zh-CN">中文（中国）</option>
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="ja-JP">日本語</option>
                  <option value="ko-KR">한국어</option>
                  <option value="fr-FR">Français</option>
                  <option value="de-DE">Deutsch</option>
                  <option value="es-ES">Español</option>
                  <option value="ru-RU">Русский</option>
                  <option value="ar-SA">العربية</option>
                </select>
              </div>

              {/* 状态显示 */}
              <div className="flex-1 min-w-[200px]">
                <label className="mb-2 block text-sm font-medium text-slate-700">{ui.statusLabel}</label>
                <div className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  status === "listening"
                    ? "bg-green-100 text-green-900"
                    : status === "stopped"
                    ? "bg-slate-100 text-slate-900"
                    : "bg-blue-100 text-blue-900"
                }`}>
                  {status === "ready" && ui.statusReady}
                  {status === "listening" && ui.statusListening}
                  {status === "stopped" && ui.statusStopped}
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-wrap gap-3">
              {!isListening ? (
                <button
                  type="button"
                  onClick={handleStart}
                  className="flex-1 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  🎤 {ui.startButton}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex-1 rounded-2xl bg-rose-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
                >
                  ⏹️ {ui.stopButton}
                </button>
              )}
              <button
                type="button"
                onClick={handleClear}
                className="rounded-2xl bg-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
              >
                {ui.clearButton}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {ui.copyButton}
              </button>
            </div>
          </div>

          {/* 识别结果 */}
          <div className="space-y-4">
            {/* 最终结果 */}
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">{ui.finalResults}</div>
              <div className="min-h-[200px] rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-900">
                {transcript || <span className="text-slate-400">{ui.outputLabel}...</span>}
              </div>
            </div>

            {/* 临时结果 */}
            {interimTranscript && (
              <div>
                <div className="mb-2 text-sm font-medium text-slate-600">{ui.interimResults}</div>
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 italic">
                  {interimTranscript}
                </div>
              </div>
            )}
          </div>

          {/* 说明 */}
          <div className="rounded-2xl bg-blue-50 px-4 py-3 text-xs text-blue-700">
            💡 {ui.note}
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}

// Type definitions for Web Speech API
declare global {
  type SpeechRecognitionConstructor = new () => SpeechRecognition;

  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: (event: Event) => void;
  onend: (event: Event) => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}
