import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PdfToTextClient from "./PdfToTextClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("pdf-to-text");

export default function PdfToTextPage() {
  return <PdfToTextClient />;
}

