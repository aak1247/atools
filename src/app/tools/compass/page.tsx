import type { Metadata } from "next";
import CompassClient from "./CompassClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "指南针 | 纯粹工具站",
  description:
    "纯前端指南针工具，支持 iPhone 方向传感器权限流程，可结合定位计算磁偏角以尽量接近真北显示，所有数据仅在本地完成。",
  alternates: {
    canonical: "/tools/compass",
  },
  openGraph: {
    title: "指南针 - 纯粹工具站",
    description:
      "在线指南针工具：显示当前朝向（磁北/真北），支持 iPhone/Android，纯前端本地运行。",
    type: "website",
  },
  manifest: "/tools/compass/manifest.webmanifest",
};

export default function CompassPage() {
  return <CompassClient />;
}

