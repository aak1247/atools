import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PdfCompressorClient from "./PdfCompressorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("pdf-compressor");

export default function PdfCompressorPage() {
  return <PdfCompressorClient />;
}

