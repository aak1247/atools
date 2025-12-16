import { generateToolMetadata } from "../../../lib/generate-tool-page";
import QrGeneratorClient from "./QrGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("qr-generator");

export default function QrGeneratorPage() {
  return <QrGeneratorClient />;
}
