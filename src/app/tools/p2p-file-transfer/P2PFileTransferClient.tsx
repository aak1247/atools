"use client";

import type { ChangeEvent, FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type ReceivedFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  url: string;
  receivedAt: number;
};

const revokeReceivedUrls = (files: ReceivedFile[]) => {
  for (const item of files) {
    URL.revokeObjectURL(item.url);
  }
};

type TransferProgress = {
  fileName: string;
  doneBytes: number;
  totalBytes: number;
};

type ControlMessage =
  | {
      type: "meta";
      id: string;
      name: string;
      size: number;
      mime: string;
    }
  | {
      type: "end";
      id: string;
    };

const CHUNK_SIZE = 16 * 1024;
const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024;
const PROGRESS_THROTTLE_MS = 120;

const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatPercent = (done: number, total: number): string => {
  if (!total) return "0%";
  const percent = Math.min(100, Math.max(0, (done / total) * 100));
  return `${percent.toFixed(1)}%`;
};

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (input: string): string => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
};

const encodeSignal = (desc: RTCSessionDescriptionInit): string =>
  toBase64Url(JSON.stringify(desc));

const parseSignalInput = (input: string): RTCSessionDescriptionInit => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("请输入连接码。");
  }
  const raw = trimmed.startsWith("{") ? trimmed : fromBase64Url(trimmed);
  const parsed = JSON.parse(raw) as RTCSessionDescriptionInit;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("连接码格式不正确。");
  }
  if (parsed.type !== "offer" && parsed.type !== "answer") {
    throw new Error("连接码缺少 type（offer/answer）。");
  }
  if (typeof parsed.sdp !== "string" || parsed.sdp.trim().length === 0) {
    throw new Error("连接码缺少 sdp。");
  }
  return parsed;
};

const waitForIceGatheringComplete = async (
  pc: RTCPeerConnection,
  timeoutMs = 10_000,
): Promise<void> => {
  if (pc.iceGatheringState === "complete") return;

  await new Promise<void>((resolve, reject) => {
    const onChange = () => {
      if (pc.iceGatheringState === "complete") {
        window.clearTimeout(timeoutId);
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }
    };

    const timeoutId = window.setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", onChange);
      reject(new Error("ICE 收集超时，请重试或开启 STUN。"));
    }, timeoutMs);

    pc.addEventListener("icegatheringstatechange", onChange);
  });
};

const waitForBufferedLow = async (
  channel: RTCDataChannel,
  timeoutMs = 10_000,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) {
      resolve();
      return;
    }

    const onLow = () => {
      window.clearTimeout(timeoutId);
      channel.removeEventListener("bufferedamountlow", onLow);
      resolve();
    };

    const timeoutId = window.setTimeout(() => {
      channel.removeEventListener("bufferedamountlow", onLow);
      reject(new Error("发送缓冲区等待超时，请重试。"));
    }, timeoutMs);

    channel.addEventListener("bufferedamountlow", onLow);
  });

