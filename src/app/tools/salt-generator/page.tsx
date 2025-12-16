import type { Metadata } from "next";
import SaltGeneratorClient from "./SaltGeneratorClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "盐值生成器 | 纯粹工具站",
  description: "纯前端盐值生成器，支持自定义字节长度与输出格式（Hex/Base64/Base64URL），一键复制。",
  alternates: {
    canonical: "/tools/salt-generator",
  },
  openGraph: {
    title: "盐值生成器 - 纯粹工具站",
    description: "在线生成随机盐值（hex/base64），纯本地运行。",
    type: "website",
  },
  manifest: "/tools/salt-generator/manifest.webmanifest",
};

export default function SaltGeneratorPage() {
  return <SaltGeneratorClient />;
}

