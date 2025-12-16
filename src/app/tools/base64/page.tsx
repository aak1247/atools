import type { Metadata } from "next";
import Base64Client from "./Base64Client";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Base64 编码解码 | 纯粹工具站",
  description:
    "纯前端 Base64 编码/解码工具，支持 UTF-8 文本与 URL-safe Base64，所有处理均在浏览器本地完成。",
  alternates: {
    canonical: "/tools/base64",
  },
  openGraph: {
    title: "Base64 编码解码 - 纯粹工具站",
    description: "在线 Base64 编码与解码，支持中文等 UTF-8 文本与 URL-safe 模式。",
    type: "website",
  },
  manifest: "/tools/base64/manifest.webmanifest",
};

export default function Base64Page() {
  return <Base64Client />;
}

