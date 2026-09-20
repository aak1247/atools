"use client";

import ToolPageLayout from "../../../components/ToolPageLayout";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";

type LogItem = {
  id: string;
  at: number;
  type: "info" | "sent" | "received" | "error";
  message: string;
};

// 中文默认值
const DEFAULT_UI = {
  connectionCardTitle: "连接",
  connecting: "连接中",
  connected: "已连接",
  closing: "断开中",
  disconnected: "未连接",
  urlLabel: "WebSocket URL",
  urlPlaceholder: "wss://example.com/ws",
  protocolsLabel: "protocols（可选，逗号分隔）",
  protocolsPlaceholder: "graphql-ws",
  connectButton: "连接",
  disconnectButton: "断开",
  sendMessageCardTitle: "发送消息",
  sendButton: "发送",
  clearInputButton: "清空输入",
  logsCardTitle: "日志",
  autoScrollLabel: "自动滚动",
  clearLogsButton: "清空日志",
  noLogs: "暂无日志。",
  urlRequired: "URL 不能为空。",
  urlInvalidScheme: "URL 必须以 ws:// 或 wss:// 开头。",
  connectingTo: "尝试连接：{target}{protocols}",
  protocolsInfo: "（protocols: {protocols}）",
  connectedSuccess: "连接已建立。",
  connectionClosed: "连接已关闭（code={code}{reason}）。",
  reasonInfo: "，reason={reason}",
  connectionError: "连接发生错误（可能是网络/证书/服务端拒绝）。",
  notConnectedCannotSend: "未连接，无法发送。",
} as const;

type WebsocketTesterUi = typeof DEFAULT_UI;

const formatTime = (ms: number): string => {
  const d = new Date(ms);
  const timeStr = d.toTimeString().slice(0, 8);
  return `${timeStr}.${String(d.getMilliseconds()).padStart(3, "0")}`;
};

