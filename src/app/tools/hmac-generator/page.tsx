import type { Metadata } from "next";
import HmacGeneratorClient from "./HmacGeneratorClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "HMAC 生成器 | 纯粹工具站",
  description: "纯前端 HMAC 生成器，支持 SHA1/SHA256/SHA512，支持文本或十六进制 Key，输出 Hex/Base64 并可一键复制。",
  alternates: {
    canonical: "/tools/hmac-generator",
  },
  openGraph: {
    title: "HMAC 生成器 - 纯粹工具站",
    description: "在线生成 HMAC（SHA1/SHA256/SHA512），纯本地运行。",
    type: "website",
  },
  manifest: "/tools/hmac-generator/manifest.webmanifest",
};

export default function HmacGeneratorPage() {
  return <HmacGeneratorClient />;
}

