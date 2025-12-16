import type { Metadata } from "next";
import UrlEncoderClient from "./UrlEncoderClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "URL 编码解码 | 纯粹工具站",
  description:
    "纯前端 URL 编码/解码工具，支持 encodeURIComponent 与 application/x-www-form-urlencoded 模式，所有处理均在浏览器本地完成。",
  alternates: {
    canonical: "/tools/url-encoder",
  },
  openGraph: {
    title: "URL 编码解码 - 纯粹工具站",
    description: "在线 URL 编码与解码，一键处理中文、空格与特殊字符。",
    type: "website",
  },
  manifest: "/tools/url-encoder/manifest.webmanifest",
};

export default function UrlEncoderPage() {
  return <UrlEncoderClient />;
}

