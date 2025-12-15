import type { Metadata } from "next";
import PdfStampClient from "./PdfStampClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "PDF 盖章工具 | 纯粹工具站",
  description:
    "纯前端 PDF 盖章工具，支持上传 PDF 与透明印章图片，拖拽、缩放、旋转印章后生成带章 PDF，全程本地处理不上传服务器。",
  alternates: {
    canonical: "/tools/pdf-stamp",
  },
  openGraph: {
    title: "PDF 盖章工具 - 纯粹工具站",
    description:
      "在线 PDF 盖章工具，基于 pdf.js 与 pdf-lib，在浏览器中完成印章叠加与导出，保留原始 PDF 文本层结构，适合内部审批与个人文档场景。",
    type: "website",
  },
  manifest: "/tools/pdf-stamp/manifest.webmanifest",
};

export default function PdfStampPage() {
  return <PdfStampClient />;
}

