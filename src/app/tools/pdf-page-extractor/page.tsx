import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PdfPageExtractorClient from "./PdfPageExtractorClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("pdf-page-extractor");

export default function PdfPageExtractorPage() {
  return <PdfPageExtractorClient />;
}

