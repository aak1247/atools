import { Metadata } from "next";
import IcoGeneratorClient from "./IcoGeneratorClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "ICO 图标生成工具 - 纯粹工具站",
  description: "在线 ICO 图标生成工具，多种尺寸可选（一次生成一个尺寸），浏览器本地处理，无需上传服务器，安全快捷地生成 Windows 应用图标和网站 favicon。",
  keywords: "ICO图标生成,图标制作,Windows图标,favicon生成,在线工具",
  manifest: "/tools/ico-generator/manifest.webmanifest",
};

export default function IcoGeneratorPage() {
  return <IcoGeneratorClient />;
}
