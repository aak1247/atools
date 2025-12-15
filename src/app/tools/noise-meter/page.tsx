import { Metadata } from "next";
import NoiseMeterClient from "./NoiseMeterClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "噪音计 - 纯粹工具站",
  description: "纯前端噪音测量工具，通过设备麦克风实时测量环境噪音分贝水平，适用于噪音检测和环境监测。",
  keywords: ["噪音计", "分贝", "噪音测量", "环境噪音", "音频检测", "噪音监测"],
  manifest: "/tools/noise-meter/manifest.webmanifest",
  openGraph: {
    title: "噪音计 - 纯粹工具站",
    description: "纯前端噪音测量工具，通过设备麦克风实时测量环境噪音分贝水平，适用于噪音检测和环境监测。",
    url: "/tools/noise-meter",
    type: "website",
  },
};

export default function NoiseMeterPage() {
  return <NoiseMeterClient />;
}