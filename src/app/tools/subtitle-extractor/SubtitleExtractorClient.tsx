"use client";

import type { ChangeEvent } from "react";
import * as GBK from "gbk.js";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolPageLayout from "../../../components/ToolPageLayout";

type SubtitleFormat = "srt" | "vtt" | "ass";

type Cue = {
  startMs: number;
  endMs: number;
  text: string;
  // for ASS carry full dialogue fields
  ass?: {
    rawPrefix: string; // "Dialogue: ..." until start,end, then rest
    afterEnd: string;
  };
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad3 = (n: number) => String(n).padStart(3, "0");

const formatSrtTime = (ms: number) => {
  const t = Math.max(0, Math.round(ms));
  const hh = Math.floor(t / 3600000);
  const mm = Math.floor((t % 3600000) / 60000);
  const ss = Math.floor((t % 60000) / 1000);
  const mmm = t % 1000;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)},${pad3(mmm)}`;
};

const formatVttTime = (ms: number) => {
  const t = Math.max(0, Math.round(ms));
  const hh = Math.floor(t / 3600000);
  const mm = Math.floor((t % 3600000) / 60000);
  const ss = Math.floor((t % 60000) / 1000);
  const mmm = t % 1000;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}.${pad3(mmm)}`;
};

const formatAssTime = (ms: number) => {
  const t = Math.max(0, Math.round(ms));
  const hh = Math.floor(t / 3600000);
  const mm = Math.floor((t % 3600000) / 60000);
  const ss = Math.floor((t % 60000) / 1000);
  const cc = Math.floor((t % 1000) / 10); // centiseconds
  return `${hh}:${pad2(mm)}:${pad2(ss)}.${pad2(cc)}`;
};

const parseSrtTime = (text: string) => {
  const m = text.trim().match(/^(\d+):(\d+):(\d+),(\d{1,3})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  const ms = Number(m[4].padEnd(3, "0"));
  return hh * 3600000 + mm * 60000 + ss * 1000 + ms;
};

const parseVttTime = (text: string) => {
  const m = text.trim().match(/^(\d+):(\d+):(\d+)\.(\d{1,3})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  const ms = Number(m[4].padEnd(3, "0"));
  return hh * 3600000 + mm * 60000 + ss * 1000 + ms;
};

const parseAssTime = (text: string) => {
  const m = text.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})\.(\d{1,2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  const cc = Number(m[4].padEnd(2, "0"));
  return hh * 3600000 + mm * 60000 + ss * 1000 + cc * 10;
};

const detectFormat = (text: string): SubtitleFormat => {
  const t = text.trimStart();
  if (/^\s*WEBVTT\b/i.test(t)) return "vtt";
  if (/^\s*\[Script Info\]/i.test(t) || /^\s*\[V4\+ Styles\]/i.test(t) || /^\s*Dialogue:/im.test(t)) return "ass";
  return "srt";
};

const normalizeLineBreaks = (text: string) => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const parseSrt = (text: string): Cue[] => {
  const blocks = normalizeLineBreaks(text).split(/\n{2,}/g);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.length > 0);
    if (lines.length < 2) continue;
    const timeLine = lines[0].includes("-->") ? lines[0] : lines[1];
    const timeMatch = timeLine.match(/(.+?)\s*-->\s*(.+)/);
    if (!timeMatch) continue;
    const start = parseSrtTime(timeMatch[1]);
    const end = parseSrtTime(timeMatch[2]);
    if (start == null || end == null) continue;
    const textLines = lines.slice(timeLine === lines[0] ? 1 : 2);
    cues.push({ startMs: start, endMs: end, text: textLines.join("\n") });
  }
  return cues;
};

const parseVtt = (text: string): Cue[] => {
  const lines = normalizeLineBreaks(text).split("\n");
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (/^WEBVTT\b/i.test(line)) {
      i += 1;
      continue;
    }
    // optional cue id line
    let timeLine = line;
    if (!line.includes("-->") && i + 1 < lines.length && lines[i + 1].includes("-->")) {
      timeLine = lines[i + 1].trim();
      i += 1;
    }
    const timeMatch = timeLine.match(/(.+?)\s*-->\s*(.+?)(?:\s+.*)?$/);
    if (!timeMatch) {
      i += 1;
      continue;
    }
    const start = parseVttTime(timeMatch[1]);
    const end = parseVttTime(timeMatch[2]);
    if (start == null || end == null) {
      i += 1;
      continue;
    }
    i += 1;
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim().length > 0) {
      textLines.push(lines[i]);
      i += 1;
    }
    cues.push({ startMs: start, endMs: end, text: textLines.join("\n") });
  }
  return cues;
};

