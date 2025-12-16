import type { Metadata } from "next";
import TimerClient from "./TimerClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "计时器 | 纯粹工具站",
  description: "纯前端计时器工具，支持倒计时与秒表，所有计时均在浏览器本地完成。",
  alternates: {
    canonical: "/tools/timer",
  },
  openGraph: {
    title: "计时器 - 纯粹工具站",
    description: "在线计时器与秒表，适合学习、工作、运动等场景。",
    type: "website",
  },
  manifest: "/tools/timer/manifest.webmanifest",
};

export default function TimerPage() {
  return <TimerClient />;
}

