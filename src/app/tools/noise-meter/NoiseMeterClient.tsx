"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  AlertTriangle,
  CheckCircle,
  Info,
  Gauge,
} from "lucide-react";

interface NoiseMeterState {
  isListening: boolean;
  currentDb: number;
  maxDb: number;
  averageDb: number;
  error: string | null;
  permission: "prompt" | "granted" | "denied";
  history: number[];
  calibrationOffset: number;
}

const NoiseMeterClient = () => {
  const [state, setState] = useState<NoiseMeterState>({
    isListening: false,
    currentDb: 0,
    maxDb: 0,
    averageDb: 0,
    error: null,
    permission: "prompt",
    history: [],
    calibrationOffset: 100,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const historyRef = useRef<number[]>([]);
  const listeningRef = useRef(false);
  const lastUiUpdateAtRef = useRef<number>(0);
  const calibrationOffsetRef = useRef<number>(100);

  // 分贝水平描述
  const getNoiseLevel = (db: number) => {
    if (db < 30) {
      return { level: "极安静", textClass: "text-emerald-700", badgeClass: "bg-emerald-100 text-emerald-700" };
    }
    if (db < 50) {
      return { level: "安静", textClass: "text-sky-700", badgeClass: "bg-sky-100 text-sky-700" };
    }
    if (db < 70) {
      return { level: "正常", textClass: "text-amber-700", badgeClass: "bg-amber-100 text-amber-700" };
    }
    if (db < 90) {
      return { level: "较吵", textClass: "text-orange-700", badgeClass: "bg-orange-100 text-orange-700" };
    }
    return { level: "很吵", textClass: "text-rose-700", badgeClass: "bg-rose-100 text-rose-700" };
  };

  const clampDb = (db: number) => Math.max(0, Math.min(120, db));

  // 计算估算分贝（dB SPL，需校准；默认偏移为 100）
  const calculateEstimatedDb = (samples: Float32Array) => {
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / samples.length);
    if (!Number.isFinite(rms) || rms <= 0) return 0;

    const dbfs = 20 * Math.log10(rms); // 0 dBFS 是满幅，环境音一般为负值
    const estimatedDb = dbfs + calibrationOffsetRef.current;
    return clampDb(estimatedDb);
  };

  const cleanupAudio = useCallback(() => {
    listeningRef.current = false;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (microphoneRef.current) {
      microphoneRef.current.disconnect();
      microphoneRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (silentGainRef.current) {
      silentGainRef.current.disconnect();
      silentGainRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // 开始测量
  const startListening = async () => {
    try {
      cleanupAudio();
      listeningRef.current = true;
      setState((prev) => ({ ...prev, error: null, isListening: true }));

      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 创建音频上下文（兼容旧版 Safari 的 webkitAudioContext）
      type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
      const AudioContextCtor =
        window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("当前浏览器不支持 AudioContext");
      }
      audioContextRef.current = new AudioContextCtor();
      await audioContextRef.current.resume();

      // 创建分析器节点
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.85;

      // 连接麦克风到分析器
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
      microphoneRef.current.connect(analyserRef.current);

      // 让音频图真正“跑起来”（部分浏览器只挂 analyser 不一定会触发处理）
      silentGainRef.current = audioContextRef.current.createGain();
      silentGainRef.current.gain.value = 0;
      analyserRef.current.connect(silentGainRef.current);
      silentGainRef.current.connect(audioContextRef.current.destination);

      // 重置状态
      historyRef.current = [];
      lastUiUpdateAtRef.current = 0;
      setState((prev) => ({
        ...prev,
        currentDb: 0,
        maxDb: 0,
        averageDb: 0,
        history: [],
        permission: "granted",
      }));

      // 开始分析
      analyzeAudio();

    } catch (error) {
      let errorMessage = "无法访问麦克风";

      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          errorMessage = "麦克风权限被拒绝，请在浏览器设置中允许访问麦克风";
          setState((prev) => ({ ...prev, permission: "denied" }));
        } else if (error.name === "NotFoundError") {
          errorMessage = "未找到麦克风设备";
        } else if (error.name === "NotReadableError") {
          errorMessage = "麦克风被其他应用占用";
        } else if (error.name === "SecurityError") {
          errorMessage = "当前环境不支持麦克风访问（需要 HTTPS 或 localhost）";
        }
      }

      listeningRef.current = false;
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isListening: false
      }));
    }
  };

  // 停止测量
  const stopListening = () => {
    cleanupAudio();
    setState((prev) => ({ ...prev, isListening: false }));
  };

  // 分析音频
  const analyzeAudio = () => {
    if (!analyserRef.current || !listeningRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    analyserRef.current.getFloatTimeDomainData(dataArray);

    const db = calculateEstimatedDb(dataArray);

    const now = performance.now();
    if (now - lastUiUpdateAtRef.current >= 100) {
      lastUiUpdateAtRef.current = now;

      // 更新历史记录
      historyRef.current.push(db);
      if (historyRef.current.length > 120) {
        historyRef.current.shift();
      }

      // 计算统计值
      const maxDb = Math.max(...historyRef.current);
      const averageDb =
        historyRef.current.reduce((total, value) => total + value, 0) /
        historyRef.current.length;

      setState((prev) => ({
        ...prev,
        currentDb: Math.round(db * 10) / 10,
        maxDb: Math.round(maxDb * 10) / 10,
        averageDb: Math.round(averageDb * 10) / 10,
        history: [...historyRef.current],
      }));
    }

    animationRef.current = requestAnimationFrame(analyzeAudio);
  };

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  useEffect(() => {
    calibrationOffsetRef.current = state.calibrationOffset;
  }, [state.calibrationOffset]);

  const noiseInfo = getNoiseLevel(state.currentDb);
  const hasSession = state.history.length > 0;
  const statusText = state.isListening ? "测量中" : hasSession ? "已停止" : "未开始";
  const statusBadge = state.isListening
    ? noiseInfo
    : hasSession
      ? { level: "已停止", textClass: "text-slate-800", badgeClass: "bg-slate-100 text-slate-700" }
      : { level: "未开始", textClass: "text-slate-800", badgeClass: "bg-slate-100 text-slate-700" };
  const isSecureContextHint =
    typeof window !== "undefined" && window.isSecureContext === false;

  const historyForChart = state.history.slice(-60);
  const chartPoints = (() => {
    if (historyForChart.length < 2) return "";
    const width = 240;
    const height = 60;
    const minDb = 0;
    const maxDb = 120;
    return historyForChart
      .map((value, index) => {
        const x = (index / (historyForChart.length - 1)) * width;
        const y = height - ((value - minDb) / (maxDb - minDb)) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  })();

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">噪音计</h1>
        <p className="mt-2 text-sm text-slate-500">
          纯前端实时测量 • 支持校准偏移 • 数据不上传
        </p>
      </div>

      {/* 主要显示区域 */}
      <div className="glass-card overflow-hidden rounded-3xl p-8 shadow-xl ring-1 ring-black/5">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Gauge className="h-4 w-4" />
            <span>{statusText}</span>
          </div>

          <div>
            <div className={`text-6xl font-bold tracking-tight ${statusBadge.textClass}`}>
              {state.isListening || hasSession ? state.currentDb.toFixed(1) : "—"}
              <span className="ml-2 text-2xl font-semibold text-slate-600">dB</span>
            </div>
            <div
              className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusBadge.badgeClass}`}
            >
              {statusBadge.level}
            </div>
          </div>

          {/* 分贝指示器 */}
          <div className="w-full">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full transition-all duration-200 ease-out"
                style={{
                  width: `${Math.min(100, (state.currentDb / 120) * 100)}%`,
                  background:
                    "linear-gradient(to right, #10b981 0%, #eab308 55%, #ef4444 80%, #991b1b 100%)",
                }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-400">
              <span>0</span>
              <span>60</span>
              <span>120</span>
            </div>
          </div>

          {/* 统计信息 */}
          <div className="grid w-full grid-cols-2 gap-4 text-sm">
            <div className="rounded-2xl bg-white/60 p-4 text-left ring-1 ring-black/5">
              <div className="text-slate-500">最大值</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {state.maxDb.toFixed(1)}{" "}
                <span className="text-sm font-medium text-slate-500">dB</span>
              </div>
            </div>
            <div className="rounded-2xl bg-white/60 p-4 text-left ring-1 ring-black/5">
              <div className="text-slate-500">平均值</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {state.averageDb.toFixed(1)}{" "}
                <span className="text-sm font-medium text-slate-500">dB</span>
              </div>
            </div>
          </div>

          <div className="w-full rounded-2xl bg-white/60 p-4 text-left ring-1 ring-black/5">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium text-slate-700">趋势</div>
              <div className="text-xs text-slate-500">
                最近 {historyForChart.length} 次采样
              </div>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl bg-slate-50 p-3 ring-1 ring-black/5">
              {chartPoints ? (
                <svg viewBox="0 0 240 60" className="h-[60px] w-full">
                  <polyline
                    points={chartPoints}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <div className="text-sm text-slate-400">开始测量后显示趋势</div>
              )}
            </div>
          </div>
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          {!state.isListening ? (
            <button
              onClick={startListening}
              className="flex items-center justify-center gap-3 rounded-2xl bg-blue-600 px-8 py-4 font-medium text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-700 active:scale-[0.98]"
            >
              <Mic className="w-5 h-5" />
              开始测量
            </button>
          ) : (
            <button
              onClick={stopListening}
              className="flex items-center justify-center gap-3 rounded-2xl bg-rose-600 px-8 py-4 font-medium text-white shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-700 active:scale-[0.98]"
            >
              <MicOff className="w-5 h-5" />
              停止测量
            </button>
          )}

          <div className="w-full max-w-md rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium text-slate-700">校准偏移</div>
              <div className="text-sm font-semibold tabular-nums text-slate-900">
                {state.calibrationOffset} dB
              </div>
            </div>
            <input
              type="range"
              min={70}
              max={120}
              step={1}
              value={state.calibrationOffset}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  calibrationOffset: Number(e.target.value),
                }))
              }
              className="mt-3 w-full accent-blue-600"
              aria-label="校准偏移"
            />
            <div className="mt-2 text-xs text-slate-500">
              用于把相对音量（dBFS）映射为更直观的分贝范围；不同设备需手动调整以接近真实声级。
            </div>
          </div>
        </div>

        {/* 错误信息 */}
        {state.error && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium mb-1">无法访问麦克风</div>
              <div className="text-sm text-rose-700/80">{state.error}</div>
            </div>
          </div>
        )}

        {/* 权限状态提示 */}
        {state.permission === "denied" && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
            <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              麦克风权限已被拒绝。请在浏览器设置中允许此网站访问麦克风，或点击地址栏左侧的麦克风图标重新授权。
            </div>
          </div>
        )}

        {isSecureContextHint && (
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 text-slate-700 ring-1 ring-black/5">
            <Info className="h-5 w-5 flex-shrink-0 text-slate-500" />
            <div className="text-sm">
              当前页面不是安全上下文，浏览器可能会禁止麦克风访问。请使用 HTTPS 或在本机通过 localhost 访问。
            </div>
          </div>
        )}

        {/* 使用说明 */}
        <div className="glass-card rounded-3xl p-6 shadow-xl ring-1 ring-black/5">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Volume2 className="h-5 w-5 text-slate-700" />
            使用说明
          </h2>
          <div className="space-y-3 text-slate-700">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-1 text-emerald-600 flex-shrink-0" />
              <div>点击“开始测量”按钮授权麦克风访问</div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-1 text-emerald-600 flex-shrink-0" />
              <div>将设备放置在需要测量噪音的位置</div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-1 text-emerald-600 flex-shrink-0" />
              <div>实时显示当前环境噪音分贝水平</div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-1 text-emerald-600 flex-shrink-0" />
              <div>测量数据仅在本地处理，不会上传到服务器</div>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200/70 pt-4">
            <h3 className="font-medium mb-2 text-slate-900">噪音水平参考：</h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
              <div>30dB以下 - 极安静（录音棚）</div>
              <div>30-50dB - 安静（图书馆）</div>
              <div>50-70dB - 正常（办公室）</div>
              <div>70-90dB - 较吵（街道）</div>
              <div>90dB以上 - 很吵（工厂）</div>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200/70 pt-4 text-xs text-slate-500">
            <strong>注意：</strong>此工具使用设备麦克风进行噪音测量，测量结果受设备性能和环境因素影响，仅供参考。如需专业级噪音测量，请使用专业声级计。
          </div>
        </div>
    </div>
  );
};

export default NoiseMeterClient;
