import { generateToolMetadata } from "../../../lib/generate-tool-page";
import QrScannerClient from "./QrScannerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("qr-scanner");

export default function QrScannerPage() {
  return <QrScannerClient />;
}
