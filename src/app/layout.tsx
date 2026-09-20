import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";
import RouteProgressBar from "../components/RouteProgressBar";
import DesignUploadEnhancer from "../components/DesignUploadEnhancer";
import { buildClarityBootstrapScript, getClarityProjectId } from "../lib/clarity";
import { getSiteBaseUrl } from "../lib/site-url";

function getMetadataBase(): URL {
  return new URL(getSiteBaseUrl());
}

const metadataBase = getMetadataBase();
const applicationName = "ATools";
const siteNameZh = "ATools 纯粹工具站";
const defaultTitle = "ATools 纯粹工具站 - 免费在线工具箱，零上传更安全";
const defaultDescription =
  "ATools 纯粹工具站提供免费在线工具，覆盖开发调试、文档处理、图片与音视频处理、办公效率等场景。多数工具在浏览器本地运行，文件和文本默认不上传服务器。";
const defaultKeywords = [
  "免费在线工具",
  "ATools",
  "纯粹工具站",
  "在线工具箱",
  "纯前端工具",
  "浏览器本地处理",
  "零上传工具",
  "开发者工具",
  "PDF工具",
  "图片工具",
  "音视频工具",
  "JSON工具",
  "效率工具",
  "隐私安全工具",
];

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const clarityProjectId = getClarityProjectId();

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: defaultTitle,
    template: `%s | ${siteNameZh}`,
  },
  description: defaultDescription,
  keywords: defaultKeywords,
  applicationName,
  category: "technology",
  openGraph: {
    title: defaultTitle,
    description: defaultDescription,
    type: "website",
    siteName: siteNameZh,
    locale: "zh_CN",
    url: "/zh-cn",
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="scroll-smooth">
      {clarityProjectId ? (
        <Script
          id="clarity-bootstrap"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: buildClarityBootstrapScript(clarityProjectId),
          }}
        />
      ) : null}
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--background)] text-[var(--foreground)] selection:bg-blue-500/20 selection:text-blue-600`}
      >
        <RouteProgressBar />
        <ServiceWorkerRegister />
        <DesignUploadEnhancer />
        {children}
      </body>
    </html>
  );
}
