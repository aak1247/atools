import type { Metadata } from "next";
import ToolNavClient from "./ToolNavClient";

export const metadata: Metadata = {
  title: "工具导航 | 纯粹工具站",
  description: "精选纯前端工具集合，科学计算器、图片压缩等，隐私安全，极致体验。",
};

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="relative mx-auto max-w-2xl text-center animate-fade-in-up">
        <div className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50/50 px-3 py-1 text-xs font-medium text-blue-600 backdrop-blur-sm mb-6">
          <span className="flex h-2 w-2 rounded-full bg-blue-600 mr-2"></span>
          纯前端 • 零上传 • 极致体验
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl mb-6">
          让工具回归<span className="text-gradient">简单与纯粹</span>
        </h1>
        <p className="text-lg leading-8 text-slate-600">
          精心打造的纯前端工具集合。无需安装，即开即用，所有数据均在本地处理，
          为您提供最安全、流畅的使用体验。
        </p>
      </section>

      <ToolNavClient />
    </div>
  );
}
