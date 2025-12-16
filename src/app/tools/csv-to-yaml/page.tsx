import type { Metadata } from "next";
import CsvToYamlClient from "./CsvToYamlClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "CSV-YAML 转换器 | 纯粹工具站",
  description: "纯前端 CSV 转 YAML 工具，支持自动识别分隔符、首行表头与一键复制下载。",
  alternates: {
    canonical: "/tools/csv-to-yaml",
  },
  openGraph: {
    title: "CSV-YAML 转换器 - 纯粹工具站",
    description: "在线 CSV 转 YAML，支持表头与分隔符识别，纯本地运行。",
    type: "website",
  },
  manifest: "/tools/csv-to-yaml/manifest.webmanifest",
};

export default function CsvToYamlPage() {
  return <CsvToYamlClient />;
}

