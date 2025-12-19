import { generateToolMetadata } from "../../../lib/generate-tool-page";
import QrCodeBulkGeneratorClient from "./QrCodeBulkGeneratorClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("qr-code-bulk-generator");

export default function QrCodeBulkGeneratorPage() {
  return <QrCodeBulkGeneratorClient />;
}

