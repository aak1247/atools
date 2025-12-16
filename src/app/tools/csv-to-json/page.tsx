import type { Metadata } from "next";
import CsvToJsonClient from "./CsvToJsonClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "CSV-JSON 转换器 | 纯粹工具站",
  description: "纯前端 CSV 转 JSON 工具，支持自动识别分隔符、首行表头与一键复制下载。",
  alternates: {
    canonical: "/tools/csv-to-json",
  },
  openGraph: {
    title: "CSV-JSON 转换器 - 纯粹工具站",
    description: "在线 CSV 转 JSON，支持表头与分隔符识别，纯本地运行。",
    type: "website",
  },
  manifest: "/tools/csv-to-json/manifest.webmanifest",
};

export default function CsvToJsonPage() {
  return <CsvToJsonClient />;
}

