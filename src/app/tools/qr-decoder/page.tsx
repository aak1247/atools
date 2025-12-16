import { generateToolMetadata } from "../../../lib/generate-tool-page";
import QrDecoderClient from "./QrDecoderClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("qr-decoder");

export default function QrDecoderPage() {
  return <QrDecoderClient />;
}
