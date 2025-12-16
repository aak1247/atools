import type { Metadata } from "next";
import DesClient from "./DesClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "DES 加解密 | 纯粹工具站",
  description:
    "纯前端 DES 加解密工具（CBC/ECB + PKCS7），支持输入十六进制 Key/IV 并输出 Base64 密文。注意：DES 已不安全，仅用于兼容场景。",
  alternates: {
    canonical: "/tools/des",
  },
  openGraph: {
    title: "DES 加解密 - 纯粹工具站",
    description: "在线 DES 加密/解密（CBC/ECB），纯本地运行。",
    type: "website",
  },
  manifest: "/tools/des/manifest.webmanifest",
};

export default function DesPage() {
  return <DesClient />;
}