export default function WebsocketTesterClient() {
  const config = useOptionalToolConfig("websocket-tester");
  const ui: WebsocketTesterUi = { ...DEFAULT_UI, ...((config?.ui ?? {}) as Partial<WebsocketTesterUi>) };

  const socketRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const [url, setUrl] = useState("wss://echo.websocket.events");
  const [protocols, setProtocols] = useState("");
  const [message, setMessage] = useState('{"hello":"world"}');
  const [autoScroll, setAutoScroll] = useState(true);
  const [logs, setLogs] = useState<LogItem[]>([]);

  const [readyState, setReadyState] = useState<number>(WebSocket.CLOSED);

  const status = useMemo(() => {
    if (readyState === WebSocket.CONNECTING) return { text: ui.connecting, color: "bg-amber-50 text-amber-800 ring-amber-200" };
    if (readyState === WebSocket.OPEN) return { text: ui.connected, color: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
    if (readyState === WebSocket.CLOSING) return { text: ui.closing, color: "bg-slate-100 text-slate-700 ring-slate-200" };
    return { text: ui.disconnected, color: "bg-rose-50 text-rose-800 ring-rose-200" };
  }, [readyState, ui.closing, ui.connected, ui.connecting, ui.disconnected]);

  const pushLog = (type: LogItem["type"], messageText: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        at: Date.now(),
        type,
        message: messageText,
      },
    ]);
  };

  useEffect(() => {
    if (!autoScroll) return;
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [autoScroll, logs.length]);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const connect = () => {
    const target = url.trim();
    if (!target) {
      pushLog("error", ui.urlRequired);
      return;
    }
    if (!/^wss?:\/\//i.test(target)) {
      pushLog("error", ui.urlInvalidScheme);
      return;
    }

    socketRef.current?.close();
    setReadyState(WebSocket.CONNECTING);

    const protocolList = protocols
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const ws = protocolList.length > 0 ? new WebSocket(target, protocolList) : new WebSocket(target);
    socketRef.current = ws;
    const protoStr = protocolList.length ? ui.protocolsInfo.replace("{protocols}", protocolList.join(", ")) : "";
    pushLog("info", ui.connectingTo.replace("{target}", target).replace("{protocols}", protoStr));

    ws.addEventListener("open", () => {
      setReadyState(WebSocket.OPEN);
      pushLog("info", ui.connectedSuccess);
    });
    ws.addEventListener("close", (event) => {
      setReadyState(WebSocket.CLOSED);
      const reasonStr = event.reason ? ui.reasonInfo.replace("{reason}", event.reason) : "";
      pushLog("info", ui.connectionClosed.replace("{code}", String(event.code)).replace("{reason}", reasonStr));
    });
    ws.addEventListener("error", () => {
      setReadyState(ws.readyState);
      pushLog("error", ui.connectionError);
    });
    ws.addEventListener("message", async (event) => {
      if (typeof event.data === "string") {
        pushLog("received", event.data);
        return;
      }
      if (event.data instanceof Blob) {
        const text = await event.data.text().catch(() => "");
        pushLog("received", text ? `[Blob] ${text}` : `[Blob] ${event.data.type} ${event.data.size} bytes`);
        return;
      }
      pushLog("received", `[${typeof event.data}]`);
    });
  };

  const disconnect = () => {
    const ws = socketRef.current;
    if (!ws) return;
    setReadyState(WebSocket.CLOSING);
    ws.close();
  };

  const send = () => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pushLog("error", ui.notConnectedCannotSend);
      return;
    }
    ws.send(message);
    pushLog("sent", message);
  };

  const clear = () => setLogs([]);

  return (
    <ToolPageLayout toolSlug="websocket-tester" maxWidthClassName="max-w-6xl">
      <div className="space-y-8">
        <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">{ui.connectionCardTitle}</div>
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${status.color}`}>{status.text}</div>
                </div>

                <div className="mt-4 grid gap-4">
                  <label className="block text-sm text-slate-700">
                    {ui.urlLabel}
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      placeholder={ui.urlPlaceholder}
                    />
                  </label>
                  <label className="block text-sm text-slate-700">
                    {ui.protocolsLabel}
                    <input
                      value={protocols}
                      onChange={(e) => setProtocols(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                      placeholder={ui.protocolsPlaceholder}
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={connect}
                    className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    {ui.connectButton}
                  </button>
                  <button
                    type="button"
                    onClick={disconnect}
                    disabled={readyState !== WebSocket.OPEN && readyState !== WebSocket.CONNECTING}
                    className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    {ui.disconnectButton}
                  </button>
                </div>
              </div>

              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">{ui.sendMessageCardTitle}</div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-3 h-36 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={send}
                    disabled={readyState !== WebSocket.OPEN}
                    className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {ui.sendButton}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessage("")}
                    className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
                  >
                    {ui.clearInputButton}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">{ui.logsCardTitle}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      {ui.autoScrollLabel}
                    </label>
                    <button
                      type="button"
                      onClick={clear}
                      className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
                    >
                      {ui.clearLogsButton}
                    </button>
                  </div>
                </div>

                <div className="mt-4 max-h-[520px] overflow-auto rounded-2xl bg-slate-50 p-4 font-mono text-xs ring-1 ring-slate-200">
                  {logs.length === 0 && <div className="text-slate-500">{ui.noLogs}</div>}
                  {logs.map((item) => {
                    const badge =
                      item.type === "sent"
                        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                        : item.type === "received"
                          ? "bg-indigo-50 text-indigo-800 ring-indigo-200"
                          : item.type === "error"
                            ? "bg-rose-50 text-rose-800 ring-rose-200"
                            : "bg-slate-100 text-slate-700 ring-slate-200";
                    const label =
                      item.type === "sent"
                        ? "SEND"
                        : item.type === "received"
                          ? "RECV"
                          : item.type === "error"
                            ? "ERROR"
                            : "INFO";
                    return (
                      <div key={item.id} className="mb-2">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 text-[10px] text-slate-500">{formatTime(item.at)}</span>
                          <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ring-1 ${badge}`}>
                            {label}
                          </span>
                          <pre className="whitespace-pre-wrap break-words text-slate-800">{item.message}</pre>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}

