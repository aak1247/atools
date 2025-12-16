import type { Metadata } from "next";
import ColorPickerClient from "./ColorPickerClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "图片取色器 | 纯粹工具站",
  description: "纯前端图片取色器，上传图片并点击取色，输出 HEX/RGB 等格式，一键复制。",
  alternates: {
    canonical: "/tools/color-picker",
  },
  openGraph: {
    title: "图片取色器 - 纯粹工具站",
    description: "在线图片取色，点击像素即可获取 HEX/RGB 等颜色值。",
    type: "website",
  },
  manifest: "/tools/color-picker/manifest.webmanifest",
};

export default function ColorPickerPage() {
  return <ColorPickerClient />;
}

