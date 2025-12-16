import type { Metadata } from "next";
import TimestampConverterClient from "./TimestampConverterClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "时间戳转换 | 纯粹工具站",
  description:
    "纯前端时间戳转换工具（Unix 秒/毫秒 ↔ 日期时间），支持本地时区与 UTC，一键复制结果。",
  alternates: {
    canonical: "/tools/timestamp-converter",
  },
  openGraph: {
    title: "时间戳转换 - 纯粹工具站",
    description: "在线 Unix 时间戳与日期时间互转，支持本地时区与 UTC。",
    type: "website",
  },
  manifest: "/tools/timestamp-converter/manifest.webmanifest",
};

export default function TimestampConverterPage() {
  return <TimestampConverterClient />;
}

