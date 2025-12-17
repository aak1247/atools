import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PdfSplitClient from "./PdfSplitClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("pdf-split");

export default function PdfSplitPage() {
  return <PdfSplitClient />;
}