const copyText = async (text: string): Promise<void> => {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // ignore, fallback below
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

const randomId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const P2PFileTransferClient: FC = () => {
  const [useStun, setUseStun] = useState<boolean>(false);
  const [localCode, setLocalCode] = useState<string>("");
  const [remoteCodeInput, setRemoteCodeInput] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [pcState, setPcState] = useState<RTCPeerConnectionState | "idle">(
    "idle",
  );
  const [iceState, setIceState] = useState<RTCIceConnectionState | "idle">(
    "idle",
  );
  const [channelState, setChannelState] = useState<
    RTCDataChannelState | "idle"
  >("idle");

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<TransferProgress | null>(
    null,
  );
  const [receiveProgress, setReceiveProgress] =
    useState<TransferProgress | null>(null);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortTransferRef = useRef<boolean>(false);
  const sendProgressTsRef = useRef<number>(0);
  const receiveProgressTsRef = useRef<number>(0);
  const toastTimerRef = useRef<number | null>(null);
  const receivedFilesRef = useRef<ReceivedFile[]>([]);

  const incomingRef = useRef<{
    id: string;
    name: string;
    size: number;
    mime: string;
    doneBytes: number;
    chunks: ArrayBuffer[];
  } | null>(null);

  const supported = useMemo(
    () => typeof RTCPeerConnection !== "undefined",
    [],
  );

  const connectionReady = pcState === "connected" && channelState === "open";

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 1600);
  };

  const closePeer = () => {
    abortTransferRef.current = true;

    const channel = channelRef.current;
    if (channel) {
      channel.onopen = null;
      channel.onclose = null;
      channel.onmessage = null;
      channel.onerror = null;
      try {
        channel.close();
      } catch {
        // ignore
      }
    }
    channelRef.current = null;

    const pc = pcRef.current;
    if (pc) {
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.ondatachannel = null;
      try {
        pc.close();
      } catch {
        // ignore
      }
    }
    pcRef.current = null;

    incomingRef.current = null;
    setPcState("idle");
    setIceState("idle");
    setChannelState("idle");
  };

  const resetAll = () => {
    closePeer();
    abortTransferRef.current = false;

    revokeReceivedUrls(receivedFilesRef.current);
    receivedFilesRef.current = [];
    setReceivedFiles([]);
    setReceiveProgress(null);

    setSelectedFiles([]);
    setIsSending(false);
    setSendProgress(null);

    setLocalCode("");
    setRemoteCodeInput("");
    setError(null);
  };

  const createPeerConnection = (): RTCPeerConnection => {
    const iceServers = useStun
      ? [{ urls: ["stun:stun.l.google.com:19302"] }]
      : [];

    const pc = new RTCPeerConnection({
      iceServers,
    });

    pc.onconnectionstatechange = () => {
      setPcState(pc.connectionState);
      if (pc.connectionState === "failed") {
        setError("连接失败：可尝试重置后开启 STUN 再试。");
      }
    };

    pc.oniceconnectionstatechange = () => {
      setIceState(pc.iceConnectionState);
    };

    return pc;
  };

  const handleControlMessage = (message: ControlMessage) => {
    if (message.type === "meta") {
      incomingRef.current = {
        id: message.id,
        name: message.name,
        size: message.size,
        mime: message.mime,
        doneBytes: 0,
        chunks: [],
      };
      setReceiveProgress({
        fileName: message.name,
        doneBytes: 0,
        totalBytes: message.size,
      });
      receiveProgressTsRef.current = performance.now();
      return;
    }

    if (message.type === "end") {
      const incoming = incomingRef.current;
      if (!incoming || incoming.id !== message.id) {
        return;
      }

      const blob = new Blob(incoming.chunks, { type: incoming.mime });
      const url = URL.createObjectURL(blob);
      const received: ReceivedFile = {
        id: incoming.id,
        name: incoming.name,
        size: incoming.size,
        mime: incoming.mime,
        url,
        receivedAt: Date.now(),
      };

      incomingRef.current = null;
      setReceiveProgress(null);
      setReceivedFiles((prev) => {
        const next = [received, ...prev];
        receivedFilesRef.current = next;
        return next;
      });
    }
  };

  const handleDataMessage = (event: MessageEvent) => {
    void (async () => {
      if (typeof event.data === "string") {
        try {
          const parsed = JSON.parse(event.data) as ControlMessage;
          if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
            return;
          }
          if (parsed.type === "meta" || parsed.type === "end") {
            handleControlMessage(parsed);
          }
        } catch {
          // ignore invalid control messages
        }
        return;
      }

      const incoming = incomingRef.current;
      if (!incoming) return;

      const buffer =
        event.data instanceof ArrayBuffer
          ? event.data
          : event.data instanceof Blob
            ? await event.data.arrayBuffer()
            : null;

      if (!buffer) return;

      incoming.chunks.push(buffer);
      incoming.doneBytes += buffer.byteLength;

      const now = performance.now();
      if (
        now - receiveProgressTsRef.current >= PROGRESS_THROTTLE_MS ||
        incoming.doneBytes >= incoming.size
      ) {
        receiveProgressTsRef.current = now;
        setReceiveProgress({
          fileName: incoming.name,
          doneBytes: incoming.doneBytes,
          totalBytes: incoming.size,
        });
      }
    })();
  };

  const setupDataChannel = (channel: RTCDataChannel) => {
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = Math.floor(
      MAX_BUFFERED_AMOUNT / 2,
    );
    channel.onopen = () => setChannelState(channel.readyState);
    channel.onclose = () => setChannelState(channel.readyState);
    channel.onerror = () => setError("数据通道发生错误，请重置后重试。");
    channel.onmessage = handleDataMessage;
    setChannelState(channel.readyState);
    channelRef.current = channel;
  };

  const handleCreateOffer = async () => {
    setError(null);
    setIsBusy(true);
    resetAll();

    try {
      const pc = createPeerConnection();
      pcRef.current = pc;
      setPcState(pc.connectionState);
      setIceState(pc.iceConnectionState);

      const channel = pc.createDataChannel("file");
      setupDataChannel(channel);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      if (!pc.localDescription) {
        throw new Error("生成连接码失败，请重试。");
      }

      const code = encodeSignal(pc.localDescription);
      setLocalCode(code);
      showToast("已生成连接码，可复制到另一台设备。");
    } catch (err) {
      closePeer();
      setError(
        err instanceof Error ? err.message : "生成连接码失败，请重试。",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleUseRemoteCode = async () => {
    setError(null);
    setIsBusy(true);

    const codeInput = remoteCodeInput;

    try {
      const signal = parseSignalInput(codeInput);

      if (signal.type === "offer") {
        resetAll();

        const pc = createPeerConnection();
        pcRef.current = pc;
        setPcState(pc.connectionState);
        setIceState(pc.iceConnectionState);

        pc.ondatachannel = (event) => {
          setupDataChannel(event.channel);
        };

        await pc.setRemoteDescription(signal);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGatheringComplete(pc);

        if (!pc.localDescription) {
          throw new Error("生成连接码失败，请重试。");
        }

        const local = encodeSignal(pc.localDescription);
        setLocalCode(local);
        showToast("已生成连接码，请复制回对方继续。");
        return;
      }

      const pc = pcRef.current;
      if (!pc) {
        throw new Error("请先在本机点击“生成连接码”。");
      }

      await pc.setRemoteDescription(signal);
      showToast("已应用连接码，等待连接建立...");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "处理连接码失败，请重试。",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setSelectedFiles(files);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (!files.length) return;
    setSelectedFiles(files);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const sendSingleFile = async (channel: RTCDataChannel, file: File) => {
    const id = randomId();
    const mime = file.type || "application/octet-stream";

    const meta: ControlMessage = {
      type: "meta",
      id,
      name: file.name,
      size: file.size,
      mime,
    };
    channel.send(JSON.stringify(meta));

    let offset = 0;
    let doneBytes = 0;
    sendProgressTsRef.current = performance.now();
    setSendProgress({
      fileName: file.name,
      doneBytes: 0,
      totalBytes: file.size,
    });

    while (offset < file.size) {
      if (abortTransferRef.current) {
        throw new Error("传输已取消。");
      }
      if (channel.readyState !== "open") {
        throw new Error("连接已断开。");
      }

      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      channel.send(buffer);
      offset += buffer.byteLength;
      doneBytes += buffer.byteLength;

      const now = performance.now();
      if (
        now - sendProgressTsRef.current >= PROGRESS_THROTTLE_MS ||
        doneBytes >= file.size
      ) {
        sendProgressTsRef.current = now;
        setSendProgress({
          fileName: file.name,
          doneBytes,
          totalBytes: file.size,
        });
      }

      if (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        await waitForBufferedLow(channel);
      }
    }

    channel.send(JSON.stringify({ type: "end", id }));
  };

  const handleSend = async () => {
    setError(null);

    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") {
      setError("请先完成连接（数据通道打开后）再发送文件。");
      return;
    }
    if (!selectedFiles.length) {
      setError("请先选择需要发送的文件。");
      return;
    }

    setIsSending(true);
    abortTransferRef.current = false;

    try {
      for (const file of selectedFiles) {
        await sendSingleFile(channel, file);
      }
      showToast("发送完成。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败，请重试。");
    } finally {
      setIsSending(false);
      setSendProgress(null);
    }
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      closePeer();
      revokeReceivedUrls(receivedFilesRef.current);
    };
  }, []);

  const totalSelectedSize = useMemo(
    () => selectedFiles.reduce((sum, file) => sum + file.size, 0),
    [selectedFiles],
  );

  if (!supported) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in-up space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            局域网 P2P 文件传输工具
          </h1>
          <p className="mt-2 text-slate-500">
            当前浏览器不支持 WebRTC（RTCPeerConnection），请更换为 Chrome /
            Edge / Firefox / Safari 新版本再试。
          </p>
        </div>
      </div>
    );
  }

  const statusBadge = connectionReady
    ? { text: "已连接", cls: "bg-emerald-600 text-white" }
    : pcState === "connecting" || iceState === "checking"
      ? { text: "连接中", cls: "bg-indigo-600 text-white" }
      : pcState === "failed" || iceState === "failed"
        ? { text: "失败", cls: "bg-rose-600 text-white" }
        : { text: "未连接", cls: "bg-slate-200 text-slate-700" };

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          局域网 P2P 文件传输工具
        </h1>
        <p className="mt-2 text-slate-500">
          基于 WebRTC DataChannel 的纯前端点对点传输，不经服务器中转。先完成连接，再选择文件发送。
        </p>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">
              第一步：建立连接（复制/粘贴连接码）
            </h2>
            <p className="text-xs text-slate-500">
              谁先点击“生成连接码”，谁就是创建方；另一台设备粘贴并点击“使用连接码”后会生成新的连接码，复制回创建方再“使用连接码”即可完成连接。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusBadge.cls}`}
            >
              {statusBadge.text}
            </span>
            <button
              type="button"
              onClick={resetAll}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
            >
              重置
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={useStun}
              onChange={(event) => setUseStun(event.target.checked)}
              disabled={isBusy || pcState !== "idle"}
              className="h-4 w-4 rounded border-slate-300"
            />
            开启 STUN（更易成功，需联网）
          </label>

          <span className="text-[11px] text-slate-500">
            pc: {pcState} · ice: {iceState} · dc: {channelState}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">
                本机连接码
              </h3>
              <button
                type="button"
                onClick={handleCreateOffer}
                disabled={isBusy || pcState !== "idle"}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                生成连接码
              </button>
            </div>

            <textarea
              value={localCode}
              readOnly
              rows={6}
              placeholder="点击“生成连接码”或“使用连接码”后会出现在这里"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  void copyText(localCode).then(() =>
                    showToast("已复制连接码"),
                  )
                }
                disabled={!localCode}
                className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                复制
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">
                对方连接码
              </h3>
              <button
                type="button"
                onClick={handleUseRemoteCode}
                disabled={isBusy || remoteCodeInput.trim().length === 0}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                使用连接码
              </button>
            </div>

            <textarea
              value={remoteCodeInput}
              onChange={(event) => setRemoteCodeInput(event.target.value)}
              rows={6}
              placeholder="将对方发来的连接码粘贴到这里"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />

            <p className="text-[11px] text-slate-500">
              加入方：粘贴创建方连接码后点击“使用连接码”，会生成本机连接码（发回创建方）。创建方：粘贴对方发回的连接码后点击“使用连接码”完成连接。
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-3 text-[11px] leading-relaxed text-slate-500">
          <p>
            提示：如果在公司网络/移动热点下连接不成功，可尝试开启 STUN 或更换浏览器。文件传输过程中请保持页面常亮，避免系统休眠导致断连。
          </p>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">
              第二步：选择文件并发送
            </h2>
            <p className="text-xs text-slate-500">
              连接成功后，两端都可以选择文件发送。大文件会占用浏览器内存，建议单次传输不要太大。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!connectionReady || isSending}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              选择文件
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!connectionReady || isSending || !selectedFiles.length}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSending ? "发送中..." : "开始发送"}
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`rounded-2xl border border-dashed p-6 text-center transition ${
            isDragging
              ? "border-indigo-400 bg-indigo-50/60"
              : "border-slate-200 bg-slate-50/60"
          }`}
        >
          <p className="text-sm font-medium text-slate-900">拖拽文件到这里</p>
          <p className="mt-1 text-xs text-slate-500">
            {connectionReady
              ? "或点击“选择文件”从本地挑选"
              : "请先完成连接后再选择文件"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">待发送</h3>
              <span className="text-[11px] text-slate-500">
                {selectedFiles.length} 个文件 · {formatSize(totalSelectedSize)}
              </span>
            </div>

            {selectedFiles.length === 0 ? (
              <p className="text-xs text-slate-500">尚未选择文件。</p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-auto pr-1 no-scrollbar">
                {selectedFiles.map((file) => (
                  <li
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-slate-100"
                  >
                    <div className="min-w-0">
                      <p
                        className="truncate font-medium text-slate-900"
                        title={file.name}
                      >
                        {file.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {formatSize(file.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedFiles((prev) =>
                          prev.filter((item) => item !== file),
                        )
                      }
                      disabled={isSending}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      移除
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {sendProgress && (
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs">
                <p className="font-medium text-slate-900">
                  发送中：{sendProgress.fileName}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatSize(sendProgress.doneBytes)} /{" "}
                  {formatSize(sendProgress.totalBytes)}（
                  {formatPercent(sendProgress.doneBytes, sendProgress.totalBytes)}
                  ）
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{
                      width: formatPercent(
                        sendProgress.doneBytes,
                        sendProgress.totalBytes,
                      ),
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">已接收</h3>
              <span className="text-[11px] text-slate-500">
                {receivedFiles.length} 个文件
              </span>
            </div>

            {receiveProgress && (
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs">
                <p className="font-medium text-slate-900">
                  接收中：{receiveProgress.fileName}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatSize(receiveProgress.doneBytes)} /{" "}
                  {formatSize(receiveProgress.totalBytes)}（
                  {formatPercent(
                    receiveProgress.doneBytes,
                    receiveProgress.totalBytes,
                  )}
                  ）
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all"
                    style={{
                      width: formatPercent(
                        receiveProgress.doneBytes,
                        receiveProgress.totalBytes,
                      ),
                    }}
                  />
                </div>
              </div>
            )}

            {receivedFiles.length === 0 ? (
              <p className="text-xs text-slate-500">还没有接收到文件。</p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-auto pr-1 no-scrollbar">
                {receivedFiles.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-slate-100"
                  >
                    <div className="min-w-0">
                      <p
                        className="truncate font-medium text-slate-900"
                        title={file.name}
                      >
                        {file.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {formatSize(file.size)}
                      </p>
                    </div>
                    <a
                      href={file.url}
                      download={file.name}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
                    >
                      下载
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
};

export default P2PFileTransferClient;
