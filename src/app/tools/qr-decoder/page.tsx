import type { Metadata } from "next";
import QrDecoderClient from "./QrDecoderClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "二维码解析器 | 纯粹工具站",
  description: "纯前端二维码解析器，支持上传二维码图片并解析内容，一键复制结果。",
  alternates: {
    canonical: "/tools/qr-decoder",
  },
  openGraph: {
    title: "二维码解析器 - 纯粹工具站",
    description: "在线解析二维码图片，识别并输出二维码内容。",
    type: "website",
  },
  manifest: "/tools/qr-decoder/manifest.webmanifest",
};

export default function QrDecoderPage() {
  return <QrDecoderClient />;
}

