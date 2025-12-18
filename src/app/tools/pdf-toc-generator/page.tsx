import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PdfTocGeneratorClient from "./PdfTocGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("pdf-toc-generator");

export default function PdfTocGeneratorPage() {
  return <PdfTocGeneratorClient />;
}

