import type { Metadata } from "next";
import JsonYamlConverterClient from "./JsonYamlConverterClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "JSON-YAML 转换器 | 纯粹工具站",
  description: "纯前端 JSON 与 YAML 互转工具，支持一键复制与格式化，所有处理均在浏览器本地完成。",
  alternates: {
    canonical: "/tools/json-yaml-converter",
  },
  openGraph: {
    title: "JSON-YAML 转换器 - 纯粹工具站",
    description: "在线 JSON 与 YAML 互转，支持格式化与复制，纯本地运行。",
    type: "website",
  },
  manifest: "/tools/json-yaml-converter/manifest.webmanifest",
};

export default function JsonYamlConverterPage() {
  return <JsonYamlConverterClient />;
}