const splitCsvFields = (s: string, expected: number): string[] => {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "," && out.length < expected - 1) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
};

const parseAss = (text: string): { header: string; cues: Cue[] } => {
  const lines = normalizeLineBreaks(text).split("\n");
  const cues: Cue[] = [];
  const headerLines: string[] = [];
  for (const line of lines) {
    if (/^\s*Dialogue:/i.test(line)) {
      const after = line.replace(/^\s*Dialogue:\s*/i, "");
      // We only need start/end/time and text; ASS format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
      const fields = splitCsvFields(after, 10);
      if (fields.length < 10) continue;
      const start = parseAssTime(fields[1]);
      const end = parseAssTime(fields[2]);
      if (start == null || end == null) continue;
      const textField = fields.slice(9).join(",").replace(/\\N/g, "\n");
      const rawPrefix = `Dialogue: ${fields.slice(0, 1).join(",")},`; // layer + comma
      const afterEnd = `,${fields.slice(3).join(",")}`;
      cues.push({ startMs: start, endMs: end, text: textField, ass: { rawPrefix, afterEnd } });
    } else {
      headerLines.push(line);
    }
  }
  return { header: `${headerLines.join("\n")}\n`, cues };
};

const shiftAndScale = (cues: Cue[], offsetMs: number, speed: number) => {
  const s = speed <= 0 ? 1 : speed;
  return cues.map((c) => {
    const start = c.startMs * s + offsetMs;
    const end = c.endMs * s + offsetMs;
    return { ...c, startMs: Math.max(0, Math.round(start)), endMs: Math.max(0, Math.round(end)) };
  });
};

