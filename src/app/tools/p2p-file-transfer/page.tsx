import type { Metadata } from "next";
import P2PFileTransferClient from "./P2PFileTransferClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "局域网 P2P 文件传输工具 | 纯粹工具站",
  description:
    "纯前端 WebRTC P2P 文件传输工具，适合局域网/热点环境下电脑手机互传文件；无需登录、无需服务器中转，不上传服务器；通过复制/粘贴连接码完成连接。",
  alternates: {
    canonical: "/tools/p2p-file-transfer",
  },
  openGraph: {
    title: "局域网 P2P 文件传输工具 - 纯粹工具站",
    description:
      "基于 WebRTC DataChannel 的点对点文件传输工具，整个过程在浏览器本地完成，不经服务器中转，适合设备间快速互传。",
    type: "website",
  },
  manifest: "/tools/p2p-file-transfer/manifest.webmanifest",
};

export default function P2PFileTransferPage() {
  return <P2PFileTransferClient />;
}
