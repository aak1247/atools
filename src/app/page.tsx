import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "工具导航 | 纯粹工具站",
  description: "精选纯前端工具集合，科学计算器、图片压缩等，隐私安全，极致体验。",
};

const tools = [
  {
    slug: "calculator",
    name: "科学计算器",
    description: "优雅强大的在线计算工具，支持复杂函数运算。",
    icon: (
      <svg className="h-6 w-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    gradient: "from-orange-50 to-amber-50",
  },
  {
    slug: "image-compressor",
    name: "图片压缩",
    description: "本地极速压缩，智能算法，隐私零泄露。",
    icon: (
      <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    gradient: "from-blue-50 to-indigo-50",
  },
  {
    slug: "seal-extractor",
    name: "印章提取",
    description: "智能识别扫描件中的红色公章，一键生成透明背景电子章。",
    icon: (
      <svg
        className="h-6 w-6 text-rose-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 4a4 4 0 00-4 4c0 1.485.81 2.776 2.01 3.47C8.82 12.35 8 13.62 8 15v1h8v-1c0-1.38-.82-2.65-2.01-3.53A4.002 4.002 0 0012 4zM6 19h12"
        />
      </svg>
    ),
    gradient: "from-rose-50 to-red-50",
  },
];

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

      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 animate-fade-in-up delay-100">
        {tools.map((tool) => (
          <Link
            key={tool.slug}
            href={`/tools/${tool.slug}`}
            className="group relative overflow-hidden rounded-2xl glass-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${tool.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}></div>
            <div className="relative z-10 flex flex-col h-full">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5 transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md">
                {tool.icon}
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">
                {tool.name}
              </h2>
              <p className="flex-1 text-sm leading-relaxed text-slate-600">
                {tool.description}
              </p>
              <div className="mt-6 flex items-center text-sm font-medium text-blue-600 opacity-0 transition-all duration-300 transform translate-y-2 group-hover:opacity-100 group-hover:translate-y-0">
                立即使用
                <svg className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </Link>
        ))}
        
        {/* Coming Soon Card */}
        <div className="group relative overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-6 transition-all hover:bg-slate-50">
          <div className="flex flex-col h-full items-center justify-center text-center">
            <div className="mb-3 rounded-full bg-slate-100 p-3">
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-slate-900">更多工具</h3>
            <p className="mt-1 text-xs text-slate-500">持续更新中...</p>
          </div>
        </div>
      </section>
    </div>
  );
}