const toSrt = (cues: Cue[]) => {
  const lines: string[] = [];
  for (let i = 0; i < cues.length; i += 1) {
    const c = cues[i];
    lines.push(String(i + 1));
    lines.push(`${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}`);
    lines.push(c.text);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
};

const toVtt = (cues: Cue[]) => {
  const lines: string[] = ["WEBVTT", ""];
  for (const c of cues) {
    lines.push(`${formatVttTime(c.startMs)} --> ${formatVttTime(c.endMs)}`);
    lines.push(c.text);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
};

const defaultAssHeader = ` [Script Info]
; Script generated by ATools
ScriptType: v4.00+
Collisions: Normal
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00181818,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,60,60,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const toAss = (header: string | null, cues: Cue[]) => {
  const lines: string[] = [];
  lines.push((header && header.trim().length > 0 ? header : defaultAssHeader).replace(/\r\n/g, "\n"));
  for (const c of cues) {
    if (c.ass) {
      lines.push(`${c.ass.rawPrefix}${formatAssTime(c.startMs)},${formatAssTime(c.endMs)}${c.ass.afterEnd.replace(/\r?\n/g, "")}`);
    } else {
      const text = c.text.replace(/\r\n/g, "\n").replace(/\n/g, "\\N");
      lines.push(`Dialogue: 0,${formatAssTime(c.startMs)},${formatAssTime(c.endMs)},Default,,0,0,0,,${text}`);
    }
  }
  if (!lines[lines.length - 1].endsWith("\n")) lines.push("");
  return `${lines.join("\n")}\n`;
};

const decodeText = (bytes: Uint8Array, encoding: "auto" | "utf-8" | "gbk") => {
  if (encoding === "gbk") return GBK.decode(Array.from(bytes));
  if (encoding === "utf-8") return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return GBK.decode(Array.from(bytes));
  }
};

const encodeText = (text: string, encoding: "utf-8" | "gbk"): Uint8Array => {
  if (encoding === "gbk") return new Uint8Array(GBK.encode(text));
  return new TextEncoder().encode(text);
};

export default function SubtitleExtractorClient() {
  return (
    <ToolPageLayout toolSlug="subtitle-extractor" maxWidthClassName="max-w-6xl">
      <SubtitleExtractorInner />
    </ToolPageLayout>
  );
}

function SubtitleExtractorInner() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [inputText, setInputText] = useState("");
  const [inputFormat, setInputFormat] = useState<SubtitleFormat>("srt");
  const [outputFormat, setOutputFormat] = useState<SubtitleFormat>("srt");
  const [inputEncoding, setInputEncoding] = useState<"auto" | "utf-8" | "gbk">("auto");
  const [outputEncoding, setOutputEncoding] = useState<"utf-8" | "gbk">("utf-8");

  const [offsetMs, setOffsetMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("output.srt");

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const parsed = useMemo(() => {
    setError(null);
    const src = inputText.trim();
    if (!src) return { header: null as string | null, cues: [] as Cue[] };
    try {
      const detected = detectFormat(inputText);
      if (detected !== inputFormat) setInputFormat(detected);

      if (inputFormat === "ass") {
        const { header, cues } = parseAss(inputText);
        return { header, cues };
      }
      if (inputFormat === "vtt") return { header: null, cues: parseVtt(inputText) };
      return { header: null, cues: parseSrt(inputText) };
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析失败");
      return { header: null, cues: [] as Cue[] };
    }
  }, [inputFormat, inputText]);

  const adjusted = useMemo(() => shiftAndScale(parsed.cues, offsetMs, speed), [offsetMs, parsed.cues, speed]);

  const outputText = useMemo(() => {
    try {
      if (outputFormat === "ass") return toAss(parsed.header, adjusted);
      if (outputFormat === "vtt") return toVtt(adjusted);
      return toSrt(adjusted);
    } catch (e) {
      return `/* ERROR: ${e instanceof Error ? e.message : "生成失败"} */\n`;
    }
  }, [adjusted, outputFormat, parsed.header]);

  useEffect(() => {
    const ext = outputFormat;
    setDownloadName(`output.${ext}`);
  }, [outputFormat]);

  useEffect(() => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    if (!outputText || outputText.startsWith("/* ERROR:")) {
      setDownloadUrl(null);
      return;
    }
    const bytes = encodeText(outputText, outputEncoding);
    const mime =
      outputFormat === "vtt"
        ? "text/vtt"
        : outputFormat === "ass"
          ? "text/plain"
          : "application/x-subrip";
    const blob = new Blob([bytes], { type: `${mime};charset=${outputEncoding}` });
    setDownloadUrl(URL.createObjectURL(blob));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputText, outputEncoding, outputFormat]);

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const text = decodeText(bytes, inputEncoding);
    setInputText(text);
    const detected = detectFormat(text);
    setInputFormat(detected);
    setOutputFormat(detected);
    const base = f.name.replace(/\.[^.]+$/, "") || "subtitle";
    setDownloadName(`${base}.out.${detected}`);
  };

  const copyOutput = async () => {
    await navigator.clipboard.writeText(outputText);
  };

  const clear = () => {
    setInputText("");
    setError(null);
    setOffsetMs(0);
    setSpeed(1);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full px-4">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputRef} type="file" accept=".srt,.vtt,.ass,text/*" className="hidden" onChange={(e) => void onUpload(e)} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              上传字幕文件
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              清空
            </button>
            <div className="text-xs text-slate-500">
              已解析 {parsed.cues.length} 条
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyOutput()}
              className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              复制输出
            </button>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={downloadName}
                className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                下载 {downloadName}
              </a>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">输入</div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-600">
                    格式
                    <select
                      value={inputFormat}
                      onChange={(e) => setInputFormat(e.target.value as SubtitleFormat)}
                      className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="srt">SRT</option>
                      <option value="vtt">VTT</option>
                      <option value="ass">ASS</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    编码
                    <select
                      value={inputEncoding}
                      onChange={(e) => setInputEncoding(e.target.value as any)}
                      className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="auto">自动</option>
                      <option value="utf-8">UTF-8</option>
                      <option value="gbk">GBK</option>
                    </select>
                  </label>
                </div>
              </div>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="mt-3 h-[520px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                placeholder="粘贴字幕内容或上传文件…"
              />
              {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">时间轴调整</div>
              <div className="mt-4 grid gap-4">
                <label className="block text-sm text-slate-700">
                  偏移（毫秒，可为负）
                  <input
                    type="number"
                    step={10}
                    value={offsetMs}
                    onChange={(e) => setOffsetMs(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    placeholder="例如 500 或 -250"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  速度倍率（&gt;0）
                  <input
                    type="number"
                    step={0.01}
                    min={0.1}
                    max={10}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                  />
                </label>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                  说明：输出时间 = 输入时间 × 速度倍率 + 偏移；最终会裁剪到 ≥0。
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">输出</div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-600">
                    格式
                    <select
                      value={outputFormat}
                      onChange={(e) => setOutputFormat(e.target.value as SubtitleFormat)}
                      className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="srt">SRT</option>
                      <option value="vtt">VTT</option>
                      <option value="ass">ASS</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    编码
                    <select
                      value={outputEncoding}
                      onChange={(e) => setOutputEncoding(e.target.value as any)}
                      className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="utf-8">UTF-8</option>
                      <option value="gbk">GBK</option>
                    </select>
                  </label>
                </div>
              </div>
              <textarea
                value={outputText}
                readOnly
                className="mt-3 h-[360px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none"
                placeholder="输出结果…"
              />
              <div className="mt-3 text-xs text-slate-500">
                提示：本工具纯前端运行，支持 UTF-8/GBK 编码读写与 SRT/VTT/ASS 格式互转（ASS 样式保留仅在 ASS→ASS 时完整）。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

