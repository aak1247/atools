import type { Metadata } from "next";
import UuidGeneratorClient from "./UuidGeneratorClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "UUID 生成器 | 纯粹工具站",
  description: "纯前端 UUID v4 生成器，支持批量生成与一键复制，所有生成均在浏览器本地完成。",
  alternates: {
    canonical: "/tools/uuid-generator",
  },
  openGraph: {
    title: "UUID 生成器 - 纯粹工具站",
    description: "在线生成 UUID v4，支持批量生成与复制。",
    type: "website",
  },
  manifest: "/tools/uuid-generator/manifest.webmanifest",
};

export default function UuidGeneratorPage() {
  return <UuidGeneratorClient />;
}

