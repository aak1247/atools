import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PdfTrimClient from "./PdfTrimClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("pdf-trim");

export default function PdfTrimPage() {
  return <PdfTrimClient />;
}
