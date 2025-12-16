import type { Metadata } from "next";
import QrGeneratorClient from "./QrGeneratorClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "二维码生成器 | 纯粹工具站",
  description: "纯前端二维码生成器，支持自定义尺寸、容错等级与配色，生成 PNG 下载。",
  alternates: {
    canonical: "/tools/qr-generator",
  },
  openGraph: {
    title: "二维码生成器 - 纯粹工具站",
    description: "在线生成二维码，支持自定义大小与配色，纯本地运行。",
    type: "website",
  },
  manifest: "/tools/qr-generator/manifest.webmanifest",
};

export default function QrGeneratorPage() {
  return <QrGeneratorClient />;
}

