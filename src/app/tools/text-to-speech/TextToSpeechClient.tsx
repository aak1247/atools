"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

const DEFAULT_UI = {
  title: "Text to Speech",
  inputLabel: "Input Text",
  inputPlaceholder: "Enter text to convert...",
  voiceSelect: "Select Voice",
  rateLabel: "Rate",
  pitchLabel: "Pitch",
  volumeLabel: "Volume",
  speakButton: "Start Speaking",
  pauseButton: "Pause",
  resumeButton: "Resume",
  stopButton: "Stop",
  clearButton: "Clear",
  statusReady: "Ready",
  statusSpeaking: "Speaking...",
  statusPaused: "Paused",
  statusStopped: "Stopped",
  noVoices: "No voices detected. Please use a browser that supports Web Speech API",
  sampleText: "This is a sample text for testing the text-to-speech functionality.",
  loadingVoices: "Loading voice list...",
  note: "Note: Long text will be automatically split into segments. Available voices depend on your browser and operating system.",
} as const;

type TextToSpeechUi = typeof DEFAULT_UI;

export default function TextToSpeechClient() {
  const config = useOptionalToolConfig("text-to-speech");
  const ui: TextToSpeechUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<TextToSpeechUi>) };

  const [text, setText] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [status, setStatus] = useState<"ready" | "speaking" | "paused" | "stopped">("ready");
  const [isPaused, setIsPaused] = useState(false);
  const [voicesLoaded, setVoicesLoaded] = useState(false);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // 加载语音列表
  useEffect(() => {
    const loadVoices = () => {
      const synth = window.speechSynthesis;
      const availableVoices = synth.getVoices();
      setVoices(availableVoices);
      if (availableVoices.length > 0 && !selectedVoice) {
        setSelectedVoice(availableVoices[0].name);
      }
      setVoicesLoaded(true);
    };

    loadVoices();

    // 某些浏览器异步加载语音
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [selectedVoice]);

  // 开始朗读
  const handleSpeak = useCallback(() => {
    if (!text.trim()) return;

    const synth = window.speechSynthesis;

    // 停止当前朗读
    synth.cancel();

    // 分段处理长文本（每段约 200 字符）
    const chunkSize = 200;
    const textChunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      textChunks.push(text.slice(i, i + chunkSize));
    }

    let currentIndex = 0;

    const speakNext = () => {
      if (currentIndex >= textChunks.length) {
        setStatus("stopped");
        setIsPaused(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(textChunks[currentIndex]);

      // 设置语音
      const voice = voices.find((v) => v.name === selectedVoice);
      if (voice) {
        utterance.voice = voice;
      }

      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      utterance.onstart = () => {
        setStatus("speaking");
      };

      utterance.onend = () => {
        if (isPaused) return;
        currentIndex++;
        if (currentIndex < textChunks.length) {
          speakNext();
        } else {
          setStatus("stopped");
          setIsPaused(false);
        }
      };

      utterance.onerror = (event) => {
        console.error("Speech error:", event.error);
        if (event.error !== "interrupted") {
          setStatus("stopped");
          setIsPaused(false);
        }
      };

      utteranceRef.current = utterance;
      synth.speak(utterance);
    };

    speakNext();
  }, [text, voices, selectedVoice, rate, pitch, volume, isPaused]);

  // 暂停
  const handlePause = () => {
    const synth = window.speechSynthesis;
    if (synth.speaking && !synth.paused) {
      synth.pause();
      setStatus("paused");
      setIsPaused(true);
    }
  };

  // 继续
  const handleResume = () => {
    const synth = window.speechSynthesis;
    if (synth.paused) {
      synth.resume();
      setStatus("speaking");
      setIsPaused(false);
    }
  };

  // 停止
  const handleStop = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    setStatus("stopped");
    setIsPaused(false);
  };

  // 清空
  const handleClear = () => {
    handleStop();
    setText("");
  };

  // 插入示例文本
  const handleInsertSample = () => {
    setText(ui.sampleText);
  };

  return (
    <ToolPageLayout toolSlug="text-to-speech">
      <div className="mt-8 space-y-6">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* 输入区域 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-900">{ui.inputLabel}</label>
                <button
                  type="button"
                  onClick={handleInsertSample}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  示例文本
                </button>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="h-[320px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                placeholder={ui.inputPlaceholder}
              />
            </div>

            {/* 控制区域 */}
            <div className="space-y-5">
              {/* 状态显示 */}
              <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                <div className="text-xs text-slate-600">Status</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {status === "ready" && ui.statusReady}
                  {status === "speaking" && ui.statusSpeaking}
                  {status === "paused" && ui.statusPaused}
                  {status === "stopped" && ui.statusStopped}
                </div>
              </div>

              {/* 语音选择 */}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{ui.voiceSelect}</label>
                {!voicesLoaded ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                    {ui.loadingVoices}
                  </div>
                ) : voices.length === 0 ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                    {ui.noVoices}
                  </div>
                ) : (
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  >
                    {voices.map((voice) => (
                      <option key={voice.name} value={voice.name}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 语速 */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">{ui.rateLabel}</label>
                  <span className="text-xs text-slate-500">{rate.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={rate}
                  onChange={(e) => setRate(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              {/* 音调 */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">{ui.pitchLabel}</label>
                  <span className="text-xs text-slate-500">{pitch.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={pitch}
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              {/* 音量 */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">{ui.volumeLabel}</label>
                  <span className="text-xs text-slate-500">{Math.round(volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              {/* 操作按钮 */}
              <div className="grid grid-cols-2 gap-3">
                {status === "speaking" ? (
                  <>
                    <button
                      type="button"
                      onClick={handlePause}
                      className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-600"
                    >
                      {ui.pauseButton}
                    </button>
                    <button
                      type="button"
                      onClick={handleStop}
                      className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
                    >
                      {ui.stopButton}
                    </button>
                  </>
                ) : status === "paused" ? (
                  <>
                    <button
                      type="button"
                      onClick={handleResume}
                      className="rounded-2xl bg-green-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-600"
                    >
                      {ui.resumeButton}
                    </button>
                    <button
                      type="button"
                      onClick={handleStop}
                      className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
                    >
                      {ui.stopButton}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleSpeak}
                      disabled={!text.trim()}
                      className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {ui.speakButton}
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      className="rounded-2xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
                    >
                      {ui.clearButton}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 说明 */}
          <div className="mt-6 rounded-2xl bg-blue-50 px-4 py-3 text-xs text-blue-700">
            ℹ️ {ui.note}
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
