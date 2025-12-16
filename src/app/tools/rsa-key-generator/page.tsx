import type { Metadata } from "next";
import RsaKeyGeneratorClient from "./RsaKeyGeneratorClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "RSA 密钥生成器 | 纯粹工具站",
  description:
    "纯前端 RSA 密钥生成器，支持生成 2048/3072/4096 位密钥，并导出 PEM（PKCS8 私钥 / SPKI 公钥）。",
  alternates: {
    canonical: "/tools/rsa-key-generator",
  },
  openGraph: {
    title: "RSA 密钥生成器 - 纯粹工具站",
    description: "在线生成 RSA 密钥对并导出 PEM，纯本地运行。",
    type: "website",
  },
  manifest: "/tools/rsa-key-generator/manifest.webmanifest",
};

export default function RsaKeyGeneratorPage() {
  return <RsaKeyGeneratorClient />;
}

