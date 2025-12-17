import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PdfToImagesClient from "./PdfToImagesClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("pdf-to-images");

export default function PdfToImagesPage() {
  return <PdfToImagesClient />;
}

