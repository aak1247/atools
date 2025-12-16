import type { Metadata } from "next";
import Aes256Client from "./Aes256Client";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "AES256 加解密 | 纯粹工具站",
  description:
    "纯前端 AES-256-GCM 加解密工具，使用 PBKDF2 派生密钥并输出可复制的加密结果（JSON），所有处理均在浏览器本地完成。",
  alternates: {
    canonical: "/tools/aes256",
  },
  openGraph: {
    title: "AES256 加解密 - 纯粹工具站",
    description: "在线 AES-256-GCM 加密/解密（PBKDF2 派生密钥），纯本地运行。",
    type: "website",
  },
  manifest: "/tools/aes256/manifest.webmanifest",
};

export default function Aes256Page() {
  return <Aes256Client />;
}

