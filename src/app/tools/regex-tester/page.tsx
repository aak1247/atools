import type { Metadata } from "next";
import RegexTesterClient from "./RegexTesterClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "正则表达式测试工具 | 纯粹工具站",
  description:
    "纯前端正则表达式测试工具，支持匹配、分组查看与替换预览，所有处理均在浏览器本地完成。",
  alternates: {
    canonical: "/tools/regex-tester",
  },
  openGraph: {
    title: "正则表达式测试工具 - 纯粹工具站",
    description: "在线测试正则表达式，查看匹配结果与捕获分组，并预览替换。",
    type: "website",
  },
  manifest: "/tools/regex-tester/manifest.webmanifest",
};

export default function RegexTesterPage() {
  return <RegexTesterClient />;
}

