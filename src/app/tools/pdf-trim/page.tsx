import type { Metadata } from "next";
import PdfTrimClient from "./PdfTrimClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "PDF 剪切工具 | 纯粹工具站",
  description:
    "纯前端 PDF 剪切工具，支持选择一个 PDF 文件并删除其中几页后导出新的 PDF，整个过程在浏览器本地完成，不上传服务器。",
  alternates: {
    canonical: "/tools/pdf-trim",
  },
  openGraph: {
    title: "PDF 剪切工具 - 纯粹工具站",
    description:
      "在线 PDF 剪切工具，使用 pdf-lib 在浏览器中从一个 PDF 中删除指定页面并导出新文件，适合合同、多页资料的页码调整与隐私页删除等场景。",
    type: "website",
  },
  manifest: "/tools/pdf-trim/manifest.webmanifest",
};

export default function PdfTrimPage() {
  return <PdfTrimClient />;
}

