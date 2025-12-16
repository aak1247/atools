import type { Metadata } from "next";
import RandomNumberGeneratorClient from "./RandomNumberGeneratorClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "随机数生成器 | 纯粹工具站",
  description:
    "纯前端随机数生成器，支持区间、数量、去重与一键复制，并使用本地存储记住偏好设置。",
  alternates: {
    canonical: "/tools/random-number-generator",
  },
  openGraph: {
    title: "随机数生成器 - 纯粹工具站",
    description: "在线生成随机整数，支持范围、数量、去重与复制。",
    type: "website",
  },
  manifest: "/tools/random-number-generator/manifest.webmanifest",
};

export default function RandomNumberGeneratorPage() {
  return <RandomNumberGeneratorClient />;
}

