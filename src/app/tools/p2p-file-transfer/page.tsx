import { generateToolMetadata } from "../../../lib/generate-tool-page";
import P2PFileTransferClient from "./P2PFileTransferClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("p2p-file-transfer");

export default function P2PFileTransferPage() {
  return <P2PFileTransferClient />;
}
