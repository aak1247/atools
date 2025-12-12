import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "前端工具站",
  description: "纯前端 SSR 工具集合示例站点",
  applicationName: "前端工具站",
  themeColor: "#f5f5f7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--background)] text-[var(--foreground)] selection:bg-blue-500/20 selection:text-blue-600`}
      >
        <ServiceWorkerRegister />
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-50 w-full glass border-b border-white/20 transition-all duration-300">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
              <Link
                href="/"
                className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900 transition-opacity hover:opacity-80"
              >
                <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm"></div>
                <span>前端工具站</span>
              </Link>
              <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
                <Link 
                  href="/" 
                  className="transition-colors hover:text-slate-900"
                >
                  工具导航
                </Link>
                <a 
                  href="https://github.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-slate-900"
                >
                  GitHub
                </a>
              </nav>
            </div>
          </header>

          <main className="flex-1">
            <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>

          <footer className="border-t border-slate-200/60 bg-white/50 py-8 text-center text-xs text-slate-500 backdrop-blur-sm">
            <div className="mx-auto max-w-5xl px-4">
              <p>© {new Date().getFullYear()} 前端工具站. Crafted with precision.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
