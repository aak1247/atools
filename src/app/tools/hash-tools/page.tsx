import type { Metadata } from "next";
import HashToolsClient from "./HashToolsClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "哈希生成与校验 | 纯粹工具站",
  description:
    "纯前端哈希生成与校验工具，支持 MD5、SHA1、SHA256、SHA512（文本/文件），所有计算均在浏览器本地完成。",
  alternates: {
    canonical: "/tools/hash-tools",
  },
  openGraph: {
    title: "哈希生成与校验 - 纯粹工具站",
    description: "在线生成 MD5/SHA 哈希并进行文件校验，纯本地计算。",
    type: "website",
  },
  manifest: "/tools/hash-tools/manifest.webmanifest",
};

export default function HashToolsPage() {
  return <HashToolsClient />;
}

