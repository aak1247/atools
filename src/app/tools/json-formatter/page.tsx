import type { Metadata } from "next";
import JsonFormatterClient from "./JsonFormatterClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "JSON 格式化 | 纯粹工具站",
  description:
    "纯前端 JSON 格式化与压缩工具，支持缩进、排序键与一键复制，所有处理均在浏览器本地完成。",
  alternates: {
    canonical: "/tools/json-formatter",
  },
  openGraph: {
    title: "JSON 格式化 - 纯粹工具站",
    description: "在线 JSON 格式化与压缩，支持缩进与键排序。",
    type: "website",
  },
  manifest: "/tools/json-formatter/manifest.webmanifest",
};

export default function JsonFormatterPage() {
  return <JsonFormatterClient />;
}

