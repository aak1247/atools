import type { Metadata } from "next";
import CalculatorClient from "./CalculatorClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "科学计算器 | 前端工具站",
  description:
    "纯前端科学计算器工具，支持四则运算以及常用三角、平方根、对数函数，所有计算均在本地浏览器完成。",
  alternates: {
    canonical: "/tools/calculator",
  },
  openGraph: {
    title: "科学计算器 - 前端工具站",
    description:
      "在线科学计算器，支持 sin/cos/tan、sqrt、log 等函数，适合日常学习和工作场景。",
    type: "website",
  },
  manifest: "/tools/calculator/manifest.webmanifest",
};

export default function CalculatorPage() {
  return <CalculatorClient />;
}
